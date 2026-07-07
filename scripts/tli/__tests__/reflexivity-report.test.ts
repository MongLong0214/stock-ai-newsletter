import { describe, expect, it } from 'vitest'
import { extractNewsletterExposureEvents } from '../ops/reflexivity-loader'
import { buildReflexivityReport } from '../ops/reflexivity-report'

const allThemeIds = ['theme-a', 'theme-b', 'theme-c', 'theme-d', 'theme-e', 'theme-f']

describe('buildReflexivityReport', () => {
  it('proposes an exposure_suspect issue when exposed raw_value lift exceeds the control group', () => {
    const report = buildReflexivityReport({
      asOfDate: '2026-07-06',
      quarterStart: '2026-07-01',
      quarterEnd: '2026-07-06',
      allThemeIds,
      eventWindowDays: 3,
      minComparableEvents: 1,
      liftThreshold: 0.15,
      labelLiftThreshold: 0.25,
      extractionMode: 'fixture',
      exposureEvents: [
        { themeId: 'theme-a', exposureDate: '2026-07-01', source: 'fixture' },
        { themeId: 'theme-b', exposureDate: '2026-07-02', source: 'fixture' },
      ],
      interestRows: [
        { themeId: 'theme-a', date: '2026-07-01', rawValue: 100 },
        { themeId: 'theme-a', date: '2026-07-02', rawValue: 130 },
        { themeId: 'theme-a', date: '2026-07-03', rawValue: 140 },
        { themeId: 'theme-a', date: '2026-07-04', rawValue: 150 },
        { themeId: 'theme-b', date: '2026-07-02', rawValue: 80 },
        { themeId: 'theme-b', date: '2026-07-03', rawValue: 104 },
        { themeId: 'theme-b', date: '2026-07-04', rawValue: 112 },
        { themeId: 'theme-b', date: '2026-07-05', rawValue: 120 },
        { themeId: 'theme-c', date: '2026-07-01', rawValue: 100 },
        { themeId: 'theme-c', date: '2026-07-02', rawValue: 105 },
        { themeId: 'theme-c', date: '2026-07-03', rawValue: 105 },
        { themeId: 'theme-c', date: '2026-07-04', rawValue: 105 },
        { themeId: 'theme-d', date: '2026-07-02', rawValue: 200 },
        { themeId: 'theme-d', date: '2026-07-03', rawValue: 210 },
        { themeId: 'theme-d', date: '2026-07-04', rawValue: 210 },
        { themeId: 'theme-d', date: '2026-07-05', rawValue: 210 },
      ],
      labelRows: [],
    })

    expect(report.eventStudy.status).toBe('ready')
    expect(report.eventStudy.exposed.meanRelativeChange).toBe(0.4)
    expect(report.eventStudy.control.meanRelativeChange).toBe(0.033333)
    expect(report.eventStudy.netLift).toBe(0.366667)
    expect(report.issueProposal?.labels).toContain('exposure_suspect')
    expect(report.recommendedAction).toBe('propose_exposure_suspect_issue')
  })

  it('compares exposed and unexposed quarterly label distributions', () => {
    const report = buildReflexivityReport({
      asOfDate: '2026-07-06',
      quarterStart: '2026-07-01',
      quarterEnd: '2026-07-06',
      allThemeIds,
      minComparableEvents: 2,
      liftThreshold: 0.50,
      labelLiftThreshold: 0.40,
      extractionMode: 'fixture',
      exposureEvents: [
        { themeId: 'theme-a', exposureDate: '2026-07-01', source: 'fixture' },
        { themeId: 'theme-b', exposureDate: '2026-07-02', source: 'fixture' },
      ],
      interestRows: [],
      labelRows: [
        { themeId: 'theme-a', baseDate: '2026-07-01', yBinary: true, labelStatus: 'final' },
        { themeId: 'theme-b', baseDate: '2026-07-02', yBinary: true, labelStatus: 'final' },
        { themeId: 'theme-c', baseDate: '2026-07-01', yBinary: false, labelStatus: 'final' },
        { themeId: 'theme-d', baseDate: '2026-07-01', yBinary: false, labelStatus: 'final' },
      ],
    })

    expect(report.labelDistribution.status).toBe('ready')
    expect(report.labelDistribution.exposed.positiveRate).toBe(1)
    expect(report.labelDistribution.unexposed.positiveRate).toBe(0)
    expect(report.labelDistribution.lift).toBe(1)
    expect(report.issueProposal?.evidence.labelDistributionSignificant).toBe(true)
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
