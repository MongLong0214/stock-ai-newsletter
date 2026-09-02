import { keysetOrExpression, paginateByKeyset } from '@/scripts/tli/shared/keyset'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { z } from 'zod'
import { ORIGIN_ELIGIBILITY_RULE_VERSION } from './origin-eligibility'

const DB_PAGE_SIZE = 1000
const ID_CHUNK_SIZE = 300
const BINDING_KEYSET = {
  first: 'study_contract_id',
  second: 'forecast_origin_manifest_id',
  third: 'id',
} as const

export interface EligibleStudyOriginBinding {
  readonly study_origin_manifest_id: string
  readonly forecast_origin_manifest_id: string
}

export interface LatestStudyOriginEligibility {
  readonly study_origin_manifest_id: string
  readonly verdict: 'eligible' | 'ineligible'
}

const bindingRowSchema = z.object({
  id: z.string().uuid(),
  study_contract_id: z.string().uuid(),
  forecast_origin_manifest_id: z.string().uuid(),
})

const eligibilityRowSchema = z.object({
  study_origin_manifest_id: z.string().uuid(),
  verdict: z.enum(['eligible', 'ineligible']),
})

export interface StudyOriginEligibilitySourceDeps {
  readonly loadBindings?: (studyContractId: string) => Promise<EligibleStudyOriginBinding[]>
  readonly loadLatestEligibility?: (
    studyOriginManifestIds: readonly string[],
  ) => Promise<LatestStudyOriginEligibility[]>
  readonly warn?: (message: string) => void
}

export const filterEligibleStudyOriginBindings = (
  bindings: readonly EligibleStudyOriginBinding[],
  eligibilityRows: readonly LatestStudyOriginEligibility[],
  warn: (message: string) => void = console.warn,
): EligibleStudyOriginBinding[] => {
  const eligibilityByStudyOrigin = new Map(
    eligibilityRows.map((row) => [row.study_origin_manifest_id, row.verdict]),
  )
  return bindings.filter((binding) => {
    const verdict = eligibilityByStudyOrigin.get(binding.study_origin_manifest_id)
    if (verdict === undefined) {
      warn(`⚠️ origin eligibility 판정 없음 — 제외: ${binding.study_origin_manifest_id}`)
      return false
    }
    return verdict === 'eligible'
  })
}

const loadBindings = async (studyContractId: string): Promise<EligibleStudyOriginBinding[]> => {
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
        .select('id, study_contract_id, forecast_origin_manifest_id')
        .eq('study_contract_id', studyContractId)
      if (after !== null) query = query.or(keysetOrExpression(BINDING_KEYSET, after))
      const { data, error } = await query
        .order('study_contract_id')
        .order('forecast_origin_manifest_id')
        .order('id')
        .limit(DB_PAGE_SIZE)
      if (error) throw new Error(`study-origin binding query failed: ${error.message}`)
      return bindingRowSchema.array().parse(data ?? [])
    },
  })
  return rows.map((row) => ({
    study_origin_manifest_id: row.id,
    forecast_origin_manifest_id: row.forecast_origin_manifest_id,
  }))
}

const loadLatestEligibility = async (
  studyOriginManifestIds: readonly string[],
): Promise<LatestStudyOriginEligibility[]> => {
  const rows: LatestStudyOriginEligibility[] = []
  for (let index = 0; index < studyOriginManifestIds.length; index += ID_CHUNK_SIZE) {
    const ids = studyOriginManifestIds.slice(index, index + ID_CHUNK_SIZE)
    const { data, error } = await supabaseAdmin
      .from('tli_study_origin_eligibility_latest')
      .select('study_origin_manifest_id, verdict')
      .eq('rule_version', ORIGIN_ELIGIBILITY_RULE_VERSION)
      .in('study_origin_manifest_id', ids)
    if (error) throw new Error(`study-origin eligibility query failed: ${error.message}`)
    rows.push(...eligibilityRowSchema.array().parse(data ?? []))
  }
  return rows
}

export const loadEligibleStudyOriginBindings = async (
  studyContractId: string,
  deps: StudyOriginEligibilitySourceDeps = {},
): Promise<EligibleStudyOriginBinding[]> => {
  const bindings = await (deps.loadBindings ?? loadBindings)(studyContractId)
  const eligibilityRows = await (deps.loadLatestEligibility ?? loadLatestEligibility)(
    bindings.map((binding) => binding.study_origin_manifest_id),
  )
  return filterEligibleStudyOriginBindings(bindings, eligibilityRows, deps.warn)
}
