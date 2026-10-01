import { OBSERVED_INPUT_NAMES, OBSERVED_INPUT_VERSION } from '@/scripts/stock-picks/observed-inputs'

export const UTILITY_SCORE_VERSION = 'utility-reference-smooth-v1'

export interface UtilityScoreNormalization {
  readonly version: typeof UTILITY_SCORE_VERSION
  readonly mean: number
  readonly standardDeviation: number
  readonly center: 50
  readonly oneStandardDeviationScore: 70
  readonly tailCurvature: 5.25
  readonly referencePanels: number
  readonly referenceRows: number
  readonly referenceThrough: string
  readonly referenceLastSignal: string
  readonly source: 'kis'
  readonly weighting: 'equal signal date, strict matured training rows'
  readonly fitInputSha256: string
}

export interface UtilityTreeNode {
  readonly isLeaf: boolean
  readonly value: number
  readonly featureIdx: number
  readonly numThreshold: number | 'Infinity' | '-Infinity'
  readonly missingGoLeft: boolean
  readonly left: number
  readonly right: number
}

export interface UtilityModelArtifact {
  readonly schemaVersion: 3
  readonly modelVersion: string
  readonly trainedLabelsThrough: string
  readonly observedInputVersion: string
  readonly featureNames: readonly string[]
  readonly baselinePrediction: number
  readonly normalization: UtilityScoreNormalization
  readonly trees: readonly (readonly UtilityTreeNode[])[]
}

const validDate = (value: string): boolean => (
  /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value
)

function validateNormalization(normalization: UtilityScoreNormalization): void {
  if (!normalization || normalization.version !== UTILITY_SCORE_VERSION
    || !Number.isFinite(normalization.mean) || normalization.mean < 0 || normalization.mean > 1
    || !Number.isFinite(normalization.standardDeviation)
    || normalization.standardDeviation <= 0 || normalization.standardDeviation > 0.5
    || normalization.center !== 50 || normalization.oneStandardDeviationScore !== 70
    || normalization.tailCurvature !== 5.25
    || !Number.isSafeInteger(normalization.referencePanels) || normalization.referencePanels <= 0
    || !Number.isSafeInteger(normalization.referenceRows) || normalization.referenceRows < normalization.referencePanels
    || !validDate(normalization.referenceThrough) || !validDate(normalization.referenceLastSignal)
    || normalization.referenceLastSignal >= normalization.referenceThrough
    || normalization.source !== 'kis'
    || normalization.weighting !== 'equal signal date, strict matured training rows'
    || !/^[a-f0-9]{64}$/.test(normalization.fitInputSha256)) {
    throw new Error('종합 점수 모델 표준화 계약 불일치')
  }
}

/** 학습 날짜를 동일 가중한 고정 기준 분포로 환산한다. 당일 후보 순위로 점수를 보정하지 않는다. */
export function normalizeUtilityScore(normalization: UtilityScoreNormalization, utility: number): number {
  validateNormalization(normalization)
  if (!Number.isFinite(utility)) throw new Error('종합 점수 추론 실패')
  const clippedUtility = Math.min(1, Math.max(0, utility))
  const delta = clippedUtility - normalization.mean
  // 5.25=(50/(70-50))²-1: 평균 50·+1σ 70을 유지하며 상단을 100점에 뭉개지 않는다.
  const standardized = normalization.center + normalization.center
    * delta / Math.hypot(delta, Math.sqrt(normalization.tailCurvature) * normalization.standardDeviation)
  if (!Number.isFinite(standardized)) throw new Error('종합 점수 추론 실패')
  return Math.floor(standardized + 0.5)
}

/** HGB 리프 값은 학습률이 이미 반영되어 있으며 결측 분기도 저장된 모델을 따른다. */
export function validateUtilityModel(model: UtilityModelArtifact): UtilityModelArtifact {
  if (model.schemaVersion !== 3 || model.modelVersion !== 'composite-utility-v3'
    || model.observedInputVersion !== OBSERVED_INPUT_VERSION
    || !validDate(model.trainedLabelsThrough)
    || !Number.isFinite(model.baselinePrediction)
    || model.featureNames.length !== OBSERVED_INPUT_NAMES.length
    || model.featureNames.some((name, i) => name !== OBSERVED_INPUT_NAMES[i])
    || model.trees.length !== 100) throw new Error('종합 점수 모델 계약 불일치')
  validateNormalization(model.normalization)
  if (model.normalization.referenceThrough !== model.trainedLabelsThrough) {
    throw new Error('종합 점수 모델 표준화 학습 시점 불일치')
  }
  for (const tree of model.trees) {
    if (!tree.length) throw new Error('종합 점수 모델 빈 트리')
    const visited = new Set<number>()
    const visit = (index: number): void => {
      if (!Number.isInteger(index) || index < 0 || index >= tree.length || visited.has(index)) {
        throw new Error('종합 점수 모델 트리 연결 오류')
      }
      visited.add(index)
      const node = tree[index]!
      if (typeof node.isLeaf !== 'boolean' || !Number.isFinite(node.value)) throw new Error('종합 점수 모델 노드 오류')
      if (node.isLeaf) return
      if (!Number.isInteger(node.featureIdx) || node.featureIdx < 0 || node.featureIdx >= OBSERVED_INPUT_NAMES.length
        || typeof node.missingGoLeft !== 'boolean'
        || !(typeof node.numThreshold === 'number' && Number.isFinite(node.numThreshold)
          || node.numThreshold === 'Infinity' || node.numThreshold === '-Infinity')) {
        throw new Error('종합 점수 모델 분기 오류')
      }
      visit(node.left); visit(node.right)
    }
    visit(0)
    if (visited.size !== tree.length) throw new Error('종합 점수 모델 미연결 노드')
  }
  return model
}

export function scoreUtilityModel(model: UtilityModelArtifact, inputs: readonly (number | null)[]): {
  readonly utility: number
  readonly score: number
} {
  validateUtilityModel(model)
  if (inputs.length !== OBSERVED_INPUT_NAMES.length
    || Array.from(inputs).some((v) => v !== null && (typeof v !== 'number' || !Number.isFinite(v) && !Number.isNaN(v)))) {
    throw new Error('종합 점수 관측 피처 계약 불일치')
  }
  let prediction = model.baselinePrediction
  for (const tree of model.trees) {
    let index = 0
    while (!tree[index]!.isLeaf) {
      const node = tree[index]!
      const value = inputs[node.featureIdx]
      const goLeft = value === null || Number.isNaN(value)
        ? node.missingGoLeft : value! <= Number(node.numThreshold)
      index = goLeft ? node.left : node.right
    }
    prediction += tree[index]!.value
  }
  if (!Number.isFinite(prediction)) throw new Error('종합 점수 추론 실패')
  const utility = Math.min(1, Math.max(0, prediction))
  return { utility, score: normalizeUtilityScore(model.normalization, utility) }
}
