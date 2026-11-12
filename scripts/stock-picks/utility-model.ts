import { OBSERVED_FLOW_INPUT_NAMES, OBSERVED_FLOW_INPUT_VERSION, OBSERVED_INPUT_NAMES, OBSERVED_INPUT_VERSION } from '@/scripts/stock-picks/observed-inputs'

export const UTILITY_SCORE_VERSION = 'utility-reference-smooth-v1'
export const RETURN_SCORE_VERSION = 'return-reference-smooth-v1'

export interface UtilityScoreNormalization {
  readonly version: typeof UTILITY_SCORE_VERSION | typeof RETURN_SCORE_VERSION
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

export interface UtilityPredictor {
  readonly baselinePrediction: number
  readonly trees: readonly (readonly UtilityTreeNode[])[]
}

interface UtilityModelReference {
  readonly trainedLabelsThrough: string
  readonly observedInputVersion: string
  readonly featureNames: readonly string[]
  readonly normalization: UtilityScoreNormalization
}

export interface LegacyUtilityModelArtifact extends UtilityModelReference, UtilityPredictor {
  readonly schemaVersion: 3
  readonly modelVersion: 'composite-utility-v3'
}

export interface CompositeUtilityModelArtifact extends UtilityModelReference {
  readonly schemaVersion: 4
  readonly modelVersion: 'composite-utility-v4'
  readonly targetDefinition: {
    readonly version: 'touch-nonloss-v1'
    readonly formula: 'clip(touch)*clip(nonLoss)^2'
    readonly horizon: 5
    readonly roundTripCostBps: 30
  }
  readonly heads: { readonly touch: UtilityPredictor; readonly nonLoss: UtilityPredictor }
}

/** scikit-learn HGB는 리프 값에만 학습률을 곱해 저장한다. 내부 노드 값을 같은 단위로 맞출 때 쓴다. */
interface HgbShrinkage {
  readonly learning_rate: number
}

export interface CompositeReturnModelArtifact extends UtilityModelReference, UtilityPredictor {
  readonly schemaVersion: 5
  readonly modelVersion: 'composite-return-v6' | 'composite-return-v8'
  readonly targetDefinition: {
    readonly version: 'demeaned-tp7-net-v1'
    readonly formula: string
    readonly horizon: 5
    readonly takeProfit: 0.07
    readonly cost: 'krx-realistic-v1'
    readonly demean: 'signal-date strict rows'
  }
  readonly parameters: HgbShrinkage
  readonly leafValuesAlreadyIncludeLearningRate: true
  readonly normalization: UtilityScoreNormalization & { readonly version: typeof RETURN_SCORE_VERSION }
}

/** v9: v8과 같은 수익 머리에, 같은 65개 입력으로 5일 순수익 > 0 여부를 맞히는 타율 머리(로그오즈)를 더한다. */
export interface CompositeReturnHitModelArtifact extends UtilityModelReference, UtilityPredictor {
  readonly schemaVersion: 6
  readonly modelVersion: 'composite-return-v9'
  readonly targetDefinition: CompositeReturnModelArtifact['targetDefinition']
  readonly hitTargetDefinition: {
    readonly version: 'net-positive-d5-v1'
    readonly formula: string
    readonly horizon: 5
    readonly cost: 'krx-realistic-v1'
    readonly output: 'log-odds'
  }
  readonly hitHead: UtilityPredictor
  readonly parameters: HgbShrinkage
  readonly hitParameters: HgbShrinkage
  readonly leafValuesAlreadyIncludeLearningRate: true
  readonly normalization: CompositeReturnModelArtifact['normalization']
}

export type UtilityModelArtifact = LegacyUtilityModelArtifact | CompositeUtilityModelArtifact | CompositeReturnModelArtifact
  | CompositeReturnHitModelArtifact

const validDate = (value: string): boolean => (
  /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value
)

function validateNormalization(normalization: UtilityScoreNormalization): void {
  if (!normalization || ![UTILITY_SCORE_VERSION, RETURN_SCORE_VERSION].includes(normalization.version)
    || !Number.isFinite(normalization.mean)
    || (normalization.version === RETURN_SCORE_VERSION
      ? Math.abs(normalization.mean) > 0.5 : normalization.mean < 0 || normalization.mean > 1)
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
  const clippedUtility = normalization.version === UTILITY_SCORE_VERSION ? Math.min(1, Math.max(0, utility)) : utility
  const delta = clippedUtility - normalization.mean
  // 5.25=(50/(70-50))²-1: 평균 50·+1σ 70을 유지하며 상단을 100점에 뭉개지 않는다.
  const standardized = normalization.center + normalization.center
    * delta / Math.hypot(delta, Math.sqrt(normalization.tailCurvature) * normalization.standardDeviation)
  if (!Number.isFinite(standardized)) throw new Error('종합 점수 추론 실패')
  return Math.floor(standardized + 0.5)
}

/** v8·v9만 기존 50개 관측값 뒤에 KIS 투자자 수급 15개를 붙인다. 다른 모델은 기존 50개 계약 그대로다. */
export function modelInputContract(model: Pick<UtilityModelArtifact, 'schemaVersion' | 'modelVersion'>): {
  readonly version: string
  readonly names: readonly string[]
} {
  return (model.schemaVersion === 5 && model.modelVersion === 'composite-return-v8')
    || (model.schemaVersion === 6 && model.modelVersion === 'composite-return-v9')
    ? { version: OBSERVED_FLOW_INPUT_VERSION, names: OBSERVED_FLOW_INPUT_NAMES }
    : { version: OBSERVED_INPUT_VERSION, names: OBSERVED_INPUT_NAMES }
}

/** HGB 리프 값은 학습률이 이미 반영되어 있으며 결측 분기도 저장된 모델을 따른다. */
export function validateUtilityModel(model: UtilityModelArtifact): UtilityModelArtifact {
  const supportedVersion = (model.schemaVersion === 3 && model.modelVersion === 'composite-utility-v3'
    && !('heads' in model))
    || (model.schemaVersion === 4 && model.modelVersion === 'composite-utility-v4'
      && model.targetDefinition?.version === 'touch-nonloss-v1'
      && model.targetDefinition.formula === 'clip(touch)*clip(nonLoss)^2'
      && model.targetDefinition.horizon === 5 && model.targetDefinition.roundTripCostBps === 30
      && model.heads && Object.keys(model.heads).sort().join(',') === 'nonLoss,touch'
      && !('trees' in model) && !('baselinePrediction' in model))
    || (model.schemaVersion === 5 && (model.modelVersion === 'composite-return-v6' || model.modelVersion === 'composite-return-v8')
      && validReturnTarget(model.targetDefinition) && !('heads' in model) && !('hitHead' in model)
      && validShrinkage(model.parameters) && model.leafValuesAlreadyIncludeLearningRate === true)
    || (model.schemaVersion === 6 && model.modelVersion === 'composite-return-v9'
      && validReturnTarget(model.targetDefinition) && !('heads' in model)
      && validShrinkage(model.parameters) && validShrinkage(model.hitParameters)
      && model.leafValuesAlreadyIncludeLearningRate === true
      && model.hitTargetDefinition?.version === 'net-positive-d5-v1'
      && typeof model.hitTargetDefinition.formula === 'string' && model.hitTargetDefinition.formula.length > 0
      && model.hitTargetDefinition.horizon === 5 && model.hitTargetDefinition.cost === 'krx-realistic-v1'
      && model.hitTargetDefinition.output === 'log-odds')
  const inputs = supportedVersion ? modelInputContract(model) : null
  if (!inputs || model.observedInputVersion !== inputs.version
    || !validDate(model.trainedLabelsThrough)
    || !Array.isArray(model.featureNames) || model.featureNames.length !== inputs.names.length
    || model.featureNames.some((name, i) => name !== inputs.names[i])) {
    throw new Error('종합 점수 모델 계약 불일치')
  }
  validateNormalization(model.normalization)
  if (model.normalization.version !== (model.schemaVersion >= 5 ? RETURN_SCORE_VERSION : UTILITY_SCORE_VERSION)) {
    throw new Error('종합 점수 모델 표준화 계약 불일치')
  }
  if (model.normalization.referenceThrough !== model.trainedLabelsThrough) {
    throw new Error('종합 점수 모델 표준화 학습 시점 불일치')
  }
  if (model.schemaVersion === 4) {
    validatePredictor(model.heads.touch); validatePredictor(model.heads.nonLoss)
  } else validatePredictor(model, model.schemaVersion >= 5 ? 200 : 100, inputs.names.length)
  if (model.schemaVersion === 6) validatePredictor(model.hitHead, 200, inputs.names.length)
  return model
}

const validShrinkage = (parameters: HgbShrinkage | undefined): boolean => (
  typeof parameters?.learning_rate === 'number' && parameters.learning_rate > 0 && parameters.learning_rate <= 1
)

const validReturnTarget = (target: CompositeReturnModelArtifact['targetDefinition'] | undefined): boolean => (
  target?.version === 'demeaned-tp7-net-v1'
  && typeof target.formula === 'string' && target.formula.length > 0
  && target.horizon === 5 && target.takeProfit === 0.07
  && target.cost === 'krx-realistic-v1' && target.demean === 'signal-date strict rows'
)

function validatePredictor(model: UtilityPredictor, treeCount = 100, inputCount: number = OBSERVED_INPUT_NAMES.length): void {
  if (!model || !Number.isFinite(model.baselinePrediction) || !Array.isArray(model.trees)
    || model.trees.length !== treeCount) throw new Error('종합 점수 모델 계약 불일치')
  for (const tree of model.trees) {
    if (!Array.isArray(tree) || !tree.length) throw new Error('종합 점수 모델 빈 트리')
    const visited = new Set<number>()
    const visit = (index: number): void => {
      if (!Number.isInteger(index) || index < 0 || index >= tree.length || visited.has(index)) {
        throw new Error('종합 점수 모델 트리 연결 오류')
      }
      visited.add(index)
      const node = tree[index]!
      if (!node || typeof node.isLeaf !== 'boolean' || !Number.isFinite(node.value)) throw new Error('종합 점수 모델 노드 오류')
      if (node.isLeaf) return
      if (!Number.isInteger(node.featureIdx) || node.featureIdx < 0 || node.featureIdx >= inputCount
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
}

export function scoreUtilityModel(model: UtilityModelArtifact, inputs: readonly (number | null)[]): {
  readonly utility: number
  readonly score: number
} {
  validateUtilityModel(model)
  assertModelInputs(model, inputs)
  const utility = model.schemaVersion === 4
    ? predict(model.heads.touch, inputs) * predict(model.heads.nonLoss, inputs) ** 2
    : predict(model, inputs, model.schemaVersion === 3)
  return { utility, score: normalizeUtilityScore(model.normalization, utility) }
}

/** v9 타율 머리의 로그오즈. 확률로 바꾸지 않아 scikit-learn decision_function과 그대로 대조된다. */
export function scoreUtilityHitHead(model: UtilityModelArtifact, inputs: readonly (number | null)[]): number {
  validateUtilityModel(model)
  if (model.schemaVersion !== 6) throw new Error('타율 머리는 schema 6 모델만 지원합니다')
  assertModelInputs(model, inputs)
  return predict(model.hitHead, inputs, false)
}

function assertModelInputs(model: UtilityModelArtifact, inputs: readonly (number | null)[]): void {
  if (inputs.length !== modelInputContract(model).names.length
    || Array.from(inputs).some((v) => v !== null && (typeof v !== 'number' || !Number.isFinite(v) && !Number.isNaN(v)))) {
    throw new Error('종합 점수 관측 피처 계약 불일치')
  }
}

/**
 * 수익 모델(schema 5 이상) 예측값을 입력별 기여도로 나눈다(트리 경로 분해, Saabas).
 * 분기마다 자식 노드 값 − 부모 노드 값을 그 분기 입력에 더하므로
 * baselinePrediction + Σ루트 값 + Σ기여도 = 예측값이 정확히 성립한다.
 * 저장된 내부 노드 값은 학습률을 곱하기 전 값이라 리프와 같은 단위(× 학습률)로 맞춘 뒤 차이를 낸다.
 * head='hit'은 v9 타율 머리의 로그오즈를 같은 방식으로 나눈다.
 */
export function attributeUtilityModel(model: UtilityModelArtifact, inputs: readonly (number | null)[],
  head: 'return' | 'hit' = 'return'): {
  readonly bias: number
  readonly contributions: readonly number[]
} {
  validateUtilityModel(model)
  if (model.schemaVersion !== 5 && model.schemaVersion !== 6) throw new Error('기여도 분해는 수익 모델(schema 5 이상)만 지원합니다')
  if (head === 'hit' && model.schemaVersion !== 6) throw new Error('타율 머리는 schema 6 모델만 지원합니다')
  if (inputs.length !== modelInputContract(model).names.length) throw new Error('종합 점수 관측 피처 계약 불일치')
  const useHit = head === 'hit' && model.schemaVersion === 6
  const predictor: UtilityPredictor = useHit ? model.hitHead : model
  const learningRate = (useHit ? model.hitParameters : model.parameters).learning_rate
  // WHY: 단위를 맞추지 않으면 내부 분기의 차이가 1/학습률배로 부풀고 마지막 분기 입력에 반대 부호로 몰린다(합은 그대로라 검산으로는 안 보인다).
  const valueOf = (node: UtilityTreeNode): number => (node.isLeaf ? node.value : node.value * learningRate)
  const contributions = Array<number>(inputs.length).fill(0)
  let bias = predictor.baselinePrediction
  for (const tree of predictor.trees) {
    let index = 0
    bias += valueOf(tree[0]!)
    while (!tree[index]!.isLeaf) {
      const node = tree[index]!
      const value = inputs[node.featureIdx]
      const goLeft = value === null || Number.isNaN(value)
        ? node.missingGoLeft : value! <= Number(node.numThreshold)
      const next = goLeft ? node.left : node.right
      contributions[node.featureIdx]! += valueOf(tree[next]!) - valueOf(node)
      index = next
    }
  }
  if (!Number.isFinite(bias) || contributions.some((value) => !Number.isFinite(value))) {
    throw new Error('종합 점수 기여도 계산 실패')
  }
  return { bias, contributions }
}

function predict(model: UtilityPredictor, inputs: readonly (number | null)[], clip = true): number {
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
  return clip ? Math.min(1, Math.max(0, prediction)) : prediction
}
