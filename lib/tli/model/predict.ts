import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { FEATURE_NAMES } from '@/lib/tli/features/build-features'
import { predictM1Probability } from '@/lib/tli/model/m1'
import type { M1FeatureRow, M1ModelArtifact } from '@/lib/tli/model/m1'

const numberArraySchema = z.array(z.number())

const plattCalibratorSchema = z.object({
  type: z.literal('platt'),
  a: z.number(),
  b: z.number(),
})

const betaCalibratorSchema = z.object({
  type: z.literal('beta'),
  a: z.number(),
  b: z.number(),
  c: z.number(),
})

const isotonicCalibratorSchema = z.object({
  type: z.literal('isotonic'),
  thresholds: numberArraySchema.min(1),
  values: numberArraySchema.min(1),
}).superRefine((calibrator, context) => {
  if (calibrator.thresholds.length !== calibrator.values.length) {
    context.addIssue({
      code: 'custom',
      path: ['values'],
      message: 'M1 isotonic calibrator thresholds and values length mismatch',
    })
  }
  for (let index = 1; index < calibrator.thresholds.length; index++) {
    const previous = calibrator.thresholds[index - 1]
    const current = calibrator.thresholds[index]
    if (previous === undefined || current === undefined || current <= previous) {
      context.addIssue({
        code: 'custom',
        path: ['thresholds', index],
        message: 'M1 isotonic calibrator thresholds must be strictly increasing',
      })
    }
  }
})

const calibratorSchema = z.discriminatedUnion('type', [
  plattCalibratorSchema,
  betaCalibratorSchema,
  isotonicCalibratorSchema,
])

export const M1ModelArtifactSchema = z.object({
  artifact_version: z.literal('tli-model-artifact-v1'),
  model_type: z.literal('m1_logistic'),
  feature_schema: z.array(z.string()),
  scaler: z.object({
    median: numberArraySchema,
    mad: numberArraySchema,
  }),
  coefficients: z.object({
    intercept: z.number(),
    weights: numberArraySchema,
  }),
  calibrator: calibratorSchema,
  trained_at: z.string(),
  train_range: z.tuple([z.string(), z.string()]),
  labeler_version: z.string(),
  seed: z.number(),
  sample_report: z.unknown(),
}).superRefine((artifact, context) => {
  if (artifact.feature_schema.length !== FEATURE_NAMES.length) {
    context.addIssue({
      code: 'custom',
      path: ['feature_schema'],
      message: 'M1 artifact feature schema length mismatch',
    })
  }
  for (let index = 0; index < FEATURE_NAMES.length; index++) {
    if (artifact.feature_schema[index] !== FEATURE_NAMES[index]) {
      context.addIssue({
        code: 'custom',
        path: ['feature_schema', index],
        message: `M1 artifact feature schema mismatch at index ${index}`,
      })
    }
  }
  if (
    artifact.scaler.median.length !== FEATURE_NAMES.length ||
    artifact.scaler.mad.length !== FEATURE_NAMES.length ||
    artifact.coefficients.weights.length !== FEATURE_NAMES.length * 2
  ) {
    context.addIssue({
      code: 'custom',
      path: ['coefficients', 'weights'],
      message: 'M1 artifact scaler or coefficient length mismatch',
    })
  }
})

export function parseM1ModelArtifact(value: unknown): M1ModelArtifact {
  return M1ModelArtifactSchema.parse(value)
}

export async function loadM1ArtifactFromJsonFile(path: string): Promise<M1ModelArtifact> {
  const content = await readFile(path, 'utf8')
  const parsed: unknown = JSON.parse(content)
  return parseM1ModelArtifact(parsed)
}

export function predictM1T1Probability(input: {
  readonly artifact: M1ModelArtifact
  readonly row: M1FeatureRow
}): number | null {
  return predictM1Probability(input.artifact, input.row)
}
