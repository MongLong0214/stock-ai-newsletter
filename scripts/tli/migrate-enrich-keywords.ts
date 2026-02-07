import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from './supabase-admin'

/** 주식시장 영문→한글 매핑 */
const ENGLISH_KOREAN_MAP: Record<string, string[]> = {
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
function enrichThemeKeywords(themeName: string): Array<{ keyword: string; source: string; isPrimary: boolean }> {
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

/** 배치 upsert 헬퍼 */
async function upsertBatch(
  rows: Array<{ theme_id: string; keyword: string; source: string; is_primary: boolean; weight: number }>,
  batchSize = 500
) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabaseAdmin
      .from('theme_keywords')
      .upsert(batch, { onConflict: 'theme_id,keyword,source' })

    if (error) {
      throw new Error(`배치 upsert 실패: ${error.message}`)
    }
  }
}

/** 메인 마이그레이션 로직 */
export async function migrateEnrichKeywords() {
  console.log('━'.repeat(80))
  console.log('🔄 테마 키워드 마이그레이션 시작')
  console.log('━'.repeat(80))

  // 1) 모든 활성 테마 조회
  const { data: themes, error } = await supabaseAdmin
    .from('themes')
    .select('id, name')
    .eq('is_active', true)

  if (error) {
    throw new Error(`테마 조회 실패: ${error.message}`)
  }

  if (!themes || themes.length === 0) {
    console.log('\n⊘ 활성 테마 없음 - 마이그레이션 종료')
    return
  }

  console.log(`\n📊 ${themes.length}개 활성 테마 발견`)

  // 2) 각 테마에 대해 키워드 생성
  const allKeywordRows: Array<{
    theme_id: string
    keyword: string
    source: string
    is_primary: boolean
    weight: number
  }> = []

  for (const theme of themes) {
    const keywords = enrichThemeKeywords(theme.name)

    for (const k of keywords) {
      allKeywordRows.push({
        theme_id: theme.id,
        keyword: k.keyword,
        source: k.source,
        is_primary: k.isPrimary,
        weight: k.isPrimary ? 1.0 : 0.8,
      })
    }

    console.log(`   ✓ ${theme.name}: ${keywords.length}개 키워드 생성`)
  }

  // 3) 배치 upsert
  console.log(`\n💾 ${allKeywordRows.length}개 키워드 저장 중...`)
  await upsertBatch(allKeywordRows)

  console.log('\n━'.repeat(80))
  console.log(`✨ 마이그레이션 완료 (${themes.length}개 테마, ${allKeywordRows.length}개 키워드)`)
  console.log('━'.repeat(80))
}

// 직접 실행 시
const isDirectRun = process.argv[1]?.includes('migrate-enrich-keywords')
if (isDirectRun) {
  migrateEnrichKeywords()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error('❌ 치명적 오류:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
