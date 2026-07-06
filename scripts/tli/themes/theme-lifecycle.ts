import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { batchQuery } from '@/scripts/tli/shared/supabase-batch'
import { daysAgo } from '@/scripts/tli/shared/utils'
import { buildOngoingStateChangeRow, buildCloseRowPatch } from '@/scripts/tli/themes/theme-state-history'
import {
  findScorelessZombieThemes,
  type ScorelessZombieThemeCandidate,
  type ScorelessZombieThemeInput,
} from '@/scripts/tli/themes/scoreless-zombie-themes'
import { getKSTDate, getKSTDateString } from '@/lib/tli/date-utils'

// ─────────────────────────────────────────────────────
// 테마 생명주기 관리: 자동 활성화 / 비활성화
// ─────────────────────────────────────────────────────

/** state_history_v2에 상태 변경 기록 (이전 행 닫기 + 신규 행 삽입) */
async function recordStateChange(input: {
  themeId: string
  newIsActive: boolean
  firstSpikeDate: string | null
  changeDate: string
}) {
  try {
    // 이전 활성 행 닫기
    const closePatch = buildCloseRowPatch({ changeDate: input.changeDate })
    await supabaseAdmin
      .from('theme_state_history_v2')
      .update(closePatch)
      .eq('theme_id', input.themeId)
      .is('effective_to', null)

    // 신규 행 삽입
    const newRow = buildOngoingStateChangeRow({
      themeId: input.themeId,
      newIsActive: input.newIsActive,
      firstSpikeDate: input.firstSpikeDate,
      changeDate: input.changeDate,
    })
    await supabaseAdmin
      .from('theme_state_history_v2')
      .insert(newRow)
  } catch (err: unknown) {
    console.error(`   ⚠️ state history 기록 실패 (파이프라인 계속): ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** 비활성화 임계값 */
export const DEACTIVATION_CONFIG = {
  /** 최근 점수 임계값 (미만이면 비활성화 후보) */
  scoreThreshold: 15,
  /** 낮은 점수 연속 일수 (이상이면 비활성화) */
  lowScoreDays: 14,
  /** 네이버 목록 미출현 기준 일수 */
  notSeenDays: 30,
  scorelessActiveDays: 30,
} as const

export interface ScorelessZombieCleanupResult {
  candidates: ScorelessZombieThemeCandidate[]
  mutations: number
  dryRun: boolean
}

export function computeNextNaverSeenStreak(input: {
  previousStreak: number | null | undefined
  previousSeenDate: string | null | undefined
  currentSeenDate: string
}) {
  if (!input.previousSeenDate) return 1

  const previous = new Date(input.previousSeenDate)
  const current = new Date(input.currentSeenDate)
  const diffDays = Math.floor((current.getTime() - previous.getTime()) / 86400000)
  if (diffDays === 1) return Math.max(1, input.previousStreak ?? 1) + 1
  return 1
}

export function shouldAutoActivateTheme(input: {
  isActive: boolean
  discoverySource: string
  naverSeenStreak: number | null | undefined
}) {
  return !input.isActive
    && input.discoverySource === 'naver_finance'
    && (input.naverSeenStreak ?? 0) >= 2
}

export async function cleanupScorelessZombieThemes(input: {
  today?: Date
  dryRun?: boolean
} = {}): Promise<ScorelessZombieCleanupResult> {
  const today = input.today ?? getKSTDate()
  const dryRun = input.dryRun ?? true

  const { data: themes, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, created_at, is_active')
    .eq('is_active', true)

  if (error) {
    throw new Error(`점수 없는 활성 테마 조회 실패: ${error.message}`)
  }
  if (!themes) {
    throw new Error('점수 없는 활성 테마 조회 실패: 응답 데이터 없음')
  }

  const themeRows: ScorelessZombieThemeInput[] = themes.map((theme) => ({
    id: theme.id,
    name: theme.name,
    createdAt: theme.created_at,
    isActive: theme.is_active,
  }))
  const themeIds = themeRows.map((theme) => theme.id)
  const scoreRows = await batchQuery<{ theme_id: string }>(
    'lifecycle_scores',
    'theme_id',
    themeIds,
    undefined,
    'theme_id',
    { failOnError: true },
  )
  const scoredThemeIds = new Set(scoreRows.map((row) => row.theme_id))
  const candidates = findScorelessZombieThemes({
    themes: themeRows,
    scoredThemeIds,
    today,
    minimumAgeDays: DEACTIVATION_CONFIG.scorelessActiveDays,
  })

  if (dryRun || candidates.length === 0) {
    return { candidates, mutations: 0, dryRun }
  }

  let mutations = 0
  const todayStr = today.toISOString().split('T')[0]
  for (const candidate of candidates) {
    const { error: updateError } = await supabaseAdmin
      .from('themes')
      .update({ is_active: false })
      .eq('id', candidate.id)

    if (updateError) {
      console.error(`   ⚠️ 점수 없는 테마 비활성화 실패 (${candidate.name}): ${updateError.message}`)
      continue
    }

    await recordStateChange({
      themeId: candidate.id,
      newIsActive: false,
      firstSpikeDate: null,
      changeDate: todayStr,
    })
    mutations++
    console.log(`   ✓ 점수 없는 활성 테마 비활성화: ${candidate.name} (${candidate.ageDays}일)`)
  }

  return { candidates, mutations, dryRun }
}

// ─────────────────────────────────────────────────────
// 자동 활성화: 네이버 2회 연속 등장 → is_active=true
// ─────────────────────────────────────────────────────

export async function autoActivate() {
  console.log('\n⚡ 3단계: 자동 활성화 판정')

  // 비활성 테마 중 네이버에서 발견된 것 조회
  const { data: candidates, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, is_active, discovery_source, naver_seen_streak')

  if (error || !candidates) {
    console.error('   ⚠️ 활성화 후보 조회 실패')
    return
  }

  let activatedCount = 0

  for (const theme of candidates) {
    if (!shouldAutoActivateTheme({
      isActive: theme.is_active,
      discoverySource: theme.discovery_source,
      naverSeenStreak: theme.naver_seen_streak,
    })) continue

    await supabaseAdmin
      .from('themes')
      .update({ is_active: true, auto_activated: true })
      .eq('id', theme.id)

    const today = getKSTDateString()
    await recordStateChange({
      themeId: theme.id,
      newIsActive: true,
      firstSpikeDate: null,
      changeDate: today,
    })

    activatedCount++
    console.log(`   ✓ 활성화: ${theme.name}`)
  }

  console.log(`\n   📊 ${activatedCount}개 테마 활성화`)
}

// ─────────────────────────────────────────────────────
// 자동 비활성화: 낮은 점수 + 네이버 미출현
// ─────────────────────────────────────────────────────

export async function autoDeactivate() {
  console.log('\n💤 4단계: 자동 비활성화 판정')

  const today = getKSTDate()
  let scorelessCleanup: ScorelessZombieCleanupResult = { candidates: [], mutations: 0, dryRun: false }
  try {
    scorelessCleanup = await cleanupScorelessZombieThemes({ today, dryRun: false })
  } catch (error: unknown) {
    console.warn('   ⚠️ 점수 없는 좀비 테마 정리 실패 (나머지 비활성화 로직은 계속):', error instanceof Error ? error.message : String(error))
  }

  const { data: activeThemes, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, last_seen_on_naver')
    .eq('is_active', true)
    .eq('discovery_source', 'naver_finance')

  if (error || !activeThemes) {
    console.error('   ⚠️ 활성 테마 조회 실패')
    return
  }

  const cutoffDate = daysAgo(DEACTIVATION_CONFIG.lowScoreDays)

  // 모든 활성 테마의 최근 점수 배치 조회 (자동 페이지네이션)
  const themeIds = activeThemes.map(t => t.id)
  const allScores = await batchQuery<{ theme_id: string; score: number }>(
    'lifecycle_scores', 'theme_id, score', themeIds,
    q => q.gte('calculated_at', cutoffDate),
  )

  // 테마별 점수 그룹화
  const scoresByTheme = new Map<string, number[]>()
  for (const s of allScores) {
    const arr = scoresByTheme.get(s.theme_id) || []
    arr.push(s.score)
    scoresByTheme.set(s.theme_id, arr)
  }

  let deactivatedCount = scorelessCleanup.mutations

  for (const theme of activeThemes) {
    // 조건 1: 네이버 목록에서 일정 기간 미출현
    const lastSeen = theme.last_seen_on_naver ? new Date(theme.last_seen_on_naver) : null
    const notSeenDays = lastSeen
      ? Math.floor((today.getTime() - lastSeen.getTime()) / 86400000)
      : Infinity

    if (notSeenDays < DEACTIVATION_CONFIG.notSeenDays) continue

    // 조건 2: 최근 N일간 점수가 임계값 미만 (데이터 없으면 판단 보류)
    const scores = scoresByTheme.get(theme.id) || []
    if (scores.length === 0) continue
    const allLow = scores.every(s => s < DEACTIVATION_CONFIG.scoreThreshold)
    if (!allLow) continue

    // 양쪽 조건 모두 충족 → 비활성화
    await supabaseAdmin
      .from('themes')
      .update({ is_active: false })
      .eq('id', theme.id)

    const todayStr = today.toISOString().split('T')[0]
    await recordStateChange({
      themeId: theme.id,
      newIsActive: false,
      firstSpikeDate: null,
      changeDate: todayStr,
    })

    deactivatedCount++
    console.log(`   ✓ 비활성화: ${theme.name} (미출현 ${notSeenDays}일)`)
  }

  console.log(`\n   📊 ${deactivatedCount}개 테마 비활성화`)
}
