import { resolveFirstSpikeDate } from '@/scripts/tli/themes/enrich-themes'

const DEFAULT_MAX_SHARED_SPIKE_DATE_SHARE = 0.2
const DEFAULT_MIN_SHARED_SPIKE_DATE_COUNT = 10

interface MinimalThemeForSpikeInference {
  id: string
  name?: string
  first_spike_date: string | null
  created_at: string | null
  is_active?: boolean
}

export function buildDiscoveredThemeInsert(input: {
  name: string
  naverThemeId: string
  today: string
  discoveredAt: string
}) {
  return {
    name: input.name,
    naver_theme_id: input.naverThemeId,
    is_active: false,
    discovery_source: 'naver_finance',
    discovered_at: input.discoveredAt,
    last_seen_on_naver: input.today,
    naver_seen_streak: 1,
    first_spike_date: null,
  }
}

export function buildInitialStateHistoryInput(input: {
  themeId: string
  changeDate: string
}) {
  return {
    themeId: input.themeId,
    newIsActive: false as const,
    firstSpikeDate: null,
    changeDate: input.changeDate,
  }
}

export function buildFirstSpikeDateBackfillRows(
  themes: MinimalThemeForSpikeInference[],
  interestByTheme: Map<string, Array<{ time: string; normalized: number }>>,
  kstNow: Date,
): Array<{ id: string; first_spike_date: string }> {
  const updates: Array<{ id: string; first_spike_date: string }> = []

  for (const theme of themes) {
    if (theme.first_spike_date) continue

    const inferred = resolveFirstSpikeDate({
      id: theme.id,
      name: theme.name ?? theme.id,
      first_spike_date: theme.first_spike_date,
      created_at: theme.created_at,
      is_active: theme.is_active ?? false,
    }, interestByTheme.get(theme.id), kstNow)
    if (!inferred) continue

    updates.push({
      id: theme.id,
      first_spike_date: inferred,
    })
  }

  return filterSpikeDateBackfillRowsByConcentration(updates).rows
}

export function buildFirstSpikeDateRepairRows(
  themes: MinimalThemeForSpikeInference[],
  interestByTheme: Map<string, Array<{ time: string; normalized: number }>>,
  kstNow: Date,
  repairDates: string[],
): Array<{ id: string; first_spike_date: string }> {
  const repairSet = new Set(repairDates)
  const updates: Array<{ id: string; first_spike_date: string }> = []

  for (const theme of themes) {
    if (!theme.first_spike_date || !repairSet.has(theme.first_spike_date)) continue

    const inferred = resolveFirstSpikeDate({
      id: theme.id,
      name: theme.name ?? theme.id,
      first_spike_date: null,
      created_at: theme.created_at,
      is_active: theme.is_active ?? false,
    }, interestByTheme.get(theme.id), kstNow)
    if (!inferred || inferred === theme.first_spike_date) continue

    updates.push({
      id: theme.id,
      first_spike_date: inferred,
    })
  }

  return filterSpikeDateBackfillRowsByConcentration(updates).rows
}

export function filterSpikeDateBackfillRowsByConcentration(
  rows: Array<{ id: string; first_spike_date: string }>,
  input: {
    maxSharedSpikeDateShare?: number
    minSharedSpikeDateCount?: number
  } = {},
) {
  if (rows.length === 0) {
    return { rows, blockedDates: [] as string[], blockedCount: 0 }
  }

  const maxShare = input.maxSharedSpikeDateShare ?? DEFAULT_MAX_SHARED_SPIKE_DATE_SHARE
  const minCount = input.minSharedSpikeDateCount ?? DEFAULT_MIN_SHARED_SPIKE_DATE_COUNT

  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.first_spike_date, (counts.get(row.first_spike_date) ?? 0) + 1)
  }

  const blockedDates = [...counts.entries()]
    .filter(([, count]) => count >= minCount && (count / rows.length) > maxShare)
    .map(([date]) => date)

  if (blockedDates.length === 0) {
    return { rows, blockedDates, blockedCount: 0 }
  }

  const blocked = new Set(blockedDates)
  const filteredRows = rows.filter((row) => !blocked.has(row.first_spike_date))

  return {
    rows: filteredRows,
    blockedDates,
    blockedCount: rows.length - filteredRows.length,
  }
}
