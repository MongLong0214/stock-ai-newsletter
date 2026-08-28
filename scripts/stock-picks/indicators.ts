export type NullableNumber = number | null

export interface Position52wResult {
  readonly value: number | null
  readonly observations: number
  readonly fullWindow: boolean
}

export interface TrendRegression {
  readonly r2: number
  /** 일 단위 log-price OLS 기울기다. */
  readonly slope: number
}

const isFiniteNumber = (value: NullableNumber | undefined): value is number => (
  value !== null && value !== undefined && Number.isFinite(value)
)

const positiveWindow = (values: readonly NullableNumber[], length: number): number[] | null => {
  if (!Number.isInteger(length) || length <= 0 || values.length < length) return null
  const window = values.slice(-length)
  return window.every((value): value is number => isFiniteNumber(value) && value > 0)
    ? window
    : null
}

const numericWindow = (values: readonly NullableNumber[], length: number): number[] | null => {
  if (!Number.isInteger(length) || length <= 0 || values.length < length) return null
  const window = values.slice(-length)
  return window.every(isFiniteNumber) ? window : null
}

const contiguousNumericSuffix = (values: readonly NullableNumber[]): number[] => {
  let start = values.length
  while (start > 0 && isFiniteNumber(values[start - 1])) start--
  return values.slice(start) as number[]
}

const emaSeries = (values: readonly number[], period: number): Array<number | null> => {
  const output: Array<number | null> = Array.from({ length: values.length }, () => null)
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return output

  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  output[period - 1] = current
  const alpha = 2 / (period + 1)
  for (let index = period; index < values.length; index++) {
    current += alpha * (values[index] - current)
    output[index] = current
  }
  return output
}

export function sma(values: readonly NullableNumber[], period: number): number | null {
  const window = numericWindow(values, period)
  return window ? window.reduce((sum, value) => sum + value, 0) / period : null
}

/** 첫 period개 단순평균을 seed로 쓰는 표준 EMA다. */
export function ema(values: readonly NullableNumber[], period: number): number | null {
  const suffix = contiguousNumericSuffix(values)
  if (suffix.length < period) return null
  return emaSeries(suffix, period).at(-1) ?? null
}

/** Wilder 원식(alpha=1/period)이며 표준 EMA(alpha=2/(period+1))가 아니다. */
export function wilderRsi(values: readonly NullableNumber[], period = 14): number | null {
  if (!Number.isInteger(period) || period <= 0) return null
  const closes = contiguousNumericSuffix(values)
  if (closes.length < period + 1) return null

  let averageGain = 0
  let averageLoss = 0
  for (let index = 1; index <= period; index++) {
    const change = closes[index] - closes[index - 1]
    averageGain += Math.max(0, change)
    averageLoss += Math.max(0, -change)
  }
  averageGain /= period
  averageLoss /= period

  for (let index = period + 1; index < closes.length; index++) {
    const change = closes[index] - closes[index - 1]
    averageGain = ((period - 1) * averageGain + Math.max(0, change)) / period
    averageLoss = ((period - 1) * averageLoss + Math.max(0, -change)) / period
  }

  if (averageGain === 0 && averageLoss === 0) return 50
  if (averageLoss === 0) return 100
  if (averageGain === 0) return 0
  return 100 - 100 / (1 + averageGain / averageLoss)
}

export function macdHistogram(
  values: readonly NullableNumber[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): number | null {
  if (
    !Number.isInteger(fastPeriod) || fastPeriod <= 0
    || !Number.isInteger(slowPeriod) || slowPeriod <= fastPeriod
    || !Number.isInteger(signalPeriod) || signalPeriod <= 0
  ) return null

  const closes = contiguousNumericSuffix(values)
  if (closes.length < slowPeriod + signalPeriod - 1) return null
  const fast = emaSeries(closes, fastPeriod)
  const slow = emaSeries(closes, slowPeriod)
  const macd = closes.flatMap((_value, index) => (
    fast[index] === null || slow[index] === null
      ? []
      : [(fast[index] as number) - (slow[index] as number)]
  ))
  const signal = emaSeries(macd, signalPeriod).at(-1)
  const currentMacd = macd.at(-1)
  return signal === null || signal === undefined || currentMacd === undefined
    ? null
    : currentMacd - signal
}

/**
 * 현재 SMA와 lookback거래일 전 SMA의 log 비율을 일수로 나눈다.
 * 가격 단위가 달라도 비교 가능한 일 단위 기울기다.
 */
export function smaSlope(
  values: readonly NullableNumber[],
  period: number,
  lookback: number,
): number | null {
  if (!Number.isInteger(lookback) || lookback <= 0) return null
  const window = positiveWindow(values, period + lookback)
  if (!window) return null
  const previous = window.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  const current = window.slice(lookback).reduce((sum, value) => sum + value, 0) / period
  return (Math.log(current) - Math.log(previous)) / lookback
}

const alignedOhlcSuffix = (
  highs: readonly NullableNumber[],
  lows: readonly NullableNumber[],
  closes: readonly NullableNumber[],
): { highs: number[]; lows: number[]; closes: number[] } | null => {
  if (highs.length !== lows.length || lows.length !== closes.length) return null
  let start = closes.length
  while (
    start > 0
    && isFiniteNumber(highs[start - 1])
    && isFiniteNumber(lows[start - 1])
    && isFiniteNumber(closes[start - 1])
    && (highs[start - 1] as number) >= (lows[start - 1] as number)
    && (lows[start - 1] as number) > 0
    && (closes[start - 1] as number) > 0
  ) start--
  return {
    highs: highs.slice(start) as number[],
    lows: lows.slice(start) as number[],
    closes: closes.slice(start) as number[],
  }
}

const trueRanges = (highs: readonly number[], lows: readonly number[], closes: readonly number[]): number[] => (
  highs.map((high, index) => index === 0
    ? high - lows[index]
    : Math.max(high - lows[index], Math.abs(high - closes[index - 1]), Math.abs(lows[index] - closes[index - 1])))
)

export function atrPercent(
  highs: readonly NullableNumber[],
  lows: readonly NullableNumber[],
  closes: readonly NullableNumber[],
  period = 14,
): number | null {
  if (!Number.isInteger(period) || period <= 0) return null
  const rows = alignedOhlcSuffix(highs, lows, closes)
  if (!rows || rows.closes.length < period) return null
  const ranges = trueRanges(rows.highs, rows.lows, rows.closes)
  let atr = ranges.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  for (let index = period; index < ranges.length; index++) {
    atr = ((period - 1) * atr + ranges[index]) / period
  }
  return atr / rows.closes.at(-1)! * 100
}

/** Wilder +DM/-DM/TR 스무딩과 첫 period개 DX 평균 seed를 쓰는 표준 ADX다. */
export function adx(
  highs: readonly NullableNumber[],
  lows: readonly NullableNumber[],
  closes: readonly NullableNumber[],
  period = 14,
): number | null {
  if (!Number.isInteger(period) || period <= 0) return null
  const rows = alignedOhlcSuffix(highs, lows, closes)
  if (!rows || rows.closes.length < period * 2) return null

  const ranges = trueRanges(rows.highs, rows.lows, rows.closes)
  const plusDm: number[] = []
  const minusDm: number[] = []
  for (let index = 1; index < rows.closes.length; index++) {
    const upMove = rows.highs[index] - rows.highs[index - 1]
    const downMove = rows.lows[index - 1] - rows.lows[index]
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0)
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0)
  }

  let smoothedTr = ranges.slice(1, period + 1).reduce((sum, value) => sum + value, 0)
  let smoothedPlus = plusDm.slice(0, period).reduce((sum, value) => sum + value, 0)
  let smoothedMinus = minusDm.slice(0, period).reduce((sum, value) => sum + value, 0)
  const directionalIndex = (): number => {
    if (smoothedTr === 0) return 0
    const plusDi = 100 * smoothedPlus / smoothedTr
    const minusDi = 100 * smoothedMinus / smoothedTr
    const denominator = plusDi + minusDi
    return denominator === 0 ? 0 : 100 * Math.abs(plusDi - minusDi) / denominator
  }
  const dxValues = [directionalIndex()]

  for (let interval = period; interval < plusDm.length; interval++) {
    smoothedTr = smoothedTr - smoothedTr / period + ranges[interval + 1]
    smoothedPlus = smoothedPlus - smoothedPlus / period + plusDm[interval]
    smoothedMinus = smoothedMinus - smoothedMinus / period + minusDm[interval]
    dxValues.push(directionalIndex())
  }
  if (dxValues.length < period) return null

  let currentAdx = dxValues.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  for (let index = period; index < dxValues.length; index++) {
    currentAdx = ((period - 1) * currentAdx + dxValues[index]) / period
  }
  return currentAdx
}

export function obvSlope(
  closes: readonly NullableNumber[],
  volumes: readonly NullableNumber[],
  period: number,
): number | null {
  if (closes.length !== volumes.length) return null
  const closeWindow = positiveWindow(closes, period)
  const volumeWindow = numericWindow(volumes, period)
  if (!closeWindow || !volumeWindow || volumeWindow.some((volume) => volume < 0)) return null

  const obv = [0]
  for (let index = 1; index < period; index++) {
    const direction = Math.sign(closeWindow[index] - closeWindow[index - 1])
    obv.push(obv[index - 1] + direction * volumeWindow[index])
  }
  return linearRegression(obv).slope
}

export function volumeRatio(values: readonly NullableNumber[], period = 20): number | null {
  const window = numericWindow(values, period)
  if (!window || window.some((value) => value < 0)) return null
  const average = window.reduce((sum, value) => sum + value, 0) / period
  return average > 0 ? window.at(-1)! / average : null
}

/** 신호일 시가가 직전 거래일 종가에서 벌어진 비율이다. 양수면 갭상승이다. */
export function gapFromPreviousClosePercent(
  previousClose: NullableNumber | undefined,
  currentOpen: NullableNumber | undefined,
): number | null {
  if (
    !isFiniteNumber(previousClose) || previousClose <= 0
    || !isFiniteNumber(currentOpen) || currentOpen <= 0
  ) return null
  return (currentOpen / previousClose - 1) * 100
}

export function rollingPercentileRank(values: readonly NullableNumber[], period: number): number | null {
  const window = numericWindow(values, period)
  if (!window) return null
  const current = window.at(-1)!
  const less = window.filter((value) => value < current).length
  const equal = window.filter((value) => value === current).length
  return (less + 0.5 * equal) / period
}

/**
 * 종가의 가용 최대 252거래일 범위를 사용한다. observations/fullWindow로 축약 이력을
 * 호출자가 결과에 명시할 수 있으며, 최소 두 관측치가 없으면 value는 null이다.
 */
export function position52w(values: readonly NullableNumber[], period = 252): Position52wResult {
  if (!Number.isInteger(period) || period <= 1) return { value: null, observations: 0, fullWindow: false }
  const suffix = contiguousNumericSuffix(values)
  const window = suffix.slice(-period)
  const observations = window.length
  if (observations < 2 || window.some((value) => value <= 0)) {
    return { value: null, observations, fullWindow: false }
  }
  const low = Math.min(...window)
  const high = Math.max(...window)
  const value = high === low ? null : (window.at(-1)! - low) / (high - low)
  return { value, observations, fullWindow: observations === period }
}

export function consecutiveUpDays(values: readonly NullableNumber[]): number | null {
  const closes = contiguousNumericSuffix(values)
  if (closes.length < 2) return null
  let count = 0
  for (let index = closes.length - 1; index > 0; index--) {
    if (closes[index] <= closes[index - 1]) break
    count++
  }
  return count
}

const linearRegression = (values: readonly number[]): TrendRegression => {
  const count = values.length
  const meanX = (count - 1) / 2
  const meanY = values.reduce((sum, value) => sum + value, 0) / count
  let sumXx = 0
  let sumXy = 0
  let sumYy = 0
  for (let index = 0; index < count; index++) {
    const centeredX = index - meanX
    const centeredY = values[index] - meanY
    sumXx += centeredX * centeredX
    sumXy += centeredX * centeredY
    sumYy += centeredY * centeredY
  }
  const slope = sumXx === 0 ? 0 : sumXy / sumXx
  const r2 = sumYy === 0 ? 1 : Math.min(1, Math.max(0, (sumXy * sumXy) / (sumXx * sumYy)))
  return { r2, slope }
}

export function trendR2(values: readonly NullableNumber[], period: number): TrendRegression | null {
  const window = positiveWindow(values, period)
  return window ? linearRegression(window.map(Math.log)) : null
}

/** 현재 종가를 직전 period거래일 최고 종가와 비교해 돌파(양수)도 표현한다. */
export function distanceFromHigh(values: readonly NullableNumber[], period: number): number | null {
  const window = positiveWindow(values, period + 1)
  if (!window) return null
  const previousHigh = Math.max(...window.slice(0, -1))
  return (window.at(-1)! / previousHigh - 1) * 100
}
