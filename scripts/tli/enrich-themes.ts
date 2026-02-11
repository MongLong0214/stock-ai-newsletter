/** 테마 보강 — first_spike_date 추론 · 피처 추출 · 곡선 구축 · 모집단 통계 */

import {
  normalizeTimeline, normalizeValues, resampleCurve, findPeakDay,
  extractFeatures, featuresToArray, classifySector,
  type TimeSeriesPoint, type ThemeFeatures, type FeaturePopulationStats,
} from '../../lib/tli/comparison'

// ── 타입 ──────────────────────────────────────────────────────────────────────

export interface RawTheme {
  id: string
  name: string
  first_spike_date: string | null
  created_at: string | null
  is_active: boolean
}

export interface EnrichedTheme {
  id: string
  name: string
  firstSpikeDate: string
  isActive: boolean
  features: ThemeFeatures
  curve: TimeSeriesPoint[]
  resampledCurve: number[]
  keywords: string[]
  keywordsLower: Set<string>
  peakDay: number
  totalDays: number
  activeDays: number
  sector: string
}

export interface ThemeDataMaps {
  interest: Map<string, Array<{ time: string; normalized: number }>>
  scores: Map<string, Array<{ score: number; calculated_at: string }>>
  news: Map<string, Array<{ article_count: number }>>
  keywords: Map<string, Array<{ keyword: string }>>
  stocks: Map<string, Array<{ price_change_pct: number | null; volume: number | null }>>
}

// ── 테마 보강 ─────────────────────────────────────────────────────────────────

const MIN_MEANINGFUL_INTEREST = 30

/** 전체 테마에 대해 first_spike_date 추론 + 피처 추출 + 곡선 구축 */
export function enrichThemes(
  allThemes: RawTheme[],
  data: ThemeDataMaps,
  kstNow: Date,
): { themes: EnrichedTheme[]; inferredCount: number } {
  const enriched: EnrichedTheme[] = []
  let inferredCount = 0

  for (const theme of allThemes) {
    const firstSpikeDate = resolveFirstSpikeDate(theme, data.interest.get(theme.id), kstNow)
    if (!firstSpikeDate) continue
    if (firstSpikeDate !== theme.first_spike_date) inferredCount++

    // 데이터 수집
    const interest = data.interest.get(theme.id) || []
    const scores = data.scores.get(theme.id) || []
    const news = data.news.get(theme.id) || []
    const keywords = (data.keywords.get(theme.id) || []).map(k => k.keyword)
    const stocks = data.stocks.get(theme.id) || []

    // first_spike_date 이후 관심도 곡선
    const interestAfterSpike = interest
      .filter(m => m.time >= firstSpikeDate)
      .sort((a, b) => a.time.localeCompare(b.time))
    const curve = normalizeTimeline(
      interestAfterSpike.map(m => ({ date: m.time, value: m.normalized })),
      firstSpikeDate,
    )

    // 활성 일수 (KST 날짜 기준, 시간 절삭으로 ±1일 오차 제거)
    const kstToday = kstNow.toISOString().split('T')[0]
    const activeDays = Math.max(0, Math.floor((new Date(kstToday).getTime() - new Date(firstSpikeDate).getTime()) / 86400000))

    // 주가/거래량 집계
    const validPrices = stocks.filter(s => s.price_change_pct !== null).map(s => s.price_change_pct!)
    const validVolumes = stocks.filter(s => s.volume !== null).map(s => s.volume!)
    const avgPriceChangePct = validPrices.length > 0 ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length : 0
    const avgVolume = validVolumes.length > 0 ? validVolumes.reduce((a, b) => a + b, 0) / validVolumes.length : 0

    // 피처 벡터 추출
    const features = extractFeatures({
      scores: scores.map(s => ({ score: s.score })),
      interestValues: interestAfterSpike.map(m => m.normalized),
      totalNewsCount: news.reduce((sum, n) => sum + n.article_count, 0),
      activeDays,
      avgPriceChangePct,
      avgVolume,
    })

    // 피크/총일수
    const peakDay = curve.length > 0 ? findPeakDay(curve) : -1
    const totalDays = curve.length > 0 ? curve[curve.length - 1].day : activeDays

    // 사전계산 캐싱 (비교 시 재계산 방지)
    const resampledCurve = curve.length >= 7 ? resampleCurve(normalizeValues(curve)) : []
    const keywordsLower = new Set(keywords.map(k => k.toLowerCase()))

    enriched.push({
      id: theme.id,
      name: theme.name,
      firstSpikeDate,
      isActive: theme.is_active,
      features, curve, resampledCurve, keywords, keywordsLower, peakDay, totalDays, activeDays,
      sector: classifySector(keywords),
    })
  }

  return { themes: enriched, inferredCount }
}

// ── first_spike_date 결정 ────────────────────────────────────────────────────

/** first_spike_date가 없거나 365일 초과 시 자동 추론 (장기/반복 테마 대응) */
function resolveFirstSpikeDate(
  theme: RawTheme,
  interest: Array<{ time: string; normalized: number }> | undefined,
  kstNow: Date,
): string | null {
  const fsd = theme.first_spike_date
  const daysSince = fsd ? Math.floor((kstNow.getTime() - new Date(fsd).getTime()) / 86400000) : Infinity

  if (fsd && daysSince <= 365) return fsd

  // 관심도 데이터 기반 추론
  if (interest && interest.length > 0) {
    const sorted = [...interest].sort((a, b) => a.time.localeCompare(b.time))
    const meaningful = sorted.find(d => d.normalized >= MIN_MEANINGFUL_INTEREST)
    if (meaningful) return meaningful.time
    return sorted.reduce((max, d) => d.normalized > max.normalized ? d : max, sorted[0]).time
  }

  // created_at 폴백
  if (theme.created_at) return new Date(theme.created_at).toISOString().split('T')[0]

  return null
}

// ── 모집단 통계 ──────────────────────────────────────────────────────────────

/** 피처 벡터의 표본 평균/표준편차 (z-score 정규화용, 최소 3개 테마 필요) */
export function computePopulationStats(themes: EnrichedTheme[]): FeaturePopulationStats {
  if (themes.length < 3) return { means: [], stddevs: [] }
  const vecs = themes.map(t => featuresToArray(t.features))
  const numDims = vecs[0]?.length ?? 0
  const n = vecs.length
  const means: number[] = []
  const stddevs: number[] = []

  for (let d = 0; d < numDims; d++) {
    const vals = vecs.map(v => v[d])
    const mean = vals.reduce((s, v) => s + v, 0) / n
    means.push(mean)
    // Bessel 보정: N-1로 나눠 표본 표준편차 사용 (모집단이 아닌 표본이므로)
    stddevs.push(Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)))
  }

  return { means, stddevs }
}