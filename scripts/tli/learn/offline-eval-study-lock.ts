import { canonicalJsonV1Sha256 } from '../../../lib/tli/canonical-json-v1'
import type { StudyOrigin } from '../../../lib/tli/eval/types'
import { z } from 'zod'

export interface ScientificBaselineStudyLock {
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly studyOriginScheduleSha256: string
}

export const scientificBaselineStudyLockSchema: z.ZodType<ScientificBaselineStudyLock> = z.object({
  studyContractId: z.string().min(1),
  studyContractSha256: z.string().regex(/^[0-9a-f]{64}$/),
  studyOriginScheduleSha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

export const computeStudyOriginScheduleSha256 = (input: {
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly studyOriginSchedule: readonly StudyOrigin[]
}): string => canonicalJsonV1Sha256({
  kind: 'scientific-study-origin-schedule-v1',
  studyContractId: input.studyContractId,
  studyContractSha256: input.studyContractSha256,
  studyOriginSchedule: input.studyOriginSchedule.map((origin) => ({
    originDate: origin.originDate,
    forecastCutoff: origin.forecastCutoff,
  })),
})
