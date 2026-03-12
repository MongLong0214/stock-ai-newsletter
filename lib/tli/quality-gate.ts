import type { ThemeListItem } from './types'
import { QUALITY_GATE } from './constants/quality-gate'

export function buildQualityGateBuckets(themes: ThemeListItem[]): {
  emerging: ThemeListItem[]
  growth: ThemeListItem[]
  peak: ThemeListItem[]
  decline: ThemeListItem[]
  reigniting: ThemeListItem[]
} {
  const { minScore, excludeConfidence } = QUALITY_GATE

  const emerging: ThemeListItem[] = []
  const growth: ThemeListItem[] = []
  const peak: ThemeListItem[] = []
  const decline: ThemeListItem[] = []
  const reigniting: ThemeListItem[] = []

  for (const theme of themes) {
    if (theme.stage === 'Dormant') continue
    if (theme.score <= 0) continue
    if (theme.score < minScore) continue
    if (theme.confidenceLevel && excludeConfidence.includes(theme.confidenceLevel)) continue

    if (theme.isReigniting) {
      reigniting.push(theme)
    } else {
      switch (theme.stage) {
        case 'Emerging': emerging.push(theme); break
        case 'Growth': growth.push(theme); break
        case 'Peak': peak.push(theme); break
        case 'Decline': decline.push(theme); break
      }
    }
  }

  // Emerging: 오름차순 — 낮은 점수 = 진짜 신규 기회.
  // 고점수 Emerging은 catch-all 오분류(avg 62.5 > Growth avg 49.7)이므로 의도적 제외.
  emerging.sort((a, b) => a.score - b.score)
  growth.sort((a, b) => b.score - a.score)
  peak.sort((a, b) => b.score - a.score)
  decline.sort((a, b) => b.score - a.score)
  reigniting.sort((a, b) => b.score - a.score)

  return { emerging, growth, peak, decline, reigniting }
}

export function applyQualityGate(themes: ThemeListItem[]): {
  emerging: ThemeListItem[]
  growth: ThemeListItem[]
  peak: ThemeListItem[]
  decline: ThemeListItem[]
  reigniting: ThemeListItem[]
} {
  const { stageCaps, reignitingCap } = QUALITY_GATE
  const buckets = buildQualityGateBuckets(themes)

  return {
    emerging: buckets.emerging.slice(0, stageCaps.Emerging),
    growth: buckets.growth.slice(0, stageCaps.Growth),
    peak: buckets.peak.slice(0, stageCaps.Peak),
    decline: buckets.decline.slice(0, stageCaps.Decline),
    reigniting: buckets.reigniting.slice(0, reignitingCap),
  }
}
