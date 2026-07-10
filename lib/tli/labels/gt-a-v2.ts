/**
 * TLI v3 Todo 7: `gta-v2` exact-five ground-truth label math — 순수 함수.
 *
 * estimand (master plan "무엇을 예측하는가"):
 *   past_mean(t)   = base date 포함 직전 5 한국 거래일의 **동일 response** 평균
 *   future_mean(t) = base date 다음 정확히 5 거래일의 같은 response 평균
 *   denominator_valid(t) = 1[past_mean > 0]          ← 정확히 이것만. 양수 absolute floor 금지.
 *   ratio(t)       = future_mean / past_mean         ← denominator_valid일 때만 정의
 *   growth(t)      = ratio - 1
 *   g_log_ratio(t) = -1.5 if future_mean=0 else clip(ln(ratio), -1.5, 1.5)
 *   y(t)           = 1[growth >= 0.10] = 1[ratio >= 1.10]   ← 로그값 0.10 threshold 금지
 *
 * scale invariance: 동일 10개 값에 임의의 양수 상수 c를 곱해도 eligibility/ratio/growth/g_log_ratio/y가
 * 모두 불변이어야 한다. IEEE-754 곱셈/나눗셈은 c를 정확히 상쇄하지 못하므로(예: c=0.01),
 * 두 합의 비를 BigInt 유리수로 **약분**한 뒤에만 double/`Math.log`로 넘긴다. 이렇게 하면 스케일된 입력이
 * 동일 기약분수로 환원되어 ratio·g_log_ratio·y가 bit 단위로 같아진다.
 */

export const GTA_V2_LABELER_VERSION = 'gta-v2'
export const GTA_V2_HORIZON_DAYS = 5
export const GTA_V2_PAST_WINDOW = 5
export const GTA_V2_FUTURE_WINDOW = 5
/** growth threshold. y = 1[growth >= 0.10] = 1[ratio >= 1.10]. */
export const GTA_V2_GROWTH_THRESHOLD = 0.1
export const GTA_V2_WINSOR_MIN = -1.5
export const GTA_V2_WINSOR_MAX = 1.5

// target=ES2017이라 BigInt 리터럴(`0n`)을 못 쓴다. 함수 호출로 대체한다.
const BIG_ZERO = BigInt(0)
const BIG_TEN = BigInt(10)
const RATIO_THRESHOLD_NUM = BigInt(11)
const RATIO_THRESHOLD_DEN = BigInt(10)

export type GtAV2ExclusionReason = 'zero_denominator' | 'source_gap_sla' | 'spec_mismatch'

export interface GtAV2EligibleLabel {
  readonly kind: 'eligible'
  /** past_mean. c에 따라 스케일되므로 불변 집합에 포함되지 않는다. */
  readonly denominator: number
  readonly futureMean: number
  readonly ratio: number
  readonly growth: number
  readonly gLogRatio: number
  readonly yBinary: boolean
}

export interface GtAV2ZeroDenominatorLabel {
  readonly kind: 'zero_denominator'
  readonly denominator: 0
}

export type GtAV2LabelResult = GtAV2EligibleLabel | GtAV2ZeroDenominatorLabel

interface Rational {
  readonly mant: bigint
  readonly scale: number
}

const pow10 = (exponent: number): bigint => BIG_TEN ** BigInt(exponent)

/** double → 정확한 십진 유리수 (value = mant / 10^scale). 지수 표기까지 전개한다. */
function decimalToRational(value: number): Rational {
  if (!Number.isFinite(value)) {
    throw new TypeError('gta-v2 response 값은 finite여야 합니다')
  }
  if (value < 0) {
    throw new RangeError('gta-v2 response 값은 nonnegative여야 합니다')
  }

  let text = value.toString()
  let exponent = 0
  const expMatch = text.match(/^([^eE]+)[eE]([+-]?\d+)$/)
  if (expMatch) {
    text = expMatch[1]
    exponent = Number(expMatch[2])
  }

  const [intPart, fracPart = ''] = text.split('.')
  const digits = `${intPart}${fracPart}`
  const mant = BigInt(digits === '' ? '0' : digits)
  const scale = fracPart.length - exponent
  if (scale < 0) {
    return { mant: mant * pow10(-scale), scale: 0 }
  }
  return { mant, scale }
}

/** 값 배열을 정확한 십진 합으로: value = num / 10^scale. */
function exactSum(values: readonly number[]): Rational {
  const rationals = values.map(decimalToRational)
  const scale = rationals.reduce((max, rational) => Math.max(max, rational.scale), 0)
  let num = BIG_ZERO
  for (const rational of rationals) {
    num += rational.mant * pow10(scale - rational.scale)
  }
  return { mant: num, scale }
}

function absBigInt(value: bigint): bigint {
  return value < BIG_ZERO ? -value : value
}

function gcd(left: bigint, right: bigint): bigint {
  let a = absBigInt(left)
  let b = absBigInt(right)
  while (b !== BIG_ZERO) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clip(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function assertExactFive(values: readonly number[], label: string): void {
  if (values.length !== GTA_V2_PAST_WINDOW) {
    throw new RangeError(`gta-v2 ${label}는 정확히 ${GTA_V2_PAST_WINDOW}개여야 합니다 (받음: ${values.length})`)
  }
}

/**
 * exact 5+5 값에서 gta-v2 label을 계산한다. 값이 정확히 5+5가 아니거나 finite/nonnegative가 아니면 throw한다
 * (source gap/spec 결손은 라벨 값이 아니라 finalizer의 상태 전이로 처리한다).
 */
export function labelGtAV2(input: {
  readonly pastValues: readonly number[]
  readonly futureValues: readonly number[]
}): GtAV2LabelResult {
  assertExactFive(input.pastValues, 'past window')
  assertExactFive(input.futureValues, 'future window')

  const pastSum = exactSum(input.pastValues)
  const futureSum = exactSum(input.futureValues)

  // denominator_valid = 1[past_mean > 0]. 오직 past 합의 부호만 본다 — absolute floor 없음.
  if (pastSum.mant <= BIG_ZERO) {
    return { kind: 'zero_denominator', denominator: 0 }
  }

  // ratio = future_sum / past_sum = (fNum * 10^pScale) / (pNum * 10^fScale) 를 기약분수로 환원한다.
  let ratioNum = futureSum.mant * pow10(pastSum.scale)
  let ratioDen = pastSum.mant * pow10(futureSum.scale)
  const divisor = gcd(ratioNum, ratioDen)
  ratioNum /= divisor
  ratioDen /= divisor

  const denominator = mean(input.pastValues)
  const futureMean = mean(input.futureValues)

  // future_mean=0 이면 ratio=0 → g_log_ratio=-1.5 로 고정한다.
  if (ratioNum === BIG_ZERO) {
    return {
      kind: 'eligible',
      denominator,
      futureMean,
      ratio: 0,
      growth: -1,
      gLogRatio: GTA_V2_WINSOR_MIN,
      // y = 1[ratio >= 1.10]; ratio=0 이므로 false.
      yBinary: false,
    }
  }

  const ratio = Number(ratioNum) / Number(ratioDen)
  const gLogRatio = clip(Math.log(ratio), GTA_V2_WINSOR_MIN, GTA_V2_WINSOR_MAX)

  // y = 1[ratio >= 1.10] = 1[10 * future_sum >= 11 * past_sum]. 유리수 비교라 로그·부동소수점 threshold를 쓰지 않는다.
  const yBinary = ratioNum * RATIO_THRESHOLD_DEN >= ratioDen * RATIO_THRESHOLD_NUM

  return {
    kind: 'eligible',
    denominator,
    futureMean,
    ratio,
    growth: ratio - 1,
    gLogRatio,
    yBinary,
  }
}
