import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  ROLLBACK_LIMITS,
  evaluateRollbackGate,
  rollbackGateInputSchema,
  type RollbackGateInput,
} from './rollback-gate'

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET ?? 'true'

const scenarioSchema = z.enum(['rollback', 'keep'])

const modelRowSchema = z.object({
  model_version: z.string().min(1),
})

const metricRowSchema = z.object({
  brier: z.number().nullable(),
})

const args = process.argv.slice(2)

const readArg = (name: string, fallback: string | null = null): string | null => {
  const exact = `--${name}`
  const prefix = `${exact}=`
  const match = args.find((arg) => arg === exact || arg.startsWith(prefix))
  if (!match) return fallback
  return match === exact ? '' : match.slice(prefix.length)
}

const readBooleanArg = (name: string, fallback: boolean): boolean => {
  const value = readArg(name)
  if (value === null) return fallback
  if (value === '') return true
  return ['1', 'true', 'yes'].includes(value.toLowerCase())
}

const ensureParentDir = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true })
}

const writeJson = (path: string, payload: unknown): void => {
  ensureParentDir(path)
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`)
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

const mean = (values: readonly number[]): number | null => (
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
)

const dryRunInput = (scenario: z.infer<typeof scenarioSchema>): RollbackGateInput => ({
  championModelVersion: 'm1-current',
  previousModelVersion: 'b-abl-v1',
  championMeanBrier: scenario === 'rollback' ? 0.122 : 0.105,
  previousMeanBrier: 0.10,
  championMetricDays: 20,
  previousMetricDays: 20,
})

const dateDaysAgo = (asOfDate: string, days: number): string => {
  const date = new Date(`${asOfDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

async function loadMetricMean(input: {
  readonly modelVersion: string
  readonly sinceDate: string
  readonly asOfDate: string
}): Promise<{ readonly meanBrier: number | null; readonly days: number }> {
  const { supabaseAdmin } = await import('../shared/supabase-admin')
  const { data, error } = await supabaseAdmin
    .from('model_metrics_daily')
    .select('brier')
    .eq('model_version', input.modelVersion)
    .gte('metric_date', input.sinceDate)
    .lte('metric_date', input.asOfDate)

  if (error) throw new Error(`model_metrics_daily 로딩 실패 (${input.modelVersion}): ${error.message}`)
  const rows = z.array(metricRowSchema).parse(data ?? [])
  const briers = rows.flatMap((row) => row.brier === null ? [] : [row.brier])
  return { meanBrier: mean(briers), days: briers.length }
}

async function loadActualInput(asOfDate: string): Promise<RollbackGateInput> {
  const { supabaseAdmin } = await import('../shared/supabase-admin')
  const championResult = await supabaseAdmin
    .from('model_registry')
    .select('model_version')
    .eq('status', 'champion')
    .maybeSingle()
  if (championResult.error) throw new Error(`champion model 로딩 실패: ${championResult.error.message}`)
  const champion = modelRowSchema.parse(championResult.data)

  const previousResult = await supabaseAdmin
    .from('model_registry')
    .select('model_version')
    .in('status', ['archived', 'rolled_back'])
    .order('promoted_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (previousResult.error) throw new Error(`previous model 로딩 실패: ${previousResult.error.message}`)
  const previous = previousResult.data === null ? null : modelRowSchema.parse(previousResult.data)
  const sinceDate = dateDaysAgo(asOfDate, ROLLBACK_LIMITS.rollingWindowDays)
  const championMetrics = await loadMetricMean({
    modelVersion: champion.model_version,
    sinceDate,
    asOfDate,
  })
  const previousMetrics = previous
    ? await loadMetricMean({ modelVersion: previous.model_version, sinceDate, asOfDate })
    : { meanBrier: null, days: 0 }

  return rollbackGateInputSchema.parse({
    championModelVersion: champion.model_version,
    previousModelVersion: previous?.model_version ?? null,
    championMeanBrier: championMetrics.meanBrier,
    previousMeanBrier: previousMetrics.meanBrier,
    championMetricDays: championMetrics.days,
    previousMetricDays: previousMetrics.days,
  })
}

async function main(): Promise<void> {
  const dryRun = readBooleanArg('dry-run', false)
  const scenario = scenarioSchema.parse(readArg('scenario', 'rollback'))
  const jsonOutput = readArg('json-output')
  const asOfDate = readArg('as-of', new Date().toISOString().slice(0, 10)) ?? new Date().toISOString().slice(0, 10)
  const inputPath = readArg('input')
  const gateInput = inputPath
    ? rollbackGateInputSchema.parse(readJson(inputPath))
    : dryRun
      ? dryRunInput(scenario)
      : await loadActualInput(asOfDate)
  const gate = evaluateRollbackGate(gateInput)

  const payload = gate.shouldRollback && dryRun
    ? { step: 'rollback-check', dryRun, action: 'would_rollback', gateInput, gate }
    : gate.shouldRollback
      ? {
          step: 'rollback-check',
          dryRun,
          action: 'rolled_back',
          gateInput,
          gate,
          result: await (await import('./model-registry')).rollbackModelRegistryVersion(gateInput.previousModelVersion ?? ''),
        }
      : { step: 'rollback-check', dryRun, action: 'keep_champion', gateInput, gate }

  if (jsonOutput) writeJson(jsonOutput, payload)
  console.log(JSON.stringify(payload))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
