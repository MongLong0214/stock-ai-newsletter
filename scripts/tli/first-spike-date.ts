import { resolveFirstSpikeDate } from './enrich-themes'

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

  return updates
}
