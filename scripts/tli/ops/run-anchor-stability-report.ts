import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })

import type { AnchorObservation } from '@/scripts/tli/ops/anchor-stability-report'
import {
  buildAnchorStabilityReport,
  getAnchorStabilityWindow,
  inferPrimaryAnchorObservationsFromInterestRows,
  type InterestMetricAnchorScaleRow,
} from '@/scripts/tli/ops/anchor-stability-report'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { getKSTDateString } from '@/lib/tli/date-utils'

const readArg = (name: string): string | null => {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null
}

const readNumberArg = (name: string, fallback: number): number => {
  const value = readArg(name)
  if (value === null) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) throw new Error(`--${name}는 정수여야 합니다: ${value}`)
  return parsed
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const parseObservationSource = (value: unknown): AnchorObservation['source'] => (
  value === 'candidate_sampling' ||
  value === 'manual_observation' ||
  value === 'primary_anchor_scale_inference'
    ? value
    : 'manual_observation'
)

const parseObservationFile = (path: string): AnchorObservation[] => {
  const payload: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(payload)) throw new Error(`관측 파일은 배열이어야 합니다: ${path}`)

  return payload.map((item, index) => {
    if (!isRecord(item)) throw new Error(`관측 ${index}가 객체가 아닙니다`)
    const candidate = item.candidate
    const date = item.date
    const value = item.value
    if (typeof candidate !== 'string' || candidate.trim() === '') {
      throw new Error(`관측 ${index}의 candidate가 올바르지 않습니다`)
    }
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`관측 ${index}의 date가 올바르지 않습니다`)
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`관측 ${index}의 value가 양수 숫자가 아닙니다`)
    }
    return { candidate, date, value, source: parseObservationSource(item.source) }
  })
}

const loadInferredPrimaryRows = async (
  startDate: string,
  endDate: string,
): Promise<InterestMetricAnchorScaleRow[]> => {
  const { data, error } = await supabaseAdmin
    .from('interest_metrics')
    .select('time, raw_value, anchor_scaled_value')
    .eq('source', 'naver_datalab')
    .not('anchor_scaled_value', 'is', null)
    .gte('time', startDate)
    .lte('time', endDate)

  if (error) throw new Error(`앵커 스케일 interest_metrics 로딩 실패: ${error.message}`)
  return data ?? []
}

async function main(): Promise<void> {
  const asOfDate = readArg('as-of') ?? getKSTDateString()
  const windowDays = readNumberArg('window-days', 14)
  const observationsPath = readArg('observations')
  const { startDate, endDate } = getAnchorStabilityWindow(asOfDate, windowDays)
  const rows = await loadInferredPrimaryRows(startDate, endDate)
  const inferredObservations = inferPrimaryAnchorObservationsFromInterestRows(rows)
  const externalObservations = observationsPath === null ? [] : parseObservationFile(observationsPath)
  const report = buildAnchorStabilityReport({
    asOfDate,
    windowDays,
    observations: [...inferredObservations, ...externalObservations],
  })

  console.log(JSON.stringify(report, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
