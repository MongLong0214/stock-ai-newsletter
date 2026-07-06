const DAY_MS = 24 * 60 * 60 * 1000

export interface ScorelessZombieThemeInput {
  id: string
  name: string
  createdAt: string | null
  isActive: boolean
}

export interface ScorelessZombieThemeCandidate {
  id: string
  name: string
  createdAt: string
  ageDays: number
}

export function getThemeAgeDays(input: {
  createdAt: string | null
  today: Date
}): number | null {
  if (!input.createdAt) return null

  const createdAt = new Date(input.createdAt).getTime()
  const today = input.today.getTime()
  if (!Number.isFinite(createdAt) || !Number.isFinite(today)) return null

  const ageMs = today - createdAt
  if (ageMs < 0) return null

  return Math.floor(ageMs / DAY_MS)
}

export function shouldDeactivateScorelessTheme(input: {
  isActive: boolean
  createdAt: string | null
  hasScores: boolean
  today: Date
  minimumAgeDays: number
}): boolean {
  if (!input.isActive || input.hasScores) return false

  const ageDays = getThemeAgeDays({
    createdAt: input.createdAt,
    today: input.today,
  })
  if (ageDays == null) return false

  // notSeenDays(theme-lifecycle.ts DEACTIVATION_CONFIG) 판정과 경계 일관성 유지 — 정확히 N일째부터 대상
  return ageDays >= input.minimumAgeDays
}

export function findScorelessZombieThemes(input: {
  themes: ScorelessZombieThemeInput[]
  scoredThemeIds: ReadonlySet<string>
  today: Date
  minimumAgeDays: number
}): ScorelessZombieThemeCandidate[] {
  const candidates: ScorelessZombieThemeCandidate[] = []

  for (const theme of input.themes) {
    if (!shouldDeactivateScorelessTheme({
      isActive: theme.isActive,
      createdAt: theme.createdAt,
      hasScores: input.scoredThemeIds.has(theme.id),
      today: input.today,
      minimumAgeDays: input.minimumAgeDays,
    })) continue

    const ageDays = getThemeAgeDays({
      createdAt: theme.createdAt,
      today: input.today,
    })
    if (theme.createdAt == null || ageDays == null) continue

    candidates.push({
      id: theme.id,
      name: theme.name,
      createdAt: theme.createdAt,
      ageDays,
    })
  }

  return candidates
}
