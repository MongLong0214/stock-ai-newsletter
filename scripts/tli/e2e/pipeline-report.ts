import {
  skippedStage,
  type DryRunStage,
} from './contracts'

const STAGE_ORDER = [
  'study_lock',
  'scratch_postgres',
  'origins',
  'gta_v2',
  'dataset',
  'features',
  'train_evaluate',
  'cycle_freeze',
  'predict',
  'label_score',
  'gate',
  'cleanup',
] as const

export const CONTRACT_DEFECTS = [
  'The committed migration-051 rehearsal expects an identical collection payload to raise SQLSTATE 23505, but migration 050 and the collector contract require each call to append a separate immutable run. This Todo 15 rehearsal preserves the deployed append contract and reports the historical rehearsal mismatch instead of changing the database contract.',
  'A literal uninterrupted 26-origin weekly cohort leaves only 12 available origins in the first outer fit after the gta-v2 future-window purge, below the frozen five-fold inner-OOF floor. The fixture predeclares one embargo week immediately before the first outer test without using outcomes.',
] as const

export const DRY_RUN_RISKS = [
  'Prospective efficacy here is synthetic engineering evidence only; it is not a price, alpha, causal, or public prediction claim.',
  'Row-level prediction intervals are replayed from the frozen 500-model estimator/calibrator bodies persisted at cycle freeze (block_bootstrap_envelope_v1); a stored envelope that does not byte-match the replay is rejected, so no substitute interval is admitted.',
] as const

export const completedStages = (stages: readonly DryRunStage[]): DryRunStage[] => {
  const byName = new Map(stages.map((stage) => [stage.name, stage]))
  return STAGE_ORDER.map((name) => byName.get(name) ?? skippedStage(name))
}
