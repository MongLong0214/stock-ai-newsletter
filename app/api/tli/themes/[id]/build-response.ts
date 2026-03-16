/**
 * ThemeDetail 응답 객체 조합
 */

import type { ThemeDetail } from '@/lib/tli/types'
import { toStage, getStageKo, isScoreComponents } from '@/lib/tli/types'
import type { ComparisonResult } from '@/lib/tli/types/api'
import type {
  AnalogEvidencePayload,
  ForecastPayload,
} from '@/lib/tli/forecast/api-payloads'
import type { ThemeForecastControl } from '@/lib/tli/types/api'

interface ThemeBasic {
  id: string
  name: string
  name_en: string | null
  description: string | null
  first_spike_date: string | null
}

interface ScoreData {
  score: number
  stage: string
  is_reigniting: boolean
  calculated_at: string
  components: unknown
}

interface BuildThemeDetailParams {
  theme: ThemeBasic
  latestScore: ScoreData | null
  dayAgoScore: ScoreData | null
  weekAgoScore: ScoreData | null
  stockCount: number
  stocks: Array<{
    symbol: string
    name: string
    market: string
    current_price: number | null
    price_change_pct: number | null
    volume: number | null
  }>
  newsCount: number
  newsArticles: Array<{
    title: string
    link: string
    source: string | null
    pub_date: string
  }>
  keywords: string[]
  comparisonResults: ComparisonResult[]
  allScores: ScoreData[]
  newsList: Array<{ time: string; article_count: number }>
  interestList: Array<{ time: string; normalized: number }>
  forecast?: ForecastPayload
  analogEvidence?: AnalogEvidencePayload
  forecastControl?: ThemeForecastControl
  comparisonSource?: ThemeDetail['comparisonSource']
}

/**
 * ThemeDetail 응답 객체 조합
 */
export function buildThemeDetailResponse(params: BuildThemeDetailParams): ThemeDetail {
  const {
    theme,
    latestScore,
    dayAgoScore,
    weekAgoScore,
    stockCount,
    stocks,
    newsCount,
    newsArticles,
    keywords,
    comparisonResults,
    allScores,
    newsList,
    interestList,
    forecast,
    analogEvidence,
    forecastControl,
    comparisonSource,
  } = params

  const rawComponents = latestScore?.components ?? null
  const components = isScoreComponents(rawComponents) ? rawComponents : null
  const stage = toStage(latestScore?.stage)

  return {
    id: theme.id,
    name: theme.name,
    nameEn: theme.name_en,
    description: theme.description,
    firstSpikeDate: theme.first_spike_date,
    keywords,
    score: {
      value: latestScore?.score ?? 0,
      stage,
      stageKo: getStageKo(stage),
      updatedAt: latestScore?.calculated_at ?? new Date().toISOString(),
      change24h: latestScore?.score != null && dayAgoScore?.score != null
        ? latestScore.score - dayAgoScore.score
        : 0,
      change7d: latestScore?.score != null && weekAgoScore?.score != null
        ? latestScore.score - weekAgoScore.score
        : 0,
      isReigniting: latestScore?.is_reigniting ?? false,
      components: {
        interest: components?.interest_score ?? 0,
        newsMomentum: components?.news_momentum ?? 0,
        volatility: components?.volatility_score ?? 0,
        activity: components?.activity_score ?? 0,
      },
      raw: components?.raw
        ? {
            recent7dAvg: components.raw.recent_7d_avg,
            baseline30dAvg: components.raw.baseline_30d_avg,
            newsThisWeek: components.raw.news_this_week,
            newsLastWeek: components.raw.news_last_week,
            interestStddev: components.raw.interest_stddev,
            activeDays: components.raw.active_days,
          }
        : null,
      confidence: components?.confidence
        ? {
            level: components.confidence.level,
            dataAge: components.confidence.dataAge,
            interestCoverage: components.confidence.interestCoverage,
            newsCoverage: components.confidence.newsCoverage,
            reason: components.confidence.reason,
          }
        : null,
    },
    stockCount,
    stocks: stocks.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      market: s.market,
      currentPrice: s.current_price ?? null,
      priceChangePct: s.price_change_pct ?? null,
      volume: s.volume ?? null,
    })),
    newsCount,
    recentNews: newsArticles.map((a) => ({
      title: a.title,
      link: a.link,
      source: a.source,
      pubDate: a.pub_date,
    })),
    comparisons: comparisonResults,
    forecast,
    analogEvidence,
    forecastControl,
    lifecycleCurve: allScores.map((s) => ({
      date: s.calculated_at,
      score: s.score,
    })),
    newsTimeline: newsList.map((n) => ({
      date: n.time,
      count: n.article_count,
    })),
    interestTimeline: interestList.map((i) => ({
      date: i.time,
      value: i.normalized,
    })),
    comparisonSource,
  }
}
