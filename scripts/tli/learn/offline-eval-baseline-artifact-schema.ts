import { jeffreysProbability } from '../../../lib/tli/model/baselines'
import { z } from 'zod'

export const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const countSchema = z.number().int().nonnegative()
const probabilitySchema = z.number().gt(0).lt(1)

const stratumFitSchema = <S extends string>(stratum: S) => z.object({
  stratum: z.literal(stratum),
  trainRowCount: countSchema,
  trainPositiveCount: countSchema,
  probability: probabilitySchema,
  usedGlobalFallback: z.boolean(),
}).strict()

export const primaryArtifactSchema = z.object({
  baselineId: z.literal('babl-strata-v1'),
  role: z.literal('primary'),
  studyContractId: z.string().min(1),
  studyContractSha256: sha256Schema,
  trainRowCount: countSchema,
  trainPositiveCount: countSchema,
  globalFallbackProbability: probabilitySchema,
  strata: z.object({
    rising: stratumFitSchema('rising'),
    cooling: stratumFitSchema('cooling'),
    other: stratumFitSchema('other'),
    missing: stratumFitSchema('missing'),
  }).strict(),
  artifactSha256: sha256Schema,
}).strict().superRefine((artifact, context) => {
  const strata = Object.values(artifact.strata)
  const trainRowCount = strata.reduce((sum, fit) => sum + fit.trainRowCount, 0)
  const trainPositiveCount = strata.reduce((sum, fit) => sum + fit.trainPositiveCount, 0)
  if (trainRowCount !== artifact.trainRowCount || trainPositiveCount !== artifact.trainPositiveCount) {
    context.addIssue({ code: 'custom', path: ['strata'], message: 'strata counts do not match artifact totals' })
  }
  if (artifact.trainPositiveCount > artifact.trainRowCount) {
    context.addIssue({ code: 'custom', path: ['trainPositiveCount'], message: 'positive count exceeds row count' })
    return
  }
  const expectedGlobal = jeffreysProbability(artifact.trainPositiveCount, artifact.trainRowCount)
  if (artifact.globalFallbackProbability !== expectedGlobal) {
    context.addIssue({ code: 'custom', path: ['globalFallbackProbability'], message: 'invalid global Jeffreys probability' })
  }
  strata.forEach((fit) => {
    if (fit.trainPositiveCount > fit.trainRowCount) {
      context.addIssue({ code: 'custom', path: ['strata', fit.stratum], message: 'positive count exceeds row count' })
      return
    }
    const usesFallback = fit.trainRowCount === 0
    const expectedProbability = usesFallback
      ? expectedGlobal
      : jeffreysProbability(fit.trainPositiveCount, fit.trainRowCount)
    if (fit.usedGlobalFallback !== usesFallback) {
      context.addIssue({ code: 'custom', path: ['strata', fit.stratum], message: 'invalid stratum counts or fallback' })
    }
    if (fit.probability !== expectedProbability) {
      context.addIssue({ code: 'custom', path: ['strata', fit.stratum, 'probability'], message: 'invalid stratum Jeffreys probability' })
    }
  })
})
