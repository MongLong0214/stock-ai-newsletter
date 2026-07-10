import type { ConfirmatoryFeatureInput } from '../../../lib/tli/features/build-confirmatory-features'
import {
  loadConfirmatoryDataset,
  type LoadedDataset,
} from '../learn/dataset-manifest'
import {
  buildFixtureFeatureInput,
  buildFixtureOutcome,
  type FixtureSignalMode,
} from './fixture-features'
import { STUDY_CONTRACT_ID, THEME_IDS } from './fixture-identities'
import { buildFixtureDatasetSource, buildFixtureLabelSet } from './fixture-labels'
import type { FixtureOriginRef, FixtureOriginStack } from './fixture-origins'

export type { FixtureSignalMode } from './fixture-features'

export interface TrainingFixtureData {
  readonly dataset: LoadedDataset
  readonly repeatedDataset: LoadedDataset
  readonly featureInputs: readonly ConfirmatoryFeatureInput[]
  readonly expectedRows: number
  readonly missingRows: number
  readonly exactFiveRows: number
  readonly cutoff: string
}

const timestamp = (date: string, hour: string): string => `${date}T${hour}:00:00.000Z`

export async function buildTrainingFixtureData(input: {
  readonly stack: FixtureOriginStack
  readonly mode: FixtureSignalMode
  readonly omitSourceCompletion: boolean
}): Promise<TrainingFixtureData> {
  const labels = buildFixtureLabelSet(input.stack)
  if (input.omitSourceCompletion) {
    const omitted = labels.rows.at(0)?.label_source_run_id
    if (omitted !== null && omitted !== undefined) labels.completions.delete(omitted)
  }
  const lastFuture = labels.rows.flatMap((row) => row.future_dates ?? []).sort().at(-1)
  if (lastFuture === undefined) throw new Error('fixture produced no gta-v2 future dates')
  const cutoff = timestamp(lastFuture, '12')
  const source = buildFixtureDatasetSource({ stack: input.stack, labels })
  const request = { studyContractId: STUDY_CONTRACT_ID, asOfCutoff: cutoff }
  const dataset = await loadConfirmatoryDataset(request, source)
  const repeatedDataset = await loadConfirmatoryDataset(request, source)
  return {
    dataset,
    repeatedDataset,
    featureInputs: input.stack.trainingOrigins.flatMap((origin) => (
      THEME_IDS.map((themeId) => buildFixtureFeatureInput({
        stack: input.stack,
        origin,
        themeId,
        mode: input.mode,
      }))
    )),
    expectedRows: labels.rows.length,
    missingRows: labels.rows.length - dataset.rows.length,
    exactFiveRows: dataset.rows.filter((row) => (
      row.pastDates.length === 5 && row.futureDates.length === 5
    )).length,
    cutoff,
  }
}

export function buildProspectiveFeatureInput(input: {
  readonly stack: FixtureOriginStack
  readonly origin: FixtureOriginRef
  readonly themeId: string
  readonly mode: FixtureSignalMode
}): ConfirmatoryFeatureInput {
  return buildFixtureFeatureInput(input)
}

export const buildProspectiveOutcome = (themeId: string): boolean => buildFixtureOutcome(themeId)
