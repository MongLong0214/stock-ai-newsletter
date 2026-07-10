import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BaselineFeatureRow } from '../../../lib/tli/model/baselines'
import { createWalkForwardFolds, type EvalPredictionRow } from '../../../lib/tli/eval/harness'
import type { M1ModelArtifact } from '../../../lib/tli/model/m1'
import { spawnM1Training } from './m1-runtime'
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
import { scientificBaselineStudyLockSchema } from './offline-eval-study-lock'
import { runScientificM1OfflineEvaluation } from './run-scientific-m1-eval'
import {
  isScientificM1Envelope,
  parseScientificM1Envelope,
} from './scientific-m1-offline-input'
import { renderScientificM1OfflineMarkdown } from './scientific-m1-report'

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET ?? 'true'

interface FeatureEvalRow extends BaselineFeatureRow {
  readonly id: string
}

const DEFAULT_JSON_OUTPUT = '.omo/evidence/tli-v3-t205-offline-eval.json'
const DEFAULT_MARKDOWN_OUTPUT = '.omo/evidence/tli-v3-t205-offline-eval.md'
const DEFAULT_WORK_DIR = '.omo/evidence/tli-v3-t205-m1-folds'
const DEFAULT_PARITY_OUTPUT = '.omo/evidence/tli-v3-scientific-rebuild/task-11-ts/python-ts-parity-golden.json'

const HELP = `Usage: npm run tli:eval -- [options]

Scientific study input:
  --input=<path>             strict JSON object with the sole key "scientificM1"
  --study-lock=<path>        externally frozen study ID/SHA/schedule lock
  --json-output=<path>       JSON evaluation report
  --markdown-output=<path>   Markdown summary
  --parity-output=<path>     Python/TypeScript parity golden
  --work-dir=<path>          deterministic training and bridge workspace
  --trained-at=<date>        frozen artifact training date

Legacy input/DB mode also accepts --start, --end, and --labeler-version.
`

const readArg = (name: string, fallback: string | null = null): string | null => {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

const ensureParentDir = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true })
}

const loadInputFile = (inputPath: string): unknown => {
  const parsed: unknown = JSON.parse(readFileSync(inputPath, 'utf8'))
  return parsed
}

const loadStudyLockFile = (path: string) => {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  return scientificBaselineStudyLockSchema.parse(parsed)
}

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
  const result = spawnM1Training(['--trained-at', input.trainedAt, datasetPath, artifactPath])
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
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(HELP)
    return
  }
  const inputPath = readArg('input')
  const rawInput = inputPath ? loadInputFile(inputPath) : null
  const jsonOutput = readArg('json-output', DEFAULT_JSON_OUTPUT) ?? DEFAULT_JSON_OUTPUT
  const markdownOutput = readArg('markdown-output', DEFAULT_MARKDOWN_OUTPUT) ?? DEFAULT_MARKDOWN_OUTPUT
  const workDir = readArg('work-dir', DEFAULT_WORK_DIR) ?? DEFAULT_WORK_DIR
  const studyLockPath = readArg('study-lock')
  if (studyLockPath === null) throw new Error('offline evaluation requires --study-lock=<trusted-lock.json>')
  const studyLock = loadStudyLockFile(studyLockPath)

  if (rawInput !== null && isScientificM1Envelope(rawInput)) {
    if (readArg('start') !== null || readArg('end') !== null || readArg('labeler-version') !== null) {
      throw new Error('scientificM1 input forbids start/end/labeler overrides')
    }
    const study = parseScientificM1Envelope(rawInput)
    const trainedAt = readArg('trained-at', study.dataset.manifest.max_base_date)
    if (trainedAt === null) throw new Error('scientificM1 input has no frozen trained-at date')
    const parityOutput = readArg('parity-output', DEFAULT_PARITY_OUTPUT) ?? DEFAULT_PARITY_OUTPUT
    const evaluated = runScientificM1OfflineEvaluation({ study, studyLock, workDir, trainedAt })
    ensureParentDir(jsonOutput)
    ensureParentDir(markdownOutput)
    ensureParentDir(parityOutput)
    writeFileSync(jsonOutput, `${JSON.stringify(evaluated.report, null, 2)}\n`)
    writeFileSync(markdownOutput, `${renderScientificM1OfflineMarkdown(evaluated.report)}\n`)
    writeFileSync(parityOutput, evaluated.parityGoldenBytes)
    console.log(JSON.stringify({
      reportVersion: evaluated.report.reportVersion,
      jsonOutput,
      markdownOutput,
      parityOutput,
      parityGoldenSha256: evaluated.parityGoldenSha256,
      studyContractId: evaluated.report.study.studyContractId,
      studyContractSha256: evaluated.report.study.studyContractSha256,
      outerFolds: evaluated.report.outerFoldCount,
      predictions: evaluated.report.predictions.length,
      positiveSkill: evaluated.report.promotionDecision.positiveSkill,
    }))
    return
  }

  const inputFile = rawInput as OfflineEvalInput | null
  const dataBounds = inputFile ? resolveEvalInputDateBounds(inputFile) : await loadDbDateBounds()
  const { startDate, endDate } = resolveEvalWindow({
    startArg: readArg('start'),
    endArg: readArg('end'),
    ...dataBounds,
  })
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
  const report = buildOfflineEvalReport({ ...input, m1Predictions, m1TrainingFailures }, studyLock)

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
