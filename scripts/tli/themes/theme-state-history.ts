/**
 * CMPV4-003: Theme State History — Pure Functions
 *
 * Point-in-time theme state tracking for replay-safe backtest & promotion.
 * All functions are pure (no DB calls) for testability.
 */

// ── Types ──

interface ThemeStateHistoryRow {
  theme_id: string
  effective_from: string
  effective_to: string | null
  is_active: boolean
  closed_at: string | null
  first_spike_date: string | null
  state_version: 'backfill-v1' | 'live-v1' | 'unknown'
  created_at: string
}

interface ThemeStateHistoryLookupRow {
  theme_id: string
  effective_from: string
  effective_to: string | null
  is_active: boolean
  closed_at: string | null
  first_spike_date: string | null
  state_version: string
}

// ── Backfill ──

export const buildBackfillRow = (input: {
  themeId: string
  isActive: boolean
  firstSpikeDate: string | null
  createdAt: string
  lastScoreDate: string | null
  updatedAt: string
}): ThemeStateHistoryRow => {
  const createdDate = input.createdAt.split('T')[0]
  const closedAt = !input.isActive && input.lastScoreDate ? input.lastScoreDate : null

  // inactive + no closed_at derivation → unknown
  const stateVersion: ThemeStateHistoryRow['state_version'] =
    !input.isActive && !closedAt ? 'unknown' : 'backfill-v1'
  const effectiveFrom = input.isActive
    ? createdDate
    : (closedAt ?? createdDate)

  return {
    theme_id: input.themeId,
    effective_from: effectiveFrom,
    effective_to: null,
    is_active: input.isActive,
    closed_at: closedAt,
    first_spike_date: input.firstSpikeDate,
    state_version: stateVersion,
    created_at: new Date().toISOString(),
  }
}

// ── Ongoing State Change ──

export const buildOngoingStateChangeRow = (input: {
  themeId: string
  newIsActive: boolean
  firstSpikeDate: string | null
  changeDate: string
}): ThemeStateHistoryRow => {
  return {
    theme_id: input.themeId,
    effective_from: input.changeDate,
    effective_to: null,
    is_active: input.newIsActive,
    closed_at: input.newIsActive ? null : input.changeDate,
    first_spike_date: input.firstSpikeDate,
    state_version: 'live-v1',
    created_at: new Date().toISOString(),
  }
}

// ── Close Previous Row ──

export const buildCloseRowPatch = (input: {
  changeDate: string
}): { effective_to: string } => {
  return { effective_to: input.changeDate }
}

export const buildFirstSpikeDateSyncPatch = (input: {
  firstSpikeDate: string
}): { first_spike_date: string } => ({
  first_spike_date: input.firstSpikeDate,
})

// ── Backfill Completion Check ──

export const isStateHistoryBackfillComplete = (input: {
  totalThemeCount: number
  themesWithHistoryCount: number
}): boolean => {
  if (input.totalThemeCount === 0) return false
  return input.themesWithHistoryCount >= input.totalThemeCount
}

// ── Point-in-Time Query ──

export const getThemeStateAtDate = (
  themeId: string,
  date: string,
  history: ThemeStateHistoryLookupRow[],
): ThemeStateHistoryLookupRow | null => {
  const themeRows = history.filter((row) => row.theme_id === themeId)

  for (const row of themeRows) {
    const from = row.effective_from
    const to = row.effective_to

    if (date >= from && (to === null || date <= to)) {
      return row
    }
  }

  return null
}

// ── Archetype Judgment ──

export const isArchetypeAtDate = (
  themeId: string,
  runDate: string,
  history: ThemeStateHistoryLookupRow[],
): boolean => {
  const state = getThemeStateAtDate(themeId, runDate, history)
  if (!state) return false

  // active themes are not archetypes
  if (state.is_active) return false

  // unknown state (no closed_at) → excluded from primary archetype pool
  if (!state.closed_at) return false

  // closed_at must be before runDate
  return state.closed_at < runDate
}
