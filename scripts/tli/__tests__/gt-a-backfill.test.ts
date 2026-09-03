import { describe, expect, it } from 'vitest'
import { buildGtABackfillAudit } from '../labels/gt-a-audit'
import {
  getKoreanTradingDatesBetween,
  getKoreanTradingDateWindow,
} from '../../../lib/tli/trading-calendar'

describe('GT-A backfill helpers', () => {
  it('lists only Korean trading dates across weekend boundaries', () => {
    expect(getKoreanTradingDatesBetween({
      startDate: '2026-01-02',
      endDate: '2026-01-05',
    })).toEqual(['2026-01-02', '2026-01-05'])
  })

  it('builds fixed-size past and future business-day windows', () => {
    expect(getKoreanTradingDateWindow({
      baseDate: '2026-01-09',
      startOffset: -4,
      endOffset: 0,
    })).toEqual(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'])
  })

  it('skips the 2026 local election and keeps the open Monday after Memorial Day', () => {
    // 2026-06-03 (Wed) is the local-election closure. Memorial Day is not eligible for
    // a substitute holiday, so 2026-06-08 (Mon) remains a trading day.
    expect(getKoreanTradingDatesBetween({
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    })).toEqual([
      '2026-06-01',
      '2026-06-02',
      // 2026-06-03 skipped (holiday, not a weekend)
      '2026-06-04',
      '2026-06-05',
      // 2026-06-06/07 skipped (weekend)
      '2026-06-08',
      '2026-06-09',
      '2026-06-10',
    ])
  })

  it('builds a t±5 business-day window that steps over the 2026-06-03 holiday instead of counting it', () => {
    expect(getKoreanTradingDateWindow({
      baseDate: '2026-06-05',
      startOffset: -4,
      endOffset: 0,
    })).toEqual(['2026-05-29', '2026-06-01', '2026-06-02', '2026-06-04', '2026-06-05'])
  })

  it('calculates the audit report and delta review gate', () => {
    const audit = buildGtABackfillAudit([
      { label_status: 'final', g_log_ratio: 0.2, y_binary: true, rescale_suspect: false, low_signal: false, exclude_reason: null },
      { label_status: 'final', g_log_ratio: -0.1, y_binary: false, rescale_suspect: true, low_signal: true, exclude_reason: null },
      { label_status: 'excluded', g_log_ratio: null, y_binary: null, rescale_suspect: false, low_signal: false, exclude_reason: 'denominator_floor' },
      { label_status: 'censored', g_log_ratio: null, y_binary: null, rescale_suspect: false, low_signal: false, exclude_reason: null },
    ])

    expect(audit.totalLabels).toBe(4)
    expect(audit.finalCount).toBe(2)
    expect(audit.baseRate).toBe(0.5)
    expect(audit.deltaReviewRequired).toBe(false)
    expect(audit.censoredRate).toBe(0.25)
    expect(audit.excludedByReason.denominator_floor).toBe(1)
    expect(audit.rescaleSuspectRate).toBe(0.25)
    expect(audit.lowSignalRate).toBe(0.25)
    expect(audit.gDistribution.p50).toBe(-0.1)
  })

  it('requires delta review when base rate leaves the approved range', () => {
    const audit = buildGtABackfillAudit([
      { label_status: 'final', g_log_ratio: 0.2, y_binary: true, rescale_suspect: false, low_signal: false, exclude_reason: null },
      { label_status: 'final', g_log_ratio: 0.3, y_binary: true, rescale_suspect: false, low_signal: false, exclude_reason: null },
    ])

    expect(audit.baseRate).toBe(1)
    expect(audit.deltaReviewRequired).toBe(true)
  })
})
