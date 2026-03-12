import {
  isCertificationSourceSurface,
  type Level4SourceSurface,
} from '@/lib/tli/comparison/level4-types'

export interface WeightArtifactRow {
  weight_version: string
  source_surface: Level4SourceSurface
  w_feature: number
  w_curve: number
  w_keyword: number
  sector_penalty: number
  curve_bucket_policy: Record<string, unknown>
  validation_metric_summary: Record<string, unknown>
  ci_lower: number
  ci_upper: number
  ci_method: string
  bootstrap_iterations: number
  created_at: string
}

interface WeightArtifactQueryResult<T> {
  data: T | null
  error: { message?: string } | null
}

type WeightArtifactQueryHandle<T> = Promise<{ data: T | null | any; error: { message?: string } | null }>

interface WeightArtifactTableHandle {
  upsert?(row: WeightArtifactRow): {
    select(): {
      single(): WeightArtifactQueryHandle<WeightArtifactRow>
    }
  }
  select?(columns?: string): {
    eq?(column: string, value: string): {
      maybeSingle(): WeightArtifactQueryHandle<WeightArtifactRow>
    }
    in?(column: string, values: string[]): {
      order(column: string, options: { ascending: boolean }): {
        limit(limit: number): {
          maybeSingle(): WeightArtifactQueryHandle<WeightArtifactRow>
        }
      }
    }
  }
}

interface WeightArtifactTableClient {
  from(table: string): WeightArtifactTableHandle
}

const READBACK_KEYS: Array<keyof WeightArtifactRow> = [
  'weight_version',
  'source_surface',
  'w_feature',
  'w_curve',
  'w_keyword',
  'sector_penalty',
  'ci_lower',
  'ci_upper',
  'ci_method',
  'bootstrap_iterations',
]

export function buildWeightArtifactRow(input: WeightArtifactRow): WeightArtifactRow {
  return {
    ...input,
    ci_lower: Number.isFinite(input.ci_lower) ? input.ci_lower : 0,
    ci_upper: Number.isFinite(input.ci_upper) ? input.ci_upper : 0,
    curve_bucket_policy: { ...input.curve_bucket_policy },
    validation_metric_summary: { ...input.validation_metric_summary },
  }
}

export function validateWeightArtifactReadback(input: {
  written: WeightArtifactRow
  read: WeightArtifactRow
}) {
  const mismatches = READBACK_KEYS.filter((key) => {
    const left = JSON.stringify(input.written[key])
    const right = JSON.stringify(input.read[key])
    return left !== right
  }).map((key) => key.toString())

  return {
    ok: mismatches.length === 0,
    mismatches,
  }
}

export async function upsertWeightArtifact(
  client: WeightArtifactTableClient,
  row: WeightArtifactRow,
): Promise<WeightArtifactRow> {
  const table = client.from('weight_artifact')
  if (!table.upsert) {
    throw new Error('Weight artifact client does not support upsert')
  }

  const { data, error } = await table
    .upsert(row)
    .select()
    .single()

  if (error || !data) {
    throw new Error(`Weight artifact upsert/readback failed: ${error?.message || 'unknown error'}`)
  }

  const validation = validateWeightArtifactReadback({
    written: row,
    read: data,
  })
  if (!validation.ok) {
    throw new Error(`Weight artifact readback mismatches: ${validation.mismatches.join(', ')}`)
  }

  return data
}

export async function fetchWeightArtifactByVersion(
  client: WeightArtifactTableClient,
  weightVersion: string,
): Promise<WeightArtifactRow> {
  const table = client.from('weight_artifact')
  const query = table.select?.('weight_version, source_surface, w_feature, w_curve, w_keyword, sector_penalty, curve_bucket_policy, validation_metric_summary, ci_lower, ci_upper, ci_method, bootstrap_iterations, created_at')
  if (!query?.eq) {
    throw new Error('Weight artifact client does not support version lookup')
  }

  const { data, error } = await query
    .eq('weight_version', weightVersion)
    .maybeSingle()

  if (error || !data) {
    throw new Error(`No certification-grade weight artifact available for version ${weightVersion}: ${error?.message || 'not found'}`)
  }
  if (!isCertificationSourceSurface(data.source_surface)) {
    throw new Error(`Invalid certification-grade weight artifact: ${weightVersion}`)
  }

  return data as WeightArtifactRow
}

export async function fetchLatestCertificationWeightArtifact(
  client: WeightArtifactTableClient,
): Promise<WeightArtifactRow> {
  const query = client
    .from('weight_artifact')
    .select?.('weight_version, source_surface, w_feature, w_curve, w_keyword, sector_penalty, curve_bucket_policy, validation_metric_summary, ci_lower, ci_upper, ci_method, bootstrap_iterations, created_at')

  if (!query) {
    throw new Error('Weight artifact client does not support select')
  }

  // reuse same query-shape convention as calibration artifact reader
  const chain = query as unknown as {
    in(column: string, values: string[]): {
      order(column: string, options: { ascending: boolean }): {
        limit(limit: number): {
          maybeSingle(): PromiseLike<{ data: WeightArtifactRow | null; error: { message?: string } | null }>
        }
      }
    }
  }

  const { data, error } = await chain
    .in('source_surface', ['v2_certification', 'replay_equivalent'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    throw new Error(`No certification-grade weight artifact available: ${error?.message || 'not found'}`)
  }
  if (!isCertificationSourceSurface(data.source_surface)) {
    throw new Error(`Invalid certification-grade weight artifact: ${data.weight_version}`)
  }

  return data
}
