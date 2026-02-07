import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from './supabase-admin'
import { collectNaverThemeList, type DiscoveredTheme } from './collectors/naver-finance-theme-list'
import { expandKeywords } from './collectors/naver-autocomplete'
import { collectNaverFinanceStocks } from './collectors/naver-finance-themes'
import { sleep } from './utils'

/** 비활성화 임계값 */
const DEACTIVATION_CONFIG = {
  /** 최근 점수 임계값 (미만이면 비활성화 후보) */
  scoreThreshold: 15,
  /** 낮은 점수 연속 일수 (이상이면 비활성화) */
  lowScoreDays: 14,
  /** 네이버 목록 미출현 기준 일수 */
  notSeenDays: 30,
} as const

// ─────────────────────────────────────────────────────
// 1. 테마 발견: 네이버 금융 목록 → DB 비교 → 신규 삽입
// ─────────────────────────────────────────────────────

async function discoverNewThemes(discovered: DiscoveredTheme[]) {
  console.log('\n━'.repeat(80))
  console.log('🆕 1단계: 신규 테마 발견 및 등록')
  console.log('━'.repeat(80))

  // 기존 테마를 naverThemeId로 조회
  const { data: existingThemes, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, naver_theme_id, is_active, last_seen_on_naver')

  if (error) throw new Error(`기존 테마 조회 실패: ${error.message}`)

  const existingByNaverId = new Map<string, typeof existingThemes[0]>()
  const existingByName = new Map<string, typeof existingThemes[0]>()
  for (const t of existingThemes || []) {
    if (t.naver_theme_id) existingByNaverId.set(t.naver_theme_id, t)
    existingByName.set(t.name, t)
  }

  const today = new Date().toISOString().split('T')[0]
  let newCount = 0
  let updatedCount = 0
  const newThemeIds: Array<{ id: string; name: string; naverThemeId: string }> = []

  for (const theme of discovered) {
    const existingById = existingByNaverId.get(theme.naverThemeId)
    const existingByN = existingByName.get(theme.name)
    const existing = existingById || existingByN

    if (existing) {
      // 기존 테마: last_seen_on_naver 업데이트
      await supabaseAdmin
        .from('themes')
        .update({
          last_seen_on_naver: today,
          naver_theme_id: theme.naverThemeId,
        })
        .eq('id', existing.id)

      updatedCount++
    } else {
      // 신규 테마: is_active=false로 먼저 삽입 (자동 활성화 대기)
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('themes')
        .upsert(
          {
            name: theme.name,
            naver_theme_id: theme.naverThemeId,
            is_active: false,
            discovery_source: 'naver_finance',
            discovered_at: new Date().toISOString(),
            last_seen_on_naver: today,
            first_spike_date: today,
          },
          { onConflict: 'name' }
        )
        .select('id')
        .single()

      if (insertError) {
        console.error(`   ⚠️ 테마 "${theme.name}" 삽입 실패:`, insertError.message)
        continue
      }

      newThemeIds.push({
        id: inserted.id,
        name: theme.name,
        naverThemeId: theme.naverThemeId,
      })
      newCount++
      console.log(`   ✓ 신규 테마: ${theme.name} (ID: ${theme.naverThemeId})`)
    }
  }

  console.log(`\n   📊 결과: 신규 ${newCount}개 / 갱신 ${updatedCount}개`)
  return newThemeIds
}

// ─────────────────────────────────────────────────────
// 1.5 테마명에서 검색 최적화 키워드 자동 생성
// ─────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────
// 2. 키워드 자동 생성: 테마명 + 종목명 + 자동완성
// ─────────────────────────────────────────────────────

async function populateKeywords(
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

// ─────────────────────────────────────────────────────
// 3. 자동 활성화: 네이버 2회 연속 등장 → is_active=true
// ─────────────────────────────────────────────────────

async function autoActivate() {
  console.log('\n━'.repeat(80))
  console.log('⚡ 3단계: 자동 활성화 판정')
  console.log('━'.repeat(80))

  // 비활성 테마 중 네이버에서 발견된 것 조회
  const { data: candidates, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, last_seen_on_naver, discovered_at')
    .eq('is_active', false)
    .eq('discovery_source', 'naver_finance')
    .not('last_seen_on_naver', 'is', null)

  if (error || !candidates) {
    console.error('   ⚠️ 활성화 후보 조회 실패')
    return
  }

  let activatedCount = 0

  for (const theme of candidates) {
    // 네이버 금융 목록에 존재하는 테마 → 즉시 활성화 (네이버가 검증한 테마)
    await supabaseAdmin
      .from('themes')
      .update({ is_active: true, auto_activated: true })
      .eq('id', theme.id)

    activatedCount++
    console.log(`   ✓ 활성화: ${theme.name}`)
  }

  console.log(`\n   📊 ${activatedCount}개 테마 활성화`)
}

// ─────────────────────────────────────────────────────
// 4. 자동 비활성화: 낮은 점수 + 네이버 미출현
// ─────────────────────────────────────────────────────

async function autoDeactivate() {
  console.log('\n━'.repeat(80))
  console.log('💤 4단계: 자동 비활성화 판정')
  console.log('━'.repeat(80))

  const { data: activeThemes, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, last_seen_on_naver')
    .eq('is_active', true)
    .eq('discovery_source', 'naver_finance')

  if (error || !activeThemes) {
    console.error('   ⚠️ 활성 테마 조회 실패')
    return
  }

  const today = new Date()
  const cutoffDate = new Date(Date.now() - DEACTIVATION_CONFIG.lowScoreDays * 86400000)
    .toISOString().split('T')[0]
  let deactivatedCount = 0

  for (const theme of activeThemes) {
    // 조건 1: 네이버 목록에서 일정 기간 미출현
    const lastSeen = theme.last_seen_on_naver ? new Date(theme.last_seen_on_naver) : null
    const notSeenDays = lastSeen
      ? Math.floor((today.getTime() - lastSeen.getTime()) / 86400000)
      : Infinity

    if (notSeenDays < DEACTIVATION_CONFIG.notSeenDays) continue

    // 조건 2: 최근 N일간 점수가 임계값 미만
    const { data: recentScores } = await supabaseAdmin
      .from('lifecycle_scores')
      .select('score')
      .eq('theme_id', theme.id)
      .gte('calculated_at', cutoffDate)
      .order('calculated_at', { ascending: false })

    const allLow = recentScores?.every(s => s.score < DEACTIVATION_CONFIG.scoreThreshold)
    if (!allLow) continue

    // 양쪽 조건 모두 충족 → 비활성화
    await supabaseAdmin
      .from('themes')
      .update({ is_active: false })
      .eq('id', theme.id)

    deactivatedCount++
    console.log(`   ✓ 비활성화: ${theme.name} (미출현 ${notSeenDays}일)`)
  }

  console.log(`\n   📊 ${deactivatedCount}개 테마 비활성화`)
}

// ─────────────────────────────────────────────────────
// 메인 오케스트레이터
// ─────────────────────────────────────────────────────

export async function discoverAndManageThemes() {
  console.log('🔍 테마 발견 파이프라인 시작\n')
  const startTime = Date.now()

  // 1) 네이버 금융 테마 목록 스크래핑
  const discovered = await collectNaverThemeList()

  // 2) 신규 테마 등록
  const newThemes = await discoverNewThemes(discovered)

  // 3) 신규 테마 키워드 자동 생성
  await populateKeywords(newThemes)

  // 4) 자동 활성화
  await autoActivate()

  // 5) 자동 비활성화
  await autoDeactivate()

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log('\n━'.repeat(80))
  console.log(`✨ 테마 발견 파이프라인 완료 (${duration}초)`)
  console.log('━'.repeat(80))
}

// 직접 실행 시
const isDirectRun = process.argv[1]?.includes('discover-themes')
if (isDirectRun) {
  discoverAndManageThemes()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error('❌ 치명적 오류:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
