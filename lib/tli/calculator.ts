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
import { getTLIParams, computeWActivity, type TLIParams } from './constants/tli-params';
import { getNoiseFloor, getScoreWeights } from './constants/score-config';
import { resolveInterestLevel, type InterestScale } from './interest-scale';
import { computeSentimentProxy } from './sentiment-proxy';
import { computeScoreConfidence } from './score-confidence';
import type { InterestMetric, NewsMetric, ScoreComponents, ScoreConfidence } from './types';

/** 최소 데이터 요건 */
const MIN_INTEREST_DAYS = 3;

interface CalculateScoreInput {
  interestMetrics: InterestMetric[];
  newsMetrics: NewsMetric[];
  firstSpikeDate: string | null;
  today?: string;
  avgPriceChangePct?: number;
  avgVolume?: number;
  allThemesRawAvg?: number[];
  rawPercentile?: number;
  /**
   * 절대 관심 수준을 읽을 척도. `allThemesRawAvg`도 반드시 같은 척도로 만들어져야 한다.
   * 기본 'raw'는 앵커 이전 동작 그대로 — 호출부가 명시적으로 넘길 때만 앵커로 전환된다.
   */
  interestScale?: InterestScale;
  prevSmoothedScore?: number;
  prevAvgVolume?: number;
  config?: Partial<TLIParams>;
}

export function calculateLifecycleScore(input: CalculateScoreInput): {
  score: number;
  components: ScoreComponents;
  confidence: ScoreConfidence;
} | null {
  const { interestMetrics, newsMetrics, firstSpikeDate } = input;
  const today = input.today || getKSTDateString();
  const cfg = { ...getTLIParams(), ...input.config };

  if (interestMetrics.length < MIN_INTEREST_DAYS) {
    return null;
  }

  // ── 기본 데이터 추출 ──
  const recent7d = interestMetrics.slice(0, 7).map(m => m.normalized);
  const baseline = interestMetrics.slice(7, 30).map(m => m.normalized);
  const recent7dAvg = avg(recent7d);
  const baselineAvg = baseline.length > 0 ? avg(baseline) : recent7dAvg;

  // 절대 수준은 척도에 따라 다른 컬럼에서 온다 — 감쇠 임계값도 같은 척도의 것을 써야 한다
  const interestScale: InterestScale = input.interestScale ?? 'raw';
  const rawAvg = resolveInterestLevel(interestMetrics.slice(0, 7), interestScale) ?? 0;

  const newsThisWeek = newsMetrics.slice(0, 7).reduce((sum, m) => sum + m.article_count, 0);
  const newsLastWeek = newsMetrics.slice(7, 14).reduce((sum, m) => sum + m.article_count, 0);

  // ── 1. Interest Score (Dual-Axis) ──
  let levelScore: number;
  if (input.allThemesRawAvg && input.allThemesRawAvg.length > 0) {
    levelScore = percentileRank(rawAvg, input.allThemesRawAvg);
  } else if (input.rawPercentile !== undefined) {
    levelScore = input.rawPercentile;
  } else if (interestScale === 'raw') {
    levelScore = sigmoid_normalize(rawAvg, cfg.interest_level_center, cfg.interest_level_scale);
  } else {
    // sigmoid 중심·스케일 상수는 raw 척도로 교정돼 있어 앵커 값(~0.006)에 쓰면 전부 0이 된다.
    // 교차 모집단 없이 앵커 척도의 수준을 놓을 방법이 없으므로 중립값으로 둔다.
    levelScore = 0.5;
  }

  const recent7dAsc = [...recent7d].reverse();
  const growthRate = linearRegressionSlope(recent7dAsc);

  let momentumScore: number;
  if (baselineAvg > 0) {
    momentumScore = sigmoid_normalize(growthRate, 0, cfg.interest_momentum_scale);
  } else if (interestScale === 'raw') {
    momentumScore = sigmoid_normalize(rawAvg, cfg.interest_level_center, cfg.interest_level_scale) * 0.5;
  } else {
    momentumScore = levelScore * 0.5;
  }

  let interestScore = levelScore * cfg.interest_level_ratio + momentumScore * (1 - cfg.interest_level_ratio);

  const noiseFloor = interestScale === 'raw' && input.config?.min_raw_interest !== undefined
    ? input.config.min_raw_interest
    : getNoiseFloor(interestScale);
  const dampeningFactor = rawAvg < noiseFloor ? rawAvg / noiseFloor : 1;
  interestScore *= dampeningFactor;

  // ── 2. News Score ──
  const volumeScore = log_normalize(newsThisWeek, cfg.news_log_scale);

  let newsMomentumScore: number;
  let newsScore: number;
  if (newsThisWeek === 0 && newsLastWeek === 0) {
    newsMomentumScore = 0;
    newsScore = 0;
  } else if (newsLastWeek >= cfg.min_news_last_week) {
    const newsChange = (newsThisWeek - newsLastWeek) / Math.max(newsLastWeek, 1);
    newsMomentumScore = sigmoid_normalize(newsChange, 0, cfg.news_momentum_scale);
    newsScore = volumeScore * cfg.news_volume_ratio + newsMomentumScore * (1 - cfg.news_volume_ratio);
  } else {
    newsMomentumScore = volumeScore;
    newsScore = volumeScore;
  }

  // ── 3. Volatility (DVI) ──
  const interestStdDev = standardDeviation(recent7d);
  const dvi = calculateDVI(recent7dAsc);
  const volMagnitude = sigmoid_normalize(interestStdDev, cfg.vol_center, cfg.vol_scale);
  const volatilityScore = dvi * volMagnitude;

  // ── 4. Activity Score ──
  const pricePct = input.avgPriceChangePct ?? 0;
  const vol = input.avgVolume ?? 0;
  const activeDays = firstSpikeDate ? Math.max(0, daysBetween(firstSpikeDate, today)) : 0;

  const stockPriceChange = sigmoid_normalize(pricePct, 0, cfg.price_sigmoid_scale) * cfg.activity_price_weight;
  const volumeIntensity = log_normalize(vol, cfg.volume_log_scale) * cfg.activity_volume_weight;
  const dataCoverage = Math.min(activeDays / cfg.coverage_days, 1) * cfg.activity_coverage_weight;

  const sentimentProxy = computeSentimentProxy({
    avgPriceChangePct: pricePct,
    newsThisWeek: newsThisWeek,
    newsLastWeek: newsLastWeek,
    avgVolume: vol,
    prevAvgVolume: input.prevAvgVolume,
  }, input.config);

  let activityScore = stockPriceChange + volumeIntensity + dataCoverage;
  activityScore = activityScore * cfg.activity_vs_sentiment_ratio + sentimentProxy * (1 - cfg.activity_vs_sentiment_ratio);

  if (levelScore < cfg.level_dampening_threshold) {
    activityScore *= 0.5;
  }

  // ── 5. Total Score ──
  const maturityRatio = activeDays > 0 ? Math.min(activeDays / 90, 1.5) : 0;

  // 단일 소스: getTLIParams() (config override 포함)
  const hasExplicitWeightOverride = input.config?.w_interest !== undefined
    || input.config?.w_newsMomentum !== undefined
    || input.config?.w_volatility !== undefined
  const calibratedWeights = getScoreWeights()
  const wActivity = computeWActivity(cfg);
  const weights = hasExplicitWeightOverride
    ? { interest: cfg.w_interest, newsMomentum: cfg.w_newsMomentum, volatility: cfg.w_volatility, activity: wActivity }
    : {
        interest: calibratedWeights.interest,
        newsMomentum: calibratedWeights.newsMomentum,
        volatility: calibratedWeights.volatility,
        activity: calibratedWeights.activity,
      };

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
      interest_scale: interestScale,
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
