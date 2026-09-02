import { canonicalJsonV1, compareUtf8Bytes } from '@/lib/tli/canonical-json'
import { getKSTDateString } from '@/lib/tli/date-utils'
import {
  loadAttentionStudyContracts,
  type AttentionStudyContract,
} from '@/scripts/tli/collectors/babl-phase-snapshot'
import {
  CONFIRMATORY_HORIZON_DAYS,
  CONFIRMATORY_LABELER_VERSION,
  CONFIRMATORY_LABEL_TYPE,
} from '@/scripts/tli/learn/dataset-manifest'
import {
  SCIENTIFIC_GATE_EXIT,
  scientificGateExitCode,
  type ScientificGateSeverity,
} from '@/scripts/tli/ops/scientific-gate-exit'
import {
  deriveGtAV2Windows,
  loadKospiTradingDates,
} from '@/scripts/tli/labels/gta-v2-daily'
import { keysetOrExpression, paginateByKeyset } from '@/scripts/tli/shared/keyset'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { z } from 'zod'
import {
  evaluateOriginEligibility,
  ORIGIN_ELIGIBILITY_RULE_VERSION,
  type OriginEligibilityResult,
  type OriginLabelAccounting,
} from './origin-eligibility'
import { loadOriginRoster, type OriginRoster } from './origin-roster'

const DB_PAGE_SIZE = 1000
const ID_CHUNK_SIZE = 300
const BINDING_KEYSET = {
  first: 'study_contract_id',
  second: 'forecast_origin_manifest_id',
  third: 'id',
} as const
const LABEL_KEYSET = { first: 'base_date', second: 'theme_id', third: 'id' } as const

const bindingRowSchema = z.object({
  id: z.string().uuid(),
  study_contract_id: z.string().uuid(),
  forecast_origin_manifest_id: z.string().uuid(),
  forecast: z.object({
    origin_date: z.string(),
    forecast_cutoff: z.string(),
    expected_theme_ids: z.array(z.string().uuid()),
    expected_theme_count: z.number().int().positive(),
    theme_inputs: z.array(z.object({
      theme_id: z.string().uuid(),
      input_status: z.enum(['usable', 'abstain']),
    })),
  }),
})

const labelRowSchema = z.object({
  id: z.string().uuid(),
  theme_id: z.string().uuid(),
  base_date: z.string(),
  label_status: z.string(),
  exclude_reason: z.string().nullable(),
})

const latestEligibilityRowSchema = z.object({
  study_origin_manifest_id: z.string().uuid(),
  payload_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  matured: z.boolean(),
  verdict: z.enum(['eligible', 'ineligible']),
})

export interface StudyOriginEligibilityBinding {
  readonly studyContractId: string
  readonly studyOriginManifestId: string
  readonly forecastOriginManifestId: string
  readonly originDate: string
  readonly forecastCutoff: string
  readonly expectedThemeIds: readonly string[]
  readonly usableThemeIds: readonly string[]
}

export interface RecordedOriginEligibility {
  readonly studyContractId: string
  readonly studyOriginManifestId: string
  readonly forecastOriginManifestId: string
  readonly originDate: string
  readonly result: OriginEligibilityResult
  readonly action: 'inserted' | 'dry_run' | 'skipped_unchanged'
}

export interface LatestOriginEligibilityPayload {
  readonly payloadSha256: string
  readonly matured: boolean
  readonly verdict: OriginEligibilityResult['verdict']
}

export type OriginEligibilityEvaluationScope = 'all' | 'pending'

export interface OriginEligibilityRunSummary {
  readonly evaluatedCount: number
  readonly eligibleCount: number
  readonly ineligibleCount: number
  readonly insertedCount: number
  readonly newlyRecordedIneligibleCount: number
  readonly severity: ScientificGateSeverity
  readonly exitCode: number
}

export interface OriginEligibilityRunReport {
  readonly evaluations: readonly RecordedOriginEligibility[]
  readonly summary: OriginEligibilityRunSummary
}

export interface OriginEligibilityRunDeps {
  readonly loadStudies?: () => Promise<AttentionStudyContract[]>
  readonly loadBindings?: (studyContractId: string) => Promise<StudyOriginEligibilityBinding[]>
  readonly loadRoster?: (input: { readonly originDate: string }) => Promise<OriginRoster>
  readonly loadLabelAccounting?: (
    binding: StudyOriginEligibilityBinding,
  ) => Promise<OriginLabelAccounting>
  readonly loadKospiTradingDates?: () => Promise<string[]>
  readonly loadLatestPayloads?: (
    studyOriginManifestIds: readonly string[],
  ) => Promise<ReadonlyMap<string, LatestOriginEligibilityPayload>>
  readonly insertEligibility?: (
    binding: StudyOriginEligibilityBinding,
    result: OriginEligibilityResult,
  ) => Promise<void>
}

export const shouldAppendOriginEligibility = (
  latestPayloadSha256: string | undefined,
  payloadSha256: string,
): boolean => latestPayloadSha256 !== payloadSha256

export const filterPendingOriginEligibilityBindings = (
  bindings: readonly StudyOriginEligibilityBinding[],
  latestPayloads: ReadonlyMap<string, LatestOriginEligibilityPayload>,
  originDates: readonly string[] = [],
): StudyOriginEligibilityBinding[] => {
  const requestedOriginDates = new Set(originDates)
  return bindings.filter((binding) => {
    const latest = latestPayloads.get(binding.studyOriginManifestId)
    return latest === undefined
      || latest.matured === false
      || latest.verdict === 'ineligible'
      || requestedOriginDates.has(binding.originDate)
  })
}

const subtractCalendarDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

export const classifyOriginEligibilitySeverity = (
  evaluations: readonly {
    readonly originDate: string
    readonly result: Pick<OriginEligibilityResult, 'verdict'>
  }[],
  today: string,
): ScientificGateSeverity => {
  const ineligible = evaluations.filter((evaluation) => evaluation.result.verdict === 'ineligible')
  if (ineligible.length === 0) return 'pass'
  const criticalCutoff = subtractCalendarDays(today, 7)
  return ineligible.some((evaluation) => evaluation.originDate >= criticalCutoff) ? 'critical' : 'warning'
}

const loadStudyOriginBindings = async (
  studyContractId: string,
): Promise<StudyOriginEligibilityBinding[]> => {
  const rows = await paginateByKeyset({
    pageSize: DB_PAGE_SIZE,
    keyOf: (row: z.infer<typeof bindingRowSchema>) => ({
      first: row.study_contract_id,
      second: row.forecast_origin_manifest_id,
      third: row.id,
    }),
    fetchPage: async (after) => {
      let query = supabaseAdmin
        .from('tli_study_origin_manifests')
        .select(`
          id, study_contract_id, forecast_origin_manifest_id,
          forecast:tli_forecast_origin_manifests!inner(
            origin_date, forecast_cutoff, expected_theme_ids, expected_theme_count,
            theme_inputs:tli_forecast_origin_theme_inputs(theme_id, input_status)
          )
        `)
        .eq('study_contract_id', studyContractId)
      if (after !== null) query = query.or(keysetOrExpression(BINDING_KEYSET, after))
      const { data, error } = await query
        .order('study_contract_id')
        .order('forecast_origin_manifest_id')
        .order('id')
        .limit(DB_PAGE_SIZE)
      if (error) throw new Error(`study-origin eligibility binding 조회 실패: ${error.message}`)
      return bindingRowSchema.array().parse(data ?? [])
    },
  })

  return rows.map((row) => {
    const expectedThemeIds = row.forecast.expected_theme_ids
    const childThemeIds = row.forecast.theme_inputs.map((theme) => theme.theme_id)
    if (
      expectedThemeIds.length !== row.forecast.expected_theme_count
      || childThemeIds.length !== expectedThemeIds.length
      || new Set(expectedThemeIds).size !== expectedThemeIds.length
      || expectedThemeIds.some((themeId) => !childThemeIds.includes(themeId))
    ) {
      throw new Error(`forecast origin ${row.forecast_origin_manifest_id}의 expected universe/child가 일치하지 않습니다`)
    }
    return {
      studyContractId: row.study_contract_id,
      studyOriginManifestId: row.id,
      forecastOriginManifestId: row.forecast_origin_manifest_id,
      originDate: row.forecast.origin_date,
      forecastCutoff: new Date(row.forecast.forecast_cutoff).toISOString(),
      expectedThemeIds,
      usableThemeIds: row.forecast.theme_inputs
        .filter((theme) => theme.input_status === 'usable')
        .map((theme) => theme.theme_id),
    }
  })
}

const loadOriginLabelAccounting = async (
  binding: StudyOriginEligibilityBinding,
): Promise<OriginLabelAccounting> => {
  const rows = await paginateByKeyset({
    pageSize: DB_PAGE_SIZE,
    keyOf: (row: z.infer<typeof labelRowSchema>) => ({
      first: row.base_date,
      second: row.theme_id,
      third: row.id,
    }),
    fetchPage: async (after) => {
      let query = supabaseAdmin
        .from('theme_labels')
        .select('id, theme_id, base_date, label_status, exclude_reason')
        .eq('forecast_origin_manifest_id', binding.forecastOriginManifestId)
        .eq('label_type', CONFIRMATORY_LABEL_TYPE)
        .eq('labeler_version', CONFIRMATORY_LABELER_VERSION)
        .eq('horizon_days', CONFIRMATORY_HORIZON_DAYS)
      if (after !== null) query = query.or(keysetOrExpression(LABEL_KEYSET, after))
      const { data, error } = await query
        .order('base_date')
        .order('theme_id')
        .order('id')
        .limit(DB_PAGE_SIZE)
      if (error) throw new Error(`origin label accounting 조회 실패: ${error.message}`)
      return labelRowSchema.array().parse(data ?? [])
    },
  })

  return {
    terminal: rows.filter((row) => row.label_status === 'final' || row.label_status === 'excluded').length,
    pending: rows.filter((row) => row.label_status !== 'final' && row.label_status !== 'excluded').length,
    sourceGap: rows.filter(
      (row) => row.label_status === 'excluded' && row.exclude_reason === 'source_gap_sla',
    ).length,
  }
}

const loadLatestPayloads = async (
  studyOriginManifestIds: readonly string[],
): Promise<ReadonlyMap<string, LatestOriginEligibilityPayload>> => {
  const latest = new Map<string, LatestOriginEligibilityPayload>()
  for (let index = 0; index < studyOriginManifestIds.length; index += ID_CHUNK_SIZE) {
    const ids = studyOriginManifestIds.slice(index, index + ID_CHUNK_SIZE)
    const { data, error } = await supabaseAdmin
      .from('tli_study_origin_eligibility_latest')
      .select('study_origin_manifest_id, payload_sha256, matured, verdict')
      .eq('rule_version', ORIGIN_ELIGIBILITY_RULE_VERSION)
      .in('study_origin_manifest_id', ids)
    if (error) throw new Error(`latest origin eligibility 조회 실패: ${error.message}`)
    for (const row of latestEligibilityRowSchema.array().parse(data ?? [])) {
      latest.set(row.study_origin_manifest_id, {
        payloadSha256: row.payload_sha256,
        matured: row.matured,
        verdict: row.verdict,
      })
    }
  }
  return latest
}

const insertOriginEligibility = async (
  binding: StudyOriginEligibilityBinding,
  result: OriginEligibilityResult,
): Promise<void> => {
  const { error } = await supabaseAdmin.from('tli_study_origin_eligibility').insert({
    study_origin_manifest_id: binding.studyOriginManifestId,
    forecast_origin_manifest_id: binding.forecastOriginManifestId,
    origin_date: binding.originDate,
    rule_version: result.ruleVersion,
    verdict: result.verdict,
    roster_theme_count: result.rosterThemeCount,
    expected_theme_count: result.expectedThemeCount,
    usable_theme_count: result.usableThemeCount,
    usable_coverage: result.usableCoverage,
    unknown_theme_count: result.unknownThemeCount,
    missing_theme_count: result.missingThemeCount,
    matured: result.matured,
    label_terminal_count: result.labelTerminalCount,
    label_pending_count: result.labelPendingCount,
    label_source_gap_count: result.labelSourceGapCount,
    reasons: [...result.reasons],
    evidence: result.evidence,
    payload_sha256: result.payloadSha256,
  })
  if (error) throw new Error(`origin eligibility append 실패: ${error.message}`)
}

export const evaluateAndRecordStudyOriginEligibility = async (input: {
  readonly today?: string
  readonly now?: Date
  readonly originDates?: readonly string[]
  readonly scope?: OriginEligibilityEvaluationScope
  readonly dryRun?: boolean
  readonly deps?: OriginEligibilityRunDeps
} = {}): Promise<OriginEligibilityRunReport> => {
  const today = input.today ?? getKSTDateString()
  const now = input.now ?? new Date()
  const deps = input.deps ?? {}
  const loadStudies = deps.loadStudies ?? loadAttentionStudyContracts
  const loadBindings = deps.loadBindings ?? loadStudyOriginBindings
  const loadRoster = deps.loadRoster ?? loadOriginRoster
  const loadLabelAccounting = deps.loadLabelAccounting ?? loadOriginLabelAccounting
  const loadKospiDates = deps.loadKospiTradingDates ?? loadKospiTradingDates
  const loadLatest = deps.loadLatestPayloads ?? loadLatestPayloads
  const insertEligibility = deps.insertEligibility ?? insertOriginEligibility
  const originDateFilter = input.originDates === undefined ? null : new Set(input.originDates)
  const scope = input.scope ?? 'all'
  const allBindings: StudyOriginEligibilityBinding[] = []

  for (const study of await loadStudies()) {
    const studyBindings = await loadBindings(study.id)
    allBindings.push(...studyBindings)
  }
  const allLatestPayloads = scope === 'pending'
    ? await loadLatest(allBindings.map((binding) => binding.studyOriginManifestId))
    : null
  const bindings = scope === 'pending'
    ? filterPendingOriginEligibilityBindings(
      allBindings,
      allLatestPayloads ?? new Map(),
      input.originDates,
    )
    : allBindings.filter(
      (binding) => originDateFilter === null || originDateFilter.has(binding.originDate),
    )
  bindings.sort(
    (left, right) =>
      compareUtf8Bytes(left.originDate, right.originDate)
      || compareUtf8Bytes(left.studyOriginManifestId, right.studyOriginManifestId),
  )

  const latestPayloads = allLatestPayloads
    ?? await loadLatest(bindings.map((binding) => binding.studyOriginManifestId))
  // WHY: 모든 origin의 maturity는 같은 KOSPI 실측 스냅샷에서 파생하고, origin마다 DB를 재조회하지 않는다.
  const kospiDates = bindings.length > 0 ? await loadKospiDates() : []
  const evaluations: RecordedOriginEligibility[] = []

  for (const binding of bindings) {
    const roster = await loadRoster({ originDate: binding.originDate })
    const windows = deriveGtAV2Windows(kospiDates, binding.originDate)
    const matured = windows !== null
      && windows.graceDeadline !== null
      && now >= windows.graceDeadline
    const labelAccounting = matured ? await loadLabelAccounting(binding) : null
    const result = evaluateOriginEligibility({
      originDate: binding.originDate,
      forecastCutoff: binding.forecastCutoff,
      rosterThemeIds: [...roster.keys()],
      expectedThemeIds: binding.expectedThemeIds,
      usableThemeIds: binding.usableThemeIds,
      matured,
      labelAccounting,
    })
    const shouldAppend = shouldAppendOriginEligibility(
      latestPayloads.get(binding.studyOriginManifestId)?.payloadSha256,
      result.payloadSha256,
    )
    let action: RecordedOriginEligibility['action'] = 'skipped_unchanged'
    if (shouldAppend && input.dryRun === true) {
      action = 'dry_run'
    } else if (shouldAppend) {
      await insertEligibility(binding, result)
      action = 'inserted'
    }
    evaluations.push({
      studyContractId: binding.studyContractId,
      studyOriginManifestId: binding.studyOriginManifestId,
      forecastOriginManifestId: binding.forecastOriginManifestId,
      originDate: binding.originDate,
      result,
      action,
    })
  }

  const severity = classifyOriginEligibilitySeverity(evaluations, today)
  const summary: OriginEligibilityRunSummary = {
    evaluatedCount: evaluations.length,
    eligibleCount: evaluations.filter((evaluation) => evaluation.result.verdict === 'eligible').length,
    ineligibleCount: evaluations.filter((evaluation) => evaluation.result.verdict === 'ineligible').length,
    insertedCount: evaluations.filter((evaluation) => evaluation.action === 'inserted').length,
    newlyRecordedIneligibleCount: evaluations.filter(
      (evaluation) => evaluation.action === 'inserted' && evaluation.result.verdict === 'ineligible',
    ).length,
    severity,
    exitCode: scientificGateExitCode(severity),
  }
  return { evaluations, summary }
}

interface OriginEligibilityCliOptions {
  readonly dryRun: boolean
  readonly json: boolean
}

const parseCliOptions = (args: readonly string[]): OriginEligibilityCliOptions => {
  const unknown = args.filter((arg) => arg !== '--dry-run' && arg !== '--json')
  if (unknown.length > 0) throw new Error(`알 수 없는 인자: ${unknown.join(', ')}`)
  return { dryRun: args.includes('--dry-run'), json: args.includes('--json') }
}

const runCli = async (): Promise<void> => {
  const options = parseCliOptions(process.argv.slice(2))
  const report = await evaluateAndRecordStudyOriginEligibility({ dryRun: options.dryRun })
  if (options.json) {
    console.log(canonicalJsonV1(report))
  } else {
    for (const evaluation of report.evaluations) {
      const result = evaluation.result
      console.log([
        evaluation.originDate,
        result.verdict,
        `${result.usableThemeCount}/${result.rosterThemeCount}`,
        result.usableCoverage.toFixed(5),
        result.reasons.join(',') || '-',
      ].join('\t'))
    }
    console.log(canonicalJsonV1(report.summary))
  }
  process.exitCode = report.summary.exitCode
}

const isDirectRun = process.argv[1]?.includes('run-origin-eligibility')
if (isDirectRun) {
  runCli().catch((error: unknown) => {
    console.error('❌ origin eligibility 평가 실패:', error instanceof Error ? error.message : String(error))
    process.exitCode = SCIENTIFIC_GATE_EXIT.operationalFailure
  })
}
