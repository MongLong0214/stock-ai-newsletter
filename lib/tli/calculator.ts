/** TLI 점수 계산 모듈 v2 — Dual-Axis + DVI + Activity */

import {
  standardDeviation,
  avg,
  daysBetween,
  sigmoid_normalize,
  log_normalize,
  percentileRank,
  linearRegressionSlope,
} from './normalize';
import { getKSTDateString } from './date-utils';
import { SCORE_WEIGHTS } from './constants/score-config';
import type { InterestMetric, NewsMetric, CommunityMetric, ScoreComponents, ScoreConfidence } from './types';

/** 최소 데이터 요건 */
const MIN_INTEREST_DAYS = 3;
/** 뉴스 모멘텀 계산을 위한 최소 지난주 기사 수 */
const MIN_NEWS_LAST_WEEK = 3;
/** 커뮤니티 모멘텀 계산을 위한 최소 지난주 건수 */
const MIN_COMMUNITY_LAST_WEEK = 3;
/** 커뮤니티 데이터 없을 때 중립 폴백 점수 */
const COMMUNITY_FALLBACK = 0.3;

interface CalculateScoreInput {
  /** 최신순(desc) 정렬된 관심도 메트릭 (slice(0,7)=최근 7일) */
  interestMetrics: InterestMetric[];
  /** 최신순(desc) 정렬된 뉴스 메트릭 (slice(0,7)=이번 주) */
  newsMetrics: NewsMetric[];
  firstSpikeDate: string | null;
  today?: string;
  /** 관련주 평균 등락률 (%) */
  avgPriceChangePct?: number;
  /** 관련주 평균 거래량 */
  avgVolume?: number;
  /** 전체 테마 raw interest 평균 배열 (오름차순 정렬, percentileRank용) */
  allThemesRawAvg?: number[];
  /** 하위 호환: 파이프라인에서 사전 계산한 백분위 (allThemesRawAvg 우선) */
  rawPercentile?: number;
  /** 이전 스무딩 점수 (EMA용, 미사용 시 스무딩 스킵) */
  prevSmoothedScore?: number;
  /** 최신순(desc) 정렬된 커뮤니티 메트릭 */
  communityMetrics?: CommunityMetric[];
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
  // Level: 전체 테마 대비 상대적 위치 (allThemesRawAvg > rawPercentile > sigmoid fallback)
  let levelScore: number;
  if (input.allThemesRawAvg && input.allThemesRawAvg.length > 0) {
    levelScore = percentileRank(rawAvg, input.allThemesRawAvg);
  } else if (input.rawPercentile !== undefined) {
    levelScore = input.rawPercentile;
  } else {
    levelScore = sigmoid_normalize(rawAvg, 30, 20);
  }

  // Momentum: 7일 관심도 추세 기울기
  // 시계열을 시간순(asc)으로 뒤집어 linearRegressionSlope 입력
  const recent7dAsc = [...recent7d].reverse();
  const growthRate = linearRegressionSlope(recent7dAsc);

  let momentumScore: number;
  if (baselineAvg > 0) {
    momentumScore = sigmoid_normalize(growthRate, 0, 1.5);
  } else {
    // 기준선 부재 시 절대값 기반 half-strength fallback
    momentumScore = sigmoid_normalize(rawAvg, 30, 20) * 0.5;
  }

  let interestScore = levelScore * 0.6 + momentumScore * 0.4;

  // ── 2. News Score ──
  const volumeScore = log_normalize(newsThisWeek, 50);

  let newsMomentumScore: number;
  if (newsLastWeek >= MIN_NEWS_LAST_WEEK) {
    const newsChange = (newsThisWeek - newsLastWeek) / Math.max(newsLastWeek, 1);
    newsMomentumScore = sigmoid_normalize(newsChange, 0, 1.0);
  } else {
    // 기준선 부족 시 중립
    newsMomentumScore = 0.5;
  }

  const newsScore = volumeScore * 0.6 + newsMomentumScore * 0.4;

  // ── DataLab 미수집 fallback ──
  if (rawAvg === 0 && newsThisWeek > 0) {
    interestScore = newsScore * 0.7;
  }

  // ── 3. Volatility (DVI — Directional Volatility Index) ──
  const interestStdDev = standardDeviation(recent7d);
  // 7일 관심도 일일 변화량 (시간순)
  const deltas: number[] = [];
  for (let i = recent7dAsc.length - 1; i > 0; i--) {
    deltas.push(recent7dAsc[i] - recent7dAsc[i - 1]);
  }

  const upMoves = deltas.filter(d => d > 0);
  const downMoves = deltas.filter(d => d < 0).map(d => Math.abs(d));
  const avgUp = avg(upMoves);
  const avgDown = avg(downMoves);

  let dvi: number;
  if (avgUp === 0 && avgDown === 0) {
    dvi = 0.5;
  } else if (avgDown > 0) {
    const rs = avgUp / avgDown;
    dvi = 1 - 1 / (1 + rs);
  } else {
    dvi = 1.0;
  }

  const volMagnitude = sigmoid_normalize(interestStdDev, 15, 10);
  const volatilityScore = dvi * volMagnitude;

  // ── 4. Activity Score ──
  const pricePct = input.avgPriceChangePct ?? 0;
  const vol = input.avgVolume ?? 0;
  const activeDays = firstSpikeDate ? Math.max(0, daysBetween(firstSpikeDate, today)) : 0;

  const stockPriceChange = sigmoid_normalize(pricePct, 0, 5) * 0.5;
  const volumeIntensity = log_normalize(vol, 50_000_000) * 0.3;
  const dataCoverage = Math.min(activeDays / 14, 1) * 0.2;

  let activityScore = stockPriceChange + volumeIntensity + dataCoverage;

  // 노이즈 게이트: 관심도 수준이 극히 낮으면 활동성도 감쇠
  if (levelScore < 0.1) {
    activityScore *= 0.5;
  }

  // ── 5. Community Buzz Score ──
  const communityMetrics = input.communityMetrics ?? [];
  const blogMetrics = communityMetrics.filter(m => m.source === 'blog');
  const discMetrics = communityMetrics.filter(m => m.source === 'discussion');

  // 최근 7일 / 지난 7일 분리 (최신순 정렬 가정)
  const blogThisWeek = blogMetrics.slice(0, 7).reduce((s, m) => s + m.mention_count, 0);
  const blogLastWeek = blogMetrics.slice(7, 14).reduce((s, m) => s + m.mention_count, 0);
  const discThisWeek = discMetrics.slice(0, 7).reduce((s, m) => s + m.mention_count, 0);
  const discLastWeek = discMetrics.slice(7, 14).reduce((s, m) => s + m.mention_count, 0);

  let communityScore: number;
  const totalMentions = communityMetrics.reduce((s, m) => s + m.mention_count, 0);
  if (communityMetrics.length === 0 || totalMentions === 0) {
    // 커뮤니티 데이터 없거나 전부 0이면 중립 fallback (0보다 낮은 점수 방지)
    communityScore = COMMUNITY_FALLBACK;
  } else {
    // 블로그 점수
    const blogVolume = log_normalize(blogThisWeek, 100);
    const blogMomentum = blogLastWeek >= MIN_COMMUNITY_LAST_WEEK
      ? sigmoid_normalize((blogThisWeek - blogLastWeek) / Math.max(blogLastWeek, 1), 0, 1.0)
      : 0.5;
    const blogScore = blogVolume * 0.6 + blogMomentum * 0.4;

    // 종목토론방 점수
    const discVolume = log_normalize(discThisWeek, 500);
    const discMomentum = discLastWeek >= MIN_COMMUNITY_LAST_WEEK
      ? sigmoid_normalize((discThisWeek - discLastWeek) / Math.max(discLastWeek, 1), 0, 1.0)
      : 0.5;
    const discScore = discVolume * 0.6 + discMomentum * 0.4;

    communityScore = blogScore * 0.6 + discScore * 0.4;
  }

  // ── 6. Total Score ──
  const maturityRatio = activeDays > 0 ? Math.min(activeDays / 90, 1.5) : 0;

  const rawScore =
    interestScore * SCORE_WEIGHTS.interest +
    newsScore * SCORE_WEIGHTS.newsMomentum +
    communityScore * SCORE_WEIGHTS.communityBuzz +
    volatilityScore * SCORE_WEIGHTS.volatility +
    activityScore * SCORE_WEIGHTS.activity;

  const score = Math.round(rawScore * 100);

  // ── Confidence 계산 ──
  const interestCoverage = Math.min(interestMetrics.length / 30, 1);
  const newsDaysWithData = new Set(newsMetrics.filter(m => m.article_count > 0).map(m => m.time)).size;
  const newsCoverage = Math.min(newsDaysWithData / 14, 1);
  const coverageScore = interestCoverage * 0.6 + newsCoverage * 0.4;

  let confidenceLevel: ScoreConfidence['level'];
  let confidenceReason: string;

  if (coverageScore >= 0.7 && interestMetrics.length >= 14) {
    confidenceLevel = 'high';
    confidenceReason = '충분한 데이터';
  } else if (coverageScore >= 0.4 && interestMetrics.length >= 7) {
    confidenceLevel = 'medium';
    confidenceReason = interestMetrics.length < 14
      ? `관심도 ${interestMetrics.length}일 (14일 미만)`
      : newsDaysWithData < 7 ? '뉴스 데이터 부족' : '데이터 축적 중';
  } else {
    confidenceLevel = 'low';
    confidenceReason = interestMetrics.length < 7
      ? `관심도 ${interestMetrics.length}일 (7일 미만)`
      : newsDaysWithData === 0 ? '뉴스 데이터 없음' : '데이터 부족';
  }

  const confidence: ScoreConfidence = {
    level: confidenceLevel,
    dataAge: interestMetrics.length,
    interestCoverage,
    newsCoverage,
    reason: confidenceReason,
  };

  const components: ScoreComponents = {
    interest_score: interestScore,
    news_momentum: newsScore,
    volatility_score: volatilityScore,
    maturity_ratio: maturityRatio,
    activity_score: activityScore,
    community_buzz: communityScore,
    weights: {
      interest: SCORE_WEIGHTS.interest,
      news: SCORE_WEIGHTS.newsMomentum,
      volatility: SCORE_WEIGHTS.volatility,
      activity: SCORE_WEIGHTS.activity,
      community: SCORE_WEIGHTS.communityBuzz,
    },
    raw: {
      recent_7d_avg: recent7dAvg,
      baseline_30d_avg: baselineAvg,
      news_this_week: newsThisWeek,
      news_last_week: newsLastWeek,
      interest_stddev: interestStdDev,
      active_days: activeDays,
      raw_interest_avg: rawAvg,
      raw_percentile: input.rawPercentile ?? null,
      level_score: levelScore,
      momentum_score: momentumScore,
      interest_slope: growthRate,
      dvi,
      volume_intensity: volumeIntensity,
      data_coverage: dataCoverage,
      raw_score: rawScore,
      blog_mentions_7d: blogThisWeek,
      blog_mentions_prev_7d: blogLastWeek,
      discussion_posts_7d: discThisWeek,
      discussion_posts_prev_7d: discLastWeek,
    },
    confidence,
  };

  return { score: Math.max(0, Math.min(100, score)), components, confidence };
}
