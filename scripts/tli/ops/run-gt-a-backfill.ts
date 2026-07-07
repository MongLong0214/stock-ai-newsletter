process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET ?? 'true'

import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from '../shared/supabase-admin'
import { generateGtALabelsForBaseDate } from '../labels/label-gt-a'
import {
  buildGtABackfillAudit,
  type GtALabelAuditRow,
} from '../labels/gt-a-audit'
import { getKSTDateString } from '../../../lib/tli/date-utils'
import {
  addKoreanTradingDays,
  getKoreanTradingDatesBetween,
} from '../../../lib/tli/trading-calendar'

const DEFAULT_START_DATE = '2026-01-07'
const DEFAULT_MIN_FINAL_LABELS = 2000

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

async function loadAuditRows(input: {
  readonly startDate: string
  readonly endDate: string
}): Promise<GtALabelAuditRow[]> {
  const rows: GtALabelAuditRow[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('theme_labels')
      .select('label_status, g_log_ratio, y_binary, rescale_suspect, low_signal, exclude_reason')
      .eq('label_type', 'gt_a')
      .gte('base_date', input.startDate)
      .lte('base_date', input.endDate)
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`GT-A audit row 로딩 실패: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return rows
}

export async function runGtABackfill(input: {
  readonly startDate?: string
  readonly endDate?: string
  readonly today?: string
  readonly minimumFinalLabels?: number
}) {
  const startDate = input.startDate ?? process.env.TLI_GTA_BACKFILL_START_DATE ?? DEFAULT_START_DATE
  const today = input.today ?? getKSTDateString()
  const endDate = input.endDate ?? process.env.TLI_GTA_BACKFILL_END_DATE ?? addKoreanTradingDays(today, -1)
  const minimumFinalLabels = input.minimumFinalLabels
    ?? parsePositiveInteger(process.env.TLI_GTA_MIN_FINAL_LABELS, DEFAULT_MIN_FINAL_LABELS)
  const baseDates = getKoreanTradingDatesBetween({ startDate, endDate })

  for (const baseDate of baseDates) {
    const result = await generateGtALabelsForBaseDate({
      baseDate,
      includeInactive: true,
      today,
    })
    console.log(
      `GT-A ${baseDate}: total=${result.totalThemes} pending=${result.pendingCount} final=${result.finalCount} excluded=${result.excludedCount} censored=${result.censoredCount}`,
    )
  }

  const audit = buildGtABackfillAudit(await loadAuditRows({ startDate, endDate }))
  const output = {
    startDate,
    endDate,
    businessDateCount: baseDates.length,
    minimumFinalLabels,
    ...audit,
  }
  console.log(JSON.stringify(output, null, 2))

  if (audit.finalCount < minimumFinalLabels) {
    throw new Error(`GT-A final 라벨 부족: ${audit.finalCount} < ${minimumFinalLabels}`)
  }
  if (audit.deltaReviewRequired) {
    throw new Error(`GT-A delta 재검토 필요: baseRate=${audit.baseRate ?? 'null'}`)
  }

  return output
}

async function main() {
  await runGtABackfill({})
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
