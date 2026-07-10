/**
 * TLI v3 Todo 7: gta-v2 finalizer 오케스트레이션.
 *
 * cycle-independent forecast origin theme input에 고정된 **frozen keyword group**으로 dedicated 한
 * DataLab response의 exact 5+5 값을 얻어 pending gta-v2 라벨을 확정한다. 현재 키워드로 재조회하거나
 * 여러 response를 이어 붙이거나 post-cutoff theme 비활성화로 censor하지 않는다.
 *
 * label 값 계산(scale-invariant ratio·y·g_log_ratio)은 순수 함수 `labelGtAV2`가 담당하고,
 * exact-five/spec/source/cutoff·past_mean>0 계약의 최종 판정은 048 `finalize_tli_gta_v2_label` RPC가
 * 서버 측에서 stored observation으로 독립 재검증한다. 여기서는 그 두 계층에 넘길 payload를 만든다.
 *
 * 아래 `resolveGtAV2Finalize`는 DB 없이 단위 테스트되는 순수 결정 함수다 — RPC의 분기와 정확히 일치한다.
 */

import { canonicalJsonV1, canonicalJsonV1Sha256 } from '../../../lib/tli/canonical-json'
import { supabaseAdmin } from '../shared/supabase-admin'
import {
  GTA_V2_FUTURE_WINDOW,
  GTA_V2_HORIZON_DAYS,
  GTA_V2_LABELER_VERSION,
  GTA_V2_PAST_WINDOW,
  labelGtAV2,
} from '../../../lib/tli/labels/gt-a-v2'

export const FINALIZE_GTA_V2_LABEL_RPC = 'finalize_tli_gta_v2_label'

/**
 * cycle이 하나도 없어도 각 forecast origin manifest theme마다 foundation gta-v2 pending 라벨을 만든다.
 * 048의 INSERT trigger가 origin_date=base_date인 manifest+child를, CHECK이 exploratory_only/pending_gta_v2를
 * 강제하므로 여기서 만드는 행은 반드시 그 형태여야 한다. 현재 keyword/history를 소급 생성하지 않는다.
 */
export function buildGtAV2PendingRow(input: {
  readonly themeId: string
  readonly baseDate: string
  readonly forecastOriginManifestId: string
}): Record<string, unknown> {
  return {
    theme_id: input.themeId,
    base_date: input.baseDate,
    label_type: 'gt_a',
    horizon_days: GTA_V2_HORIZON_DAYS,
    labeler_version: GTA_V2_LABELER_VERSION,
    label_status: 'pending',
    scientific_use_status: 'exploratory_only',
    scientific_use_reason: 'pending_gta_v2',
    forecast_origin_manifest_id: input.forecastOriginManifestId,
  }
}

/** forecast manifest의 expected theme마다 pending gta-v2 라벨을 append한다 (동일 identity는 그대로 유지). */
export async function createGtAV2PendingLabels(input: {
  readonly baseDate: string
  readonly forecastOriginManifestId: string
  readonly themeIds: readonly string[]
}): Promise<number> {
  if (input.themeIds.length === 0) return 0
  const rows = input.themeIds.map((themeId) =>
    buildGtAV2PendingRow({
      themeId,
      baseDate: input.baseDate,
      forecastOriginManifestId: input.forecastOriginManifestId,
    }),
  )
  const { error } = await supabaseAdmin
    .from('theme_labels')
    .upsert(rows, {
      onConflict: 'theme_id,base_date,label_type,horizon_days,labeler_version',
      ignoreDuplicates: true,
    })
  if (error) throw new Error(`gta-v2 foundation pending 라벨 생성 실패: ${error.message}`)
  return rows.length
}

export interface GtAV2ForecastChild {
  readonly inputStatus: 'usable' | 'abstain'
  readonly keywordGroupSha256: string
  readonly forecastInterestRunId: string | null
}

export interface GtAV2SourceObservation {
  readonly tradingDate: string
  /** DataLab response 값. gta-v2는 immutable run의 normalized 값을 쓴다. */
  readonly normalized: number
}

export interface GtAV2SourceRun {
  readonly id: string
  readonly requestSha256: string
  readonly responseSha256: string
  readonly observations: readonly GtAV2SourceObservation[]
}

/** 048 finalizer RPC의 canonical payload (allowed key와 정확히 일치). */
export interface GtAV2FinalizePayload {
  readonly theme_id: string
  readonly base_date: string
  readonly forecast_origin_manifest_id: string
  readonly as_of: string
  readonly label_source_run_id: string | null
  readonly label_request_sha256: string | null
  readonly label_response_sha256: string | null
  readonly g_log_ratio: number | null
  readonly y_binary: boolean | null
}

export type GtAV2FinalizeOutcome =
  | { readonly kind: 'keep_pending'; readonly reason: 'no_source_yet' | 'future_window_incomplete' }
  | { readonly kind: 'finalize'; readonly payload: GtAV2FinalizePayload }

const orderedValues = (
  observations: readonly GtAV2SourceObservation[],
  dates: readonly string[],
): number[] => {
  const byDate = new Map(observations.map((observation) => [observation.tradingDate, observation.normalized]))
  return dates.flatMap((date) => {
    const value = byDate.get(date)
    return value === undefined ? [] : [value]
  })
}

/**
 * pending gta-v2 라벨의 확정 결과를 결정한다. RPC와 동일한 우선순위:
 *   abstain child → spec_mismatch / usable + no source → grace 판정 / usable + source → zero_denom·final.
 */
export function resolveGtAV2Finalize(input: {
  readonly themeId: string
  readonly baseDate: string
  readonly forecastOriginManifestId: string
  readonly asOf: string
  readonly child: GtAV2ForecastChild
  readonly sourceRun: GtAV2SourceRun | null
  readonly pastDates: readonly string[]
  readonly futureDates: readonly string[]
  readonly graceExpired: boolean
}): GtAV2FinalizeOutcome {
  const base = {
    theme_id: input.themeId,
    base_date: input.baseDate,
    forecast_origin_manifest_id: input.forecastOriginManifestId,
    as_of: input.asOf,
  }

  const excluded = (): GtAV2FinalizeOutcome => ({
    kind: 'finalize',
    payload: {
      ...base,
      label_source_run_id: null,
      label_request_sha256: null,
      label_response_sha256: null,
      g_log_ratio: null,
      y_binary: null,
    },
  })

  if (input.child.inputStatus === 'abstain') {
    return excluded()
  }

  if (input.sourceRun === null) {
    return input.graceExpired ? excluded() : { kind: 'keep_pending', reason: 'no_source_yet' }
  }

  const pastValues = orderedValues(input.sourceRun.observations, input.pastDates)
  const futureValues = orderedValues(input.sourceRun.observations, input.futureDates)

  if (pastValues.length < GTA_V2_PAST_WINDOW || futureValues.length < GTA_V2_FUTURE_WINDOW) {
    if (!input.graceExpired) {
      return { kind: 'keep_pending', reason: 'future_window_incomplete' }
    }
    return {
      kind: 'finalize',
      payload: {
        ...base,
        label_source_run_id: input.sourceRun.id,
        label_request_sha256: input.sourceRun.requestSha256,
        label_response_sha256: input.sourceRun.responseSha256,
        g_log_ratio: null,
        y_binary: null,
      },
    }
  }

  const result = labelGtAV2({ pastValues, futureValues })
  const isFinal = result.kind === 'eligible'

  return {
    kind: 'finalize',
    payload: {
      ...base,
      label_source_run_id: input.sourceRun.id,
      label_request_sha256: input.sourceRun.requestSha256,
      label_response_sha256: input.sourceRun.responseSha256,
      g_log_ratio: isFinal ? result.gLogRatio : null,
      y_binary: isFinal ? result.yBinary : null,
    },
  }
}

/** 048 finalizer RPC를 호출하고 확정된 라벨 id를 반환한다. */
export async function callFinalizeGtAV2Label(payload: GtAV2FinalizePayload): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc(FINALIZE_GTA_V2_LABEL_RPC, {
    p_label_canonical_json: canonicalJsonV1(payload),
    p_payload_sha256: canonicalJsonV1Sha256(payload),
  })

  if (error) throw new Error(`${FINALIZE_GTA_V2_LABEL_RPC} 실패: ${error.message}`)
  if (typeof data !== 'string' || data.length === 0) {
    throw new Error(`${FINALIZE_GTA_V2_LABEL_RPC}가 라벨 id를 반환하지 않았습니다`)
  }
  return data
}
