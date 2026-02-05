import { normalize, standardDeviation, avg, daysBetween } from './normalize';
import type { InterestMetric, NewsMetric, ScoreComponents } from './types';

const WEIGHTS = {
  interest: 0.40,
  news: 0.30,
  volatility: 0.15,
  maturity: 0.15,
} as const;

const AVG_THEME_LIFESPAN = 90;

interface CalculateScoreInput {
  interestMetrics: InterestMetric[];
  newsMetrics: NewsMetric[];
  firstSpikeDate: string | null;
  today?: string;
}

export function calculateLifecycleScore(input: CalculateScoreInput): {
  score: number;
  components: ScoreComponents;
} {
  const { interestMetrics, newsMetrics, firstSpikeDate } = input;
  const today = input.today || new Date().toISOString().split('T')[0];

  const recent7d = interestMetrics.slice(0, 7).map(m => m.normalized);
  const baseline30d = interestMetrics.slice(0, 30).map(m => m.normalized);
  const recent7dAvg = avg(recent7d);
  const baseline30dAvg = avg(baseline30d);
  const interestRatio = baseline30dAvg > 0 ? recent7dAvg / baseline30dAvg : 0;
  const interestScore = normalize(interestRatio, 0.5, 3.0);

  const newsThisWeek = newsMetrics.slice(0, 7).reduce((sum, m) => sum + m.article_count, 0);
  const newsLastWeek = newsMetrics.slice(7, 14).reduce((sum, m) => sum + m.article_count, 0);
  const newsGrowthRate = (newsThisWeek - newsLastWeek) / Math.max(newsLastWeek, 1);
  const newsMomentum = normalize(newsGrowthRate, -0.5, 2.0);

  const interestStdDev = standardDeviation(recent7d);
  const volatilityScore = normalize(interestStdDev, 0, 30);

  const activeDays = firstSpikeDate ? daysBetween(firstSpikeDate, today) : 0;
  const maturityRatio = Math.min(activeDays / AVG_THEME_LIFESPAN, 1.5);
  const maturityNormalized = normalize(maturityRatio, 0, 1.5);

  const rawScore =
    interestScore * WEIGHTS.interest +
    newsMomentum * WEIGHTS.news +
    volatilityScore * WEIGHTS.volatility +
    maturityNormalized * WEIGHTS.maturity;

  const score = Math.round(rawScore * 100);

  const components: ScoreComponents = {
    interest_score: interestScore,
    news_momentum: newsMomentum,
    volatility_score: volatilityScore,
    maturity_ratio: maturityRatio,
    weights: { ...WEIGHTS },
    raw: {
      recent_7d_avg: recent7dAvg,
      baseline_30d_avg: baseline30dAvg,
      news_this_week: newsThisWeek,
      news_last_week: newsLastWeek,
      interest_stddev: interestStdDev,
      active_days: activeDays,
    },
  };

  return { score: Math.max(0, Math.min(100, score)), components };
}
