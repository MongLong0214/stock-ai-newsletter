import { describe, expect, it, vi } from 'vitest'

vi.mock('../shared/supabase-admin', () => ({
  supabaseAdmin: { rpc: vi.fn() },
}))

import {
  buildLegacyGtAFinalizationRow,
  finalizeLegacyLabelRows,
  type LegacyLabelFinalizationTransport,
} from '../labels/finalize-legacy-labels'

const uuid = (prefix: string, value: number): string =>
  `${prefix}-0000-4000-8000-${value.toString(16).padStart(12, '0')}`

const buildFinalRows = (count: number) => Array.from({ length: count }, (_, index) =>
  buildLegacyGtAFinalizationRow({
    id: uuid('54000001', index + 1),
    themeId: uuid('54000000', index + 1),
    baseDate: '2026-07-03',
    result: {
      status: 'final',
      gLogRatio: Math.log(1.2),
      yBinary: true,
      denominator: 100,
      rescaleSuspect: false,
      lowSignal: false,
      keywordEpoch: 1,
      excludeReason: null,
      labelerVersion: 'gta-v1',
    },
  }))

describe('legacy label finalizer RPC writer', () => {
  it('does not cap a 992-row writer input and chunks it into 500 and 492 rows', async () => {
    const transport = vi.fn<LegacyLabelFinalizationTransport>(async (rows) => ({
      data: rows.length,
      error: null,
    }))

    await expect(finalizeLegacyLabelRows(buildFinalRows(992), transport)).resolves.toBe(992)
    expect(transport).toHaveBeenCalledTimes(2)
    expect(transport.mock.calls[0]?.[0]).toHaveLength(500)
    expect(transport.mock.calls[1]?.[0]).toHaveLength(492)
  })

  it('rejects an error-free zero-row response instead of reporting silent success', async () => {
    const transport = vi.fn<LegacyLabelFinalizationTransport>().mockResolvedValue({
      data: 0,
      error: null,
    })

    await expect(finalizeLegacyLabelRows(buildFinalRows(1), transport)).rejects.toThrow(
      'affected=0, expected=1',
    )
  })

  it('surfaces the database error from the exact finalizer RPC', async () => {
    const transport = vi.fn<LegacyLabelFinalizationTransport>().mockResolvedValue({
      data: null,
      error: { message: 'identity mismatch' },
    })

    await expect(finalizeLegacyLabelRows(buildFinalRows(1), transport)).rejects.toThrow(
      'identity mismatch',
    )
  })

  it('rejects a non-final GT-A payload that carries outcome columns', () => {
    expect(() => buildLegacyGtAFinalizationRow({
      id: uuid('54000001', 1),
      themeId: uuid('54000000', 1),
      baseDate: '2026-07-03',
      result: {
        status: 'censored',
        gLogRatio: 0.1,
        yBinary: true,
        denominator: 100,
        rescaleSuspect: false,
        lowSignal: false,
        keywordEpoch: 1,
        excludeReason: null,
        labelerVersion: 'gta-v1',
      },
    })).toThrow('GT-A non-final payload cannot carry outcomes')
  })
})
