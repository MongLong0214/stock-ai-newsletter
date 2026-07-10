import { describe, expect, it } from 'vitest'
import {
  createInnerOofSplit,
  createStudyWalkForwardFolds,
  distinctOriginDates,
  isTrainRowAvailable,
  type StudyEvalRow,
  type StudyOrigin,
} from '@/lib/tli/eval/harness'

const CUTOFF_SUFFIX = 'T09:00:00.000Z'

/** `2026-01-05` + 7n calendar days, i.e. one weekly origin per Monday. */
const originDate = (index: number): string => (
  new Date(Date.UTC(2026, 0, 5) + index * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
)

const makeOrigins = (count: number): StudyOrigin[] => (
  Array.from({ length: count }, (_unused, index) => ({
    originDate: originDate(index),
    forecastCutoff: `${originDate(index)}${CUTOFF_SUFFIX}`,
  }))
)

const makeOriginDates = (count: number): string[] => Array.from({ length: count }, (_unused, index) => originDate(index))

/** Every row's five future dates land inside its own origin week, so nothing is purged by default. */
const makeRows = (originCount: number, themeIds: readonly string[] = ['theme-a', 'theme-b']): StudyEvalRow[] => (
  makeOriginDates(originCount).flatMap((baseDate) => themeIds.map((themeId) => ({
    id: `${themeId}|${baseDate}`,
    themeId,
    baseDate,
    futureDates: [1, 2, 3, 4, 5].map((offset) => (
      new Date(Date.parse(`${baseDate}T00:00:00.000Z`) + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    )),
    labelFinalizedAt: `${baseDate}T00:00:00.000Z`,
    labelSourceRunCompletedAt: `${baseDate}T00:00:00.000Z`,
  })))
)

const testOrigin: StudyOrigin = { originDate: '2026-03-02', forecastCutoff: `2026-03-02${CUTOFF_SUFFIX}` }

const cleanRow: StudyEvalRow = {
  id: 'theme-a|2026-02-23',
  themeId: 'theme-a',
  baseDate: '2026-02-23',
  futureDates: ['2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28'],
  labelFinalizedAt: `2026-03-01${CUTOFF_SUFFIX}`,
  labelSourceRunCompletedAt: `2026-03-01${CUTOFF_SUFFIX}`,
}

describe('TLI v3 study walk-forward splitter', () => {
  it('builds exactly 13 one-origin expanding outer folds from a 26-origin study', () => {
    const split = createStudyWalkForwardFolds({ origins: makeOrigins(26), rows: makeRows(26) })

    expect(split.originCount).toBe(26)
    expect(split.initialTrainOriginCount).toBe(13)
    expect(split.testOriginCount).toBe(13)
    expect(split.folds).toHaveLength(13)

    const [first] = split.folds
    const last = split.folds[12]
    expect(first.testOrigin.originDate).toBe(originDate(13))
    expect(first.trainOrigins).toHaveLength(13)
    expect(last.testOrigin.originDate).toBe(originDate(25))
    expect(last.trainOrigins).toHaveLength(25)
  })

  it('derives inner K=5 at N=13 and K=8 at N=26', () => {
    expect(createInnerOofSplit(makeOriginDates(13)).foldCount).toBe(5)
    expect(createInnerOofSplit(makeOriginDates(26)).foldCount).toBe(8)
  })

  it('gives every outer fold a valid inner split, K=5 on the first fold and K=8 on the last', () => {
    const split = createStudyWalkForwardFolds({ origins: makeOrigins(26), rows: makeRows(26) })

    expect(createInnerOofSplit(split.folds[0].trainOrigins).foldCount).toBe(5)
    expect(createInnerOofSplit(split.folds[12].trainOrigins).foldCount).toBe(8)
  })

  it('trains each inner fold only on origins strictly earlier than its validation origin', () => {
    const inner = createInnerOofSplit(makeOriginDates(13))

    expect(inner.folds).toHaveLength(5)
    expect(inner.folds[0].validationOrigin).toBe(originDate(8))
    expect(inner.folds[0].trainOrigins).toEqual(makeOriginDates(8))
    expect(inner.folds[4].validationOrigin).toBe(originDate(12))
    expect(inner.folds[4].trainOrigins).toEqual(makeOriginDates(12))
    for (const fold of inner.folds) {
      expect(fold.trainOrigins.every((origin) => origin < fold.validationOrigin)).toBe(true)
    }
  })

  it('rejects an inner split whose K would fall below 5', () => {
    expect(() => createInnerOofSplit(makeOriginDates(12))).toThrow(/K=4 < 5/)
    expect(() => createInnerOofSplit(makeOriginDates(9))).toThrow(/K=1 < 5/)
    expect(() => createInnerOofSplit(makeOriginDates(8))).toThrow(/K=0 < 5/)
  })

  it('rejects a candidate start below 26 clean origins', () => {
    expect(() => createStudyWalkForwardFolds({ origins: makeOrigins(25), rows: makeRows(25) }))
      .toThrow(/25 clean origins < 26/)
  })

  it('never splits the theme rows of one origin across train and test', () => {
    const split = createStudyWalkForwardFolds({ origins: makeOrigins(26), rows: makeRows(26) })

    for (const fold of split.folds) {
      const trainOrigins = new Set(fold.train.map((row) => row.baseDate))
      const testOrigins = new Set(fold.test.map((row) => row.baseDate))
      expect([...testOrigins]).toEqual([fold.testOrigin.originDate])
      expect([...trainOrigins].some((origin) => testOrigins.has(origin))).toBe(false)
      expect(fold.test).toHaveLength(2)
    }
  })

  it('produces a stable split hash that ignores every non-origin input', () => {
    const origins = makeOrigins(26)
    const split = createStudyWalkForwardFolds({ origins, rows: makeRows(26) })
    const reordered = createStudyWalkForwardFolds({ origins: [...origins].reverse(), rows: makeRows(26) })
    const differentThemes = createStudyWalkForwardFolds({ origins, rows: makeRows(26, ['theme-x', 'theme-y']) })
    const shorter = createStudyWalkForwardFolds({ origins: makeOrigins(27), rows: makeRows(27) })

    expect(split.splitOriginsSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(reordered.splitOriginsSha256).toBe(split.splitOriginsSha256)
    expect(differentThemes.splitOriginsSha256).toBe(split.splitOriginsSha256)
    expect(shorter.splitOriginsSha256).not.toBe(split.splitOriginsSha256)
  })

  it('reports the distinct ascending origins of a row set', () => {
    expect(distinctOriginDates(makeRows(3))).toEqual(makeOriginDates(3))
  })
})

describe('TLI v3 purge predicate', () => {
  it('keeps a row whose future window closed before the test origin and whose label was final by cutoff', () => {
    expect(isTrainRowAvailable(cleanRow, testOrigin)).toBe(true)
  })

  it('purges a row whose last future date equals the test origin date', () => {
    const row = { ...cleanRow, futureDates: [...cleanRow.futureDates.slice(1), '2026-03-02'] }

    expect(isTrainRowAvailable(row, testOrigin)).toBe(false)
  })

  it('purges a row whose last future date is after the test origin date', () => {
    const row = { ...cleanRow, futureDates: [...cleanRow.futureDates.slice(1), '2026-03-03'] }

    expect(isTrainRowAvailable(row, testOrigin)).toBe(false)
  })

  it('purges a row finalized after the test forecast cutoff', () => {
    const row = { ...cleanRow, labelFinalizedAt: '2026-03-02T09:00:00.001Z' }

    expect(isTrainRowAvailable(row, testOrigin)).toBe(false)
    expect(isTrainRowAvailable({ ...cleanRow, labelFinalizedAt: `2026-03-02${CUTOFF_SUFFIX}` }, testOrigin)).toBe(true)
  })

  it('purges a row whose label source run completed after the test forecast cutoff', () => {
    const row = { ...cleanRow, labelSourceRunCompletedAt: '2026-03-02T09:00:00.001Z' }

    expect(isTrainRowAvailable(row, testOrigin)).toBe(false)
    expect(isTrainRowAvailable({ ...cleanRow, labelSourceRunCompletedAt: `2026-03-02${CUTOFF_SUFFIX}` }, testOrigin)).toBe(true)
  })

  it('fails closed on rows it cannot verify', () => {
    expect(isTrainRowAvailable({ ...cleanRow, futureDates: [] }, testOrigin)).toBe(false)
    expect(isTrainRowAvailable({ ...cleanRow, futureDates: ['2026-02-31T00:00'] }, testOrigin)).toBe(false)
    expect(isTrainRowAvailable({ ...cleanRow, labelFinalizedAt: 'not-a-timestamp' }, testOrigin)).toBe(false)
    expect(isTrainRowAvailable({ ...cleanRow, labelSourceRunCompletedAt: '' }, testOrigin)).toBe(false)
  })

  it('does not apply a fixed 5-trading-day gap: a row 1 day before the test origin survives', () => {
    const adjacent: StudyEvalRow = {
      ...cleanRow,
      baseDate: '2026-02-24',
      futureDates: ['2026-02-25', '2026-03-01'],
    }

    expect(isTrainRowAvailable(adjacent, testOrigin)).toBe(true)
  })

  it('purges leaking rows inside the outer fold and keeps them out of trainOrigins', () => {
    const origins = makeOrigins(26)
    const rows = makeRows(26).map((row) => (
      row.baseDate === originDate(12)
        ? { ...row, labelFinalizedAt: `${originDate(25)}T23:59:59.999Z` }
        : row
    ))
    const split = createStudyWalkForwardFolds({ origins, rows })
    const [firstFold] = split.folds

    expect(firstFold.candidateTrainOrigins).toHaveLength(13)
    expect(firstFold.trainOrigins).toHaveLength(12)
    expect(firstFold.trainOrigins).not.toContain(originDate(12))
    expect(firstFold.purged).toHaveLength(2)
    expect(firstFold.purged.every((row) => row.baseDate === originDate(12))).toBe(true)
    expect(firstFold.train.every((row) => isTrainRowAvailable(row, firstFold.testOrigin))).toBe(true)
  })
})
