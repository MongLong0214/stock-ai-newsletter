/** TLI 점수 계산 모듈 v2 — Dual-Axis + DVI + Activity */

import {
  standardDeviation,
  avg,
  daysBetween,
  sigmoid_normalize,
  log_normalize,
  percentileRank,
  linearRegressionSlope,
  calculateDVI,
} from './normalize';
import { getKSTDateString } from './date-utils';
import { getScoreWeights, getMinRawInterest } from './constants/score-config';
import { computeSentimentProxy } from './sentiment-proxy';
import { computeScoreConfidence } from './score-confidence';
import type { InterestMetric, NewsMetric, ScoreComponents, ScoreConfidence } from './types';

/** 최소 데이터 요건 */
const MIN_INTEREST_DAYS = 3;
/** 뉴스 모멘텀 계산을 위한 최소 지난주 기사 수 */
const MIN_NEWS_LAST_WEEK = 3;

interface CalculateScoreInput {
  interestMetrics: InterestMetric[];
  newsMetrics: NewsMetric[];
  firstSpikeDate: string | null;
  today?: string;
  avgPriceChangePct?: number;
  avgVolume?: number;
  allThemesRawAvg?: number[];
  rawPercentile?: number;
  prevSmoothedScore?: number;
  prevAvgVolume?: number;
}

export function calculateLifecycleScore(input: CalculateScoreInput): {
  score: number;
  components: ScoreComponents;
  confidence: ScoreConfidence;
} | null {
  const { interestMetrics, newsMetrics, firstSpikeDate } = input;
  const today = input.today || getKSTDateString();

  if (interestMetrics.length < MIN_INTEREST_DAYS) {
    return null;
  }

  // ── 기본 데이터 추출 ──
  const recent7d = interestMetrics.slice(0, 7).map(m => m.normalized);
  const baseline = interestMetrics.slice(7, 30).map(m => m.normalized);
  const recent7dAvg = avg(recent7d);
  const baselineAvg = baseline.length > 0 ? avg(baseline) : recent7dAvg;

  const recent7dRaw = interestMetrics.slice(0, 7).map(m => m.raw_value);
  const rawAvg = avg(recent7dRaw);

  const newsThisWeek = newsMetrics.slice(0, 7).reduce((sum, m) => sum + m.article_count, 0);
  const newsLastWeek = newsMetrics.slice(7, 14).reduce((sum, m) => sum + m.article_count, 0);

  // ── 1. Interest Score (Dual-Axis) ──
  let levelScore: number;
  if (input.allThemesRawAvg && input.allThemesRawAvg.length > 0) {
    levelScore = percentileRank(rawAvg, input.allThemesRawAvg);
  } else if (input.rawPercentile !== undefined) {
    levelScore = input.rawPercentile;
  } else {
    levelScore = sigmoid_normalize(rawAvg, 30, 20);
  }

  const recent7dAsc = [...recent7d].reverse();
  const growthRate = linearRegressionSlope(recent7dAsc);

  let momentumScore: number;
  if (baselineAvg > 0) {
    momentumScore = sigmoid_normalize(growthRate, 0, 1.5);
  } else {
    momentumScore = sigmoid_normalize(rawAvg, 30, 20) * 0.5;
  }

  let interestScore = levelScore * 0.6 + momentumScore * 0.4;

  const minRawInterest = getMinRawInterest();
  const dampeningFactor = rawAvg < minRawInterest ? rawAvg / minRawInterest : 1;
  interestScore *= dampeningFactor;

  // ── 2. News Score ──
  const volumeScore = log_normalize(newsThisWeek, 50);

  let newsMomentumScore: number;
  let newsScore: number;
  if (newsThisWeek === 0 && newsLastWeek === 0) {
    newsMomentumScore = 0;
    newsScore = 0;
  } else if (newsLastWeek >= MIN_NEWS_LAST_WEEK) {
    const newsChange = (newsThisWeek - newsLastWeek) / Math.max(newsLastWeek, 1);
    newsMomentumScore = sigmoid_normalize(newsChange, 0, 1.0);
    newsScore = volumeScore * 0.6 + newsMomentumScore * 0.4;
  } else {
    newsMomentumScore = volumeScore;
    newsScore = volumeScore;
  }

  // ── 3. Volatility (DVI) ──
  const interestStdDev = standardDeviation(recent7d);
  const dvi = calculateDVI(recent7dAsc);
  const volMagnitude = sigmoid_normalize(interestStdDev, 15, 10);
  const volatilityScore = dvi * volMagnitude;

  // ── 4. Activity Score ──
  const pricePct = input.avgPriceChangePct ?? 0;
  const vol = input.avgVolume ?? 0;
  const activeDays = firstSpikeDate ? Math.max(0, daysBetween(firstSpikeDate, today)) : 0;

  const stockPriceChange = sigmoid_normalize(pricePct, 0, 5) * 0.5;
  const volumeIntensity = log_normalize(vol, 50_000_000) * 0.3;
  const dataCoverage = Math.min(activeDays / 14, 1) * 0.2;

  const sentimentProxy = computeSentimentProxy({
    avgPriceChangePct: pricePct,
    newsThisWeek: newsThisWeek,
    newsLastWeek: newsLastWeek,
    avgVolume: vol,
    prevAvgVolume: input.prevAvgVolume,
  });

  let activityScore = stockPriceChange + volumeIntensity + dataCoverage;
  activityScore = activityScore * 0.7 + sentimentProxy * 0.3;

  if (levelScore < 0.1) {
    activityScore *= 0.5;
  }

  // ── 5. Total Score ──
  const maturityRatio = activeDays > 0 ? Math.min(activeDays / 90, 1.5) : 0;
  const weights = getScoreWeights();

  const rawScore =
    interestScore * weights.interest +
    newsScore * weights.newsMomentum +
    volatilityScore * weights.volatility +
    activityScore * weights.activity;

  const score = Math.round(rawScore * 100);

  // ── Confidence (extracted) ──
  const confidence = computeScoreConfidence(interestMetrics, newsMetrics);

  const components: ScoreComponents = {
    interest_score: interestScore,
    news_momentum: newsScore,
    volatility_score: volatilityScore,
    maturity_ratio: maturityRatio,
    activity_score: activityScore,
    weights: {
      interest: weights.interest,
      news: weights.newsMomentum,
      volatility: weights.volatility,
      activity: weights.activity,
    },
    raw: {
      recent_7d_avg: recent7dAvg,
      baseline_30d_avg: baselineAvg,
      news_this_week: newsThisWeek,
      news_last_week: newsLastWeek,
      interest_stddev: interestStdDev,
      active_days: activeDays,
      raw_interest_avg: rawAvg,
      dampening_factor: dampeningFactor,
      raw_percentile: input.rawPercentile ?? null,
      level_score: levelScore,
      momentum_score: momentumScore,
      interest_slope: growthRate,
      dvi,
      volume_intensity: volumeIntensity,
      data_coverage: dataCoverage,
      raw_score: rawScore,
      sentiment_proxy: sentimentProxy,
      avg_volume: vol,
    },
    confidence,
  };

  return { score: Math.max(0, Math.min(100, score)), components, confidence };
}
