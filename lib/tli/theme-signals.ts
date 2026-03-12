import type { ThemeListItem, ThemeRanking } from './types'

export interface ThemeSignalItem {
  id: string
  name: string
  detail: string
}

export interface ThemeSignalCard {
  key: 'movers' | 'peak' | 'emerging' | 'reigniting'
  title: string
  themes: ThemeSignalItem[]
}

type ThemeSignalPools = Pick<ThemeRanking, 'emerging' | 'growth' | 'peak' | 'decline' | 'reigniting'>

const SCORE_SURGE_MIN_CHANGE = 0.1
const EMERGING_MIN_CHANGE = 0

function toDetailTheme(theme: ThemeListItem, detail: string): ThemeSignalItem {
  return {
    id: theme.id,
    name: theme.name,
    detail,
  }
}

export function buildSignalCardsFromPools(pools: ThemeSignalPools): ThemeSignalCard[] {
  const allThemes: ThemeListItem[] = [
    ...pools.emerging,
    ...pools.growth,
    ...pools.peak,
    ...pools.decline,
    ...pools.reigniting,
  ]

  const topMovers = [...allThemes]
    .filter((theme) => theme.change7d > SCORE_SURGE_MIN_CHANGE)
    .sort((a, b) => b.change7d - a.change7d)
    .slice(0, 3)
    .map((theme) => toDetailTheme(theme, `+${theme.change7d.toFixed(1)}`))

  const peakEntries = pools.peak
    .filter((theme) => theme.change7d > 0)
    .map((theme) => toDetailTheme(theme, `${theme.score.toFixed(0)}점`))

  const emergingMomentum = pools.emerging
    .filter((theme) => theme.change7d >= EMERGING_MIN_CHANGE)
    .sort((a, b) => b.score - a.score || b.change7d - a.change7d)
    .slice(0, 3)
    .map((theme) => toDetailTheme(theme, `${theme.score.toFixed(0)}점`))

  const reignitingThemes = pools.reigniting
    .filter((theme) => theme.change7d > 0)
    .sort((a, b) => b.change7d - a.change7d)
    .map((theme) => toDetailTheme(theme, `+${theme.change7d.toFixed(1)}`))

  const signals: ThemeSignalCard[] = []

  if (topMovers.length > 0) {
    signals.push({ key: 'movers', title: '점수 급등', themes: topMovers })
  }

  if (peakEntries.length > 0) {
    signals.push({ key: 'peak', title: '과열 주의', themes: peakEntries })
  }

  if (emergingMomentum.length > 0) {
    signals.push({ key: 'emerging', title: '초기 강세', themes: emergingMomentum })
  }

  if (reignitingThemes.length > 0) {
    signals.push({ key: 'reigniting', title: '재점화', themes: reignitingThemes })
  }

  return signals
}

export function buildSignalCards(ranking: ThemeRanking): ThemeSignalCard[] {
  return ranking.signals?.length ? ranking.signals : buildSignalCardsFromPools(ranking)
}
