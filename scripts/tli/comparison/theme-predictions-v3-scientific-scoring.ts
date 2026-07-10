import type {
  ScientificPredictionScoringPlan,
  ScientificScoreFinalizer,
  ScientificScoringExecutionResult,
} from './theme-predictions-v3-scientific-types'
import { buildScientificPredictionScoringPlan } from './theme-predictions-v3-scientific-preflight'
import {
  finalizeScientificScoreWithRpc,
  loadScientificPredictionScoringInput,
} from './theme-predictions-v3-scientific-db'

export { buildScientificPredictionScoringPlan, ScientificScoringContractError } from './theme-predictions-v3-scientific-preflight'
export type {
  ScientificCycleRow,
  ScientificEvidenceArtifactRow,
  ScientificEvidenceAttestationRow,
  ScientificForecastRow,
  ScientificIntervalEvidence,
  ScientificLabelRow,
  ScientificOriginRow,
  ScientificPredictionRole,
  ScientificPredictionRow,
  ScientificPredictionScoringInput,
  ScientificPredictionScoringPlan,
  ScientificScoreFinalization,
  ScientificScoreFinalizer,
  ScientificScoreRpcRequest,
  ScientificScoringExecutionResult,
  ScientificStudyOriginRow,
} from './theme-predictions-v3-scientific-types'

export class ScientificScoringPartialError extends Error {
  readonly name = 'ScientificScoringPartialError'

  constructor(
    readonly result: ScientificScoringExecutionResult,
    readonly failure: unknown,
  ) {
    super(`scientific scoring stopped after ${result.completedFinalizations}/${result.plannedFinalizations} finalizations`)
  }
}

export async function executeScientificPredictionScoringPlan(
  plan: ScientificPredictionScoringPlan,
  finalize: ScientificScoreFinalizer,
): Promise<ScientificScoringExecutionResult> {
  let completedFinalizations = 0
  for (const item of plan.finalizations) {
    try {
      await finalize({ canonicalJson: item.canonicalJson, payloadSha256: item.payloadSha256 })
      completedFinalizations++
    } catch (failure) {
      throw new ScientificScoringPartialError({
        status: 'partial',
        plannedFinalizations: plan.finalizations.length,
        completedFinalizations,
        failedPredictionId: item.predictionId,
      }, failure)
    }
  }
  return {
    status: 'complete',
    plannedFinalizations: plan.finalizations.length,
    completedFinalizations,
    failedPredictionId: null,
  }
}

export async function scoreScientificThemePredictionsV3(input: {
  readonly cycleId: string
  readonly originId: string
  readonly scoredAt?: string
}): Promise<ScientificScoringExecutionResult> {
  const scoringInput = await loadScientificPredictionScoringInput({
    cycleId: input.cycleId,
    originId: input.originId,
    scoredAt: input.scoredAt ?? new Date().toISOString(),
  })
  const plan = buildScientificPredictionScoringPlan(scoringInput)
  return executeScientificPredictionScoringPlan(plan, finalizeScientificScoreWithRpc)
}
