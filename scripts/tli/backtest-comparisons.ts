import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import {
  normalizeTimeline, findPeakDay, extractFeatures, featuresToArray, compositeCompare, classifySector,
  pearsonCorrelation, type TimeSeriesPoint, type FeaturePopulationStats,
} from '../../lib/tli/comparison'

interface EnrichedTheme {
  id: string; name: string; firstSpikeDate: string
  curve: TimeSeriesPoint[]; keywords: string[]; peakDay: number; totalDays: number
  activeDays: number; sector: string
  interestValues: number[]; avgPriceChangePct: number; avgVolume: number
}

async function main() {
  console.log('🔬 비교 알고리즘 백테스트\n')

  // 완료된(비활성) 테마 로딩
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, first_spike_date, is_active')
    .eq('is_active', false)

  if (!themes?.length) { console.log('❌ 비활성 테마 없음'); return }

  const themeIds = themes.map(t => t.id)

  // 데이터 배치 로딩 (주가 포함, scores 제거 — v2에서 features에 불필요)
  const [interestAll, keywordsAll, stocksAll] = await Promise.all([
    batchQuery<{ theme_id: string; time: string; normalized: number }>(
      'interest_metrics', 'theme_id, time, normalized', themeIds,
    ),
    batchQuery<{ theme_id: string; keyword: string }>(
      'theme_keywords', 'theme_id, keyword', themeIds,
    ),
    batchQuery<{ theme_id: string; price_change_pct: number | null; volume: number | null }>(
      'theme_stocks', 'theme_id, price_change_pct, volume', themeIds,
    ),
  ])

  const interestByTheme = groupByThemeId(interestAll)
  const keywordsByTheme = groupByThemeId(keywordsAll)
  const stocksByTheme = groupByThemeId(stocksAll)

  // 테마 보강
  const enriched: EnrichedTheme[] = []
  for (const theme of themes) {
    const fsd = theme.first_spike_date
    if (!fsd) continue
    const interest = (interestByTheme.get(theme.id) || []).sort((a, b) => a.time.localeCompare(b.time))
    if (interest.length < 14) continue

    const curve = normalizeTimeline(interest.map(m => ({ date: m.time, value: m.normalized })), fsd)
    const keywords = (keywordsByTheme.get(theme.id) || []).map(k => k.keyword)
    const peakDay = findPeakDay(curve)
    if (peakDay < 0) continue
    const totalDays = curve.length > 0 ? curve[curve.length - 1].day : 0
    const activeDays = totalDays
    const interestValues = interest.map(m => m.normalized)

    // 주가/거래량 집계
    const stocks = stocksByTheme.get(theme.id) || []
    const validPrices = stocks.filter(s => s.price_change_pct !== null).map(s => s.price_change_pct!)
    const validVolumes = stocks.filter(s => s.volume !== null).map(s => s.volume!)
    const avgPriceChangePct = validPrices.length > 0 ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length : 0
    const avgVolume = validVolumes.length > 0 ? validVolumes.reduce((a, b) => a + b, 0) / validVolumes.length : 0

    enriched.push({
      id: theme.id, name: theme.name, firstSpikeDate: fsd,
      curve, keywords, peakDay, totalDays, activeDays, sector: classifySector(keywords),
      interestValues, avgPriceChangePct, avgVolume,
    })
  }

  console.log(`📊 백테스트 대상: ${enriched.length}개 완료 테마\n`)
  if (enriched.length < 2) { console.log('❌ 최소 2개 테마 필요'); return }

  // 모집단 통계 (7D 피처 포함)
  const allFeatureVecs = enriched.map(t => {
    const f = extractFeatures({
      interestValues: t.interestValues, totalNewsCount: 0,
      activeDays: t.activeDays, avgPriceChangePct: t.avgPriceChangePct, avgVolume: t.avgVolume,
    })
    return featuresToArray(f)
  })
  const numDims = allFeatureVecs[0].length
  const means: number[] = [], stddevs: number[] = []
  for (let d = 0; d < numDims; d++) {
    const vals = allFeatureVecs.map(v => v[d])
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length
    means.push(mean)
    stddevs.push(Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length))
  }
  const populationStats: FeaturePopulationStats = { means, stddevs }

  // 임계값 스윕
  const thresholds = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60]
  const thresholdResults: Array<{ threshold: number; matches: number; accurate: number; precision: string; recall: string }> = []
  let totalAccurateAtDefault = 0

  for (const threshold of thresholds) {
    let matches = 0, accurate = 0

    for (let i = 0; i < enriched.length; i++) {
      const current = enriched[i]
      const midIdx = Math.floor(current.curve.length / 2)
      const halfCurve = current.curve.slice(0, midIdx)
      const remainingCurve = current.curve.slice(midIdx)
      if (halfCurve.length < 7) continue

      // 절반 곡선 기준 피처 (주가/거래량 포함)
      const halfFeatures = extractFeatures({
        interestValues: current.interestValues.slice(0, midIdx),
        totalNewsCount: 0,
        activeDays: halfCurve[halfCurve.length - 1]?.day || 0,
        avgPriceChangePct: current.avgPriceChangePct,
        avgVolume: current.avgVolume,
      })

      for (let j = 0; j < enriched.length; j++) {
        if (i === j) continue
        const past = enriched[j]
        if (past.curve.length < 14) continue

        const pastFeatures = extractFeatures({
          interestValues: past.interestValues, totalNewsCount: 0,
          activeDays: past.activeDays, avgPriceChangePct: past.avgPriceChangePct, avgVolume: past.avgVolume,
        })

        const result = compositeCompare({
          current: { features: halfFeatures, curve: halfCurve, keywords: current.keywords, activeDays: halfCurve[halfCurve.length - 1]?.day || 0, sector: current.sector },
          past: { features: pastFeatures, curve: past.curve, keywords: past.keywords, peakDay: past.peakDay, totalDays: past.totalDays, name: past.name, sector: past.sector },
          populationStats,
        })

        if (result.similarity >= threshold) {
          matches++
          // 정확도 검증: 나머지 곡선과 과거 대응 구간의 상관관계
          const remainingValues = remainingCurve.map(p => p.value)
          const pastRemaining = past.curve.slice(midIdx, midIdx + remainingValues.length).map(p => p.value)
          const minLen = Math.min(remainingValues.length, pastRemaining.length)
          if (minLen >= 7) {
            const corr = pearsonCorrelation(remainingValues.slice(0, minLen), pastRemaining.slice(0, minLen))
            if (corr >= 0.3) accurate++
          }
        }
      }
    }

    if (threshold === 0.40) totalAccurateAtDefault = accurate
    thresholdResults.push({
      threshold, matches, accurate,
      precision: matches > 0 ? (accurate / matches * 100).toFixed(1) + '%' : 'N/A',
      recall: totalAccurateAtDefault > 0 ? (accurate / totalAccurateAtDefault * 100).toFixed(1) + '%' : 'N/A',
    })
  }

  console.log('\n📊 임계값별 Precision/Recall:')
  console.table(thresholdResults)
  console.log('\n✅ 백테스트 완료')
}

main().catch(console.error)