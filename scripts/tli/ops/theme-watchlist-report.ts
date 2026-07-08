import { evaluatePredictionRows, type EvalPredictionRow } from '../../../lib/tli/eval/harness'

export const THEME_WATCHLIST_REPORT_VERSION = 'tli-watchlist-v1'
export const THEME_WATCHLIST_DISCLAIMER = '관심(검색량) 전망이며 투자 권유가 아닙니다. 내부 콘텐츠 우선순위용.'

export interface ThemeWatchlistFeaturePayload {
  readonly featureSchema: readonly string[]
  readonly values: readonly number[]
  readonly missingFlags: readonly boolean[]
}

export interface ThemeWatchlistPredictionRow {
  readonly themeId: string
  readonly pRise: number | null
  readonly abstain: boolean
  readonly features: ThemeWatchlistFeaturePayload | null
}

export interface ThemeWatchlistScoredRow {
  readonly themeId: string
  readonly predictionDate: string
  readonly pRise: number | null
  readonly abstain: boolean
  readonly actualY: boolean | null
}

export interface ThemeWatchlistEntry {
  readonly themeId: string
  readonly theme: string
  readonly pRise: number
  readonly evidence: string
}

export interface ThemeWatchlistScoredHealth {
  readonly date: string
  readonly nScored: number
  readonly brier: number | null
  readonly ece: number | null
}

export type ThemeWatchlistModelVersionSource = 'override' | 'registry'

export interface ThemeWatchlistShadowHealth {
  readonly totalRows: number
  readonly nonNullPRiseCount: number
  readonly coverage: number
  readonly abstainCount: number
  readonly latestScoredDay: ThemeWatchlistScoredHealth | null
  readonly scoredMetricStatus: 'available' | 'no_scored_rows_yet'
}

export interface ThemeWatchlistReport {
  readonly reportVersion: typeof THEME_WATCHLIST_REPORT_VERSION
  readonly date: string
  readonly modelVersion: string
  readonly modelVersionSource: ThemeWatchlistModelVersionSource
  readonly rising: readonly ThemeWatchlistEntry[]
  readonly cooling: readonly ThemeWatchlistEntry[]
  readonly shadowHealth: ThemeWatchlistShadowHealth
}

export interface BuildThemeWatchlistReportInput {
  readonly date: string
  readonly modelVersion: string
  readonly modelVersionSource: ThemeWatchlistModelVersionSource
  readonly rows: readonly ThemeWatchlistPredictionRow[]
  readonly themeNames: ReadonlyMap<string, string>
  readonly scoredRows: readonly ThemeWatchlistScoredRow[]
  readonly top: number
  readonly bottom: number
}

interface EvidenceSpec {
  readonly featureName: string
  readonly render: (value: number) => string
}

const formatSigned = (value: number, digits: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
const formatProbability = (value: number): string => `${(value * 100).toFixed(1)}%`
const formatMetric = (value: number | null): string => (value === null ? 'n/a' : value.toFixed(4))

const EVIDENCE_SPECS = [
  {
    featureName: 'interest_slope_7d',
    render: (value: number) => `검색 기울기 ${formatSigned(value, 3)}`,
  },
  {
    featureName: 'news_momentum',
    render: (value: number) => `뉴스 모멘텀 ${formatSigned(value, 3)}`,
  },
  {
    featureName: 'basket_return_5d',
    render: (value: number) => `바스켓 초과수익 ${formatSigned(value * 100, 1)}%`,
  },
  {
    featureName: 'babl_phase_signal',
    render: (value: number) => {
      if (value > 0) return `B-abl 상승 신호 ${formatSigned(value, 0)}`
      if (value < 0) return `B-abl 하락 신호 ${value.toFixed(0)}`
      return 'B-abl 중립 0'
    },
  },
] as const satisfies readonly EvidenceSpec[]

const findFeatureValue = (features: ThemeWatchlistFeaturePayload | null, featureName: string): number | null => {
  if (features === null) return null
  const index = features.featureSchema.findIndex((name) => name === featureName)
  if (index < 0) return null
  const value = features.values[index]
  const missing = features.missingFlags[index] ?? false
  return missing || value === undefined || !Number.isFinite(value) ? null : value
}

export function buildEvidenceString(features: ThemeWatchlistFeaturePayload | null): string {
  const tags = EVIDENCE_SPECS.flatMap((spec) => {
    const value = findFeatureValue(features, spec.featureName)
    return value === null ? [] : [spec.render(value)]
  })
  return tags.length === 0 ? '저장된 피처 근거 없음' : tags.join(', ')
}

const themeNameFor = (themeNames: ReadonlyMap<string, string>, themeId: string): string => themeNames.get(themeId) ?? themeId

const compareText = (left: string, right: string): number => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

const toEntry = (
  row: ThemeWatchlistPredictionRow & { readonly pRise: number },
  themeNames: ReadonlyMap<string, string>,
): ThemeWatchlistEntry => ({
  themeId: row.themeId,
  theme: themeNameFor(themeNames, row.themeId),
  pRise: row.pRise,
  evidence: buildEvidenceString(row.features),
})

const sortedNonNullRows = (
  rows: readonly ThemeWatchlistPredictionRow[],
  themeNames: ReadonlyMap<string, string>,
  direction: 'rising' | 'cooling',
): Array<ThemeWatchlistPredictionRow & { readonly pRise: number }> => rows.flatMap((row) => (
  row.pRise === null ? [] : [{ ...row, pRise: row.pRise }]
)).sort((left, right) => {
  const probabilityOrder = direction === 'rising' ? right.pRise - left.pRise : left.pRise - right.pRise
  return probabilityOrder !== 0
    ? probabilityOrder
    : compareText(themeNameFor(themeNames, left.themeId), themeNameFor(themeNames, right.themeId))
})

const toEvalRows = (rows: readonly ThemeWatchlistScoredRow[]): EvalPredictionRow[] => rows.map((row) => ({
  id: `${row.themeId}|${row.predictionDate}`,
  themeId: row.themeId,
  baseDate: row.predictionDate,
  probability: row.abstain ? null : row.pRise,
  y: row.actualY ?? false,
}))

const buildLatestScoredHealth = (rows: readonly ThemeWatchlistScoredRow[]): ThemeWatchlistScoredHealth | null => {
  const latestDate = [...new Set(rows.map((row) => row.predictionDate))].sort().at(-1)
  if (latestDate === undefined) return null
  const latestRows = rows.filter((row) => row.predictionDate === latestDate)
  const metrics = evaluatePredictionRows(toEvalRows(latestRows))
  return {
    date: latestDate,
    nScored: metrics.nScored,
    brier: metrics.brier,
    ece: metrics.ece,
  }
}

const buildShadowHealth = (
  rows: readonly ThemeWatchlistPredictionRow[],
  scoredRows: readonly ThemeWatchlistScoredRow[],
): ThemeWatchlistShadowHealth => {
  const nonNullPRiseCount = rows.filter((row) => row.pRise !== null).length
  const latestScoredDay = buildLatestScoredHealth(scoredRows)
  return {
    totalRows: rows.length,
    nonNullPRiseCount,
    coverage: rows.length === 0 ? 0 : nonNullPRiseCount / rows.length,
    abstainCount: rows.filter((row) => row.abstain).length,
    latestScoredDay,
    scoredMetricStatus: latestScoredDay === null ? 'no_scored_rows_yet' : 'available',
  }
}

export function buildThemeWatchlistReport(input: BuildThemeWatchlistReportInput): ThemeWatchlistReport {
  const rising = sortedNonNullRows(input.rows, input.themeNames, 'rising')
    .slice(0, input.top)
    .map((row) => toEntry(row, input.themeNames))
  const cooling = sortedNonNullRows(input.rows, input.themeNames, 'cooling')
    .slice(0, input.bottom)
    .map((row) => toEntry(row, input.themeNames))

  return {
    reportVersion: THEME_WATCHLIST_REPORT_VERSION,
    date: input.date,
    modelVersion: input.modelVersion,
    modelVersionSource: input.modelVersionSource,
    rising,
    cooling,
    shadowHealth: buildShadowHealth(input.rows, input.scoredRows),
  }
}

const escapeCell = (value: string): string => value.replace(/\|/g, '\\|')

const renderEntries = (entries: readonly ThemeWatchlistEntry[]): readonly string[] => {
  if (entries.length === 0) return ['| 없음 | - | - |']
  return entries.map((entry) => (
    `| ${escapeCell(entry.theme)} | ${formatProbability(entry.pRise)} | ${escapeCell(entry.evidence)} |`
  ))
}

const renderLatestScoredDay = (health: ThemeWatchlistShadowHealth): string => {
  const latest = health.latestScoredDay
  if (latest === null) return '- 최근 scored-day: no scored rows yet'
  return `- 최근 scored-day: ${latest.date}, Brier ${formatMetric(latest.brier)}, ECE ${formatMetric(latest.ece)} (n=${latest.nScored})`
}

export function renderThemeWatchlistMarkdown(report: ThemeWatchlistReport): string {
  const health = report.shadowHealth
  return [
    `# TLI 테마 워치리스트 (${report.date})`,
    [`모델: \`${report.modelVersion}\``, `모델 버전 출처: \`${report.modelVersionSource}\``].join('\n'),
    ['## 상승 워치리스트', '| 테마 | 상승확률 | 근거 |', '| --- | ---: | --- |', ...renderEntries(report.rising)].join('\n'),
    ['## 쿨링 리스트', '| 테마 | 상승확률 | 근거 |', '| --- | ---: | --- |', ...renderEntries(report.cooling)].join('\n'),
    [
      '## Shadow Health',
      `- 대상 행: ${health.totalRows}`,
      `- p_rise 커버리지: ${health.nonNullPRiseCount}/${health.totalRows} (${formatProbability(health.coverage)})`,
      `- Abstain: ${health.abstainCount}`,
      renderLatestScoredDay(health),
    ].join('\n'),
    THEME_WATCHLIST_DISCLAIMER,
    '',
  ].join('\n\n')
}
