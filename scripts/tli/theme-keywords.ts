import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from './supabase-admin'
import { collectNaverFinanceStocks } from './collectors/naver-finance-themes'
import { expandKeywords } from './collectors/naver-autocomplete'
import { sleep } from './utils'

// ─────────────────────────────────────────────────────
// 테마명에서 검색 최적화 키워드 자동 생성
// ─────────────────────────────────────────────────────

/** 주식시장 영문→한글 매핑 */
export const ENGLISH_KOREAN_MAP: Record<string, string[]> = {
  'AI': ['인공지능'],
  'EV': ['전기차'],
  'HBM': ['고대역폭메모리'],
  'SpaceX': ['스페이스엑스'],
  'ESG': ['친환경경영'],
  'NFT': ['대체불가토큰'],
  'IoT': ['사물인터넷'],
  'UAM': ['도심항공모빌리티'],
  'XR': ['확장현실'],
  'AR': ['증강현실'],
  'VR': ['가상현실'],
  'OLED': ['유기발광다이오드'],
  'SMR': ['소형모듈원전'],
  'CXL': ['씨엑스엘'],
  'Robot': ['로봇'],
  'Robotics': ['로보틱스'],
}

/** 테마명에서 검색 최적화 키워드 자동 생성 */
export function enrichThemeKeywords(themeName: string): Array<{ keyword: string; source: string; isPrimary: boolean }> {
  const enriched: Array<{ keyword: string; source: string; isPrimary: boolean }> = []
  const seen = new Set<string>()

  const addIfNew = (keyword: string, source: string, isPrimary: boolean) => {
    const normalized = keyword.trim()
    if (normalized.length >= 2 && !seen.has(normalized)) {
      seen.add(normalized)
      enriched.push({ keyword: normalized, source, isPrimary })
    }
  }

  // 1) 원본 테마명
  addIfNew(themeName, 'general', true)
  addIfNew(themeName, 'naver', false)

  // 2) 괄호 제거: "스페이스X(SpaceX)" → "스페이스X"
  const withoutParens = themeName.replace(/\s*\([^)]*\)\s*/g, '').trim()
  if (withoutParens !== themeName) {
    addIfNew(withoutParens, 'naver', false)
  }

  // 3) 괄호 안 내용 추출: "스페이스X(SpaceX)" → "SpaceX"
  const parenMatch = themeName.match(/\(([^)]+)\)/)
  if (parenMatch) {
    addIfNew(parenMatch[1], 'naver', false)
  }

  // 4) 한글만 추출: "AI반도체" → "반도체"
  const koreanOnly = themeName.replace(/[^가-힣\s]/g, '').trim()
  if (koreanOnly.length >= 2 && koreanOnly !== themeName) {
    addIfNew(koreanOnly, 'naver', false)
  }

  // 5) 영문→한글 매핑
  for (const [eng, koreans] of Object.entries(ENGLISH_KOREAN_MAP)) {
    if (themeName.toUpperCase().includes(eng.toUpperCase())) {
      for (const kr of koreans) {
        addIfNew(kr, 'auto_enriched', false)
      }
    }
  }

  return enriched
}

// ─────────────────────────────────────────────────────
// 키워드 자동 생성: 테마명 + 종목명 + 자동완성
// ─────────────────────────────────────────────────────

export async function populateKeywords(
  newThemes: Array<{ id: string; name: string; naverThemeId: string }>
) {
  if (newThemes.length === 0) {
    console.log('\n⊘ 신규 테마 없음 - 키워드 생성 건너뜀')
    return
  }

  console.log('\n━'.repeat(80))
  console.log(`🔑 2단계: ${newThemes.length}개 신규 테마 키워드 자동 생성`)
  console.log('━'.repeat(80))

  for (const theme of newThemes) {
    // 1) 테마명 기반 자동 키워드 보강
    const keywords = enrichThemeKeywords(theme.name)

    // 2) 네이버 금융에서 종목명 추출 → 키워드로 활용
    try {
      const stocks = await collectNaverFinanceStocks([
        { id: theme.id, naverThemeId: theme.naverThemeId }
      ])

      // 상위 5개 종목명을 키워드로 추가
      const topStocks = stocks.slice(0, 5)
      for (const stock of topStocks) {
        keywords.push({ keyword: stock.name, source: 'auto_stock', isPrimary: false })
      }

      // 종목도 함께 저장
      if (stocks.length > 0) {
        const stockRows = stocks.map(s => ({
          theme_id: theme.id,
          symbol: s.symbol,
          name: s.name,
          market: s.market as 'KOSPI' | 'KOSDAQ',
          source: 'naver',
          is_curated: false,
          relevance: 1.0,
          is_active: true,
        }))

        await supabaseAdmin
          .from('theme_stocks')
          .upsert(stockRows, { onConflict: 'theme_id,symbol' })

        console.log(`   📈 ${stocks.length}개 종목 저장`)
      }

      await sleep(3000) // 스크래핑 정중한 지연
    } catch (error: unknown) {
      console.error(`   ⚠️ 종목 수집 실패 (${theme.name}):`, error instanceof Error ? error.message : String(error))
    }

    // 3) 네이버 자동완성으로 관련 키워드 확장
    try {
      const autoKeywords = await expandKeywords(theme.name, 8)
      for (const kw of autoKeywords) {
        // 테마명 자체와 중복 제거
        if (kw === theme.name) continue
        keywords.push({ keyword: kw, source: 'auto_autocomplete', isPrimary: false })
      }
    } catch (error: unknown) {
      console.error(`   ⚠️ 자동완성 확장 실패 (${theme.name}):`, error instanceof Error ? error.message : String(error))
    }

    // 4) DB에 배치 저장
    const keywordRows = keywords.map(k => ({
      theme_id: theme.id,
      keyword: k.keyword,
      source: k.source,
      is_primary: k.isPrimary,
      weight: k.isPrimary ? 1.0 : 0.8,
    }))

    const { error } = await supabaseAdmin
      .from('theme_keywords')
      .upsert(keywordRows, { onConflict: 'theme_id,keyword,source' })

    if (error) {
      console.error(`   ⚠️ 키워드 저장 실패 (${theme.name}):`, error.message)
    } else {
      console.log(`   ✓ ${theme.name}: ${keywords.length}개 키워드 저장`)
    }
  }
}
