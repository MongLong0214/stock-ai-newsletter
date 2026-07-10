import { describe, expect, it } from 'vitest'
import {
  formatPredictionSnapshotCard,
  getPeakTimingStat,
  getPredictionSnapshotForPresentation,
  getScenarioCards,
  shouldRenderPredictionPanel,
} from './presentation'

const scenarios = {
  best: { themeName: 'Fast', peakDay: 12, totalDays: 40, similarity: 0.7 },
  median: { themeName: 'Typical', peakDay: 20, totalDays: 60, similarity: 0.6 },
  worst: { themeName: 'Late', peakDay: 40, totalDays: 120, similarity: 0.5 },
}

const fallbackInput = {
  stageKo: '성장기',
  change7d: 0,
}

describe('getPredictionSnapshotForPresentation', () => {
  it.each([
    { isLoading: true, isError: false },
    { isLoading: false, isError: true },
  ])('null snapshot의 loading/error 상태에서는 기존 pending view 입력을 유지한다', (queryState) => {
    expect(getPredictionSnapshotForPresentation(null, queryState)).toBeUndefined()
  })

  it('성공한 null snapshot은 fallback 입력으로 유지한다', () => {
    expect(getPredictionSnapshotForPresentation(null, {
      isLoading: false,
      isError: false,
    })).toBeNull()
  })
})

describe('getScenarioCards', () => {
  it('uses neutral labels for distinct scenarios', () => {
    const cards = getScenarioCards(scenarios)

    expect(cards.map((card) => card.label)).toEqual(['빠른 경로', '기준 경로', '긴 경로'])
  })

  it('collapses identical scenarios into a single reference card', () => {
    const cards = getScenarioCards({
      best: scenarios.best,
      median: scenarios.best,
      worst: scenarios.best,
    })

    expect(cards.map((card) => card.label)).toEqual(['참고 경로'])
  })

  it('requires both a spike date and at least three comparisons before rendering the panel shell', () => {
    expect(shouldRenderPredictionPanel('2026-01-01', 3)).toBe(true)
    expect(shouldRenderPredictionPanel(null, 3)).toBe(false)
    expect(shouldRenderPredictionPanel('2026-01-01', 2)).toBe(false)
  })

})

describe('getPeakTimingStat', () => {
  it('keeps Cooling copy descriptive instead of forward-looking', () => {
    expect(getPeakTimingStat({ phase: 'cooling', avgDaysToPeak: 0, avgPeakDay: 34 })).toEqual({
      label: '기록상 정점',
      value: '34일차 부근',
    })
  })

  it('keeps forward-looking peak copy for Rising and Hot phases', () => {
    expect(getPeakTimingStat({ phase: 'rising', avgDaysToPeak: 8, avgPeakDay: 34 })).toEqual({
      label: '예상 정점',
      value: '약 8일 후',
    })
  })
})

describe('formatPredictionSnapshotCard', () => {
  it('formats probability, expected range, and recent validation copy', () => {
    const view = formatPredictionSnapshotCard({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'AI 반도체',
      themeId: '11111111-1111-4111-8111-111111111111',
      predictionDate: '2026-08-03',
      pRise: 0.68,
      ciLower: 0.59,
      ciUpper: 0.77,
      abstain: false,
      abstainReasons: [],
      modelVersion: 'm1-2026w31',
      trailing90d: { topSignalPrecision: 0.63, n: 214 },
      phase: 'rising',
      deprecation: { phase: 'removed_after=2026-09-15, use pRise' },
    }, fallbackInput)

    expect(view.statusLabel).toBe('상승 가능성')
    expect(view.probabilityLabel).toBe('68%')
    expect(view.ciLabel).toBe('59-77%')
    expect(view.trailingPrecisionLabel).toBe('최근 검증: 상위 신호 63% 적중 (표본 214개)')
  })

  it('formats withheld snapshots as a clear preparation state without a fake probability', () => {
    const view = formatPredictionSnapshotCard({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'AI 반도체',
      themeId: '11111111-1111-4111-8111-111111111111',
      predictionDate: '2026-08-03',
      pRise: null,
      ciLower: null,
      ciUpper: null,
      abstain: true,
      abstainReasons: ['interest_history_lt_7'],
      modelVersion: 'm1-2026w31',
      trailing90d: { topSignalPrecision: null, n: 0 },
      phase: null,
      deprecation: { phase: 'removed_after=2026-09-15, use pRise' },
    }, fallbackInput)

    expect(view.statusLabel).toBe('데이터 7일 확보 중')
    expect(view.probabilityLabel).toBe('대기')
    expect(view.ciLabel).toBe('예상 범위 준비 중')
    expect(view.trailingPrecisionLabel).toBe('최근 검증: 아직 표시할 표본이 부족해요')
  })

  it('keeps the existing pending snapshot view while the query result is undefined', () => {
    const view = formatPredictionSnapshotCard(undefined, fallbackInput)

    expect(view).toEqual({
      statusLabel: '평가 준비 중',
      probabilityLabel: '대기',
      ciLabel: '예상 범위 준비 중',
      trailingPrecisionLabel: '최근 검증: 아직 표시할 표본이 부족해요',
      phaseLabel: '준비 중',
      reasonLabel: null,
    })
  })

  it.each([
    { change7d: 2.4, directionLabel: '상승' },
    { change7d: 0, directionLabel: '보합' },
    { change7d: -1.7, directionLabel: '하락' },
  ])('snapshot null이면 change7d $change7d를 서술형 fallback $directionLabel로 표시한다', ({ change7d, directionLabel }) => {
    const view = formatPredictionSnapshotCard(null, {
      stageKo: '성장기',
      change7d,
    })

    expect(view).toEqual({
      statusLabel: '현재 상태',
      stageLabel: '성장기',
      directionLabel,
      guidanceLabel: '상세 안내는 검증 완료 후 제공됩니다',
    })
  })

  it('서술형 fallback view model에는 검증 전 예측·투자 문구가 없다', () => {
    const view = formatPredictionSnapshotCard(null, fallbackInput)
    const serializedView = JSON.stringify(view)

    for (const forbiddenText of [
      '%',
      '확률',
      '신뢰구간',
      '전망치',
      '예상 상승',
      '가격',
      '수익',
      '매수',
      '매도',
    ]) {
      expect(serializedView).not.toContain(forbiddenText)
    }
  })
})
