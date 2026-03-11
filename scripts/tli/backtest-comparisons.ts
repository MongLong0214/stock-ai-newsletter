import { config } from 'dotenv'
config({ path: '.env.local' })
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import {
  normalizeTimeline, findPeakDay, extractFeatures, featuresToArray, compositeCompare,
  pearsonCorrelation, type TimeSeriesPoint, type FeaturePopulationStats,
} from '../../lib/tli/comparison'
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
  activeDays: number; sector: string
  interestValues: number[]; avgPriceChangePct: number; avgVolume: number
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
      'theme_state_history_v2', 'theme_id, effective_from, effective_to, is_active, closed_at', themeIds,
    ),
  ])

  const interestByTheme = groupByThemeId(interestAll)

  // 테마 보강
  const enriched: EnrichedTheme[] = []
  for (const theme of themes) {
    const interest = (interestByTheme.get(theme.id) || []).sort((a, b) => a.time.localeCompare(b.time))
    const fsd = resolveFirstSpikeDate(theme, interest, new Date(Date.now() + 9 * 60 * 60 * 1000))
    if (!fsd) continue
    if (interest.length < 14) continue

    const curve = normalizeTimeline(interest.map(m => ({ date: m.time, value: m.normalized })), fsd)
    const keywords: string[] = []
    const peakDay = findPeakDay(curve)
    if (peakDay < 0) continue
    const totalDays = curve.length > 0 ? curve[curve.length - 1].day : 0
    const activeDays = totalDays
    const interestValues = interest.map(m => m.normalized)

    // historical keyword/stock snapshot이 아직 없으므로 neutral defaults 사용
    const avgPriceChangePct = 0
    const avgVolume = 0

    enriched.push({
      id: theme.id, name: theme.name, firstSpikeDate: fsd,
      curve, keywords, peakDay, totalDays, activeDays, sector: 'etc',
      interestValues, avgPriceChangePct, avgVolume,
    })
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

  const thresholds = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60]
  const folds = buildTemporalBacktestFolds(enriched, 3).map((fold, idx) => ({
    foldId: `fold-${idx + 1}`,
    train: [...fold.train, ...fold.validation],
    validation: fold.validation,
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
      })

      for (const past of archetypeCandidates) {
        if (past.curve.length < 14) continue

        const pastFeatures = extractFeatures({
          interestValues: past.interestValues,
          totalNewsCount: 0,
          activeDays: past.activeDays,
          avgPriceChangePct: past.avgPriceChangePct,
          avgVolume: past.avgVolume,
        })

        const result = compositeCompare({
          current: {
            features: halfFeatures,
            curve: halfCurve,
            keywords: current.keywords,
            activeDays: halfCurve[halfCurve.length - 1]?.day || 0,
            sector: current.sector,
          },
          past: {
            features: pastFeatures,
            curve: past.curve,
            keywords: past.keywords,
            peakDay: past.peakDay,
            totalDays: past.totalDays,
            name: past.name,
            sector: past.sector,
          },
          populationStats,
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
