import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import {
  normalizeTimeline, findPeakDay, extractFeatures, compositeCompare, classifySector,
  pearsonCorrelation, type TimeSeriesPoint, type FeaturePopulationStats,
} from '../../lib/tli/comparison'

async function main() {
  console.log('🔬 비교 알고리즘 백테스트\n')

  // 완료된(비활성) 테마 로딩
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, first_spike_date, is_active')
    .eq('is_active', false)

  if (!themes?.length) { console.log('❌ 비활성 테마 없음'); return }

  const themeIds = themes.map(t => t.id)

  // 전체 데이터 로딩
  const [interestAll, scoresAll, keywordsAll] = await Promise.all([
    batchQuery<{ theme_id: string; time: string; normalized: number }>(
      'interest_metrics', 'theme_id, time, normalized', themeIds,
    ),
    batchQuery<{ theme_id: string; score: number; calculated_at: string }>(
      'lifecycle_scores', 'theme_id, score, calculated_at', themeIds,
      q => q.order('calculated_at', { ascending: false }),
    ),
    batchQuery<{ theme_id: string; keyword: string }>(
      'theme_keywords', 'theme_id, keyword', themeIds,
    ),
  ])

  const interestByTheme = groupByThemeId(interestAll)
  const scoresByTheme = groupByThemeId(scoresAll)
  const keywordsByTheme = groupByThemeId(keywordsAll)

  // 보강된 테마 데이터 구성
  interface EnrichedTheme {
    id: string; name: string; firstSpikeDate: string;
    curve: TimeSeriesPoint[]; keywords: string[]; peakDay: number; totalDays: number;
    activeDays: number; sector: string; scores: Array<{ score: number }>;
    interestValues: number[];
  }

  const enriched: EnrichedTheme[] = []
  for (const theme of themes) {
    const fsd = theme.first_spike_date
    if (!fsd) continue
    const interest = (interestByTheme.get(theme.id) || []).sort((a, b) => a.time.localeCompare(b.time))
    if (interest.length < 14) continue

    const curve = normalizeTimeline(interest.map(m => ({ date: m.time, value: m.normalized })), fsd)
    const keywords = (keywordsByTheme.get(theme.id) || []).map(k => k.keyword)
    const scores = (scoresByTheme.get(theme.id) || []).map(s => ({ score: s.score }))
    const totalDays = curve.length > 0 ? curve[curve.length - 1].day : 0
    const peakDay = findPeakDay(curve)
    const activeDays = totalDays
    const sector = classifySector(keywords)
    const interestValues = interest.map(m => m.normalized)

    enriched.push({ id: theme.id, name: theme.name, firstSpikeDate: fsd, curve, keywords, peakDay, totalDays, activeDays, sector, scores, interestValues })
  }

  console.log(`📊 백테스트 대상: ${enriched.length}개 완료 테마\n`)
  if (enriched.length < 2) { console.log('❌ 최소 2개 테마 필요'); return }

  // 모집단 통계
  const allFeatureVecs = enriched.map(t => {
    const f = extractFeatures({ scores: t.scores, interestValues: t.interestValues, totalNewsCount: 0, activeDays: t.activeDays })
    return Object.values(f)
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
    let matches = 0
    let accurate = 0

    for (let i = 0; i < enriched.length; i++) {
      const current = enriched[i]
      // 중간 지점을 "현재" 상태로 사용
      const midIdx = Math.floor(current.curve.length / 2)
      const halfCurve = current.curve.slice(0, midIdx)
      const remainingCurve = current.curve.slice(midIdx)
      if (halfCurve.length < 7) continue

      const halfFeatures = extractFeatures({
        scores: current.scores.slice(0, Math.min(7, current.scores.length)),
        interestValues: current.interestValues.slice(0, midIdx),
        totalNewsCount: 0,
        activeDays: halfCurve[halfCurve.length - 1]?.day || 0,
      })

      for (let j = 0; j < enriched.length; j++) {
        if (i === j) continue
        const past = enriched[j]
        if (past.curve.length < 14) continue

        const result = compositeCompare({
          current: { features: halfFeatures, curve: halfCurve, keywords: current.keywords, activeDays: halfCurve[halfCurve.length - 1]?.day || 0, sector: current.sector },
          past: { features: extractFeatures({ scores: past.scores, interestValues: past.interestValues, totalNewsCount: 0, activeDays: past.activeDays }), curve: past.curve, keywords: past.keywords, peakDay: past.peakDay, totalDays: past.totalDays, name: past.name, sector: past.sector },
          populationStats,
        })

        if (result.similarity >= threshold) {
          matches++
          // 정확도 검증: 나머지 곡선이 과거 테마의 대응 구간과 상관관계가 있는지 확인
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
      threshold,
      matches,
      accurate,
      precision: matches > 0 ? (accurate / matches * 100).toFixed(1) + '%' : 'N/A',
      recall: totalAccurateAtDefault > 0 ? (accurate / totalAccurateAtDefault * 100).toFixed(1) + '%' : 'N/A',
    })
  }

  console.log('\n📊 임계값별 Precision/Recall:')
  console.table(thresholdResults)

  console.log('\n✅ 백테스트 완료')
}

main().catch(console.error)
