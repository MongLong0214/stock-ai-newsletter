import { describe, expect, it } from 'vitest'
import type { ExposureEvent, InterestMetricRow, ThemeLabelRow } from '../ops/reflexivity-report'
import { extractNewsletterExposureEvents } from '../ops/reflexivity-loader'
import { buildReflexivityReport } from '../ops/reflexivity-report'

const allThemeIds = ['theme-a', 'theme-b', 'theme-c', 'theme-d', 'theme-e', 'theme-f']
const eventDate = '2026-07-01'

function themeIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`)
}

function fixtureExposureEvents(themeIdsInput: readonly string[]): ExposureEvent[] {
  return themeIdsInput.map((themeId) => ({ themeId, exposureDate: eventDate, source: 'fixture' }))
}

function fixtureInterestRows(themeIdsInput: readonly string[], futureRawValue: number): InterestMetricRow[] {
  return themeIdsInput.flatMap((themeId) => [
    { themeId, date: eventDate, rawValue: 100 },
    { themeId, date: '2026-07-02', rawValue: futureRawValue },
  ])
}

function fixtureLabelRows(input: {
  readonly themeIdsInput: readonly string[]
  readonly positiveCount: number
}): ThemeLabelRow[] {
  return input.themeIdsInput.map((themeId, index) => ({
    themeId,
    baseDate: eventDate,
    yBinary: index < input.positiveCount,
    labelStatus: 'final',
  }))
}

describe('buildReflexivityReport', () => {
  it('proposes an exposure_suspect issue when exposed raw_value lift is statistically significant', () => {
    const exposedThemeIds = themeIds('exposed', 20)
    const controlThemeIds = themeIds('control', 20)
    const report = buildReflexivityReport({
      asOfDate: '2026-07-06',
      quarterStart: '2026-07-01',
      quarterEnd: '2026-07-06',
      allThemeIds: [...exposedThemeIds, ...controlThemeIds],
      eventWindowDays: 1,
      minComparableEvents: 5,
      liftThreshold: 0.15,
      labelLiftThreshold: 0.25,
      extractionMode: 'fixture',
      exposureEvents: fixtureExposureEvents(exposedThemeIds),
      interestRows: [
        ...fixtureInterestRows(exposedThemeIds, 150),
        ...fixtureInterestRows(controlThemeIds, 100),
      ],
      labelRows: [],
    })

    expect(report.eventStudy.status).toBe('ready')
    expect(report.reportVersion).toBe('tli-reflexivity-report-v2')
    expect(report.thresholds.alpha).toBe(0.05)
    expect(report.thresholds.permutationIterations).toBe(2000)
    expect(report.eventStudy.exposed.meanRelativeChange).toBe(0.5)
    expect(report.eventStudy.control.meanRelativeChange).toBe(0)
    expect(report.eventStudy.netLift).toBe(0.5)
    expect(report.eventStudy.significantLift).toBe(true)
    expect(report.eventStudy.permutationIterations).toBe(2000)
    expect(report.eventStudy.pValue).toBeLessThanOrEqual(0.05)
    expect(report.eventStudy.statisticallySignificant).toBe(true)
    expect(report.issueProposal?.labels).toContain('exposure_suspect')
    expect(report.recommendedAction).toBe('propose_exposure_suspect_issue')
  })

  it('proposes an exposure_suspect issue when label lift is statistically significant', () => {
    const exposedThemeIds = themeIds('label-exposed', 20)
    const unexposedThemeIds = themeIds('label-unexposed', 20)
    const report = buildReflexivityReport({
      asOfDate: '2026-07-06',
      quarterStart: '2026-07-01',
      quarterEnd: '2026-07-06',
      allThemeIds: [...exposedThemeIds, ...unexposedThemeIds],
      minComparableEvents: 5,
      liftThreshold: 0.50,
      labelLiftThreshold: 0.40,
      extractionMode: 'fixture',
      exposureEvents: fixtureExposureEvents(exposedThemeIds),
      interestRows: [],
      labelRows: [
        ...fixtureLabelRows({ themeIdsInput: exposedThemeIds, positiveCount: 20 }),
        ...fixtureLabelRows({ themeIdsInput: unexposedThemeIds, positiveCount: 0 }),
      ],
    })

    expect(report.labelDistribution.status).toBe('ready')
    expect(report.labelDistribution.exposed.positiveRate).toBe(1)
    expect(report.labelDistribution.unexposed.positiveRate).toBe(0)
    expect(report.labelDistribution.lift).toBe(1)
    expect(report.labelDistribution.significantLift).toBe(true)
    expect(report.labelDistribution.pValue).toBeLessThanOrEqual(0.05)
    expect(report.labelDistribution.statisticallySignificant).toBe(true)
    expect(report.issueProposal?.evidence.labelDistributionSignificant).toBe(true)
  })

  it('does not propose an issue when a small label lift only crosses the effect threshold', () => {
    const exposedThemeIds = themeIds('small-exposed', 5)
    const unexposedThemeIds = themeIds('small-unexposed', 5)
    const report = buildReflexivityReport({
      asOfDate: '2026-07-06',
      quarterStart: '2026-07-01',
      quarterEnd: '2026-07-06',
      allThemeIds: [...exposedThemeIds, ...unexposedThemeIds],
      minComparableEvents: 5,
      liftThreshold: 0.50,
      labelLiftThreshold: 0.19,
      extractionMode: 'fixture',
      exposureEvents: fixtureExposureEvents(exposedThemeIds),
      interestRows: [],
      labelRows: [
        ...fixtureLabelRows({ themeIdsInput: exposedThemeIds, positiveCount: 3 }),
        ...fixtureLabelRows({ themeIdsInput: unexposedThemeIds, positiveCount: 2 }),
      ],
    })

    expect(report.labelDistribution.status).toBe('ready')
    expect(report.labelDistribution.lift).toBe(0.2)
    expect(report.labelDistribution.significantLift).toBe(true)
    expect(report.labelDistribution.pValue).toBeGreaterThan(0.05)
    expect(report.labelDistribution.statisticallySignificant).toBe(false)
    expect(report.issueProposal).toBeNull()
    expect(report.recommendedAction).toBe('none')
  })

  it('returns deterministic permutation p-values for identical inputs', () => {
    const exposedThemeIds = themeIds('stable-exposed', 5)
    const unexposedThemeIds = themeIds('stable-unexposed', 5)
    const input = {
      asOfDate: '2026-07-06',
      quarterStart: '2026-07-01',
      quarterEnd: '2026-07-06',
      allThemeIds: [...exposedThemeIds, ...unexposedThemeIds],
      minComparableEvents: 5,
      liftThreshold: 0.50,
      labelLiftThreshold: 0.19,
      extractionMode: 'fixture',
      exposureEvents: fixtureExposureEvents(exposedThemeIds),
      interestRows: [],
      labelRows: [
        ...fixtureLabelRows({ themeIdsInput: exposedThemeIds, positiveCount: 3 }),
        ...fixtureLabelRows({ themeIdsInput: unexposedThemeIds, positiveCount: 2 }),
      ],
    } satisfies Parameters<typeof buildReflexivityReport>[0]

    const first = buildReflexivityReport(input)
    const second = buildReflexivityReport(input)

    expect(first.labelDistribution.pValue).toBe(second.labelDistribution.pValue)
    expect(first.labelDistribution.statisticallySignificant)
      .toBe(second.labelDistribution.statisticallySignificant)
  })

  it('does not propose an issue when comparable raw_value and label samples are insufficient', () => {
    const report = buildReflexivityReport({
      asOfDate: '2026-07-06',
      quarterStart: '2026-07-01',
      quarterEnd: '2026-07-06',
      allThemeIds,
      minComparableEvents: 2,
      extractionMode: 'fixture',
      exposureEvents: [{ themeId: 'theme-a', exposureDate: '2026-07-01', source: 'fixture' }],
      interestRows: [{ themeId: 'theme-a', date: '2026-07-01', rawValue: 100 }],
      labelRows: [{ themeId: 'theme-a', baseDate: '2026-07-01', yBinary: true, labelStatus: 'final' }],
    })

    expect(report.eventStudy.status).toBe('insufficient_data')
    expect(report.labelDistribution.status).toBe('insufficient_data')
    expect(report.issueProposal).toBeNull()
    expect(report.recommendedAction).toBe('none')
  })
})

describe('extractNewsletterExposureEvents', () => {
  it('deduplicates theme-date exposure events from sent newsletter text matches', () => {
    const extraction = extractNewsletterExposureEvents({
      themes: [
        { id: 'theme-a', name: '반도체', nameEn: 'Semiconductor' },
        { id: 'theme-b', name: '2차전지', nameEn: null },
        { id: 'theme-c', name: 'AI', nameEn: 'Artificial Intelligence' },
      ],
      newsletters: [
        {
          id: 'newsletter-1',
          newsletterDate: '2026-07-01',
          geminiAnalysis: JSON.stringify({ topThemes: ['반도체', 'Semiconductor'] }),
          subscriberCount: 1200,
        },
        {
          id: 'newsletter-2',
          newsletterDate: '2026-07-02',
          geminiAnalysis: '오늘은 2차전지 관련주와 인공지능 수요를 점검합니다.',
          subscriberCount: 1300,
        },
        {
          id: 'newsletter-3',
          newsletterDate: '2026-07-03',
          geminiAnalysis: '시장 요약만 발행되었습니다.',
          subscriberCount: 1250,
        },
      ],
    })

    expect(extraction.newsletterCount).toBe(3)
    expect(extraction.matchedNewsletterCount).toBe(2)
    expect(extraction.unmatchedNewsletterCount).toBe(1)
    expect(extraction.events).toEqual([
      {
        themeId: 'theme-a',
        exposureDate: '2026-07-01',
        source: 'newsletter_content_text_match',
        newsletterId: 'newsletter-1',
        matchedName: '반도체',
        subscriberCount: 1200,
      },
      {
        themeId: 'theme-b',
        exposureDate: '2026-07-02',
        source: 'newsletter_content_text_match',
        newsletterId: 'newsletter-2',
        matchedName: '2차전지',
        subscriberCount: 1300,
      },
    ])
  })
})
