// TLI v3 Todo 6: 거래 가능한 월요일 18:00 KST cutoff 뒤 origin manifest 축적.
// 순서는 항상 universal forecast manifest → 조건을 만족하는 study마다 `bind_tli_study_origin`이다.
// experiment cycle이 0개여도 두 manifest를 계속 쌓는다. 동일 payload retry는 046 RPC가 기존 id를 반환한다.

import { canonicalJsonV1, canonicalJsonV1Sha256, type JsonObject } from '@/lib/tli/canonical-json'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { isKoreanTradingDate } from '@/lib/tli/trading-calendar'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { z } from 'zod'
import { loadAttentionStudyContracts, type AttentionStudyContract } from '@/scripts/tli/collectors/babl-phase-snapshot'
import { buildForecastOriginManifestPayload, buildStudyOriginManifestPayload, FORECAST_MANIFEST_VERSION, forecastCutoffUtc } from './forecast-origin-manifest'
import type { ForecastThemeSource, StudyBablCandidate } from './forecast-origin-manifest'
import { loadForecastThemeSources, loadStudyBablCandidates } from './origin-sources'
import { loadOriginRoster } from './origin-roster'

export const CREATE_FORECAST_ORIGIN_MANIFEST_RPC = 'create_tli_forecast_origin_manifest'
export const BIND_STUDY_ORIGIN_RPC = 'bind_tli_study_origin'

export interface MondayOriginManifestReport {
  readonly originDate: string
  readonly forecastManifestId: string
  readonly forecastChildCount: number
  readonly usableChildCount: number
  readonly abstainChildCount?: number
  readonly rosterThemeCount?: number
  readonly studyOriginManifestIds: readonly string[]
}

export interface MondayOriginReport {
  readonly asOfDate: string
  readonly skippedReason: 'before_cutoff' | 'up_to_date' | null
  readonly origins: readonly MondayOriginManifestReport[]
}

export interface ExistingForecastOrigin {
  readonly id: string
  readonly originDate: string
  readonly expectedThemeIds: readonly string[]
  readonly usableChildCount: number
  readonly rosterThemeCount?: number
}

export interface ExistingStudyBinding {
  readonly forecastManifestId: string
  readonly studyContractId: string
}

// TLI v3 source 계약이 가동되는 첫 clean origin. 이전 월요일은 소급 추정하지 않는다.
export const MONDAY_ORIGIN_START_DATE = '2026-07-13'

const ISO_MONDAY = 1
const WEEK_MS = 7 * 86_400_000

const isTradingMonday = (originDate: string): boolean => {
  const weekday = new Date(`${originDate}T00:00:00.000Z`).getUTCDay()
  return weekday === ISO_MONDAY && isKoreanTradingDate(originDate)
}

// cutoff 이전에는 어떤 manifest도 만들지 않는다 — 그 뒤에 끝난 수집을 소급 사용하지 않기 위함이다.
export const isAfterForecastCutoff = (originDate: string, now: Date): boolean => now.getTime() >= Date.parse(forecastCutoffUtc(originDate))

// lock 시각이 cutoff보다 이르고 first origin 이후인 study만 이 origin에 bind할 수 있다.
export const selectBindableStudies = (
  studies: readonly AttentionStudyContract[],
  originDate: string,
): AttentionStudyContract[] =>
  studies.filter(
    (study) =>
      Date.parse(study.locked_at) < Date.parse(forecastCutoffUtc(originDate))
      && study.first_origin_date <= originDate,
  )

const withKeywordCanonicalJson = (payload: JsonObject): JsonObject => {
  if (!Array.isArray(payload.theme_inputs)) throw new Error('forecast theme_inputs가 배열이 아닙니다')
  return {
    ...payload,
    theme_inputs: payload.theme_inputs.map((child) => {
      if (child === null || Array.isArray(child) || typeof child !== 'object') throw new Error('forecast theme input이 object가 아닙니다')
      return { ...child, keyword_group_canonical_json: canonicalJsonV1(child.keyword_group_spec) }
    }),
  }
}

const callManifestRpc = async (rpc: string, payload: JsonObject): Promise<string> => {
  const canonicalJson = canonicalJsonV1(payload)
  const payloadSha256 = canonicalJsonV1Sha256(payload)

  const { data, error } = await supabaseAdmin.rpc(rpc, {
    p_manifest_canonical_json: canonicalJson,
    p_payload_sha256: payloadSha256,
  })

  if (error) throw new Error(`${rpc} 실패: ${error.message}`)
  if (typeof data !== 'string' || data.length === 0) throw new Error(`${rpc}가 manifest id를 반환하지 않았습니다`)
  return data
}

const existingForecastRowSchema = z.object({
  id: z.string().uuid(), origin_date: z.string(),
  expected_theme_ids: z.array(z.string().uuid()).min(1), expected_theme_count: z.number().int().positive(),
  theme_inputs: z.array(z.object({ input_status: z.enum(['usable', 'abstain']) })),
})

const loadExistingForecastOrigins = async (input: {
  readonly startDate: string
  readonly endDate: string
}): Promise<ExistingForecastOrigin[]> => {
  const { data, error } = await supabaseAdmin
    .from('tli_forecast_origin_manifests')
    .select('id, origin_date, expected_theme_ids, expected_theme_count, theme_inputs:tli_forecast_origin_theme_inputs(input_status)')
    .eq('manifest_version', FORECAST_MANIFEST_VERSION)
    .gte('origin_date', input.startDate)
    .lte('origin_date', input.endDate)

  if (error) throw new Error(`기존 forecast origin manifest 조회 실패: ${error.message}`)
  return existingForecastRowSchema.array().parse(data ?? []).map((row) => {
    if (row.expected_theme_ids.length !== row.expected_theme_count || row.theme_inputs.length !== row.expected_theme_count) {
      throw new Error(`forecast origin ${row.id}의 parent/child theme count가 다릅니다`)
    }
    return {
      id: row.id,
      originDate: row.origin_date,
      expectedThemeIds: row.expected_theme_ids,
      usableChildCount: row.theme_inputs.filter((child) => child.input_status === 'usable').length,
    }
  })
}

const existingStudyBindingRowSchema = z.object({
  forecast_origin_manifest_id: z.string().uuid(), study_contract_id: z.string().uuid(),
})

const loadExistingStudyBindings = async (input: {
  readonly forecastManifestIds: readonly string[]
}): Promise<ExistingStudyBinding[]> => {
  if (input.forecastManifestIds.length === 0) return []
  const { data, error } = await supabaseAdmin
    .from('tli_study_origin_manifests')
    .select('forecast_origin_manifest_id, study_contract_id')
    .in('forecast_origin_manifest_id', [...input.forecastManifestIds])

  if (error) throw new Error(`기존 study-origin manifest 조회 실패: ${error.message}`)
  return existingStudyBindingRowSchema.array().parse(data ?? []).map((row) => ({
    forecastManifestId: row.forecast_origin_manifest_id,
    studyContractId: row.study_contract_id,
  }))
}

const tradingMondaysThrough = (asOfDate: string): string[] => {
  const endTime = Date.parse(`${asOfDate}T00:00:00.000Z`)
  const dates: string[] = []

  for (
    let cursor = Date.parse(`${MONDAY_ORIGIN_START_DATE}T00:00:00.000Z`);
    cursor <= endTime;
    cursor += WEEK_MS
  ) {
    const originDate = new Date(cursor).toISOString().slice(0, 10)
    if (isTradingMonday(originDate)) dates.push(originDate)
  }

  return dates
}

export interface MondayOriginDeps {
  readonly loadExistingForecastOrigins?: (
    input: { readonly startDate: string; readonly endDate: string },
  ) => Promise<readonly ExistingForecastOrigin[]>
  readonly loadExistingStudyBindings?: (
    input: { readonly forecastManifestIds: readonly string[] },
  ) => Promise<readonly ExistingStudyBinding[]>
  readonly loadThemeSources?: (input: { readonly originDate: string }) => Promise<ForecastThemeSource[]>
  readonly loadStudies?: () => Promise<AttentionStudyContract[]>
  readonly loadBablCandidates?: (
    input: { originDate: string; themeIds: readonly string[]; study: AttentionStudyContract },
  ) => Promise<Map<string, StudyBablCandidate[]>>
  readonly createForecastManifest?: (payload: JsonObject) => Promise<string>
  readonly bindStudyOrigin?: (payload: JsonObject) => Promise<string>
  readonly loadRosterThemeCount?: (input: { readonly originDate: string }) => Promise<number>
  readonly now?: Date
}

const bindingKey = (forecastManifestId: string, studyContractId: string): string => `${forecastManifestId}:${studyContractId}`

export const runMondayOrigins = async (
  asOfDate: string = getKSTDateString(),
  deps: MondayOriginDeps = {},
): Promise<MondayOriginReport> => {
  const now = deps.now ?? new Date()
  const candidateDates = tradingMondaysThrough(asOfDate)
  const eligibleDates = candidateDates.filter((originDate) => isAfterForecastCutoff(originDate, now))
  const hasPendingCutoff = candidateDates.length > eligibleDates.length

  if (eligibleDates.length === 0) {
    const skippedReason = hasPendingCutoff ? 'before_cutoff' : 'up_to_date'
    console.log(`⊘ ${asOfDate} 기준 ${skippedReason === 'before_cutoff' ? 'cutoff 경과 origin 없음' : '처리할 origin 없음'}`)
    return { asOfDate, skippedReason, origins: [] }
  }

  const existingForecasts = await (deps.loadExistingForecastOrigins ?? loadExistingForecastOrigins)({
    startDate: eligibleDates[0],
    endDate: eligibleDates[eligibleDates.length - 1],
  })
  const existingByDate = new Map(existingForecasts.map((forecast) => [forecast.originDate, forecast]))
  const existingBindings = await (deps.loadExistingStudyBindings ?? loadExistingStudyBindings)({
    forecastManifestIds: existingForecasts.map((forecast) => forecast.id),
  })
  const bindingKeys = new Set(existingBindings.map((binding) =>
    bindingKey(binding.forecastManifestId, binding.studyContractId)))
  const loadThemeSources = deps.loadThemeSources ?? loadForecastThemeSources
  const loadStudies = deps.loadStudies ?? loadAttentionStudyContracts
  const loadBablCandidates = deps.loadBablCandidates ?? loadStudyBablCandidates
  const createForecastManifest =
    deps.createForecastManifest ?? ((payload) => callManifestRpc(CREATE_FORECAST_ORIGIN_MANIFEST_RPC, payload))
  const bindStudyOrigin = deps.bindStudyOrigin ?? ((payload) => callManifestRpc(BIND_STUDY_ORIGIN_RPC, payload))
  const loadRosterThemeCount = deps.loadRosterThemeCount
    ?? (async ({ originDate }) => (await loadOriginRoster({ originDate })).size)

  const allStudies = await loadStudies()
  const origins: MondayOriginManifestReport[] = []

  for (const originDate of eligibleDates) {
    let forecast = existingByDate.get(originDate)
    let forecastCreated = false
    let rosterThemeCount = forecast?.rosterThemeCount ?? null

    if (!forecast) {
      console.log(`\n🗓️  ${originDate} forecast origin manifest 생성 (cutoff ${forecastCutoffUtc(originDate)})`)
      const themeSources = await loadThemeSources({ originDate })
      const forecastPayload = withKeywordCanonicalJson(
        buildForecastOriginManifestPayload({ originDate, themeSources }),
      )
      const forecastManifestId = await createForecastManifest(forecastPayload)
      forecast = {
        id: forecastManifestId,
        originDate,
        expectedThemeIds: z.array(z.string().uuid()).parse(forecastPayload.expected_theme_ids),
        usableChildCount: themeSources.filter(
          (source) => source.interestRun !== null && source.newsObservationIds?.length === 14,
        ).length,
      }
      const hasRosterMarkers = themeSources.some((source) => source.rosterEligible !== undefined)
      rosterThemeCount = hasRosterMarkers
        ? themeSources.filter((source) => source.rosterEligible === true).length
        : themeSources.length
      forecastCreated = true
      console.log(`   ✅ forecast manifest ${forecast.id} (child ${forecast.expectedThemeIds.length}, usable ${forecast.usableChildCount}, abstain ${forecast.expectedThemeIds.length - forecast.usableChildCount})`)
    }

    const studies = selectBindableStudies(allStudies, originDate).filter(
      (study) => !bindingKeys.has(bindingKey(forecast.id, study.id)),
    )
    if (!forecastCreated && studies.length === 0) continue
    if (rosterThemeCount === null) rosterThemeCount = await loadRosterThemeCount({ originDate })

    const studyOriginManifestIds: string[] = []

    for (const study of studies) {
      const candidatesByThemeId = await loadBablCandidates({
        originDate,
        themeIds: forecast.expectedThemeIds,
        study,
      })
      const studyPayload = buildStudyOriginManifestPayload({
        studyContractId: study.id,
        forecastOriginManifestId: forecast.id,
        expectedThemeIds: forecast.expectedThemeIds,
        candidatesByThemeId,
      })
      const studyOriginManifestId = await bindStudyOrigin(studyPayload)
      studyOriginManifestIds.push(studyOriginManifestId)
      bindingKeys.add(bindingKey(forecast.id, study.id))
      console.log(`   ✅ study-origin manifest ${studyOriginManifestId} (study ${study.id}, child ${forecast.expectedThemeIds.length})`)
    }

    if (studies.length === 0) {
      console.log('   ⊘ bind 가능한 study contract 없음 — forecast manifest만 축적')
    }

    origins.push({
      originDate,
      forecastManifestId: forecast.id,
      forecastChildCount: forecast.expectedThemeIds.length,
      usableChildCount: forecast.usableChildCount,
      abstainChildCount: forecast.expectedThemeIds.length - forecast.usableChildCount,
      rosterThemeCount,
      studyOriginManifestIds,
    })
  }

  if (origins.length === 0) {
    const skippedReason = hasPendingCutoff ? 'before_cutoff' : 'up_to_date'
    console.log(`⊘ ${asOfDate} 기준 ${skippedReason === 'before_cutoff' ? '당일 cutoff 대기 중' : '모든 origin/bind 생성 완료'}`)
    return { asOfDate, skippedReason, origins }
  }
  return { asOfDate, skippedReason: null, origins }
}

const isDirectRun = process.argv[1]?.includes('run-monday-origins')
if (isDirectRun) {
  runMondayOrigins()
    .then((report) => {
      console.log(`\n${JSON.stringify(report, null, 2)}`)
      process.exit(0)
    })
    .catch((error: unknown) => {
      console.error('❌ Monday origin 생성 실패:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
