/**
 * TLI v3: gta-v2 foundation 라벨 일일 오케스트레이션.
 *
 * (1) origin_date가 지난 forecast manifest마다 theme child 전체에 pending gta-v2 라벨을 append(멱등)하고
 * (2) pending 라벨마다 048 `finalize_tli_gta_v2_label` payload를 구성해 확정을 시도한다.
 *
 * 날짜 창(past 5 + future 5 + grace)은 RPC와 동일하게 **stock_daily_prices(KOSPI) 실측**에서 파생한다 —
 * 계산 캘린더(trading-calendar)를 쓰지 않는다. 캘린더와 실측이 어긋났던 2026-07-17 제헌절 사고의 재발 방지.
 * 값 판정·제외 사유는 전부 RPC가 서버 측에서 독립 재검증하므로(fail-closed) 여기서는 payload만 만든다.
 */

import { supabaseAdmin } from '../shared/supabase-admin'
import {
  keysetOrExpression,
  paginateByKeyset,
  type KeysetCursor,
} from '../shared/keyset'
import {
  callFinalizeGtAV2Label,
  createGtAV2PendingLabels,
  resolveGtAV2Finalize,
  type GtAV2ForecastChild,
  type GtAV2SourceRun,
} from './finalize-gt-a-v2'

export interface GtAV2Windows {
  readonly pastDates: readonly string[]
  readonly futureDates: readonly string[]
  readonly horizonDate: string
  /** horizon 뒤 3번째 KOSPI 거래일 18:00 KST. 그 거래일이 아직 없으면 null (grace 미도래). */
  readonly graceDeadline: Date | null
}

/**
 * 048 RPC와 동일 규칙: past 5 = base_date 포함 직전 5 KOSPI 거래일(마지막이 base와 일치해야 함),
 * future 5 = base_date 이후 첫 5 거래일. 파생 불가하면 null (base가 거래일이 아니거나 미래 창 미성숙).
 */
export function deriveGtAV2Windows(
  kospiDatesAscending: readonly string[],
  baseDate: string,
): GtAV2Windows | null {
  const past = kospiDatesAscending.filter((date) => date <= baseDate).slice(-5)
  const future = kospiDatesAscending.filter((date) => date > baseDate).slice(0, 5)

  if (past.length !== 5 || past[4] !== baseDate || future.length !== 5) return null

  const horizonDate = future[4]
  const afterHorizon = kospiDatesAscending.filter((date) => date > horizonDate).slice(0, 3)
  const graceDeadline = afterHorizon.length === 3
    ? new Date(`${afterHorizon[2]}T18:00:00+09:00`)
    : null

  return { pastDates: past, futureDates: future, horizonDate, graceDeadline }
}

interface PendingGtAV2LabelRow {
  readonly theme_id: string
  readonly base_date: string
  readonly forecast_origin_manifest_id: string
}

interface ForecastChildRow {
  readonly theme_id: string
  readonly input_status: 'usable' | 'abstain'
  readonly keyword_group_sha256: string
  readonly forecast_interest_run_id: string | null
}

export interface GtAV2FoundationPhaseResult {
  readonly pendingCreated: number
  readonly finalized: number
  readonly keptPending: number
  readonly failures: number
}

interface KospiTradingDateRow {
  readonly trade_date: string
}

export type KospiTradingDateTransport = (input: {
  readonly after: KeysetCursor | null
  readonly pageSize: number
}) => Promise<readonly KospiTradingDateRow[]>

const KOSPI_TRADING_DATE_PAGE_SIZE = 1_000
// The shared primitive has a three-part cursor; repeating the unique trade date preserves its total order.
const KOSPI_TRADING_DATE_KEYSET = {
  first: 'trade_date',
  second: 'trade_date',
  third: 'trade_date',
} as const

const supabaseKospiTradingDateTransport: KospiTradingDateTransport = async ({ after, pageSize }) => {
  let query = supabaseAdmin
    .from('stock_daily_prices')
    .select('trade_date')
    .eq('symbol', 'KOSPI')
  if (after !== null) query = query.or(keysetOrExpression(KOSPI_TRADING_DATE_KEYSET, after))
  const { data, error } = await query
    .order('trade_date', { ascending: true })
    .limit(pageSize)
  if (error) throw new Error(`KOSPI 거래일 조회 실패: ${error.message}`)
  return (data ?? []) as KospiTradingDateRow[]
}

export const loadKospiTradingDates = async (
  transport: KospiTradingDateTransport = supabaseKospiTradingDateTransport,
): Promise<string[]> => {
  const rows = await paginateByKeyset({
    pageSize: KOSPI_TRADING_DATE_PAGE_SIZE,
    fetchPage: (after) => transport({ after, pageSize: KOSPI_TRADING_DATE_PAGE_SIZE }),
    keyOf: (row: KospiTradingDateRow) => ({
      first: row.trade_date,
      second: row.trade_date,
      third: row.trade_date,
    }),
  })
  return rows.map((row) => row.trade_date)
}

const loadForecastChildren = async (manifestId: string): Promise<Map<string, ForecastChildRow>> => {
  const { data, error } = await supabaseAdmin
    .from('tli_forecast_origin_theme_inputs')
    .select('theme_id, input_status, keyword_group_sha256, forecast_interest_run_id')
    .eq('forecast_origin_manifest_id', manifestId)
  if (error) throw new Error(`forecast theme child 조회 실패: ${error.message}`)
  return new Map((data ?? []).map((row) => [row.theme_id as string, row as ForecastChildRow]))
}

/** horizon을 커버하는, frozen keyword group의 최신 complete DataLab run 1건. */
const loadLatestLabelSourceRun = async (input: {
  readonly keywordGroupSha256: string
  readonly themeId: string
  readonly horizonDate: string
  readonly windowDates: readonly string[]
}): Promise<GtAV2SourceRun | null> => {
  const { data: runs, error } = await supabaseAdmin
    .from('tli_collection_runs')
    .select('id, request_sha256, response_sha256')
    .eq('source', 'naver_datalab')
    .eq('status', 'complete')
    .eq('keyword_group_hash', input.keywordGroupSha256)
    .gte('source_max_date', input.horizonDate)
    .order('source_max_date', { ascending: false })
    .order('completed_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`gta-v2 label source run 조회 실패: ${error.message}`)
  const run = runs?.[0]
  if (!run) return null

  const { data: observations, error: observationError } = await supabaseAdmin
    .from('tli_interest_observations')
    .select('trading_date, normalized')
    .eq('collection_run_id', run.id)
    .eq('theme_id', input.themeId)
    .eq('source', 'naver_datalab')
    .in('trading_date', [...input.windowDates])
  if (observationError) throw new Error(`gta-v2 label source observation 조회 실패: ${observationError.message}`)

  return {
    id: run.id as string,
    requestSha256: run.request_sha256 as string,
    responseSha256: run.response_sha256 as string,
    observations: (observations ?? []).map((row) => ({
      tradingDate: row.trading_date as string,
      normalized: Number(row.normalized),
    })),
  }
}

export async function runGtAV2FoundationPhase(today: string): Promise<GtAV2FoundationPhaseResult> {
  const { data: manifests, error: manifestError } = await supabaseAdmin
    .from('tli_forecast_origin_manifests')
    .select('id, origin_date')
    .lte('origin_date', today)
    .order('origin_date', { ascending: true })
  if (manifestError) throw new Error(`forecast manifest 조회 실패: ${manifestError.message}`)

  let pendingCreated = 0
  const childrenByManifest = new Map<string, Map<string, ForecastChildRow>>()

  for (const manifest of manifests ?? []) {
    const children = await loadForecastChildren(manifest.id as string)
    childrenByManifest.set(manifest.id as string, children)
    pendingCreated += await createGtAV2PendingLabels({
      baseDate: manifest.origin_date as string,
      forecastOriginManifestId: manifest.id as string,
      themeIds: [...children.keys()],
    })
  }

  const { data: pendingLabels, error: pendingError } = await supabaseAdmin
    .from('theme_labels')
    .select('theme_id, base_date, forecast_origin_manifest_id')
    .eq('labeler_version', 'gta-v2')
    .eq('label_status', 'pending')
    .order('base_date', { ascending: true })
  if (pendingError) throw new Error(`gta-v2 pending 라벨 조회 실패: ${pendingError.message}`)

  const kospiDates = await loadKospiTradingDates()
  const asOf = new Date().toISOString()
  const now = Date.now()

  let finalized = 0
  let keptPending = 0
  let failures = 0
  let firstFailure: string | null = null

  for (const label of (pendingLabels ?? []) as PendingGtAV2LabelRow[]) {
    const child = childrenByManifest.get(label.forecast_origin_manifest_id)?.get(label.theme_id)
    if (!child) {
      failures++
      firstFailure ??= `manifest child 없음: ${label.theme_id}@${label.base_date}`
      continue
    }

    const windows = deriveGtAV2Windows(kospiDates, label.base_date)
    if (windows === null) {
      // 미래 창 미성숙(KOSPI 실측 부족) — RPC도 같은 이유로 거부하므로 pending 유지.
      keptPending++
      continue
    }

    const graceExpired = windows.graceDeadline !== null && now >= windows.graceDeadline.getTime()
    const resolvedChild: GtAV2ForecastChild = {
      inputStatus: child.input_status,
      keywordGroupSha256: child.keyword_group_sha256,
      forecastInterestRunId: child.forecast_interest_run_id,
    }

    try {
      const sourceRun = child.input_status === 'usable'
        ? await loadLatestLabelSourceRun({
          keywordGroupSha256: child.keyword_group_sha256,
          themeId: label.theme_id,
          horizonDate: windows.horizonDate,
          windowDates: [...windows.pastDates, ...windows.futureDates],
        })
        : null

      const outcome = resolveGtAV2Finalize({
        themeId: label.theme_id,
        baseDate: label.base_date,
        forecastOriginManifestId: label.forecast_origin_manifest_id,
        asOf,
        child: resolvedChild,
        sourceRun,
        pastDates: windows.pastDates,
        futureDates: windows.futureDates,
        graceExpired,
      })

      if (outcome.kind === 'keep_pending') {
        keptPending++
        continue
      }

      await callFinalizeGtAV2Label(outcome.payload)
      finalized++
    } catch (error: unknown) {
      failures++
      firstFailure ??= error instanceof Error ? error.message : String(error)
    }
  }

  if (firstFailure !== null) {
    console.warn(`   ⚠️ gta-v2 확정 실패 ${failures}건 (첫 사유: ${firstFailure})`)
  }

  return { pendingCreated, finalized, keptPending, failures }
}
