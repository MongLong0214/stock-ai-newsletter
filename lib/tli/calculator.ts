/** TLI 점수 계산 모듈 */

import { normalize, standardDeviation, avg, daysBetween } from './normalize';
import { aggregateSentiment } from './sentiment';
import { getKSTDateString } from './date-utils';
import { SCORE_WEIGHTS } from './constants/score-config';
import type { InterestMetric, NewsMetric, ScoreComponents } from './types';

/** 최소 데이터 요건 */
const MIN_INTEREST_DAYS = 3;
/** 뉴스 모멘텀 최소 기사 수 (이번주+지난주 합계) */
const MIN_NEWS_FOR_MOMENTUM = 5;

const AVG_THEME_LIFESPAN = 90;

interface CalculateScoreInput {
  /** 최신순(desc) 정렬된 관심도 메트릭 (slice(0,7)=최근 7일) */
  interestMetrics: InterestMetric[];
  /** 최신순(desc) 정렬된 뉴스 메트릭 (slice(0,7)=이번 주) */
  newsMetrics: NewsMetric[];
  firstSpikeDate: string | null;
  today?: string;
  /** 최근 7일간 뉴스 기사 감성 점수 (-1 ~ +1) */
  sentimentScores?: number[];
  /** 테마 간 raw interest 백분위 (0.0=최하위, 1.0=최상위) */
  rawPercentile?: number;
}

export function calculateLifecycleScore(input: CalculateScoreInput): {
  score: number;
  components: ScoreComponents;
} | null {
  const { interestMetrics, newsMetrics, firstSpikeDate } = input;
  const today = input.today || getKSTDateString();

  // 최소 데이터 요건 미달 시 점수 계산 스킵
  if (interestMetrics.length < MIN_INTEREST_DAYS) {
    return null;
  }

  // 7일/30일 윈도우 분리 (겹침 제거)
  const recent7d = interestMetrics.slice(0, 7).map(m => m.normalized);
  const baseline = interestMetrics.slice(7, 30).map(m => m.normalized);
  const recent7dAvg = avg(recent7d);
  const baselineAvg = baseline.length > 0 ? avg(baseline) : recent7dAvg;
  const interestRatio = baselineAvg > 0 ? recent7dAvg / baselineAvg : 0;

  // 절대 관심도 검증: raw_value 평균이 너무 낮으면 노이즈로 판단
  const recent7dRaw = interestMetrics.slice(0, 7).map(m => m.raw_value);
  const rawAvg = avg(recent7dRaw);

  const newsThisWeek = newsMetrics.slice(0, 7).reduce((sum, m) => sum + m.article_count, 0);
  const newsLastWeek = newsMetrics.slice(7, 14).reduce((sum, m) => sum + m.article_count, 0);

  // 테마 간 백분위 감쇠 (주요)
  const percentileDampening = input.rawPercentile !== undefined
    ? (input.rawPercentile < 0.2
      ? 0.1 + (input.rawPercentile / 0.2) * 0.9  // 하위 20% → 0.1~1.0
      : 1.0)
    : 1.0; // 백분위 미제공 시 폴백

  // 뉴스 기반 감쇠 (보조 — 뉴스 없음 = 비활성 테마 가능성)
  // 데이터 축적 초기에는 뉴스가 없을 수 있으므로 완화된 감쇠 적용
  const totalNews = newsThisWeek + newsLastWeek;
  const newsDampening = totalNews >= 3 ? 1.0 : (totalNews > 0 ? 0.7 : 0.4);

  // Combined: 가중 평균 (percentile 60%, news 40%) — 하한 0.5로 과도한 감쇠 방지
  const dampening = Math.max(0.5, percentileDampening * 0.6 + newsDampening * 0.4);

  const interestScore = normalize(interestRatio, 0.5, 3.0) * dampening;

  // 뉴스 모멘텀: 성장률 기반 + 기준선 부재 시 절대값 폴백
  let newsMomentum: number;
  if (newsLastWeek > 0 && newsThisWeek + newsLastWeek >= MIN_NEWS_FOR_MOMENTUM) {
    const newsGrowthRate = (newsThisWeek - newsLastWeek) / newsLastWeek;
    newsMomentum = normalize(newsGrowthRate, -0.5, 2.0);
  } else if (newsThisWeek > 0) {
    // 기준선 없을 때: 절대 기사 수 기반 half-strength 시그널
    newsMomentum = normalize(newsThisWeek, 0, 15) * 0.5;
  } else {
    newsMomentum = 0;
  }

  const interestStdDev = standardDeviation(recent7d);
  // 노이즈 감지: 변동계수 높고 절대 관심도 낮으면 노이즈 변동성으로 판단
  const coefficientOfVariation = recent7dAvg > 0 ? interestStdDev / recent7dAvg : 0;
  const isNoise = coefficientOfVariation > 0.8 && dampening < 1;
  const volatilityScore = normalize(interestStdDev, 0, 50) * (isNoise ? 0.3 : 1);

  // maturity는 stage 판정용으로만 계산 (점수에 미반영)
  const activeDays = firstSpikeDate ? Math.max(0, daysBetween(firstSpikeDate, today)) : 0;
  const maturityRatio = Math.min(activeDays / AVG_THEME_LIFESPAN, 1.5);

  // 감성 분석 (데이터 없으면 중립 0.5 = 판단 보류)
  const sentimentAgg = aggregateSentiment(input.sentimentScores || []);
  const hasSentimentData = (input.sentimentScores || []).length > 0;
  const sentimentScore = hasSentimentData ? sentimentAgg.normalized : 0.5;

  const rawScore =
    interestScore * SCORE_WEIGHTS.interest +
    newsMomentum * SCORE_WEIGHTS.newsMomentum +
    sentimentScore * SCORE_WEIGHTS.sentiment +
    volatilityScore * SCORE_WEIGHTS.volatility;

  const score = Math.round(rawScore * 100);

  const components: ScoreComponents = {
    interest_score: interestScore,
    news_momentum: newsMomentum,
    sentiment_score: sentimentScore,
    volatility_score: volatilityScore,
    maturity_ratio: maturityRatio,
    weights: {
      interest: SCORE_WEIGHTS.interest,
      news: SCORE_WEIGHTS.newsMomentum,
      sentiment: SCORE_WEIGHTS.sentiment,
      volatility: SCORE_WEIGHTS.volatility,
    },
    raw: {
      recent_7d_avg: recent7dAvg,
      baseline_30d_avg: baselineAvg,
      news_this_week: newsThisWeek,
      news_last_week: newsLastWeek,
      interest_stddev: interestStdDev,
      active_days: activeDays,
      sentiment_avg: sentimentAgg.average,
      sentiment_article_count: (input.sentimentScores || []).length,
      raw_interest_avg: rawAvg,
      dampening_factor: dampening,
      raw_percentile: input.rawPercentile ?? null,
    },
  };

  return { score: Math.max(0, Math.min(100, score)), components };
}
