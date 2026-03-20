/** 테마 라이프사이클 단계 결정 모듈 v2 — Multi-Signal + Markov 제약 */

import type { Stage, ScoreComponents } from './types';
import { getTLIParams, type TLIParams } from './constants/tli-params';

/** 관심도 추세 방향 */
type Trend = 'rising' | 'stable' | 'falling';

/** Markov 허용 전이 맵 */
const ALLOWED_TRANSITIONS: Record<Stage, Set<Stage>> = {
  Dormant:  new Set<Stage>(['Emerging']),
  Emerging: new Set<Stage>(['Growth', 'Dormant']),
  Growth:   new Set<Stage>(['Peak', 'Decline']),
  Peak:     new Set<Stage>(['Decline', 'Growth']),
  Decline:  new Set<Stage>(['Dormant', 'Emerging', 'Growth']),
};

/** 데이터 갭 시 1단계 점프 허용 (Markov 제약 완화) */
const DATA_GAP_THRESHOLD = 3;

function resolveDisallowedTransition(prevStage: Stage, candidate: Stage): Stage {
  // 급반등은 허용하되 Decline -> Peak 직행은 Growth로 한 단계만 승격한다.
  if (prevStage === 'Decline' && candidate === 'Peak') {
    return 'Growth';
  }

  return prevStage;
}

/**
 * 관심도 추세 계산
 * interest_slope(raw linearRegressionSlope)를 recent_7d_avg로 정규화하여 판별
 */
function computeTrend(components: ScoreComponents, trendThreshold: number): Trend {
  const slope = components.raw.interest_slope ?? 0;
  const mean = Math.max(components.raw.recent_7d_avg, 1);
  const normalizedSlope = slope / mean;

  if (normalizedSlope > trendThreshold) return 'rising';
  if (normalizedSlope < -trendThreshold) return 'falling';
  return 'stable';
}

/**
 * 단계 결정 — Multi-Signal 우선순위 판정 + Markov 전이 제약
 * @param score 0-100 라이프사이클 점수
 * @param components 점수 하위 컴포넌트
 * @param prevStage 이전 단계 (없으면 Markov 제약 스킵)
 * @param dataGapDays 데이터 누락 일수 (>= 3이면 제약 완화)
 * @param config TLI 파라미터 오버라이드 (미전달 시 기본값)
 */
export function determineStage(
  score: number,
  components: ScoreComponents,
  prevStage?: Stage | null,
  dataGapDays?: number,
  config?: Partial<TLIParams>,
): Stage {
  const cfg = { ...getTLIParams(), ...config };
  const trend = computeTrend(components, cfg.trend_threshold);
  const newsVolume = components.raw.news_this_week;
  const rawScore = components.raw.raw_score ?? score / 100;

  // ── Multi-Signal 우선순위 판정 ──
  const t = { dormant: cfg.stage_dormant, emerging: cfg.stage_emerging, growth: cfg.stage_growth, peak: cfg.stage_peak };
  let candidate: Stage;

  // 1. Dormant: 낮은 점수 + 상승 추세 아님
  if (score < t.dormant && trend !== 'rising') {
    candidate = 'Dormant';
  }
  // 2. Peak: 높은 점수 또는 복합 시그널 (EMA bypass 포함)
  else if (
    score >= t.peak ||
    (score >= 50 && (trend === 'stable' || trend === 'rising') && newsVolume > cfg.peak_bypass_news)
  ) {
    candidate = 'Peak';
  }
  // 3. Decline: 하락 추세 + 이전 대비 15%+ 하락 + 뉴스 감소
  else if (
    trend === 'falling' &&
    rawScore < cfg.decline_score_ratio * (components.raw.level_score ?? rawScore) &&
    newsVolume < cfg.peak_bypass_news
  ) {
    candidate = 'Decline';
  }
  // 4. Growth: 성장 임계값 이상 + 안정/상승 추세
  else if (score >= t.growth && (trend === 'stable' || trend === 'rising')) {
    candidate = 'Growth';
  }
  // 5. Emerging: 나머지 전부
  else {
    candidate = 'Emerging';
  }

  // ── Markov 전이 제약 적용 ──
  if (prevStage && prevStage !== candidate) {
    const allowed = ALLOWED_TRANSITIONS[prevStage];

    if (!allowed.has(candidate)) {
      // 데이터 갭 시 1단계 점프 허용
      if (dataGapDays !== undefined && dataGapDays >= DATA_GAP_THRESHOLD) {
        return candidate;
      }
      // 허용되지 않은 전이 → 보정 또는 이전 단계 유지
      return resolveDisallowedTransition(prevStage, candidate);
    }
  }

  return candidate;
}

/**
 * 재점화 판별 — Decline→Emerging/Growth 전이 감지
 * determineStage 결과가 Emerging/Growth이고 prevStage가 Decline이면 재점화
 */
export function isReignitingTransition(
  candidateStage: Stage,
  prevStage: Stage | null | undefined,
): boolean {
  return prevStage === 'Decline' && (candidateStage === 'Emerging' || candidateStage === 'Growth');
}
