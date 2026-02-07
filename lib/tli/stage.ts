/** 테마 라이프사이클 단계 결정 모듈 */

import type { Stage, ScoreComponents } from './types';

export function determineStage(score: number, components: ScoreComponents): Stage {
  const { interest_score, news_momentum, sentiment_score, maturity_ratio } = components;

  if (
    score >= 80 ||
    (score >= 60 && interest_score > 0.8 && news_momentum > 0.7) ||
    (score >= 60 && interest_score > 0.8 && (sentiment_score ?? 0.5) > 0.7)
  ) {
    return 'Peak';
  }

  if (score >= 60) {
    return 'Growth';
  }

  if (score >= 40) {
    return 'Early';
  }

  if (score >= 20 || (maturity_ratio > 0.8 && interest_score < 0.3)) {
    return 'Decay';
  }

  return 'Dormant';
}
