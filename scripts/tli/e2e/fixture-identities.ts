import { createHash } from 'node:crypto'

import { canonicalJsonV1Sha256 } from '../../../lib/tli/canonical-json'

export const STUDY_CONTRACT_ID = '20000000-0000-4000-8000-000000000015'
export const CYCLE_ID = 'abcdefab-0000-4000-8000-000000000015'
export const FEATURE_CONTRACT_VERSION = 'tli-attention-v2-f1' as const
export const FEATURE_CONTRACT_SHA256 = canonicalJsonV1Sha256({
  contract: FEATURE_CONTRACT_VERSION,
  fixture: 'todo-15',
})
export const LABEL_CONTRACT_SHA256 = canonicalJsonV1Sha256({
  labeler: 'gta-v2',
  horizon_days: 5,
  past_window: 5,
  future_window: 5,
})
export const COMPARATOR_ARTIFACT_SHA256 = canonicalJsonV1Sha256({
  comparator: 'frozen-balanced-climatology-v1',
  probability: 0.5,
})
export const THEME_SIGNALS = [-3, -2.5, -2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 2.5, 3] as const

export const sha256Identity = (kind: string, identity: string | number): string => (
  createHash('sha256').update(`${kind}:${String(identity)}`).digest('hex')
)

export const deterministicUuid = (kind: string, identity: string | number): string => {
  const hex = sha256Identity(kind, identity)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export const experimentOriginId = (cycleId: string, originDate: string): string => (
  deterministicUuid('experiment-origin', `${cycleId}:${originDate}`)
)

export const scientificPredictionId = (
  originId: string,
  themeId: string,
  role: 'candidate' | 'comparator',
): string => deterministicUuid('scientific-prediction', `${originId}:${themeId}:${role}`)

export const THEME_IDS = THEME_SIGNALS.map((_signal, index) => (
  deterministicUuid('theme', index)
))

export const signalForTheme = (themeId: string): number => {
  const index = THEME_IDS.indexOf(themeId)
  const signal = THEME_SIGNALS[index]
  if (signal === undefined) throw new RangeError(`unknown fixture theme ${themeId}`)
  return signal
}
