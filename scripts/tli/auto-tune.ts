/** 유사도 임계값 자동 튜닝 — 검증된 비교 결과 기반 최적 임계값 산출 */
import { supabaseAdmin } from './supabase-admin'
import { daysAgo } from './utils'

export const DEFAULT_THRESHOLD = 0.35
const MIN_SAMPLES_FOR_TUNING = 30
/** trajectory_correlation이 이 값 이상이면 "정확한 비교"로 분류 (evaluate-comparisons의 0.3보다 엄격 — 튜닝은 보수적이어야 함) */
const TUNING_ACCURACY_THRESHOLD = 0.5
/** Bayesian shrinkage가 0이 되는 샘플 수 (n >= 이 값이면 축소 없음) */
const SHRINKAGE_CAP = 100

export interface OptimalThresholdResult {
  threshold: number
  confidence: 'low' | 'medium' | 'high'
  sampleSize: number
}

interface VerifiedRow {
  similarity_score: number
  trajectory_correlation: number
}

/**
 * 순수 계산 로직 (DB 의존성 없음, 테스트용 export)
 * @internal
 */
export function _optimizeFromData(rows: VerifiedRow[]): OptimalThresholdResult {
  const accurate = rows.filter(r => r.trajectory_correlation >= TUNING_ACCURACY_THRESHOLD)
  const totalAccurate = accurate.length

  if (totalAccurate === 0) {
    return { threshold: DEFAULT_THRESHOLD, confidence: 'low', sampleSize: rows.length }
  }

  const candidates = [0.25, 0.30, 0.35, 0.40, 0.45, 0.50]
  let bestThreshold = DEFAULT_THRESHOLD
  let bestF1 = 0

  for (const candidate of candidates) {
    const aboveThreshold = rows.filter(r => r.similarity_score >= candidate)
    const accurateAbove = aboveThreshold.filter(r => r.trajectory_correlation >= TUNING_ACCURACY_THRESHOLD)

    const precision = aboveThreshold.length > 0 ? accurateAbove.length / aboveThreshold.length : 0
    const recall = totalAccurate > 0 ? accurateAbove.length / totalAccurate : 0
    const f1 = (precision + recall > 0) ? 2 * precision * recall / (precision + recall) : 0

    // 동점 시 높은 임계값 선택 (precision 우선 — 노이즈 매치 최소화)
    if (f1 > bestF1 || (f1 === bestF1 && candidate > bestThreshold)) {
      bestF1 = f1
      bestThreshold = candidate
    }
  }

  // 모든 후보 F1=0이면 최적화 불가 → DEFAULT 반환
  if (bestF1 === 0) {
    return { threshold: DEFAULT_THRESHOLD, confidence: 'low', sampleSize: rows.length }
  }

  // Bayesian shrinkage
  const n = rows.length
  const shrinkWeight = Math.min(n, SHRINKAGE_CAP) / SHRINKAGE_CAP
  const shrunk = DEFAULT_THRESHOLD * (1 - shrinkWeight) + bestThreshold * shrinkWeight

  const clamped = Math.max(0.25, Math.min(0.50, shrunk))
  const rounded = Math.round(clamped * 100) / 100
  const confidence = n >= 100 ? 'high' : n >= 50 ? 'medium' : 'low'

  return { threshold: rounded, confidence, sampleSize: n }
}

/**
 * 검증된 비교 결과를 기반으로 최적 유사도 임계값 계산
 *
 * F1 최적화 + Bayesian shrinkage로 과적합 방지
 * - 최소 샘플 30개 미만 시 null 반환
 * - 정확도 기준: trajectory_correlation >= 0.5
 * - 후보 임계값: [0.25, 0.30, 0.35, 0.40, 0.45, 0.50]
 * - 샘플이 적을 수록 DEFAULT(0.35)로 수렴
 */
export async function computeOptimalThreshold(): Promise<OptimalThresholdResult | null> {
  // 1. 최근 30일 검증된 비교 결과 로드
  const thirtyDaysAgo = daysAgo(30)
  const { data: verified, error } = await supabaseAdmin
    .from('theme_comparisons')
    .select('similarity_score, trajectory_correlation')
    .eq('outcome_verified', true)
    .gte('verified_at', thirtyDaysAgo)
    .limit(5000) // Supabase 기본 1000 row 제한 방지

  if (error) {
    console.error('   ❌ 검증 데이터 로드 실패:', error.message)
    return null
  }

  // 2. null row 사전 제거 후 유효 샘플 수로 판정
  const valid = (verified ?? [])
    .filter((r): r is VerifiedRow => r.trajectory_correlation != null && r.similarity_score != null)

  if (valid.length < MIN_SAMPLES_FOR_TUNING) {
    console.log(`   ⚠️ 유효 샘플 부족 (${valid.length}/${MIN_SAMPLES_FOR_TUNING}) — 튜닝 생략`)
    return null
  }

  const result = _optimizeFromData(valid)

  console.log(`   ✅ 최적 임계값: ${result.threshold} (신뢰도: ${result.confidence}, 유효 샘플: ${result.sampleSize}개)`)

  return result
}