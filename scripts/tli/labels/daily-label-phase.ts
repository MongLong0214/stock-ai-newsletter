import { supabaseAdmin } from '../shared/supabase-admin'
import {
  GTA_HORIZON_DAYS,
  GTA_LABELER_VERSION,
} from '../../../lib/tli/labels/gt-a'
import { GTB_LABELER_VERSION } from '../../../lib/tli/labels/gt-b'
import { addKoreanTradingDays, isKoreanTradingDate } from '../../../lib/tli/trading-calendar'
import {
  generateGtALabelsForBaseDate,
  type GtALabelGenerationResult,
} from './label-gt-a'
import {
  generateGtBLabelsForBaseDate,
  type GtBLabelGenerationResult,
} from './label-gt-b'

const PENDING_SCAN_LIMIT = 500

export interface DailyLabelPhaseResult {
  readonly pendingBaseDate: string
  readonly finalizeCutoffDate: string
  readonly warningFailures: number
  readonly gtAPending: GtALabelGenerationResult | null
  readonly gtAFinalized: readonly GtALabelGenerationResult[]
  readonly gtBFinalized: readonly GtBLabelGenerationResult[]
  readonly nonTradingPendingClosed: number
}

type PendingLabelType = 'gt_a' | 'gt_b'

const LEGACY_LABELER_VERSIONS = {
  gt_a: GTA_LABELER_VERSION,
  gt_b: GTB_LABELER_VERSION,
} as const satisfies Record<PendingLabelType, string>

export interface DailyLabelPhaseDeps {
  readonly generateGtA: typeof generateGtALabelsForBaseDate
  readonly generateGtB: typeof generateGtBLabelsForBaseDate
  readonly loadPendingBaseDates: (input: {
    readonly labelType: PendingLabelType
    readonly cutoffDate: string
  }) => Promise<string[]>
  readonly closeNonTradingPending: () => Promise<number>
  readonly warn: (message: string) => void
}

export function getDailyLabelBaseDates(today: string): {
  readonly pendingBaseDate: string
  readonly finalizeCutoffDate: string
} {
  return {
    pendingBaseDate: today,
    finalizeCutoffDate: addKoreanTradingDays(today, -GTA_HORIZON_DAYS),
  }
}

/** base_date <= cutoffDate인 pending 라벨의 고유 base_date 목록 (idx_theme_labels_pending 활용, .range() 전체 페이지네이션) */
export async function loadPendingBaseDates(input: {
  readonly labelType: PendingLabelType
  readonly cutoffDate: string
}): Promise<string[]> {
  const baseDates = new Set<string>()
  for (let from = 0; ; from += PENDING_SCAN_LIMIT) {
    const { data, error } = await supabaseAdmin
      .from('theme_labels')
      .select('id, base_date')
      .eq('label_type', input.labelType)
      .eq('labeler_version', LEGACY_LABELER_VERSIONS[input.labelType])
      .eq('label_status', 'pending')
      .lte('base_date', input.cutoffDate)
      .order('base_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PENDING_SCAN_LIMIT - 1)

    if (error) throw new Error(`${input.labelType} 소급 확정 대상 조회 실패: ${error.message}`)
    for (const row of data ?? []) baseDates.add(row.base_date as string)
    if (!data || data.length < PENDING_SCAN_LIMIT) break
  }
  return [...baseDates]
}

/** base_date가 비거래일인 GT-A pending 행을 excluded로 자기치유 (주말 full 크론이 만든 고아 행 방지) */
async function closeNonTradingBaseDatePendingLabels(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('theme_labels')
    .select('base_date')
    .eq('label_type', 'gt_a')
    .eq('labeler_version', GTA_LABELER_VERSION)
    .eq('label_status', 'pending')

  if (error) throw new Error(`비거래일 pending 라벨 조회 실패: ${error.message}`)

  const baseDates = [...new Set((data ?? []).map((row) => row.base_date as string))]
  const nonTradingDates = baseDates.filter((date) => !isKoreanTradingDate(date))
  if (nonTradingDates.length === 0) return 0

  const { error: updateError, count } = await supabaseAdmin
    .from('theme_labels')
    .update({
      label_status: 'excluded',
      exclude_reason: 'non_trading_base_date',
      finalized_at: new Date().toISOString(),
    }, { count: 'exact' })
    .eq('label_type', 'gt_a')
    .eq('labeler_version', GTA_LABELER_VERSION)
    .eq('label_status', 'pending')
    .in('base_date', nonTradingDates)

  if (updateError) throw new Error(`비거래일 pending 라벨 정리 실패: ${updateError.message}`)
  return count ?? 0
}

/** base_date <= cutoffDate인 만기 경과 pending 라벨 수. 기본은 모든 버전이며 진단 시 버전을 지정한다. */
export async function countExpiredPendingLabels(input: {
  readonly labelType: PendingLabelType
  readonly cutoffDate: string
  readonly labelerVersion?: string
}): Promise<number> {
  let query = supabaseAdmin
    .from('theme_labels')
    .select('*', { count: 'exact', head: true })
    .eq('label_type', input.labelType)
    .eq('label_status', 'pending')
    .lte('base_date', input.cutoffDate)

  if (input.labelerVersion !== undefined) {
    query = query.eq('labeler_version', input.labelerVersion)
  }

  const { count, error } = await query

  if (error) throw new Error(`${input.labelType} 만기 pending 카운트 실패: ${error.message}`)
  return count ?? 0
}

const defaultDeps: DailyLabelPhaseDeps = {
  generateGtA: generateGtALabelsForBaseDate,
  generateGtB: generateGtBLabelsForBaseDate,
  loadPendingBaseDates,
  closeNonTradingPending: closeNonTradingBaseDatePendingLabels,
  warn: (message) => console.warn(message),
}

export async function runDailyLabelPhase(
  today: string,
  deps: DailyLabelPhaseDeps = defaultDeps,
): Promise<DailyLabelPhaseResult> {
  const { pendingBaseDate, finalizeCutoffDate } = getDailyLabelBaseDates(today)
  let warningFailures = 0
  let gtAPending: GtALabelGenerationResult | null = null
  const gtAFinalized: GtALabelGenerationResult[] = []
  const gtBFinalized: GtBLabelGenerationResult[] = []
  let nonTradingPendingClosed = 0

  // 비거래일에는 pending 생성 생략 — 확정 단계는 항상 실행
  if (isKoreanTradingDate(today)) {
    try {
      gtAPending = await deps.generateGtA({ baseDate: pendingBaseDate, today })
    } catch (error: unknown) {
      warningFailures++
      deps.warn(`GT-A pending 라벨 생성 실패: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  try {
    nonTradingPendingClosed = await deps.closeNonTradingPending()
  } catch (error: unknown) {
    warningFailures++
    deps.warn(`비거래일 pending 라벨 정리 실패: ${error instanceof Error ? error.message : String(error)}`)
  }

  // 현재 cutoff은 항상 시도(첫 도달 시 pending 행이 아직 없을 수 있음) + 과거 소급 미확정분을 합쳐 확정
  try {
    const gtAPendingBacklog = await deps.loadPendingBaseDates({ labelType: 'gt_a', cutoffDate: finalizeCutoffDate })
    const gtAPendingBacklogSet = new Set(gtAPendingBacklog)
    const gtATargets = [...new Set([...gtAPendingBacklog, finalizeCutoffDate])].sort()
    for (const baseDate of gtATargets) {
      try {
        gtAFinalized.push(await deps.generateGtA({
          baseDate,
          includeInactive: true,
          today,
          ...(gtAPendingBacklogSet.has(baseDate) ? { existingPendingOnly: true } : {}),
        }))
      } catch (error: unknown) {
        warningFailures++
        deps.warn(`GT-A 라벨 확정 실패 (base_date=${baseDate}): ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } catch (error: unknown) {
    warningFailures++
    deps.warn(`GT-A 확정 대상 조회 실패: ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    const gtBPendingBacklog = await deps.loadPendingBaseDates({ labelType: 'gt_b', cutoffDate: finalizeCutoffDate })
    const gtBPendingBacklogSet = new Set(gtBPendingBacklog)
    const gtBTargets = [...new Set([...gtBPendingBacklog, finalizeCutoffDate])].sort()
    for (const baseDate of gtBTargets) {
      try {
        const result = gtBPendingBacklogSet.has(baseDate)
          ? await deps.generateGtB(baseDate, { existingPendingOnly: true })
          : await deps.generateGtB(baseDate)
        gtBFinalized.push(result)
        if (result.pendingCount > 0) {
          warningFailures++
          deps.warn(`GT-B 만기 라벨 가격 부족으로 pending 유지 (base_date=${baseDate}, count=${result.pendingCount})`)
        }
      } catch (error: unknown) {
        warningFailures++
        deps.warn(`GT-B 라벨 확정 실패 (base_date=${baseDate}): ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } catch (error: unknown) {
    warningFailures++
    deps.warn(`GT-B 확정 대상 조회 실패: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    pendingBaseDate,
    finalizeCutoffDate,
    warningFailures,
    gtAPending,
    gtAFinalized,
    gtBFinalized,
    nonTradingPendingClosed,
  }
}
