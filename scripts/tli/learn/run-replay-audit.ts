import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { buildFeatureVector } from '../../../lib/tli/features/build-features'
import type { M1ModelArtifact } from '../../../lib/tli/model/m1'
import { parseM1ModelArtifact } from '../../../lib/tli/model/predict'
import { getKoreanTradingDatesBetween } from '../../../lib/tli/trading-calendar'
import {
  TLI_V3_HORIZON_DAYS,
  TLI_V3_LABELER_VERSION,
  TLI_V3_M1_PARAM_VERSION,
  buildBaselinePredictionV3Row,
  buildM1PredictionV3Row,
  parsePredictionPhase,
} from '../comparison/theme-predictions-v3-records'
import { loadFeatureInputsForBaseDate } from '../features/load-feature-inputs'
import { supabaseAdmin } from '../shared/supabase-admin'
import { buildM1TrainingDatasetDump } from './offline-eval'
import { loadOfflineEvalInput } from './offline-eval-data'
import {
  REPLAY_AUDIT_REPLAY_END,
  REPLAY_AUDIT_REPLAY_START,
  REPLAY_AUDIT_TRAIN_END,
  REPLAY_AUDIT_TRAIN_START,
  buildReplayAuditReport,
  joinReplayRowsWithFinalLabels,
  renderReplayAuditMarkdown,
  type ReplayAuditLabelRow,
  type ReplayAuditLabelStatus,
  type ReplayAuditPredictionRow,
} from './replay-audit'

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET ?? 'true'

interface QueryError {
  readonly message: string
}

interface RangeQuery<T> {
  range(from: number, to: number): PromiseLike<{
    readonly data: readonly T[] | null
    readonly error: QueryError | null
  }>
}

interface PredictionSnapshotReplayRow {
  readonly theme_id: string
  readonly snapshot_date: string
  readonly phase: string
}

interface ThemeLabelReplayRow {
  readonly theme_id: string
  readonly base_date: string
  readonly label_status: string
  readonly y_binary: boolean | null
}

interface TrainedArtifactResult {
  readonly artifact: M1ModelArtifact
  readonly datasetPath: string
  readonly artifactPath: string
}

const DEFAULT_JSON_OUTPUT = 'docs/evidence/tli-v3-replay-audit-2026-07-07.json'
const DEFAULT_MARKDOWN_OUTPUT = 'docs/evidence/tli-v3-replay-audit-2026-07-07.md'
const DEFAULT_WORK_DIR = '.omo/replay-audit'
const PAGE_SIZE = 1000

const readArg = (name: string, fallback: string | null = null): string | null => {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

const ensureParentDir = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true })
}

const writeJson = (path: string, payload: unknown): void => {
  ensureParentDir(path)
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`)
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

const fetchAllRows = async <T>(createQuery: () => RangeQuery<T>): Promise<T[]> => {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await createQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

const parseLabelStatus = (value: string): ReplayAuditLabelStatus => {
  switch (value) {
    case 'pending':
    case 'final':
    case 'censored':
    case 'excluded':
      return value
    default:
      throw new Error(`unexpected GT-A label_status: ${value}`)
  }
}

const trainCutoffArtifact = async (input: {
  readonly trainEnd: string
  readonly workDir: string
}): Promise<TrainedArtifactResult> => {
  mkdirSync(input.workDir, { recursive: true })
  const datasetPath = join(input.workDir, 'training.json')
  const artifactPath = join(input.workDir, 'artifact.json')
  const evalInput = await loadOfflineEvalInput(REPLAY_AUDIT_TRAIN_START, input.trainEnd)
  writeJson(datasetPath, buildM1TrainingDatasetDump({
    rows: evalInput.featureRows,
    labelerVersion: TLI_V3_LABELER_VERSION,
  }))
  const result = spawnSync('python', [
    'scripts/tli/learn/train_m1.py',
    '--trained-at',
    input.trainEnd,
    datasetPath,
    artifactPath,
  ], { cwd: process.cwd(), encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`M1 replay cutoff training failed: ${result.stderr || result.stdout}`)
  }
  return {
    artifact: parseM1ModelArtifact(readJson(artifactPath)),
    datasetPath,
    artifactPath,
  }
}

const loadReplaySnapshots = async (input: {
  readonly replayStart: string
  readonly replayEnd: string
  readonly tradingDays: readonly string[]
}): Promise<PredictionSnapshotReplayRow[]> => {
  const tradingDaySet = new Set(input.tradingDays)
  const rows = await fetchAllRows<PredictionSnapshotReplayRow>(() => supabaseAdmin
    .from('prediction_snapshots_v2')
    .select('theme_id, snapshot_date, phase')
    .eq('run_type', 'prod')
    .eq('evaluation_horizon_days', TLI_V3_HORIZON_DAYS)
    .gte('snapshot_date', input.replayStart)
    .lte('snapshot_date', input.replayEnd)
    .order('snapshot_date', { ascending: true }))
  return rows.filter((row) => tradingDaySet.has(row.snapshot_date))
}

const loadReplayLabels = async (input: {
  readonly replayStart: string
  readonly replayEnd: string
}): Promise<ReplayAuditLabelRow[]> => {
  const rows = await fetchAllRows<ThemeLabelReplayRow>(() => supabaseAdmin
    .from('theme_labels')
    .select('theme_id, base_date, label_status, y_binary')
    .eq('label_type', 'gt_a')
    .eq('horizon_days', TLI_V3_HORIZON_DAYS)
    .eq('labeler_version', TLI_V3_LABELER_VERSION)
    .gte('base_date', input.replayStart)
    .lte('base_date', input.replayEnd)
    .order('base_date', { ascending: true }))
  return rows.map((row) => ({
    themeId: row.theme_id,
    baseDate: row.base_date,
    labelStatus: parseLabelStatus(row.label_status),
    yBinary: row.y_binary,
  }))
}

const scoreReplayRows = async (input: {
  readonly snapshots: readonly PredictionSnapshotReplayRow[]
  readonly artifact: M1ModelArtifact
  readonly trainEnd: string
}): Promise<ReplayAuditPredictionRow[]> => {
  const rows: ReplayAuditPredictionRow[] = []
  for (const snapshot of input.snapshots) {
    const featureInputs = await loadFeatureInputsForBaseDate({
      themeId: snapshot.theme_id,
      baseDate: snapshot.snapshot_date,
    })
    const featureVector = buildFeatureVector(featureInputs)
    const m1 = buildM1PredictionV3Row({
      themeId: snapshot.theme_id,
      predictionDate: snapshot.snapshot_date,
      featureVector,
      artifact: input.artifact,
      modelVersion: `m1-replay-${input.trainEnd}`,
      paramVersion: TLI_V3_M1_PARAM_VERSION,
      servingRole: 'shadow',
    })
    const bAbl = buildBaselinePredictionV3Row({
      themeId: snapshot.theme_id,
      predictionDate: snapshot.snapshot_date,
      prediction: { phase: parsePredictionPhase(snapshot.phase) },
      featureVector,
      servingRole: 'champion',
    })
    rows.push({
      themeId: snapshot.theme_id,
      baseDate: snapshot.snapshot_date,
      pRiseM1: m1.pRise,
      pRiseBAbl: bAbl.pRise,
    })
  }
  return rows
}

async function main(): Promise<void> {
  const trainEnd = readArg('train-end', REPLAY_AUDIT_TRAIN_END) ?? REPLAY_AUDIT_TRAIN_END
  const replayStart = readArg('replay-start', REPLAY_AUDIT_REPLAY_START) ?? REPLAY_AUDIT_REPLAY_START
  const replayEnd = readArg('replay-end', REPLAY_AUDIT_REPLAY_END) ?? REPLAY_AUDIT_REPLAY_END
  const jsonOutput = readArg('json-output', DEFAULT_JSON_OUTPUT) ?? DEFAULT_JSON_OUTPUT
  const markdownOutput = readArg('markdown-output', DEFAULT_MARKDOWN_OUTPUT) ?? DEFAULT_MARKDOWN_OUTPUT
  const workDir = readArg('work-dir', DEFAULT_WORK_DIR) ?? DEFAULT_WORK_DIR
  const tradingDays = getKoreanTradingDatesBetween({ startDate: replayStart, endDate: replayEnd })
  const [trained, snapshots, labels] = await Promise.all([
    trainCutoffArtifact({ trainEnd, workDir }),
    loadReplaySnapshots({ replayStart, replayEnd, tradingDays }),
    loadReplayLabels({ replayStart, replayEnd }),
  ])
  const predictionRows = await scoreReplayRows({ snapshots, artifact: trained.artifact, trainEnd })
  const joined = joinReplayRowsWithFinalLabels({ predictionRows, labelRows: labels })
  const report = buildReplayAuditReport({
    trainEnd,
    replayStart,
    replayEnd,
    tradingDays,
    scoredRows: joined.rows,
    excludedRows: joined.excludedRows,
  })

  writeJson(jsonOutput, report)
  ensureParentDir(markdownOutput)
  writeFileSync(markdownOutput, `${renderReplayAuditMarkdown(report)}\n`)
  console.log(JSON.stringify({
    reportVersion: report.reportVersion,
    trainEnd,
    replayStart,
    replayEnd,
    scoredRows: report.scoredRows,
    excludedRows: report.excludedRows,
    tradingDays: report.tradingDays.length,
    verdict: report.verdict,
    jsonOutput,
    markdownOutput,
    datasetPath: trained.datasetPath,
    artifactPath: trained.artifactPath,
    metrics: {
      m1Brier: report.metrics.m1.brier,
      bAblBrier: report.metrics.bAbl.brier,
      m1Ece: report.metrics.m1.ece,
      m1Ic: report.metrics.m1.ic,
    },
  }))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
