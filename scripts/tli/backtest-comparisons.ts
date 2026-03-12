import { config } from 'dotenv'
config({ path: '.env.local' })
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import { normalizeTimeline, findPeakDay, type TimeSeriesPoint } from '../../lib/tli/comparison/timeline'
import { classifySectorProfile, extractFeatures, featuresToArray } from '../../lib/tli/comparison/features'
import { compositeCompare } from '../../lib/tli/comparison/composite'
import { pearsonCorrelation, type FeaturePopulationStats } from '../../lib/tli/comparison/similarity'
import { resolveFirstSpikeDate } from './enrich-themes'
import {
  aggregateThresholdSweepResults,
  buildBacktestArtifacts,
  buildTemporalBacktestFolds,
  renderThresholdSweepSummary,
  runThresholdSweepAcrossFolds,
  selectArchetypeCandidatesAtRunDate,
  selectBestThreshold,
} from './comparison-v4-backtest'

interface EnrichedTheme {
  id: string; name: string; firstSpikeDate: string
  curve: TimeSeriesPoint[]; keywords: string[]; peakDay: number; totalDays: number
  activeDays: number; sector: string; sectorConfidence: number
  interestValues: number[]; avgPriceChangePct: number; avgVolume: number
  features: ReturnType<typeof extractFeatures>
}

interface ThresholdEvaluation {
  matches: number
  accurate: number
}

interface ThemeStateHistoryRow {
  theme_id: string
  effective_from: string
  effective_to: string | null
  is_active: boolean
  closed_at: string | null
  state_version: string
}

export function buildBacktestKeywordSupportCounts(keywordSets: string[][]) {
  const counts = new Map<string, number>()
  for (const keywords of keywordSets) {
    for (const keyword of keywords) {
      const normalized = keyword.toLowerCase()
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
    }
  }
  return counts
}

export function buildBacktestEnrichedTheme(input: {
  theme: { id: string; name: string; first_spike_date: string | null; created_at: string | null; is_active: boolean }
  interest: Array<{ theme_id: string; time: string; normalized: number }>
  keywords: string[]
  stocks: Array<{ price_change_pct: number | null; volume: number | null }>
  keywordSupportCounts: Map<string, number>
  kstNow: Date
}): EnrichedTheme | null {
  const interest = [...input.interest].sort((a, b) => a.time.localeCompare(b.time))
  const fsd = resolveFirstSpikeDate(input.theme, interest, input.kstNow)
  if (!fsd || interest.length < 14) return null

  const curve = normalizeTimeline(interest.map((metric) => ({ date: metric.time, value: metric.normalized })), fsd)
  const peakDay = findPeakDay(curve)
  if (peakDay < 0) return null

  const totalDays = curve.length > 0 ? curve[curve.length - 1].day : 0
  const activeDays = totalDays
  const interestValues = interest.map((metric) => metric.normalized)
  const validPrices = input.stocks.filter((stock) => stock.price_change_pct != null).map((stock) => stock.price_change_pct as number)
  const validVolumes = input.stocks.filter((stock) => stock.volume != null).map((stock) => stock.volume as number)
  const avgPriceChangePct = validPrices.length > 0 ? validPrices.reduce((sum, value) => sum + value, 0) / validPrices.length : 0
  const avgVolume = validVolumes.length > 0 ? validVolumes.reduce((sum, value) => sum + value, 0) / validVolumes.length : 0
  const sectorProfile = classifySectorProfile(input.keywords)
  const features = extractFeatures({
    interestValues,
    totalNewsCount: 0,
    activeDays,
    avgPriceChangePct,
    avgVolume,
    keywords: input.keywords,
    keywordSupportCounts: input.keywordSupportCounts,
    sectorConfidence: sectorProfile.confidence,
  })

  return {
    id: input.theme.id,
    name: input.theme.name,
    firstSpikeDate: fsd,
    curve,
    keywords: input.keywords,
    peakDay,
    totalDays,
    activeDays,
    sector: sectorProfile.sector,
    sectorConfidence: sectorProfile.confidence,
    interestValues,
    avgPriceChangePct,
    avgVolume,
    features,
  }
}

async function main() {
  console.log('🔬 비교 알고리즘 백테스트\n')

  // 전체 테마 로딩 (point-in-time active/inactive는 state history로 판정)
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, first_spike_date, created_at, is_active')

  if (!themes?.length) { console.log('❌ 테마 없음'); return }

  const themeIds = themes.map(t => t.id)

  // point-in-time safe backtest를 위해 현재 시점 종목/키워드 스냅샷은 사용하지 않는다.
  const [interestAll, stateHistoryAll] = await Promise.all([
    batchQuery<{ theme_id: string; time: string; normalized: number }>(
      'interest_metrics', 'theme_id, time, normalized', themeIds,
    ),
    batchQuery<ThemeStateHistoryRow>(
      'theme_state_history_v2', 'theme_id, effective_from, effective_to, is_active, closed_at, state_version', themeIds,
    ),
  ])

  const interestByTheme = groupByThemeId(interestAll)
  const keywordSupportCounts = buildBacktestKeywordSupportCounts([])

  // 테마 보강
  const enriched: EnrichedTheme[] = []
  for (const theme of themes) {
    const keywords: string[] = []
    const enrichedTheme = buildBacktestEnrichedTheme({
      theme,
      interest: interestByTheme.get(theme.id) || [],
      keywords,
      stocks: [],
      keywordSupportCounts,
      kstNow: new Date(Date.now() + 9 * 60 * 60 * 1000),
    })
    if (enrichedTheme) enriched.push(enrichedTheme)
  }

  console.log(`📊 백테스트 대상: ${enriched.length}개 완료 테마\n`)
  if (enriched.length < 2) { console.log('❌ 최소 2개 테마 필요'); return }

  const computeFoldPopulationStats = (themesForStats: EnrichedTheme[]): FeaturePopulationStats => {
    const featureVecs = themesForStats.map(t => {
      const f = extractFeatures({
        interestValues: t.interestValues, totalNewsCount: 0,
        activeDays: t.activeDays, avgPriceChangePct: t.avgPriceChangePct, avgVolume: t.avgVolume,
      })
      return featuresToArray(f)
    })
    if (featureVecs.length === 0) return { means: [], stddevs: [] }
    const numDims = featureVecs[0].length
    const means: number[] = [], stddevs: number[] = []
    for (let d = 0; d < numDims; d++) {
      const vals = featureVecs.map(v => v[d])
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length
      means.push(mean)
      stddevs.push(Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length))
    }
    return { means, stddevs }
  }

  const populationKeywordSupportCounts = buildBacktestKeywordSupportCounts(enriched.map((theme) => theme.keywords))

  const thresholds = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60]
  const folds = buildTemporalBacktestFolds(enriched, 3).map((fold) => ({
    foldId: fold.foldId,
    train: [...fold.train, ...fold.validation],
    validation: fold.validation,
    embargo: fold.embargo,
    test: fold.test,
  }))

  const evaluateFold = (
    currentThemes: EnrichedTheme[],
    candidateThemes: EnrichedTheme[],
    threshold: number,
  ): ThresholdEvaluation => {
    let matches = 0
    let accurate = 0

    for (const current of currentThemes) {
      const midIdx = Math.floor(current.curve.length / 2)
      const halfCurve = current.curve.slice(0, midIdx)
      const remainingCurve = current.curve.slice(midIdx)
      if (halfCurve.length < 7) continue

      const archetypeCandidates = selectArchetypeCandidatesAtRunDate(
        candidateThemes.filter((past) => past.id !== current.id),
        {
          runDate: current.firstSpikeDate,
          stateHistory: stateHistoryAll,
        },
      )
      if (archetypeCandidates.length === 0) continue
      const populationStats = computeFoldPopulationStats(archetypeCandidates)

      const halfFeatures = extractFeatures({
        interestValues: current.interestValues.slice(0, midIdx),
        totalNewsCount: 0,
        activeDays: halfCurve[halfCurve.length - 1]?.day || 0,
        avgPriceChangePct: current.avgPriceChangePct,
        avgVolume: current.avgVolume,
        keywords: current.keywords,
        keywordSupportCounts: populationKeywordSupportCounts,
        sectorConfidence: current.sectorConfidence,
      })

      for (const past of archetypeCandidates) {
        if (past.curve.length < 14) continue

        const pastFeatures = past.features

        const result = compositeCompare({
          current: {
            features: halfFeatures,
            curve: halfCurve,
            keywords: current.keywords,
            activeDays: halfCurve[halfCurve.length - 1]?.day || 0,
            sector: current.sector,
            sectorConfidence: current.sectorConfidence,
          },
          past: {
            features: pastFeatures,
            curve: past.curve,
            keywords: past.keywords,
            peakDay: past.peakDay,
            totalDays: past.totalDays,
            name: past.name,
            sector: past.sector,
            sectorConfidence: past.sectorConfidence,
          },
          populationStats,
          keywordSupportCounts: populationKeywordSupportCounts,
        })

        if (result.similarity >= threshold) {
          matches++
          const remainingValues = remainingCurve.map((point) => point.value)
          const pastRemaining = past.curve.slice(midIdx, midIdx + remainingValues.length).map((point) => point.value)
          const minLen = Math.min(remainingValues.length, pastRemaining.length)
          if (minLen >= 7) {
            const corr = pearsonCorrelation(
              remainingValues.slice(0, minLen),
              pastRemaining.slice(0, minLen),
            )
            if (corr >= 0.3) accurate++
          }
        }
      }
    }

    return { matches, accurate }
  }

  const sweepRows = runThresholdSweepAcrossFolds({
    folds,
    thresholds,
    evaluateFold: ({ foldId, threshold, fold }) => {
      const result = evaluateFold(fold.test, fold.train, threshold)
      return { matches: result.matches, accurate: result.accurate }
    },
  })

  const aggregated = aggregateThresholdSweepResults(sweepRows)
  const best = selectBestThreshold(aggregated)
  console.log('\n📊 임계값별 Held-out Precision:')
  console.table(aggregated.map((row) => ({
    threshold: row.threshold,
    meanPrecision: `${(row.meanPrecision * 100).toFixed(1)}%`,
    totalMatches: row.totalMatches,
    totalAccurate: row.totalAccurate,
  })))
  if (best) {
    const artifacts = buildBacktestArtifacts({
      aggregatedRows: aggregated,
      selectedThreshold: best.threshold,
      currentProductionThreshold: 0.35,
      powerAnalysis: {
        primaryMetric: 'Phase-Aligned Precision@3',
        margin: -0.03,
        minimumDetectableEffect: 0.05,
        clusterCount: enriched.length,
        eligibleRuns: folds.reduce((sum, fold) => sum + fold.test.length, 0),
        confidenceLevel: 0.95,
      },
    })
    console.log(`\n🎯 선택된 임계값: ${best.threshold} (mean precision ${(best.meanPrecision * 100).toFixed(1)}%)`)
    console.log('\n' + artifacts.thresholdSummary)
    console.log('\n' + artifacts.rolloutReport)

    const powerAnalysisPath = resolve(process.cwd(), 'docs/comparison-v4-power-analysis.md')
    await mkdir(dirname(powerAnalysisPath), { recursive: true })
    await writeFile(powerAnalysisPath, `${artifacts.powerAnalysisReport}\n`, 'utf8')
    console.log(`\n📝 Power analysis 문서 생성: ${powerAnalysisPath}`)
  }
  console.log('\n✅ 백테스트 완료')
}

main().catch(console.error)
