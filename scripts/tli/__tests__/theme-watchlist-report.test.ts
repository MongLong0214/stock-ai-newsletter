import { afterEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_NAMES } from '../../../lib/tli/features/build-features'
import {
  THEME_WATCHLIST_PREDICTION_SERVING_ROLE,
  resolveThemeWatchlistModelVersion,
  runThemeWatchlistReport,
} from '../ops/run-theme-watchlist-report'
import {
  buildThemeWatchlistReport,
  renderThemeWatchlistMarkdown,
  type ThemeWatchlistPredictionRow,
  type ThemeWatchlistScoredRow,
} from '../ops/theme-watchlist-report'

const featurePayload = (valuesByName: Readonly<Record<string, number>>): ThemeWatchlistPredictionRow['features'] => ({
  featureSchema: FEATURE_NAMES,
  values: FEATURE_NAMES.map((name) => valuesByName[name] ?? 0),
  missingFlags: FEATURE_NAMES.map((name) => valuesByName[name] === undefined),
})

const predictionRow = (
  themeId: string,
  pRise: number | null,
  valuesByName: Readonly<Record<string, number>> = {},
): ThemeWatchlistPredictionRow => ({
  themeId,
  pRise,
  abstain: pRise === null,
  features: featurePayload(valuesByName),
})

const scoredRow = (themeId: string, probability: number, actualY: boolean): ThemeWatchlistScoredRow => ({
  themeId,
  predictionDate: '2026-07-01',
  pRise: probability,
  abstain: false,
  actualY,
})

const names = new Map([
  ['theme-a', 'AI 반도체'],
  ['theme-b', '로봇'],
  ['theme-c', '바이오'],
  ['theme-d', '우주항공'],
])

describe('theme watchlist report pure logic', () => {
  it('ranks rising and cooling lists with theme-name tie breaking', () => {
    const report = buildThemeWatchlistReport({
      date: '2026-07-08',
      modelVersion: 'm1-shadow-2026w27',
      modelVersionSource: 'registry',
      rows: [
        predictionRow('theme-a', 0.72),
        predictionRow('theme-b', 0.72),
        predictionRow('theme-c', 0.21),
        predictionRow('theme-d', 0.11),
      ],
      themeNames: names,
      scoredRows: [],
      top: 3,
      bottom: 2,
    })

    expect(report.rising.map((entry) => entry.theme)).toEqual(['AI 반도체', '로봇', '바이오'])
    expect(report.cooling.map((entry) => entry.theme)).toEqual(['우주항공', '바이오'])
    expect(report.shadowHealth.coverage).toBe(1)
  })

  it('assembles Korean evidence tags from the persisted feature vector', () => {
    const report = buildThemeWatchlistReport({
      date: '2026-07-08',
      modelVersion: 'm1-shadow-2026w27',
      modelVersionSource: 'registry',
      rows: [
        predictionRow('theme-a', 0.81, {
          interest_slope_7d: 0.1244,
          news_momentum: 0.42,
          basket_return_5d: 0.031,
          babl_phase_signal: 1,
        }),
      ],
      themeNames: names,
      scoredRows: [scoredRow('theme-a', 0.75, true), scoredRow('theme-b', 0.25, false)],
      top: 1,
      bottom: 1,
    })

    expect(report.rising[0]?.evidence).toBe(
      '검색 기울기 +0.124, 뉴스 모멘텀 +0.420, 바스켓 초과수익 +3.1%, B-abl 상승 신호 +1',
    )
    expect(report.shadowHealth.latestScoredDay).toMatchObject({
      date: '2026-07-01',
      nScored: 2,
      brier: 0.0625,
    })
  })

  it('degrades to an outage canary when the day has no non-null probabilities', () => {
    const report = buildThemeWatchlistReport({
      date: '2026-07-08',
      modelVersion: 'm1-shadow-2026w27',
      modelVersionSource: 'registry',
      rows: [predictionRow('theme-a', null), predictionRow('theme-b', null)],
      themeNames: names,
      scoredRows: [],
      top: 5,
      bottom: 3,
    })

    expect(report.rising).toEqual([])
    expect(report.cooling).toEqual([])
    expect(report.shadowHealth).toMatchObject({
      totalRows: 2,
      nonNullPRiseCount: 0,
      coverage: 0,
      abstainCount: 2,
      latestScoredDay: null,
      scoredMetricStatus: 'no_scored_rows_yet',
    })
  })

  it('renders a compact Korean markdown report', () => {
    const report = buildThemeWatchlistReport({
      date: '2026-07-08',
      modelVersion: 'm1-shadow-2026w27',
      modelVersionSource: 'override',
      rows: [
        predictionRow('theme-a', 0.81, { interest_slope_7d: 0.12, news_momentum: 0.4 }),
        predictionRow('theme-c', 0.22, { basket_return_5d: -0.018, babl_phase_signal: -1 }),
      ],
      themeNames: names,
      scoredRows: [],
      top: 1,
      bottom: 1,
    })

    expect(report.modelVersionSource).toBe('override')
    expect(renderThemeWatchlistMarkdown(report)).toMatchInlineSnapshot(`
      "# TLI 테마 워치리스트 (2026-07-08)

      모델: \`m1-shadow-2026w27\`
      모델 버전 출처: \`override\`

      ## 상승 워치리스트
      | 테마 | 상승확률 | 근거 |
      | --- | ---: | --- |
      | AI 반도체 | 81.0% | 검색 기울기 +0.120, 뉴스 모멘텀 +0.400 |

      ## 쿨링 리스트
      | 테마 | 상승확률 | 근거 |
      | --- | ---: | --- |
      | 바이오 | 22.0% | 바스켓 초과수익 -1.8%, B-abl 하락 신호 -1 |

      ## Shadow Health
      - 대상 행: 2
      - p_rise 커버리지: 2/2 (100.0%)
      - Abstain: 0
      - 최근 scored-day: no scored rows yet

      관심(검색량) 전망이며 투자 권유가 아닙니다. 내부 콘텐츠 우선순위용.

      "
    `)
  })
})

describe('theme watchlist report runner', () => {
  it('uses challenger as the production prediction serving role', () => {
    expect(THEME_WATCHLIST_PREDICTION_SERVING_ROLE).toBe('challenger')
  })

  it('resolves an override model version without reading the registry', async () => {
    const loadRegistryModel = vi.fn(async () => ({
      modelVersion: 'registry-version',
      containment: 'active' as const,
    }))

    await expect(resolveThemeWatchlistModelVersion([
      '--model-version=m1-override-2026w28',
    ], loadRegistryModel)).resolves.toEqual({
      modelVersion: 'm1-override-2026w28',
      modelVersionSource: 'override',
      containment: null,
    })
    expect(loadRegistryModel).not.toHaveBeenCalled()
  })

  it('records registry as the source when no override is supplied', async () => {
    const loadRegistryModel = vi.fn(async () => ({
      modelVersion: 'registry-version',
      containment: 'blocked' as const,
    }))

    await expect(resolveThemeWatchlistModelVersion([], loadRegistryModel)).resolves.toEqual({
      modelVersion: 'registry-version',
      modelVersionSource: 'registry',
      containment: 'blocked',
    })
    expect(loadRegistryModel).toHaveBeenCalledTimes(1)
  })
})

describe('theme watchlist report blocked artifacts', () => {
  const initialExitCode = process.exitCode

  afterEach(() => {
    process.exitCode = initialExitCode
    vi.restoreAllMocks()
  })

  it('prints blocked JSON with exit 2 and writes no report for a contained challenger', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const loadPredictionRows = vi.fn(async () => [] as ThemeWatchlistPredictionRow[])
    const writeJson = vi.fn()
    const writeText = vi.fn()

    await runThemeWatchlistReport([], {
      loadRegistryModel: async () => ({ modelVersion: 'm1-contained', containment: 'blocked' }),
      loadLatestPredictionDate: async () => '2026-09-01',
      loadPredictionRows,
      writeJson,
      writeText,
      today: '2026-09-02',
    })

    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toEqual({
      status: 'blocked',
      reason: 'challenger_blocked',
      modelVersion: 'm1-contained',
      latestPredictionDate: '2026-09-01',
    })
    expect(process.exitCode).toBe(2)
    expect(loadPredictionRows).not.toHaveBeenCalled()
    expect(writeJson).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('prints stale blocked JSON with exit 2 before loading report rows', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const loadRegistryModel = vi.fn(async () => ({
      modelVersion: 'registry-version',
      containment: 'blocked' as const,
    }))
    const loadPredictionRows = vi.fn(async () => [] as ThemeWatchlistPredictionRow[])
    const writeJson = vi.fn()
    const writeText = vi.fn()

    await runThemeWatchlistReport(['--model-version=m1-override'], {
      loadRegistryModel,
      loadLatestPredictionDate: async () => '2026-08-31',
      loadPredictionRows,
      writeJson,
      writeText,
      today: '2026-09-02',
    })

    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toEqual({
      status: 'blocked',
      reason: 'legacy_predictions_stale',
      modelVersion: 'm1-override',
      latestPredictionDate: '2026-08-31',
    })
    expect(process.exitCode).toBe(2)
    expect(loadRegistryModel).not.toHaveBeenCalled()
    expect(loadPredictionRows).not.toHaveBeenCalled()
    expect(writeJson).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('keeps the existing stdout shape and report files for a fresh active challenger', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const writeJson = vi.fn()
    const writeText = vi.fn()

    await runThemeWatchlistReport([], {
      loadRegistryModel: async () => ({ modelVersion: 'm1-active', containment: 'active' }),
      loadLatestPredictionDate: async () => '2026-09-01',
      loadPredictionRows: async () => [predictionRow('theme-a', 0.75)],
      loadLatestScoredRows: async () => [scoredRow('theme-a', 0.75, true)],
      loadThemeNames: async () => names,
      writeJson,
      writeText,
      today: '2026-09-02',
    })

    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toEqual({
      date: '2026-09-01',
      modelVersion: 'm1-active',
      modelVersionSource: 'registry',
      risingCount: 1,
      coverage: 1,
    })
    expect(process.exitCode).toBe(0)
    expect(writeJson).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledOnce()
  })
})
