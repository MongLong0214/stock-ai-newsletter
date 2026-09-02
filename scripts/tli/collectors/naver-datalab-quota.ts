import { NaverDatalabQuotaError } from './naver-datalab-api'

export const DEFAULT_TLI_DATALAB_DAILY_CEILING = 900
export const RESERVE_TLI_DATALAB_QUOTA_RPC = 'reserve_tli_datalab_quota'

export interface DatalabQuotaReservation {
  readonly granted: boolean
  readonly attempts: number
  readonly ceiling: number
}

export type DatalabQuotaTransport = (input: {
  readonly kstDate: string
  readonly count: number
  readonly ceiling: number
}) => Promise<DatalabQuotaReservation>

export const resolveDatalabDailyCeiling = (
  value = process.env.TLI_DATALAB_DAILY_CEILING,
  warn: (message: string) => void = console.warn,
): number => {
  if (value === undefined || value.trim() === '') return DEFAULT_TLI_DATALAB_DAILY_CEILING

  const normalized = value.trim()
  const parsed = Number(normalized)
  if (!/^[1-9]\d*$/.test(normalized) || !Number.isSafeInteger(parsed)) {
    warn(`⚠️ TLI_DATALAB_DAILY_CEILING='${value}'가 양의 정수가 아니어서 기본값 ${DEFAULT_TLI_DATALAB_DAILY_CEILING}을 사용합니다`)
    return DEFAULT_TLI_DATALAB_DAILY_CEILING
  }
  if (parsed > DEFAULT_TLI_DATALAB_DAILY_CEILING) {
    warn(`⚠️ TLI_DATALAB_DAILY_CEILING='${value}'가 관리 상한 ${DEFAULT_TLI_DATALAB_DAILY_CEILING}을 초과해 상한값을 사용합니다`)
    return DEFAULT_TLI_DATALAB_DAILY_CEILING
  }
  return parsed
}

const supabaseQuotaTransport: DatalabQuotaTransport = async (input) => {
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  const { data, error } = await supabaseAdmin.rpc(RESERVE_TLI_DATALAB_QUOTA_RPC, {
    p_kst_date: input.kstDate,
    p_count: input.count,
    p_ceiling: input.ceiling,
  })

  if (error) throw new Error(`DataLab quota 예약 실패: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  if (
    row === null
    || typeof row !== 'object'
    || typeof row.granted !== 'boolean'
    || !Number.isInteger(row.attempts)
    || !Number.isInteger(row.ceiling)
  ) {
    throw new Error('DataLab quota 예약 RPC가 잘못된 응답을 반환했습니다')
  }
  return row as DatalabQuotaReservation
}

export const reserveDatalabQuota = async (input: {
  readonly kstDate: string
  readonly count: number
  readonly transport?: DatalabQuotaTransport
  readonly ceiling?: number
}): Promise<DatalabQuotaReservation> => {
  const ceiling = input.ceiling ?? resolveDatalabDailyCeiling()
  const reservation = await (input.transport ?? supabaseQuotaTransport)({
    kstDate: input.kstDate,
    count: input.count,
    ceiling,
  })

  if (!reservation.granted) {
    throw new NaverDatalabQuotaError(
      `local ceiling ${reservation.ceiling} 초과: ${input.kstDate} attempts=${reservation.attempts}, requested=${input.count}`,
    )
  }
  return reservation
}
