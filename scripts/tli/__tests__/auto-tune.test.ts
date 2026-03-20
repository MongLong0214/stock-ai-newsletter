import { describe, it, expect } from 'vitest'
import { _optimizeFromData, DEFAULT_THRESHOLD } from '@/scripts/tli/comparison/auto-tune'

type Row = { similarity_score: number; trajectory_correlation: number }

/** n개 row 생성 헬퍼: similarity와 correlation을 개별 지정 */
function makeRows(items: Array<[sim: number, corr: number]>): Row[] {
  return items.map(([similarity_score, trajectory_correlation]) => ({
    similarity_score,
    trajectory_correlation,
  }))
}

/** count개의 동일한 row 대량 생성 */
function makeUniformRows(sim: number, corr: number, count: number): Row[] {
  return Array.from({ length: count }, () => ({ similarity_score: sim, trajectory_correlation: corr }))
}

describe('_optimizeFromData', () => {
  it('정확한 예측 0건 → 기본값(0.35) + low confidence', () => {
    // 모든 correlation이 0.5 미만 → "정확"한 비교 없음
    const rows = makeRows([
      [0.40, 0.3],
      [0.35, 0.2],
      [0.30, 0.1],
    ])
    const result = _optimizeFromData(rows)

    expect(result.threshold).toBe(DEFAULT_THRESHOLD)
    expect(result.confidence).toBe('low')
    expect(result.sampleSize).toBe(3)
  })

  it('빈 배열 → 기본값 반환', () => {
    const result = _optimizeFromData([])
    expect(result.threshold).toBe(DEFAULT_THRESHOLD)
    expect(result.confidence).toBe('low')
    expect(result.sampleSize).toBe(0)
  })

  it('F1 최적화: 정확한 비교가 높은 similarity에 집중되면 높은 임계값 선택', () => {
    // 정확한 비교(corr >= 0.5)는 모두 sim >= 0.40
    // 부정확한 비교(corr < 0.5)는 sim 0.25~0.35에 분포
    const rows = makeRows([
      // 정확 (sim >= 0.40)
      [0.45, 0.8], [0.42, 0.7], [0.50, 0.9], [0.40, 0.6], [0.48, 0.75],
      // 부정확 (낮은 sim)
      [0.25, 0.1], [0.30, 0.2], [0.28, 0.15], [0.35, 0.3], [0.32, 0.25],
    ])
    const result = _optimizeFromData(rows)

    // bestThreshold=0.40 (F1=1.0), n=10 → shrinkWeight=0.10
    // shrunk = 0.35*0.90 + 0.40*0.10 = 0.355 → rounded 0.36
    expect(result.threshold).toBe(0.36)
  })

  it('F1 최적화: 정확한 비교가 넓게 분포되면 낮은 임계값 선택', () => {
    // 정확한 비교가 모든 sim 범위에 분포
    const rows = makeRows([
      [0.25, 0.6], [0.30, 0.7], [0.35, 0.8], [0.40, 0.9], [0.45, 0.6],
      // 부정확은 거의 없음
      [0.50, 0.2],
    ])
    const result = _optimizeFromData(rows)

    // 0.25에서 precision=5/6, recall=5/5=1.0 → 높은 F1
    expect(result.threshold).toBeLessThanOrEqual(0.35)
  })

  it('Bayesian shrinkage: 30개 샘플이면 DEFAULT쪽으로 크게 수축', () => {
    // 모든 정확한 비교가 sim=0.50 (최적 후보=0.50)
    // n=30이면 shrinkWeight=0.30 → shrunk = 0.35*0.70 + 0.50*0.30 = 0.395
    const accurate = makeUniformRows(0.50, 0.8, 20)
    const inaccurate = makeUniformRows(0.25, 0.1, 10)
    const rows = [...accurate, ...inaccurate]

    const result = _optimizeFromData(rows)

    // shrinkage가 적용되어 0.50보다 낮아야 함
    expect(result.threshold).toBeLessThan(0.50)
    expect(result.threshold).toBeGreaterThanOrEqual(0.35)
  })

  it('Bayesian shrinkage: 100개 이상이면 축소 없음', () => {
    // 모든 정확한 비교가 sim=0.45 (최적 후보=0.45)
    const accurate = makeUniformRows(0.45, 0.8, 80)
    const inaccurate = makeUniformRows(0.20, 0.1, 20)
    const rows = [...accurate, ...inaccurate]

    const result = _optimizeFromData(rows)

    // n=100, shrinkWeight=1.0 → 축소 없음 → bestThreshold 그대로
    expect(result.threshold).toBe(0.45)
    expect(result.confidence).toBe('high')
  })

  it('임계값은 항상 [0.25, 0.50] 범위 내', () => {
    // 극단적 데이터: 모든 sim이 매우 낮음
    const rows = makeUniformRows(0.10, 0.8, 50)
    const result = _optimizeFromData(rows)

    expect(result.threshold).toBeGreaterThanOrEqual(0.25)
    expect(result.threshold).toBeLessThanOrEqual(0.50)
  })

  it('confidence: n < 50 → low, 50~99 → medium, 100+ → high', () => {
    const makeData = (n: number) => {
      const accurate = makeUniformRows(0.40, 0.8, Math.ceil(n * 0.7))
      const rest = makeUniformRows(0.25, 0.1, n - Math.ceil(n * 0.7))
      return [...accurate, ...rest]
    }

    expect(_optimizeFromData(makeData(30)).confidence).toBe('low')
    expect(_optimizeFromData(makeData(49)).confidence).toBe('low')
    expect(_optimizeFromData(makeData(50)).confidence).toBe('medium')
    expect(_optimizeFromData(makeData(99)).confidence).toBe('medium')
    expect(_optimizeFromData(makeData(100)).confidence).toBe('high')
    expect(_optimizeFromData(makeData(200)).confidence).toBe('high')
  })

  it('F1 동점 시 높은 임계값 선택 (precision 우선)', () => {
    // 두 임계값에서 F1이 동일한 데이터 구성
    // sim=0.30과 sim=0.35에 동일 분포의 정확/부정확
    const rows = makeRows([
      [0.30, 0.8], [0.35, 0.8],  // 정확
      [0.30, 0.1], [0.35, 0.1],  // 부정확
      // 추가 정확 데이터로 두 임계값 F1 동점 유도
      [0.40, 0.8], [0.40, 0.1],
    ])
    const result = _optimizeFromData(rows)

    // F1이 같으면 높은 임계값이 선택됨
    expect(result.threshold).toBeGreaterThanOrEqual(0.30)
  })

  it('sampleSize는 유효 row 수를 반영', () => {
    const rows = makeUniformRows(0.35, 0.8, 42)
    const result = _optimizeFromData(rows)

    expect(result.sampleSize).toBe(42)
  })

  it('반올림: 소수점 2자리', () => {
    // shrinkage로 인해 중간값이 나올 수 있는 케이스
    const accurate = makeUniformRows(0.45, 0.8, 25)
    const inaccurate = makeUniformRows(0.20, 0.1, 10)
    const result = _optimizeFromData([...accurate, ...inaccurate])

    // 소수점 2자리인지 확인
    const decimals = result.threshold.toString().split('.')[1]?.length ?? 0
    expect(decimals).toBeLessThanOrEqual(2)
  })

  it('정확한 row가 모두 최소 후보(0.25) 미만 sim → F1=0이므로 DEFAULT 반환', () => {
    // 정확한 비교(corr>=0.5)는 전부 sim < 0.25 → 어떤 후보에서도 recall=0, F1=0
    // W1: F1=0이면 최적화 불가 → DEFAULT_THRESHOLD 즉시 반환 (shrinkage 스킵)
    const accurate = makeUniformRows(0.20, 0.8, 35)
    const inaccurate = makeUniformRows(0.15, 0.1, 15)
    const rows = [...accurate, ...inaccurate]

    const result = _optimizeFromData(rows)

    expect(result.threshold).toBe(DEFAULT_THRESHOLD)
    expect(result.confidence).toBe('low')
  })

  it('모든 row가 동일 similarity → 해당 값 이하 후보 동점, 결과는 DEFAULT(0.35)', () => {
    // sim=0.35 일괄 → 후보 0.25/0.30/0.35에서 동일 F1, 동점 로직으로 0.35 선택
    // 후보 0.40+ 는 aboveThreshold=0 → F1=0
    // bestThreshold=DEFAULT=0.35 → shrinkage 무관하게 0.35
    const rows = [
      ...makeUniformRows(0.35, 0.8, 30),
      ...makeUniformRows(0.35, 0.2, 20),
    ]
    const result = _optimizeFromData(rows)

    expect(result.threshold).toBe(DEFAULT_THRESHOLD)
  })

  it('>= 경계: similarity가 정확히 후보값이면 해당 후보에 포함', () => {
    // sim=0.30 정확 1건, sim=0.29 부정확 1건
    // 후보 0.30: aboveThreshold=[sim=0.30] → precision=1.0, recall=1.0, F1=1.0
    // 만약 >를 쓰면 sim=0.30이 제외되어 recall=0
    // n=100으로 shrinkage 제거 → bestThreshold 그대로
    const accurate = makeUniformRows(0.30, 0.8, 70)
    const inaccurate = makeUniformRows(0.29, 0.1, 30)
    const rows = [...accurate, ...inaccurate]

    const result = _optimizeFromData(rows)

    // >= 이므로 0.30이 최적 (F1=1.0), n=100 → shrinkage 없음
    expect(result.threshold).toBe(0.30)
  })

  it('shrinkage 결과가 정확히 경계값(0.25, 0.50)이면 클램핑 없이 통과', () => {
    // bestThreshold=0.25, n=100 → shrinkWeight=1.0
    // shrunk = 0.35*0 + 0.25*1.0 = 0.25 → 하한 경계 정확히 일치
    const accurate = makeUniformRows(0.25, 0.8, 70)
    const inaccurate = makeUniformRows(0.24, 0.1, 30)
    const result = _optimizeFromData([...accurate, ...inaccurate])

    expect(result.threshold).toBe(0.25)

    // bestThreshold=0.50, n=100 → shrunk = 0.50 → 상한 경계 정확히 일치
    const accurate2 = makeUniformRows(0.50, 0.8, 70)
    const inaccurate2 = makeUniformRows(0.20, 0.1, 30)
    const result2 = _optimizeFromData([...accurate2, ...inaccurate2])

    expect(result2.threshold).toBe(0.50)
  })
})
