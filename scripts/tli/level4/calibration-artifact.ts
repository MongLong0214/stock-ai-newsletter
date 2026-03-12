import {
  isCertificationCalibrationArtifact,
  type Level4CalibrationArtifact,
  type Level4SourceSurface,
} from '@/lib/tli/comparison/level4-types'

export interface CalibrationBinSummary {
  bucket: number
  mean_predicted: number
  empirical_rate: number
  count: number
}

export interface CalibrationArtifactRow extends Level4CalibrationArtifact {
  source_run_date_from: string
  source_run_date_to: string
  source_row_count: number
  positive_count: number
  calibration_method: string
  brier_score_before: number
  brier_score_after: number
  ece_before: number
  ece_after: number
  bin_summary: CalibrationBinSummary[]
  created_at: string
}

export interface BuildCalibrationArtifactRowInput extends CalibrationArtifactRow {
  source_surface: Level4SourceSurface
}

export interface CalibrationArtifactReadbackValidationInput {
  written: CalibrationArtifactRow
  read: CalibrationArtifactRow
}

interface CalibrationArtifactQueryResult<T> {
  data: T | null
  error: { message?: string } | null
}

type CalibrationArtifactQueryHandle<T> = Promise<{ data: T | null | any; error: { message?: string } | null }>

interface CalibrationArtifactTableHandle {
  upsert?(row: CalibrationArtifactRow): {
    select(): {
      single(): CalibrationArtifactQueryHandle<CalibrationArtifactRow>
    }
  }
  select?(columns: string): {
    eq?(column: string, value: string): {
      maybeSingle(): CalibrationArtifactQueryHandle<CalibrationArtifactRow>
    }
    in?(column: string, values: string[]): {
      order(column: string, options: { ascending: boolean }): {
        limit(limit: number): {
          maybeSingle(): CalibrationArtifactQueryHandle<CalibrationArtifactRow>
        }
      }
    }
  }
}

interface CalibrationArtifactTableClient {
  from(table: string): CalibrationArtifactTableHandle
}

const READBACK_KEYS: Array<keyof CalibrationArtifactRow> = [
  'calibration_version',
  'source_surface',
  'ci_method',
  'bootstrap_iterations',
  'brier_score_before',
  'brier_score_after',
  'ece_before',
  'ece_after',
]

const FLOAT_READBACK_KEYS = new Set<keyof CalibrationArtifactRow>([
  'brier_score_before',
  'brier_score_after',
  'ece_before',
  'ece_after',
])

export function buildCalibrationArtifactRow(input: BuildCalibrationArtifactRowInput): CalibrationArtifactRow {
  return {
    ...input,
    bin_summary: [...input.bin_summary],
  }
}

export function validateCalibrationArtifactReadback(
  input: CalibrationArtifactReadbackValidationInput,
): { ok: boolean; mismatches: string[] } {
  const mismatches = READBACK_KEYS.filter((key) => {
    if (FLOAT_READBACK_KEYS.has(key)) {
      const left = input.written[key]
      const right = input.read[key]
      if (typeof left === 'number' && typeof right === 'number') {
        return Math.abs(left - right) > 1e-9
      }
    }
    const left = JSON.stringify(input.written[key])
    const right = JSON.stringify(input.read[key])
    return left !== right
  }).map((key) => key.toString())

  return {
    ok: mismatches.length === 0,
    mismatches,
  }
}

export async function upsertCalibrationArtifact(
  client: CalibrationArtifactTableClient,
  row: CalibrationArtifactRow,
): Promise<CalibrationArtifactRow> {
  const table = client.from('calibration_artifact')
  if (!table.upsert) {
    throw new Error('Calibration artifact client does not support upsert')
  }

  const { data, error } = await table
    .upsert(row)
    .select()
    .single()

  if (error || !data) {
    throw new Error(`Calibration artifact upsert/readback failed: ${error?.message || 'unknown error'}`)
  }

  const validation = validateCalibrationArtifactReadback({
    written: row,
    read: data,
  })
  if (!validation.ok) {
    throw new Error(`Calibration artifact readback mismatches: ${validation.mismatches.join(', ')}`)
  }

  return data
}

export async function fetchLatestCertificationCalibrationArtifact(
  client: CalibrationArtifactTableClient,
  calibrationVersion?: string | null,
): Promise<CalibrationArtifactRow> {
  const query = client
    .from('calibration_artifact')
    .select?.('source_surface, calibration_version, source_run_date_from, source_run_date_to, source_row_count, positive_count, calibration_method, ci_method, bootstrap_iterations, brier_score_before, brier_score_after, ece_before, ece_after, bin_summary, created_at')

  if (!query) {
    throw new Error('Calibration artifact client does not support select')
  }

  if (calibrationVersion) {
    const byVersion = query as unknown as {
      eq?: (column: string, value: string) => {
        maybeSingle(): Promise<{ data: CalibrationArtifactRow | null; error: { message?: string } | null }>
      }
    }
    if (!byVersion.eq) {
      throw new Error('Calibration artifact client does not support version lookup')
    }
    const { data, error } = await byVersion
      .eq('calibration_version', calibrationVersion)
      .maybeSingle()

    if (error || !data) {
      throw new Error(`No certification-grade calibration artifact available for version ${calibrationVersion}: ${error?.message || 'not found'}`)
    }
    if (!isCertificationCalibrationArtifact(data)) {
      throw new Error(`Invalid certification-grade calibration artifact: ${calibrationVersion}`)
    }
    return data as CalibrationArtifactRow
  }

  if (!(query as unknown as { in?: unknown }).in) {
    throw new Error('Calibration artifact client does not support certification lookup')
  }

  const latestChain = query as unknown as {
    in: (column: string, values: string[]) => {
      order: (column: string, options: { ascending: boolean }) => {
        limit: (limit: number) => {
          maybeSingle: () => Promise<{ data: CalibrationArtifactRow | null; error: { message?: string } | null }>
        }
      }
    }
  }

  const { data, error } = await latestChain
    .in('source_surface', ['v2_certification', 'replay_equivalent'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    throw new Error(`No certification-grade calibration artifact available for serving: ${error?.message || 'not found'}`)
  }
  if (!isCertificationCalibrationArtifact(data)) {
    const calibrationVersion = (data as { calibration_version?: string } | null)?.calibration_version ?? 'unknown'
    throw new Error(`Invalid certification-grade calibration artifact: ${calibrationVersion}`)
  }
  const row = data as Partial<CalibrationArtifactRow>
  const requiredRowKeys: Array<keyof CalibrationArtifactRow> = [
    'source_run_date_from',
    'source_run_date_to',
    'source_row_count',
    'positive_count',
    'calibration_method',
    'brier_score_before',
    'brier_score_after',
    'ece_before',
    'ece_after',
    'bin_summary',
  ]
  for (const key of requiredRowKeys) {
    if (row[key] == null) {
      throw new Error(`Incomplete certification-grade calibration artifact: missing ${key}`)
    }
  }

  return data as CalibrationArtifactRow
}
