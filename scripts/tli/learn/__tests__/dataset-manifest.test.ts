import { describe, expect, it, vi } from 'vitest'

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({ supabaseAdmin: {} }))

import { compareKeysetCursor, type KeysetCursor } from '@/scripts/tli/shared/keyset'
import {
  CONFIRMATORY_QUERY_CONTRACT,
  DATASET_MANIFEST_VERSION,
  loadConfirmatoryDataset,
  type DatasetDataSource,
  type RawConfirmatoryLabelRow,
  type StudyContractRow,
  type StudyOriginBindingRow,
} from '@/scripts/tli/learn/dataset-manifest'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_STUDY_ID = '22222222-2222-4222-8222-222222222222'
const AS_OF_CUTOFF = '2026-06-01T09:00:00.000Z'

const forecastId = (index: number): string => `f0000000-0000-4000-8000-${String(index).padStart(12, '0')}`
const studyOriginId = (index: number): string => `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`

const STUDY_CONTRACT: StudyContractRow = {
  id: STUDY_ID,
  payload_sha256: 'a'.repeat(64),
  labeler_version: 'gta-v2',
  label_contract_sha256: 'b'.repeat(64),
  feature_contract_version: 'tli-attention-v2-f1',
  feature_contract_sha256: 'c'.repeat(64),
}

const OTHER_STUDY_CONTRACT: StudyContractRow = { ...STUDY_CONTRACT, id: OTHER_STUDY_ID, payload_sha256: 'd'.repeat(64) }

const makeLabel = (
  overrides: Partial<RawConfirmatoryLabelRow>
    & Pick<RawConfirmatoryLabelRow, 'id' | 'theme_id' | 'base_date' | 'forecast_origin_manifest_id'>,
): RawConfirmatoryLabelRow => ({
  horizon_days: 5,
  labeler_version: 'gta-v2',
  label_type: 'gt_a',
  label_status: 'final',
  scientific_use_status: 'confirmatory_eligible',
  scientific_use_reason: 'gta_v2_exact_contract',
  rescale_suspect: false,
  y_binary: true,
  g_log_ratio: 0.2,
  finalized_at: '2026-03-01T09:00:00.000Z',
  label_source_run_id: 'run-ok',
  past_dates: ['2026-02-23', '2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27'],
  future_dates: ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06'],
  ...overrides,
})

const keyOf = (row: RawConfirmatoryLabelRow): KeysetCursor => ({
  first: row.base_date,
  second: row.theme_id,
  third: row.id,
})

interface FakeConfig {
  readonly studyContracts?: readonly StudyContractRow[]
  readonly bindings?: ReadonlyMap<string, readonly StudyOriginBindingRow[]>
  readonly labels: readonly RawConfirmatoryLabelRow[]
  readonly runCompletions?: ReadonlyMap<string, string>
  /** true면 DB eq/finalized 필터를 무시하고 원시 행을 그대로 흘려 loader 자체 방어 필터를 검증한다. */
  readonly broaden?: boolean
  readonly corrupt?: 'shuffle' | 'duplicate'
}

const DEFAULT_BINDINGS = new Map<string, readonly StudyOriginBindingRow[]>([
  [STUDY_ID, [
    { study_origin_manifest_id: studyOriginId(1), forecast_origin_manifest_id: forecastId(1) },
    { study_origin_manifest_id: studyOriginId(2), forecast_origin_manifest_id: forecastId(2) },
  ]],
  [OTHER_STUDY_ID, [
    { study_origin_manifest_id: studyOriginId(9), forecast_origin_manifest_id: forecastId(9) },
  ]],
])

const DEFAULT_RUNS = new Map<string, string>([
  ['run-ok', '2026-03-01T09:00:00.000Z'],
  ['run-late', '2026-07-01T09:00:00.000Z'],
])

const createFake = (config: FakeConfig): DatasetDataSource => {
  const studyContracts = new Map((config.studyContracts ?? [STUDY_CONTRACT, OTHER_STUDY_CONTRACT]).map((row) => [row.id, row]))
  const bindings = config.bindings ?? DEFAULT_BINDINGS
  const runCompletions = config.runCompletions ?? DEFAULT_RUNS

  const passesColumnFilters = (row: RawConfirmatoryLabelRow, asOfCutoff: string): boolean =>
    row.label_type === 'gt_a'
    && row.labeler_version === 'gta-v2'
    && row.horizon_days === 5
    && row.label_status === 'final'
    && row.scientific_use_status === 'confirmatory_eligible'
    && row.scientific_use_reason === 'gta_v2_exact_contract'
    && row.rescale_suspect === false
    && row.y_binary !== null
    && row.finalized_at !== null
    && new Date(row.finalized_at).getTime() <= new Date(asOfCutoff).getTime()

  return {
    async loadStudyContract(studyContractId) {
      return studyContracts.get(studyContractId) ?? null
    },
    async loadStudyOriginBindings(studyContractId) {
      return bindings.get(studyContractId) ?? []
    },
    async loadConfirmatoryLabelPage({ forecastOriginManifestIds, asOfCutoff, after, pageSize }) {
      const forecastSet = new Set(forecastOriginManifestIds)
      const filtered = config.labels.filter((row) =>
        row.forecast_origin_manifest_id !== null
        && forecastSet.has(row.forecast_origin_manifest_id)
        && (config.broaden === true || passesColumnFilters(row, asOfCutoff)))
      const ordered = [...filtered].sort((left, right) => compareKeysetCursor(keyOf(left), keyOf(right)))
      const advanced = after === null ? ordered : ordered.filter((row) => compareKeysetCursor(keyOf(row), after) > 0)
      const page = advanced.slice(0, pageSize)
      if (config.corrupt === 'shuffle' && page.length > 1) return [page[1], page[0], ...page.slice(2)]
      if (config.corrupt === 'duplicate' && page.length > 0) return [page[0], ...page]
      return page
    },
    async loadSourceRunCompletions(runIds) {
      const map = new Map<string, string>()
      for (const runId of runIds) {
        const completedAt = runCompletions.get(runId)
        if (completedAt !== undefined) map.set(runId, completedAt)
      }
      return map
    },
  }
}

const load = (config: FakeConfig, studyId = STUDY_ID) =>
  loadConfirmatoryDataset({ studyContractId: studyId, asOfCutoff: AS_OF_CUTOFF }, createFake(config))

const goodLabels: readonly RawConfirmatoryLabelRow[] = [
  makeLabel({ id: 'id-0002', theme_id: 'theme-b', base_date: '2026-02-02', forecast_origin_manifest_id: forecastId(1), y_binary: false, g_log_ratio: -0.3 }),
  makeLabel({ id: 'id-0001', theme_id: 'theme-a', base_date: '2026-02-02', forecast_origin_manifest_id: forecastId(1) }),
  makeLabel({ id: 'id-0003', theme_id: 'theme-a', base_date: '2026-03-09', forecast_origin_manifest_id: forecastId(2) }),
]

describe('loadConfirmatoryDataset — determinism', () => {
  it('produces byte-identical ordered rows and hashes across three loads of the same study/cutoff', async () => {
    const [first, second, third] = await Promise.all([load({ labels: goodLabels }), load({ labels: goodLabels }), load({ labels: goodLabels })])

    expect(first.manifest.ordered_rows_sha256).toBe(second.manifest.ordered_rows_sha256)
    expect(second.manifest.ordered_rows_sha256).toBe(third.manifest.ordered_rows_sha256)
    expect(first.manifestSha256).toBe(second.manifestSha256)
    expect(first.manifestSha256).toBe(third.manifestSha256)
    expect(first.rows).toEqual(second.rows)
    expect(first.rows).toEqual(third.rows)
  })

  it('orders rows by (base_date, theme_id, id) and reports min/max/count', async () => {
    const { manifest, rows } = await load({ labels: goodLabels })
    expect(rows.map((row) => row.id)).toEqual(['id-0001', 'id-0002', 'id-0003'])
    expect(manifest.row_count).toBe(3)
    expect(manifest.unique_key_count).toBe(3)
    expect(manifest.min_base_date).toBe('2026-02-02')
    expect(manifest.max_base_date).toBe('2026-03-09')
    expect(manifest.study_contract_id).toBe(STUDY_ID)
    expect(manifest.study_contract_sha256).toBe(STUDY_CONTRACT.payload_sha256)
    expect(manifest.manifest_version).toBe(DATASET_MANIFEST_VERSION)
  })

  it('records the exact loader filter contract in the manifest', async () => {
    const { manifest } = await load({ labels: goodLabels })
    expect(manifest.query_contract).toEqual(CONFIRMATORY_QUERY_CONTRACT)
  })
})

describe('loadConfirmatoryDataset — large synthetic fixture', () => {
  it('loads 31,300 rows with zero duplicate/missing keys, all bound to the exact study SHA', { timeout: 30_000 }, async () => {
    const bindings = new Map<string, readonly StudyOriginBindingRow[]>([
      [STUDY_ID, Array.from({ length: 10 }, (_, index) => ({
        study_origin_manifest_id: studyOriginId(100 + index),
        forecast_origin_manifest_id: forecastId(100 + index),
      }))],
    ])
    const labels: RawConfirmatoryLabelRow[] = []
    for (let day = 0; day < 313; day += 1) {
      const baseDate = new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString().slice(0, 10)
      for (let theme = 0; theme < 100; theme += 1) {
        const themeId = `theme-${String(theme).padStart(4, '0')}`
        labels.push(makeLabel({
          id: `${baseDate}-${themeId}`,
          theme_id: themeId,
          base_date: baseDate,
          forecast_origin_manifest_id: forecastId(100 + (day % 10)),
        }))
      }
    }

    const { manifest, rows } = await load({ labels, bindings })

    expect(rows).toHaveLength(31_300)
    expect(manifest.row_count).toBe(31_300)
    expect(manifest.unique_key_count).toBe(31_300)
    expect(new Set(rows.map((row) => `${row.baseDate}|${row.themeId}|${row.id}`)).size).toBe(31_300)
    expect(manifest.study_contract_sha256).toBe(STUDY_CONTRACT.payload_sha256)
    const boundForecasts = new Set(Array.from({ length: 10 }, (_, index) => forecastId(100 + index)))
    expect(rows.every((row) => boundForecasts.has(row.forecastOriginManifestId))).toBe(true)
    // strictly increasing keyset order
    for (let index = 1; index < rows.length; index += 1) {
      expect(compareKeysetCursor(
        { first: rows[index - 1].baseDate, second: rows[index - 1].themeId, third: rows[index - 1].id },
        { first: rows[index].baseDate, second: rows[index].themeId, third: rows[index].id },
      )).toBeLessThan(0)
    }
  })
})

describe('loadConfirmatoryDataset — immutability under out-of-cutoff writes', () => {
  it('keeps hash unchanged when a post-cutoff / out-of-study row is inserted after the first load', async () => {
    const before = await load({ labels: goodLabels })

    const withNoise = [
      ...goodLabels,
      // post-cutoff finalized row (inside study) — excluded
      makeLabel({ id: 'id-9001', theme_id: 'theme-z', base_date: '2026-05-30', forecast_origin_manifest_id: forecastId(1), finalized_at: '2026-06-02T09:00:00.000Z' }),
      // out-of-study forecast manifest — excluded
      makeLabel({ id: 'id-9002', theme_id: 'theme-z', base_date: '2026-02-15', forecast_origin_manifest_id: forecastId(9) }),
    ]
    const after = await load({ labels: withNoise })

    expect(after.manifest.ordered_rows_sha256).toBe(before.manifest.ordered_rows_sha256)
    expect(after.manifestSha256).toBe(before.manifestSha256)
    expect(after.rows).toEqual(before.rows)
  })
})

describe('loadConfirmatoryDataset — filter contract (each AND condition excludes)', () => {
  const baseline = goodLabels

  const withExtra = (extra: RawConfirmatoryLabelRow): readonly RawConfirmatoryLabelRow[] => [...baseline, extra]
  const expectExcluded = async (extra: RawConfirmatoryLabelRow, broaden = false) => {
    const withRow = await load({ labels: withExtra(extra), broaden })
    const clean = await load({ labels: baseline })
    expect(withRow.rows.map((row) => row.id)).not.toContain(extra.id)
    expect(withRow.manifest.ordered_rows_sha256).toBe(clean.manifest.ordered_rows_sha256)
  }

  const bad = (over: Partial<RawConfirmatoryLabelRow>): RawConfirmatoryLabelRow =>
    makeLabel({ id: 'id-bad', theme_id: 'theme-a', base_date: '2026-04-01', forecast_origin_manifest_id: forecastId(1), ...over })

  it('excludes gta-v1 / wrong labeler_version', () => expectExcluded(bad({ labeler_version: 'gta-v1' })))
  it('excludes wrong label_type', () => expectExcluded(bad({ label_type: 'gt_b' })))
  it('excludes wrong horizon', () => expectExcluded(bad({ horizon_days: 14 })))
  it('excludes pending status', () => expectExcluded(bad({ label_status: 'pending' })))
  it('excludes excluded status', () => expectExcluded(bad({ label_status: 'excluded' })))
  it('excludes exploratory_only scientific status', () => expectExcluded(bad({ scientific_use_status: 'exploratory_only' })))
  it('excludes reason mismatch', () => expectExcluded(bad({ scientific_use_reason: 'pending_gta_v2' })))
  it('excludes rescale_suspect rows', () => expectExcluded(bad({ rescale_suspect: true })))
  it('excludes null outcome rows', () => expectExcluded(bad({ y_binary: null })))
  it('excludes late finalized_at rows', () => expectExcluded(bad({ finalized_at: '2026-06-02T09:00:00.000Z' })))
  it('excludes late label source run (completed_at after cutoff)', () => expectExcluded(bad({ label_source_run_id: 'run-late' })))
  it('excludes rows whose label source run is missing', () => expectExcluded(bad({ label_source_run_id: 'run-missing' })))

  // loader 자체 방어 필터: 쿼리가 broaden 되어도 (mixed study / bad columns) 계약을 강제한다.
  it('drops broadened bad-column rows via the loader defensive filter', () => expectExcluded(bad({ scientific_use_status: 'exploratory_only' }), true))
})

describe('loadConfirmatoryDataset — mixed-study isolation', () => {
  it('never mixes another study origin into the dataset', async () => {
    // label bound to the OTHER study's forecast manifest, but we load STUDY_ID
    const labels = [
      ...goodLabels,
      makeLabel({ id: 'id-cross', theme_id: 'theme-a', base_date: '2026-02-10', forecast_origin_manifest_id: forecastId(9) }),
    ]
    const { rows } = await load({ labels })
    expect(rows.map((row) => row.id)).not.toContain('id-cross')
    expect(rows.every((row) => row.forecastOriginManifestId !== forecastId(9))).toBe(true)
  })

  it('loads only the requested study when two studies share the same label pool', async () => {
    const labels = [
      makeLabel({ id: 'id-s1', theme_id: 'theme-a', base_date: '2026-02-02', forecast_origin_manifest_id: forecastId(1) }),
      makeLabel({ id: 'id-s2', theme_id: 'theme-a', base_date: '2026-02-03', forecast_origin_manifest_id: forecastId(9) }),
    ]
    const study = await load({ labels }, STUDY_ID)
    const other = await load({ labels }, OTHER_STUDY_ID)
    expect(study.rows.map((row) => row.id)).toEqual(['id-s1'])
    expect(other.rows.map((row) => row.id)).toEqual(['id-s2'])
    expect(study.manifest.ordered_rows_sha256).not.toBe(other.manifest.ordered_rows_sha256)
  })
})

describe('loadConfirmatoryDataset — explicit failures', () => {
  it('throws when the study contract does not exist (post-outcome / unknown lock)', async () => {
    await expect(load({ studyContracts: [], labels: goodLabels }))
      .rejects.toThrow('requires an existing study contract')
  })

  it('throws when the study contract is not gta-v2', async () => {
    await expect(load({ studyContracts: [{ ...STUDY_CONTRACT, labeler_version: 'gta-v1' }], labels: goodLabels }))
      .rejects.toThrow('labeler_version must be gta-v2')
  })

  it('throws on unordered pagination pages', async () => {
    await expect(load({ labels: goodLabels, corrupt: 'shuffle' }))
      .rejects.toThrow('non-increasing or duplicate key')
  })

  it('throws on duplicated pagination keys', async () => {
    await expect(load({ labels: goodLabels, corrupt: 'duplicate' }))
      .rejects.toThrow('non-increasing or duplicate key')
  })

  it('throws when two labels collide on (theme_id, base_date, horizon_days)', async () => {
    const labels = [
      makeLabel({ id: 'id-dup-1', theme_id: 'theme-a', base_date: '2026-02-02', forecast_origin_manifest_id: forecastId(1) }),
      makeLabel({ id: 'id-dup-2', theme_id: 'theme-a', base_date: '2026-02-02', forecast_origin_manifest_id: forecastId(2) }),
    ]
    await expect(load({ labels })).rejects.toThrow('duplicate confirmatory label keys')
  })

  it('throws when a forecast origin is bound to the study more than once', async () => {
    const bindings = new Map<string, readonly StudyOriginBindingRow[]>([
      [STUDY_ID, [
        { study_origin_manifest_id: studyOriginId(1), forecast_origin_manifest_id: forecastId(1) },
        { study_origin_manifest_id: studyOriginId(2), forecast_origin_manifest_id: forecastId(1) },
      ]],
    ])
    await expect(load({ labels: goodLabels, bindings })).rejects.toThrow('more than once')
  })
})

describe('loadConfirmatoryDataset — empty study', () => {
  it('returns a deterministic empty manifest when the study has no origins', async () => {
    const bindings = new Map<string, readonly StudyOriginBindingRow[]>([[STUDY_ID, []]])
    const { manifest, rows } = await load({ labels: goodLabels, bindings })
    expect(rows).toHaveLength(0)
    expect(manifest.row_count).toBe(0)
    expect(manifest.min_base_date).toBeNull()
    expect(manifest.max_base_date).toBeNull()
    expect(manifest.forecast_origin_manifest_ids).toEqual([])
  })
})
