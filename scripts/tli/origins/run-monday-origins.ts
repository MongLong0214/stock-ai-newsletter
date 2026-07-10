/**
 * TLI v3 Todo 6: 거래 가능한 월요일 18:00 KST cutoff 뒤 origin manifest 축적.
 *
 * 순서는 항상 universal forecast manifest → 조건을 만족하는 study마다 `bind_tli_study_origin`이다.
 * experiment cycle이 0개여도 두 manifest를 계속 쌓는다. 동일 payload retry는 046 RPC가 기존 id를 반환한다.
 */

import { canonicalJsonV1, canonicalJsonV1Sha256 } from '@/lib/tli/canonical-json'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { isKoreanTradingDate } from '@/lib/tli/trading-calendar'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { loadActiveThemes } from '@/scripts/tli/shared/data-ops'
import {
  loadAttentionStudyContracts,
  type AttentionStudyContract,
} from '@/scripts/tli/collectors/babl-phase-snapshot'
import {
  buildForecastOriginManifestPayload,
  buildStudyOriginManifestPayload,
  forecastCutoffUtc,
  type ForecastThemeSource,
  type StudyBablCandidate,
} from './forecast-origin-manifest'
import { loadForecastThemeSources, loadStudyBablCandidates, type OriginTheme } from './origin-sources'

export const CREATE_FORECAST_ORIGIN_MANIFEST_RPC = 'create_tli_forecast_origin_manifest'
export const BIND_STUDY_ORIGIN_RPC = 'bind_tli_study_origin'

export interface MondayOriginReport {
  readonly originDate: string
  readonly skippedReason: 'not_a_trading_monday' | 'before_cutoff' | null
  readonly forecastManifestId: string | null
  readonly forecastChildCount: number
  readonly usableChildCount: number
  readonly studyOriginManifestIds: readonly string[]
}

const ISO_MONDAY = 1

const isTradingMonday = (originDate: string): boolean => {
  const weekday = new Date(`${originDate}T00:00:00.000Z`).getUTCDay()
  return weekday === ISO_MONDAY && isKoreanTradingDate(originDate)
}

/** cutoff 이전에는 어떤 manifest도 만들지 않는다 — 그 뒤에 끝난 수집을 소급 사용하지 않기 위함이다. */
export const isAfterForecastCutoff = (originDate: string, now: Date): boolean =>
  now.getTime() >= Date.parse(forecastCutoffUtc(originDate))

/** lock 시각이 cutoff보다 이르고 first origin 이후인 study만 이 origin에 bind할 수 있다. */
export const selectBindableStudies = (
  studies: readonly AttentionStudyContract[],
  originDate: string,
): AttentionStudyContract[] =>
  studies.filter(
    (study) =>
      Date.parse(study.locked_at) < Date.parse(forecastCutoffUtc(originDate))
      && study.first_origin_date <= originDate,
  )

const callManifestRpc = async (rpc: string, payload: object): Promise<string> => {
  const canonicalJson = canonicalJsonV1(payload)
  const payloadSha256 = canonicalJsonV1Sha256(payload)

  const { data, error } = await supabaseAdmin.rpc(rpc, {
    p_manifest_canonical_json: canonicalJson,
    p_payload_sha256: payloadSha256,
  })

  if (error) throw new Error(`${rpc} 실패: ${error.message}`)
  if (typeof data !== 'string' || data.length === 0) {
    throw new Error(`${rpc}가 manifest id를 반환하지 않았습니다`)
  }
  return data
}

export interface MondayOriginDeps {
  readonly loadThemes?: () => Promise<OriginTheme[]>
  readonly loadThemeSources?: (input: {
    originDate: string
    themes: readonly OriginTheme[]
  }) => Promise<ForecastThemeSource[]>
  readonly loadStudies?: () => Promise<AttentionStudyContract[]>
  readonly loadBablCandidates?: (input: {
    originDate: string
    themeIds: readonly string[]
    study: AttentionStudyContract
  }) => Promise<Map<string, StudyBablCandidate[]>>
  readonly createForecastManifest?: (payload: object) => Promise<string>
  readonly bindStudyOrigin?: (payload: object) => Promise<string>
  readonly now?: Date
}

export const runMondayOrigins = async (
  originDate: string = getKSTDateString(),
  deps: MondayOriginDeps = {},
): Promise<MondayOriginReport> => {
  const empty = (skippedReason: MondayOriginReport['skippedReason']): MondayOriginReport => ({
    originDate,
    skippedReason,
    forecastManifestId: null,
    forecastChildCount: 0,
    usableChildCount: 0,
    studyOriginManifestIds: [],
  })

  if (!isTradingMonday(originDate)) {
    console.log(`⊘ ${originDate}는 거래 가능한 월요일이 아님 — origin을 만들지 않는다`)
    return empty('not_a_trading_monday')
  }

  if (!isAfterForecastCutoff(originDate, deps.now ?? new Date())) {
    console.log(`⊘ ${originDate} 18:00 KST cutoff 이전 — manifest 생성 보류`)
    return empty('before_cutoff')
  }

  const loadThemes = deps.loadThemes ?? (async () => (await loadActiveThemes()) as unknown as OriginTheme[])
  const loadThemeSources = deps.loadThemeSources ?? loadForecastThemeSources
  const loadStudies = deps.loadStudies ?? loadAttentionStudyContracts
  const loadBablCandidates = deps.loadBablCandidates ?? loadStudyBablCandidates
  const createForecastManifest =
    deps.createForecastManifest ?? ((payload) => callManifestRpc(CREATE_FORECAST_ORIGIN_MANIFEST_RPC, payload))
  const bindStudyOrigin = deps.bindStudyOrigin ?? ((payload) => callManifestRpc(BIND_STUDY_ORIGIN_RPC, payload))

  console.log(`\n🗓️  ${originDate} forecast origin manifest 생성 (cutoff ${forecastCutoffUtc(originDate)})`)

  const themes = await loadThemes()
  const themeSources = await loadThemeSources({ originDate, themes })
  const forecastPayload = buildForecastOriginManifestPayload({ originDate, themeSources })
  const forecastManifestId = await createForecastManifest(forecastPayload)

  const usableChildCount = themeSources.filter(
    (source) => source.interestRun !== null && source.newsObservationIds?.length === 14,
  ).length
  console.log(`   ✅ forecast manifest ${forecastManifestId} (child ${themeSources.length}, usable ${usableChildCount})`)

  const expectedThemeIds = forecastPayload.expected_theme_ids as string[]
  const studies = selectBindableStudies(await loadStudies(), originDate)
  const studyOriginManifestIds: string[] = []

  for (const study of studies) {
    const candidatesByThemeId = await loadBablCandidates({ originDate, themeIds: expectedThemeIds, study })
    const studyPayload = buildStudyOriginManifestPayload({
      studyContractId: study.id,
      forecastOriginManifestId: forecastManifestId,
      expectedThemeIds,
      candidatesByThemeId,
    })
    const studyOriginManifestId = await bindStudyOrigin(studyPayload)
    studyOriginManifestIds.push(studyOriginManifestId)
    console.log(`   ✅ study-origin manifest ${studyOriginManifestId} (study ${study.id}, child ${expectedThemeIds.length})`)
  }

  if (studies.length === 0) {
    console.log('   ⊘ bind 가능한 study contract 없음 — forecast manifest만 축적')
  }

  return {
    originDate,
    skippedReason: null,
    forecastManifestId,
    forecastChildCount: themeSources.length,
    usableChildCount,
    studyOriginManifestIds,
  }
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
