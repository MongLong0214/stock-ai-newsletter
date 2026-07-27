/**
 * 관심도 절대 수준의 척도 선택 — 점수 계산의 SSOT
 *
 * `interest_metrics`에는 절대 수준 후보가 두 개 있고 성질이 다르다.
 *
 * - `raw_value`: DataLab 응답 ratio를 **정수 반올림**한 값. DataLab은 한 요청 안의 모든
 *   키워드 그룹을 통틀어 최대=100으로 정규화하므로, 2026-07-07 앵커(`계산기`) 투입 이후
 *   실제 테마의 ratio는 0.02~5 구간으로 눌렸고 반올림이 그 해상도를 파괴했다.
 *   실측: 테마의 7일 평균이 정확히 0인 비율 48.2%.
 * - `anchor_scaled_value`: 같은 ratio를 앵커의 7일 중앙값으로 나눈 **부동소수** 값.
 *   반올림이 없고 앵커 기준이라 테마 간 비교가 성립한다. 실측 0값 비율 0%.
 *
 * 앵커 도입 전에는 raw_value가 유일한 절대 수준이었고 임계값도 거기에 맞춰져 있었다.
 * 두 척도는 값의 크기가 세 자릿수 다르므로, **한 백분위 모집단에 섞으면 안 된다.**
 * 그래서 척도를 런 단위로 한 번만 정하고 테마 값과 교차 모집단이 항상 같은 척도를 쓰게 한다.
 */

/** 절대 수준을 읽어낼 컬럼 */
export type InterestScale = 'raw' | 'anchor'

/** 척도 판정에 필요한 최소 관측일 — 7일 창에서 과반 */
const MIN_OBSERVATIONS = 3

/** 런 전체를 앵커 척도로 돌리기 위한 최소 테마 커버리지 */
const ANCHOR_RUN_COVERAGE = 0.5

interface InterestLevelSource {
  readonly raw_value: number
  readonly anchor_scaled_value?: number | null
}

const finite = (values: readonly (number | null | undefined)[]): number[] =>
  values.flatMap((value) => (typeof value === 'number' && Number.isFinite(value) ? [value] : []))

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length

/**
 * 최근 창의 절대 관심 수준. 해당 척도의 관측이 부족하면 null
 *
 * @param recent - 최신순 관심도 관측 (호출부가 이미 7일로 자른 상태)
 * @param scale - 런 단위로 확정된 척도
 */
export function resolveInterestLevel(
  recent: readonly InterestLevelSource[],
  scale: InterestScale,
): number | null {
  const values = scale === 'anchor'
    ? finite(recent.map((row) => row.anchor_scaled_value))
    : finite(recent.map((row) => row.raw_value))

  if (values.length < Math.min(MIN_OBSERVATIONS, recent.length) || values.length === 0) return null
  return mean(values)
}

/**
 * 런 전체가 쓸 척도를 정한다
 *
 * 앵커 적재는 2026-07-06부터 시작됐으므로 그 이전 구간을 재계산하면 앵커 값이 없다.
 * 과반이 앵커를 갖출 때만 앵커 척도로 넘어가고, 아니면 기존 raw 동작을 그대로 유지한다.
 *
 * @param themeWindows - 테마별 최근 창 관측
 */
export function resolveRunInterestScale(
  themeWindows: readonly (readonly InterestLevelSource[])[],
): InterestScale {
  if (themeWindows.length === 0) return 'raw'

  const withAnchor = themeWindows
    .filter((window) => resolveInterestLevel(window, 'anchor') !== null).length

  return withAnchor / themeWindows.length >= ANCHOR_RUN_COVERAGE ? 'anchor' : 'raw'
}
