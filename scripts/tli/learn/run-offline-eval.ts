import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BaselineFeatureRow } from '../../../lib/tli/model/baselines'
import { createWalkForwardFolds, type EvalPredictionRow } from '../../../lib/tli/eval/harness'
import type { M1ModelArtifact } from '../../../lib/tli/model/m1'
import {
  buildM1Predictions,
  buildM1TrainingDatasetDump,
  buildOfflineEvalReport,
  renderOfflineEvalMarkdown,
  type M1TrainingFailure,
  type OfflineEvalInput,
} from './offline-eval'
import {
  resolveEvalInputDateBounds,
  resolveEvalWindow,
  type EvalDataDateBounds,
} from './offline-eval-window'

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET ?? 'true'

interface FeatureEvalRow extends BaselineFeatureRow {
  readonly id: string
}

const DEFAULT_JSON_OUTPUT = '.omo/evidence/tli-v3-t205-offline-eval.json'
const DEFAULT_MARKDOWN_OUTPUT = '.omo/evidence/tli-v3-t205-offline-eval.md'
const DEFAULT_WORK_DIR = '.omo/evidence/tli-v3-t205-m1-folds'

const readArg = (name: string, fallback: string | null = null): string | null => {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

const ensureParentDir = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true })
}

const loadInputFile = (inputPath: string): OfflineEvalInput => (
  JSON.parse(readFileSync(inputPath, 'utf8')) as OfflineEvalInput
)

const loadDbDateBounds = async (): Promise<EvalDataDateBounds> => {
  const { loadOfflineEvalDateBounds } = await import('./offline-eval-data')
  return loadOfflineEvalDateBounds()
}

const loadDbInput = async (startDate: string, endDate: string): Promise<OfflineEvalInput> => {
  const { loadOfflineEvalInput } = await import('./offline-eval-data')
  return loadOfflineEvalInput(startDate, endDate)
}

const toFeatureEvalRows = (rows: readonly BaselineFeatureRow[]): FeatureEvalRow[] => (
  rows.map((row) => ({
    ...row,
    id: `${row.themeId}|${row.baseDate}`,
  }))
)

const trainFoldArtifact = (input: {
  readonly foldId: string
  readonly trainRows: readonly BaselineFeatureRow[]
  readonly workDir: string
  readonly labelerVersion: string
  readonly trainedAt: string
}): M1ModelArtifact => {
  const foldDir = join(input.workDir, input.foldId)
  mkdirSync(foldDir, { recursive: true })
  const datasetPath = join(foldDir, 'training.json')
  const artifactPath = join(foldDir, 'artifact.json')
  writeFileSync(datasetPath, JSON.stringify(buildM1TrainingDatasetDump({
    rows: input.trainRows,
    labelerVersion: input.labelerVersion,
  }), null, 2))
  const result = spawnSync('uv', [
    'run',
    'scripts/tli/learn/train_m1.py',
    '--trained-at',
    input.trainedAt,
    datasetPath,
    artifactPath,
  ], { cwd: process.cwd(), encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`M1 fold training failed for ${input.foldId}: ${result.stderr || result.stdout}`)
  }
  return JSON.parse(readFileSync(artifactPath, 'utf8')) as M1ModelArtifact
}

const nullM1Predictions = (rows: readonly FeatureEvalRow[]): EvalPredictionRow[] => (
  rows.map((row) => ({
    id: row.id,
    themeId: row.themeId,
    baseDate: row.baseDate,
    probability: null,
    y: row.y,
  }))
)

const buildWalkForwardM1Predictions = (input: {
  readonly featureRows: readonly BaselineFeatureRow[]
  readonly labels: OfflineEvalInput['labels']
  readonly workDir: string
  readonly labelerVersion: string
  readonly trainedAt: string
}): { readonly predictions: readonly EvalPredictionRow[]; readonly failures: readonly M1TrainingFailure[] } => {
  const folds = createWalkForwardFolds(toFeatureEvalRows(input.featureRows))
  const failures: M1TrainingFailure[] = []
  const predictions = folds.flatMap((fold) => {
    try {
      const artifact = trainFoldArtifact({
        foldId: fold.foldId,
        trainRows: fold.train,
        workDir: input.workDir,
        labelerVersion: input.labelerVersion,
        trainedAt: input.trainedAt,
      })
      return buildM1Predictions(fold.test, artifact, input.labels)
    } catch (error) {
      failures.push({
        foldId: fold.foldId,
        reason: error instanceof Error ? error.message : String(error),
        trainRows: fold.train.length,
        testRows: fold.test.length,
      })
      return nullM1Predictions(fold.test)
    }
  })
  return { predictions, failures }
}

async function main(): Promise<void> {
  const inputPath = readArg('input')
  const inputFile = inputPath ? loadInputFile(inputPath) : null
  const dataBounds = inputFile ? resolveEvalInputDateBounds(inputFile) : await loadDbDateBounds()
  const { startDate, endDate } = resolveEvalWindow({
    startArg: readArg('start'),
    endArg: readArg('end'),
    ...dataBounds,
  })
  const jsonOutput = readArg('json-output', DEFAULT_JSON_OUTPUT) ?? DEFAULT_JSON_OUTPUT
  const markdownOutput = readArg('markdown-output', DEFAULT_MARKDOWN_OUTPUT) ?? DEFAULT_MARKDOWN_OUTPUT
  const workDir = readArg('work-dir', DEFAULT_WORK_DIR) ?? DEFAULT_WORK_DIR
  const labelerVersion = readArg('labeler-version', 'gta-v1') ?? 'gta-v1'
  const trainedAt = readArg('trained-at', endDate) ?? endDate
  const input = inputFile ? { ...inputFile, startDate, endDate } : await loadDbInput(startDate, endDate)
  const generated = input.m1Predictions ? null : buildWalkForwardM1Predictions({
    featureRows: input.featureRows,
    labels: input.labels,
    workDir,
    labelerVersion,
    trainedAt,
  })
  const m1Predictions = input.m1Predictions ?? generated?.predictions ?? []
  const m1TrainingFailures = input.m1TrainingFailures ?? generated?.failures ?? []
  const report = buildOfflineEvalReport({ ...input, m1Predictions, m1TrainingFailures })

  ensureParentDir(jsonOutput)
  ensureParentDir(markdownOutput)
  writeFileSync(jsonOutput, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(markdownOutput, `${renderOfflineEvalMarkdown(report)}\n`)
  console.log(JSON.stringify({
    reportVersion: report.reportVersion,
    jsonOutput,
    markdownOutput,
    models: Object.fromEntries(Object.entries(report.models).map(([name, summary]) => [name, summary.raw.brier])),
    censoredRate: report.labelStatus.censoredRate,
    folds: report.folds.length,
    m1TrainingFailures: report.m1TrainingFailures.length,
  }))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
