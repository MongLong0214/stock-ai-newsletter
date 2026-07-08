import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import { buildM1Predictions } from '../learn/offline-eval'
import { loadOfflineEvalDateBounds, loadOfflineEvalInput } from '../learn/offline-eval-data'
import { resolveEvalWindow } from '../learn/offline-eval-window'
import {
  buildM1CalibrationDiagnosticReport,
  renderM1CalibrationDiagnosticMarkdown,
} from './m1-calibration-diagnostic'
import { loadM1ArtifactFromJsonFile, parseM1ModelArtifact } from '../../../lib/tli/model/predict'
import type { M1ModelArtifact } from '../../../lib/tli/model/m1'

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET ?? 'true'

const DEFAULT_MODEL_VERSION = 'm1-2026w28'
const DEFAULT_JSON_OUTPUT = 'docs/evidence/tli-v3-m1-diagnostic-2026-07-07.json'
const DEFAULT_MARKDOWN_OUTPUT = 'docs/evidence/tli-v3-m1-diagnostic-2026-07-07.md'

const args = process.argv.slice(2)

const readArg = (name: string, fallback: string | null = null): string | null => {
  const prefix = `--${name}=`
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

const ensureParentDir = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true })
}

const writeJson = (path: string, payload: unknown): void => {
  ensureParentDir(path)
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`)
}

const writeText = (path: string, content: string): void => {
  ensureParentDir(path)
  writeFileSync(path, `${content}\n`)
}

const registryArtifactRowSchema = z.object({
  model_version: z.string().min(1),
  model_type: z.literal('m1_logistic'),
  coefficients: z.unknown(),
})

const loadRegistryArtifact = async (modelVersion: string): Promise<M1ModelArtifact | null> => {
  const { supabaseAdmin } = await import('../shared/supabase-admin')
  const { data, error } = await supabaseAdmin
    .from('model_registry')
    .select('model_version, model_type, coefficients')
    .eq('status', 'challenger')
    .eq('model_version', modelVersion)
    .maybeSingle()

  if (error) throw new Error(`model_registry challenger artifact load failed: ${error.message}`)
  const row = registryArtifactRowSchema.nullable().parse(data)
  return row === null ? null : parseM1ModelArtifact(row.coefficients)
}

const loadArtifact = async (input: {
  readonly modelVersion: string
  readonly artifactPath: string | null
}): Promise<{ readonly artifact: M1ModelArtifact; readonly source: string }> => {
  try {
    const registryArtifact = await loadRegistryArtifact(input.modelVersion)
    if (registryArtifact !== null) return { artifact: registryArtifact, source: `model_registry:${input.modelVersion}` }
  } catch (error) {
    if (input.artifactPath === null) throw error
    console.error(`model_registry artifact load failed; falling back to --artifact: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (input.artifactPath === null) {
    throw new Error(`model_registry challenger ${input.modelVersion} not found; pass --artifact=/path/to/artifact.json to use a local artifact`)
  }
  return {
    artifact: await loadM1ArtifactFromJsonFile(input.artifactPath),
    source: `artifact:${input.artifactPath}`,
  }
}

async function main(): Promise<void> {
  const dataBounds = await loadOfflineEvalDateBounds()
  const { startDate, endDate } = resolveEvalWindow({
    startArg: readArg('start'),
    endArg: readArg('end'),
    ...dataBounds,
  })
  const jsonOutput = readArg('json-output', DEFAULT_JSON_OUTPUT) ?? DEFAULT_JSON_OUTPUT
  const markdownOutput = readArg('markdown-output', DEFAULT_MARKDOWN_OUTPUT) ?? DEFAULT_MARKDOWN_OUTPUT
  const artifactPath = readArg('artifact')
  const modelVersion = readArg('model-version', DEFAULT_MODEL_VERSION) ?? DEFAULT_MODEL_VERSION
  const [{ artifact, source }, input] = await Promise.all([
    loadArtifact({ modelVersion, artifactPath }),
    loadOfflineEvalInput(startDate, endDate),
  ])
  const predictions = buildM1Predictions(input.featureRows, artifact)
  const report = buildM1CalibrationDiagnosticReport({
    startDate,
    endDate,
    generatedAt: new Date().toISOString(),
    predictions,
    featureRows: input.featureRows,
  })

  writeJson(jsonOutput, report)
  writeText(markdownOutput, renderM1CalibrationDiagnosticMarkdown(report))
  console.log(JSON.stringify({
    sampleLimitVerdict: report.sampleLimitVerdict,
    reliabilityVerdict: report.reliabilityVerdict,
    featureLivenessVerdict: report.featureLivenessVerdict,
    deadFeatureCount: report.featureLiveness.deadFeatureCount,
    artifactSource: source,
    scoredPredictionRows: report.scoredPredictionRows,
  }))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
