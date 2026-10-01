import { OBSERVED_INPUT_NAMES, OBSERVED_INPUT_VERSION } from '@/scripts/stock-picks/observed-inputs'

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
  readonly schemaVersion: 1
  readonly modelVersion: string
  readonly trainedLabelsThrough: string
  readonly observedInputVersion: string
  readonly featureNames: readonly string[]
  readonly baselinePrediction: number
  readonly trees: readonly (readonly UtilityTreeNode[])[]
}

/** HGB 리프 값은 학습률이 이미 반영되어 있으며 결측 분기도 저장된 모델을 따른다. */
export function validateUtilityModel(model: UtilityModelArtifact): UtilityModelArtifact {
  if (model.schemaVersion !== 1 || !model.modelVersion
    || model.observedInputVersion !== OBSERVED_INPUT_VERSION
    || !/^\d{4}-\d{2}-\d{2}$/.test(model.trainedLabelsThrough)
    || !Number.isFinite(model.baselinePrediction)
    || model.featureNames.length !== OBSERVED_INPUT_NAMES.length
    || model.featureNames.some((name, i) => name !== OBSERVED_INPUT_NAMES[i])
    || model.trees.length !== 100) throw new Error('종합 점수 모델 계약 불일치')
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
  return { utility, score: Math.floor(100 * utility + 0.5) }
}
