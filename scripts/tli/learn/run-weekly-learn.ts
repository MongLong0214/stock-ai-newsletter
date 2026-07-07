import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  evaluateTliPromotionGate,
  promotionGateInputSchema,
  promotionGateResultSchema,
  type PromotionGateInput,
} from './promotion-gate'

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET ?? 'true'

const stepSchema = z.enum([
  'checkpoint-check',
  'evaluate-challenger',
  'promote-or-keep',
  'train-new-challenger',
  'report',
])

const scenarioSchema = z.enum(['promote', 'reject'])

const gateEvaluationOutputSchema = z.object({
  step: z.literal('evaluate-challenger'),
  dryRun: z.boolean(),
  scenario: scenarioSchema.nullable(),
  candidateModelVersion: z.string().min(1),
  gate: promotionGateResultSchema,
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

const readJson = (path: string): unknown => {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  return parsed
}

const mockGateInput = (scenario: z.infer<typeof scenarioSchema>): PromotionGateInput => ({
  nEff: 320,
  cycleExtendedWeeks: 0,
  promotionsThisYear: 2,
  brierChampion: 0.20,
  deltaBrierPoint: scenario === 'promote' ? -0.006 : -0.002,
  deltaBrierUpper99: scenario === 'promote' ? -0.001 : -0.0005,
  ecePoint: 0.05,
  eceUpper95: 0.09,
  pAt10Challenger: 0.46,
  pAt10Champion: 0.48,
  clusterBalance: {
    topFivePercentLabelShare: 0.24,
    wildClusterBootstrapUsed: false,
  },
})

const todayIsoDate = (): string => new Date().toISOString().slice(0, 10)

/** H.3: model_registry.gate_result.last_evaluated_at 기준 체크포인트 판정 (dry-run은 DB 접근 없이 항상 due) */
const checkpointCheck = async () => {
  const dryRun = readBooleanArg('dry-run', false)
  const asOfDate = readArg('as-of', todayIsoDate()) ?? todayIsoDate()
  if (dryRun) {
    return {
      step: 'checkpoint-check',
      dryRun,
      asOfDate,
      lastEvaluatedAt: null,
      checkpointDue: true,
    }
  }
  const { isCheckpointDueSince, loadChampionLastEvaluatedAt } = await import('./gate-input-from-db')
  const lastEvaluatedAt = await loadChampionLastEvaluatedAt()
  return {
    step: 'checkpoint-check',
    dryRun,
    asOfDate,
    lastEvaluatedAt,
    checkpointDue: isCheckpointDueSince(lastEvaluatedAt, asOfDate),
  }
}

/** A3: --gate-input 파일은 dry-run/수동 오버라이드 전용. 기본은 DB(theme_predictions_v3 + model_registry)에서 직접 계산 */
const evaluateChallenger = async () => {
  const dryRun = readBooleanArg('dry-run', false)
  const inputPath = readArg('gate-input')
  const asOfDate = readArg('as-of', todayIsoDate()) ?? todayIsoDate()

  if (dryRun) {
    const scenario = scenarioSchema.parse(readArg('scenario', 'promote'))
    return {
      step: 'evaluate-challenger',
      dryRun,
      scenario,
      candidateModelVersion: readArg('candidate-model-version', `m1-dry-run-${scenario}`) ?? `m1-dry-run-${scenario}`,
      gate: evaluateTliPromotionGate(mockGateInput(scenario)),
    }
  }

  const gateInput = inputPath && existsSync(inputPath)
    ? promotionGateInputSchema.parse(readJson(inputPath))
    : await (async () => {
      const { buildPromotionGateInputFromDb } = await import('./gate-input-from-db')
      return buildPromotionGateInputFromDb({ asOfDate })
    })()

  const gate = evaluateTliPromotionGate(gateInput)
  const { recordChampionCheckpointEvaluation } = await import('./gate-input-from-db')
  await recordChampionCheckpointEvaluation(asOfDate)

  return {
    step: 'evaluate-challenger',
    dryRun,
    scenario: null,
    candidateModelVersion: readArg('candidate-model-version', 'm1-weekly-challenger') ?? 'm1-weekly-challenger',
    gate,
  }
}

const promoteOrKeep = async () => {
  const dryRun = readBooleanArg('dry-run', false)
  const gatePath = readArg('gate-result', 'tli-weekly-learn-gate.json') ?? 'tli-weekly-learn-gate.json'
  const evaluation = gateEvaluationOutputSchema.parse(readJson(gatePath))
  if (!evaluation.gate.passed) {
    return {
      step: 'promote-or-keep',
      action: 'keep_champion',
      dryRun,
      reason: evaluation.gate.reason,
    }
  }
  if (dryRun) {
    return {
      step: 'promote-or-keep',
      action: 'would_promote',
      dryRun,
      modelVersion: evaluation.candidateModelVersion,
    }
  }
  const { promoteModelRegistryVersion } = await import('./model-registry')
  return {
    step: 'promote-or-keep',
    action: 'promoted',
    dryRun,
    result: await promoteModelRegistryVersion(evaluation.candidateModelVersion),
  }
}

const trainNewChallenger = async () => {
  const dryRun = readBooleanArg('dry-run', false)
  const datasetPath = readArg('training-dataset')
  const artifactPath = readArg('artifact-output')
  if (!dryRun && (!datasetPath || !artifactPath)) {
    throw new Error('actual train-new-challenger requires --training-dataset and --artifact-output')
  }
  if (!dryRun && datasetPath && artifactPath) {
    if (!existsSync(datasetPath)) {
      // A3: 학습 데이터셋 파일이 없으면 offline-eval-data 로더로 직접 생성 (기존 dump 패턴 재사용)
      const trainStart = readArg('train-start', '2026-01-07') ?? '2026-01-07'
      const trainEnd = readArg('train-end', todayIsoDate()) ?? todayIsoDate()
      const labelerVersion = readArg('labeler-version', 'gta-v1') ?? 'gta-v1'
      const { loadOfflineEvalInput } = await import('./offline-eval-data')
      const { buildM1TrainingDatasetDump } = await import('./offline-eval')
      const evalInput = await loadOfflineEvalInput(trainStart, trainEnd)
      writeJson(datasetPath, buildM1TrainingDatasetDump({ rows: evalInput.featureRows, labelerVersion }))
    }
    ensureParentDir(artifactPath)
    const trainedAt = readArg('trained-at', new Date().toISOString().slice(0, 10)) ?? new Date().toISOString().slice(0, 10)
    const result = spawnSync('python', [
      'scripts/tli/learn/train_m1.py',
      '--trained-at',
      trainedAt,
      datasetPath,
      artifactPath,
    ], { cwd: process.cwd(), encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(`M1 challenger training failed: ${result.stderr || result.stdout}`)
    }

    // 학습 성공 시 아티팩트를 model_registry에 challenger로 등록 (A2 — 루프 배선)
    const { parseM1ModelArtifact } = await import('@/lib/tli/model/predict')
    const { buildIsoWeekModelVersion, registerModelRegistryChallenger } = await import('./model-registry')
    const artifact = parseM1ModelArtifact(readJson(artifactPath))
    const modelVersion = buildIsoWeekModelVersion(trainedAt)
    const registration = await registerModelRegistryChallenger({
      modelVersion,
      modelType: artifact.model_type,
      coefficients: artifact,
      trainRange: artifact.train_range,
      valMetrics: artifact.sample_report,
      gateResult: { status: 'pending' },
    })

    return {
      step: 'train-new-challenger',
      dryRun,
      action: 'trained_new_challenger',
      datasetPath,
      artifactPath,
      trainedAt,
      modelRegistry: registration,
    }
  }
  return {
    step: 'train-new-challenger',
    dryRun,
    action: dryRun ? 'would_train_new_challenger' : 'training_inputs_ready',
    datasetPath,
    artifactPath,
  }
}

const report = () => {
  const gatePath = readArg('gate-result', 'tli-weekly-learn-gate.json') ?? 'tli-weekly-learn-gate.json'
  const promotionPath = readArg('promotion-result', 'tli-weekly-learn-promotion.json') ?? 'tli-weekly-learn-promotion.json'
  const rollbackPath = readArg('rollback-result', 'tli-weekly-learn-rollback.json') ?? 'tli-weekly-learn-rollback.json'
  const gate = existsSync(gatePath) ? readJson(gatePath) : null
  const promotion = existsSync(promotionPath) ? readJson(promotionPath) : null
  const rollback = existsSync(rollbackPath) ? readJson(rollbackPath) : null
  const payload = { step: 'report', gate, promotion, rollback }
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) {
    appendFileSync(summaryPath, `## TLI Weekly Learn\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`)
  }
  return payload
}

async function main(): Promise<void> {
  const step = stepSchema.parse(readArg('step', 'evaluate-challenger'))
  const jsonOutput = readArg('json-output')
  const payload = step === 'checkpoint-check'
    ? await checkpointCheck()
    : step === 'evaluate-challenger'
      ? await evaluateChallenger()
      : step === 'promote-or-keep'
        ? await promoteOrKeep()
        : step === 'train-new-challenger'
          ? await trainNewChallenger()
          : report()

  if (jsonOutput) writeJson(jsonOutput, payload)
  console.log(JSON.stringify(payload))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
