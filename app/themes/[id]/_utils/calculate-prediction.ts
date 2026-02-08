export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type Phase = 'pre-peak' | 'near-peak' | 'at-peak' | 'post-peak' | 'declining'
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical'
export type Momentum = 'accelerating' | 'stable' | 'decelerating'

export interface Scenario {
  themeName: string
  peakDay: number
  totalDays: number
  similarity: number
}

export interface PredictionResult {
  daysSinceSpike: number
  confidence: ConfidenceLevel
  comparisonCount: number
  avgSimilarity: number

  avgPeakDay: number
  avgTotalDays: number
  avgDaysToPeak: number
  currentProgress: number
  peakProgress: number

  scenarios: {
    best: Scenario
    median: Scenario
    worst: Scenario
  }

  phase: Phase
  momentum: Momentum
  phaseMessage: string

  riskLevel: RiskLevel
  riskMessage: string

  keyInsight: string
}

interface ComparisonInput {
  pastTheme: string
  similarity: number
  estimatedDaysToPeak: number
  pastPeakDay: number
  pastTotalDays: number
}

function weightedAvg(items: ComparisonInput[], getter: (c: ComparisonInput) => number): number {
  const totalWeight = items.reduce((s, c) => s + c.similarity, 0)
  if (totalWeight <= 0) return 0
  return items.reduce((s, c) => s + getter(c) * c.similarity, 0) / totalWeight
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function deriveConfidence(count: number, avgSimilarity: number): ConfidenceLevel {
  if (count >= 3 && avgSimilarity >= 0.55) return 'high'
  if (count >= 2 && avgSimilarity >= 0.40) return 'medium'
  return 'low'
}

function derivePhase(daysSinceSpike: number, avgPeakDay: number, avgTotalDays: number): Phase {
  if (avgPeakDay <= 0 || avgTotalDays <= 0) return 'pre-peak'
  if (daysSinceSpike < avgPeakDay * 0.7) return 'pre-peak'
  if (daysSinceSpike < avgPeakDay * 0.95) return 'near-peak'
  if (daysSinceSpike <= avgPeakDay * 1.1) return 'at-peak'
  if (daysSinceSpike < avgTotalDays * 0.8) return 'post-peak'
  return 'declining'
}

/**
 * 모멘텀 판별: 피크까지 남은 거리 대비 전체 주기 비율
 * ratio > 0.3 = 전체 주기의 30% 이상 남음 = 초기 성장(가속) 구간
 * ratio > 0.1 = 피크에 근접 = 안정 구간
 * ratio <= 0.1 = 피크 직전/이후 = 감속 구간
 */
function deriveMomentum(estimatedDaysToPeak: number, avgTotalDays: number): Momentum {
  if (avgTotalDays <= 0) return 'stable'
  const ratio = estimatedDaysToPeak / avgTotalDays
  if (ratio > 0.3) return 'accelerating'
  if (ratio > 0.1) return 'stable'
  return 'decelerating'
}

function deriveRisk(phase: Phase, confidence: ConfidenceLevel): RiskLevel {
  if (phase === 'declining') return 'critical'
  if (phase === 'post-peak' || phase === 'at-peak') return 'high'
  if (phase === 'near-peak') return 'moderate'
  if (phase === 'pre-peak' && confidence !== 'low') return 'low'
  return 'moderate'
}

function buildRiskMessage(risk: RiskLevel): string {
  const messages: Record<RiskLevel, string> = {
    low: '현재 위험도가 낮은 구간입니다',
    moderate: '주의가 필요한 구간에 진입하고 있습니다',
    high: '높은 주의가 필요한 구간입니다',
    critical: '매우 높은 위험 구간입니다. 신중한 판단이 필요합니다',
  }
  return messages[risk]
}

function buildPhaseMessage(phase: Phase, avgDaysToPeak: number): string {
  switch (phase) {
    case 'pre-peak':
      return avgDaysToPeak > 0
        ? `Peak까지 약 ${avgDaysToPeak}일 남음`
        : 'Peak 이전 초기 성장 구간'
    case 'near-peak':
      return avgDaysToPeak > 0
        ? `약 ${avgDaysToPeak}일 내 Peak 도달 예상`
        : 'Peak 구간에 근접 중'
    case 'at-peak':
      return 'Peak 구간 통과 중'
    case 'post-peak':
      return 'Peak 이후 하락 전환 구간'
    case 'declining':
      return '하락 단계 진입'
  }
}

function buildKeyInsight(phase: Phase, avgDaysToPeak: number): string {
  switch (phase) {
    case 'pre-peak':
      return avgDaysToPeak > 0
        ? `유사 테마 분석 기준, 성장 초기 단계로 피크까지 약 ${avgDaysToPeak}일 여유가 있습니다`
        : '유사 테마 분석 기준, 성장 초기 단계로 피크까지 여유가 있습니다'
    case 'near-peak':
      return avgDaysToPeak > 0
        ? `피크 구간에 근접하고 있습니다. 약 ${avgDaysToPeak}일 내 정점 도달이 예상됩니다`
        : '피크 구간에 근접하고 있습니다. 곧 정점 도달이 예상됩니다'
    case 'at-peak':
      return '현재 피크 구간으로 추정됩니다. 이후 하락 전환에 유의하세요'
    case 'post-peak':
      return '피크를 지난 것으로 보입니다. 하락세 전환 가능성이 높습니다'
    case 'declining':
      return '하락 단계에 진입한 것으로 보입니다. 신중한 접근이 필요합니다'
  }
}

function buildScenarios(comparisons: ComparisonInput[]): { best: Scenario; median: Scenario; worst: Scenario } {
  const sorted = [...comparisons].sort((a, b) => a.pastTotalDays - b.pastTotalDays)
  const toScenario = (c: ComparisonInput): Scenario => ({
    themeName: c.pastTheme,
    peakDay: c.pastPeakDay,
    totalDays: c.pastTotalDays,
    similarity: c.similarity,
  })
  const midIdx = Math.floor((sorted.length - 1) / 2)
  return {
    best: toScenario(sorted[0]),
    median: toScenario(sorted[midIdx]),
    worst: toScenario(sorted[sorted.length - 1]),
  }
}

export function calculatePrediction(
  firstSpikeDate: string | null,
  comparisons: ComparisonInput[]
): PredictionResult | null {
  if (!comparisons.length) return null

  // Quality gate: reject if all comparisons have trivially short cycles
  if (comparisons.every(c => c.pastTotalDays < 2)) return null

  // KST 보정 적용 (UTC+9)
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000
  const nowKST = Date.now() + KST_OFFSET_MS
  const spikeKST = firstSpikeDate ? new Date(firstSpikeDate).getTime() + KST_OFFSET_MS : 0
  const daysSinceSpike = firstSpikeDate
    ? Math.max(0, Math.floor((nowKST - spikeKST) / 86_400_000))
    : 0

  const avgSimilarity = comparisons.reduce((s, c) => s + c.similarity, 0) / comparisons.length

  const avgPeakDay = Math.round(weightedAvg(comparisons, c => c.pastPeakDay))
  const avgTotalDays = Math.min(Math.round(weightedAvg(comparisons, c => c.pastTotalDays)), 365)

  // Quality gate: reject garbage predictions
  if (avgTotalDays < 3) return null

  const positivePeakComps = comparisons.filter(c => c.estimatedDaysToPeak > 0)
  const avgDaysToPeak = positivePeakComps.length > 0
    ? Math.round(weightedAvg(positivePeakComps, c => c.estimatedDaysToPeak))
    : 0

  const currentProgress = avgTotalDays > 0 ? clamp((daysSinceSpike / avgTotalDays) * 100, 0, 100) : 0
  const peakProgress = avgTotalDays > 0 ? clamp((avgPeakDay / avgTotalDays) * 100, 0, 100) : 0

  const comparisonCount = comparisons.length
  const confidence = deriveConfidence(comparisonCount, avgSimilarity)
  const phase = derivePhase(daysSinceSpike, avgPeakDay, avgTotalDays)
  const momentum = deriveMomentum(avgDaysToPeak, avgTotalDays)
  const riskLevel = deriveRisk(phase, confidence)
  const scenarios = buildScenarios(comparisons)

  return {
    daysSinceSpike,
    confidence,
    comparisonCount,
    avgSimilarity,
    avgPeakDay,
    avgTotalDays,
    avgDaysToPeak,
    currentProgress,
    peakProgress,
    scenarios,
    phase,
    momentum,
    phaseMessage: buildPhaseMessage(phase, avgDaysToPeak),
    riskLevel,
    riskMessage: buildRiskMessage(riskLevel),
    keyInsight: buildKeyInsight(phase, avgDaysToPeak),
  }
}
