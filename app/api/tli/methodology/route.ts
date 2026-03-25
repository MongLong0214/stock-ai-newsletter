import { apiSuccess } from '@/lib/tli/api-utils'
import { getKSTDateString } from '@/lib/tli/date-utils'

const METHODOLOGY = {
  name: 'TLI (Theme Lifecycle Index)',
  version: '2.0 — Bayesian Optimized',
  description: 'Quantitative index tracking Korean stock market theme lifecycles using public data sources.',

  scoring: {
    range: '0-100',
    components: [
      { name: 'interest', weight: '30.4%', source: 'Naver DataLab', method: '7-day search volume average vs 30-day baseline, sigmoid-normalized. Batch self-normalization applied (DataLab 5-keyword batch limit).' },
      { name: 'newsMomentum', weight: '36.6%', source: 'Naver News', method: 'Log-scale news volume + weekly article count change rate.' },
      { name: 'volatility', weight: '10.4%', source: 'Interest time-series', method: 'Standard deviation of interest values, sigmoid-normalized.' },
      { name: 'activity', weight: '22.6%', source: 'Naver Finance', method: 'Related stock price change rates, trading volume intensity, and data coverage cross-signal.' },
    ],
    optimization: 'Weights derived via Bayesian Optimization (Optuna TPE sampler, 2-stage hierarchical search: 80 trials core params + 120 trials fine-tune). Validated with walk-forward train/val split with 7-day gap to prevent data leakage.',
    accuracy: 'Growth/Decline Directional Accuracy (GDDA): ~66% on validation set.',
  },

  stabilization: {
    pipeline: 'Cautious Decay → Bollinger Band Clamp → EMA Smoothing (applied in this fixed order)',
    cautiousDecay: {
      description: 'Prevents false score drops from data gaps or temporary noise.',
      mechanism: '3 independent binary signals checked on score decline: (1) interest slope < 0, (2) this week news < last week news, (3) directional volatility index < 0.4. Decline confirmed only if 2+ signals agree (majority vote). Otherwise, previous score × 0.947 used as floor.',
    },
    bollingerClamp: {
      description: 'Limits daily score change to prevent spikes.',
      mechanism: 'Max daily change = max(min_daily_change, 2 × σ of recent smoothed scores).',
    },
    emaScheduling: {
      description: 'Theme age-adaptive smoothing.',
      mechanism: 'EMA alpha linearly interpolated: new themes (0 days) α=0.6 (reactive) → mature themes (30+ days) α=0.3 (stable). Null first_spike_date uses default α=0.417.',
    },
  },

  stages: {
    order: 'Dormant → Emerging → Growth → Peak → Decline (→ Dormant or Reigniting)',
    thresholds: {
      dormant: { score: '< 10', condition: 'AND trend ≠ rising' },
      emerging: { score: 'default', condition: 'Does not match other stage criteria' },
      growth: { score: '≥ 40', condition: 'AND stable/rising trend' },
      peak: { score: '≥ 71', condition: 'OR (≥ 50 AND stable/rising AND news > 30 articles)' },
      decline: { condition: 'Falling trend AND score < 86% of level score AND news declining' },
      reigniting: { condition: 'Transition from Decline to Emerging/Growth' },
    },
    hysteresis: '2 consecutive days of same candidate stage required for transition (prevents 1-day noise).',
    markov: 'Only allowed transitions: Dormant→Emerging, Emerging→Growth/Dormant, Growth→Peak/Decline, Peak→Decline/Growth, Decline→Dormant/Emerging/Growth. Data gap ≥ 3 days relaxes constraints.',
  },

  comparison: {
    method: '3-Pillar similarity analysis',
    pillars: [
      { name: 'Feature Similarity', weight: 'dynamic (0.40-1.00)', method: 'Mutual Rank (sqrt of bidirectional rank product) with z-score and cosine fallbacks.' },
      { name: 'Curve Similarity', weight: 'dynamic (0.00-0.60)', method: 'Shape RMSE (35%) + Derivative Pearson correlation (30%) + DTW distance (35%). Minimum 14 days data required.' },
      { name: 'Keyword Similarity', weight: 'display only', method: 'Jaccard coefficient of theme keywords.' },
    ],
    threshold: '≥ 0.40 to qualify as meaningful comparison. Auto-tuned via comparison_calibration feedback loop.',
  },

  prediction: {
    horizon: '7-day directional outlook',
    phases: 'Rising (Emerging + Growth), Hot (Peak), Cooling (Decline + Dormant)',
    reliability: 'Rising signals are most accurate. Cooling signals are reference-level only.',
  },

  dataSources: [
    { name: 'Naver DataLab', provides: 'Search interest trends (relative values, 30-day window)' },
    { name: 'Naver News', provides: 'Article counts and headlines' },
    { name: 'Naver Finance', provides: 'Theme stock listings, prices, trading volumes' },
  ],

  updateSchedule: {
    themeDiscovery: 'Sunday and Wednesday',
    scores: 'Daily (full pipeline after market close)',
    news: 'Daily (morning + evening)',
    stocks: 'Weekdays (full)',
  },

  runtime: {
    orchestration: 'collect-and-score.ts is the main batch orchestrator for the end-to-end TLI pipeline.',
    pipelineSteps: [
      'Load all active themes',
      'Collect 30-day Naver DataLab interest metrics',
      'Collect 14-day Naver News article counts',
      'Collect Naver Finance theme stocks',
      'Calculate lifecycle scores',
      'Generate v4 comparison candidates and serving inputs',
    ],
    comparisonServing: [
      'Comparison serving is permanently v4-only',
      'User-facing comparison reads use the latest published archetype run by default',
      'Serving metadata uses certification-grade calibration and weight artifacts',
    ],
    canonicalCommands: {
      runtime: ['npm run tli:run', 'npm run tli:compare'],
      ops: [
        'npm run tli:level4:calibrate',
        'npm run tli:level4:weights',
        'npm run tli:level4:drift',
        'npm run tli:level4:certify',
        'npm run tli:phase0:bridge',
        'npm run tli:phase0:materialize',
        'npm run tli:v4:promote -- <run-id> [run-id...]',
      ],
    },
    collectors: [
      {
        name: 'Naver DataLab',
        data: 'Daily search interest ratios',
        features: ['5-theme batch calls', 'retry with exponential backoff', '1s rate limiting'],
      },
      {
        name: 'Naver News',
        data: 'Daily article counts by theme keywords',
        features: ['OR query composition', 'retry with exponential backoff', '200ms rate limiting'],
      },
      {
        name: 'Naver Finance',
        data: 'Theme stock mappings and market labels',
        features: ['HTML parsing', 'symbol/name/market extraction', '3s polite scraping delay'],
      },
    ],
  },

  dataFlow: {
    collection: ['interest_metrics', 'news_metrics', 'theme_stocks'],
    derived: ['lifecycle_scores', 'theme_comparison_*', 'prediction_snapshots_v2'],
    summary: 'Collectors ingest raw public data into Supabase, then score calculation and comparison generation produce user-facing lifecycle and analog outputs.',
  },

  databaseTables: [
    { name: 'themes', purpose: 'Core theme metadata and configuration' },
    { name: 'theme_keywords', purpose: 'Theme keywords for discovery and source collection' },
    { name: 'theme_stocks', purpose: 'Stock-theme mappings collected from Naver Finance' },
    { name: 'interest_metrics', purpose: 'Daily search interest series from Naver DataLab' },
    { name: 'news_metrics', purpose: 'Daily article counts from Naver News Search API' },
    { name: 'lifecycle_scores', purpose: 'Calculated TLI scores, stages, and score components' },
    { name: 'theme_comparison_runs_v2', purpose: 'v4 comparison execution runs' },
    { name: 'theme_comparison_candidates_v2', purpose: 'Top analog candidates per v4 comparison run' },
    { name: 'theme_comparison_eval_v2', purpose: 'Fixed-horizon evaluation results for comparison candidates' },
    { name: 'prediction_snapshots_v2', purpose: 'Prediction snapshots derived from comparison candidates' },
  ],

  limitations: [
    'Naver DataLab 5-keyword batch limit requires self-normalization across batches — precision is limited.',
    'News momentum is article-count-based; sentiment analysis is not included (removed due to low accuracy).',
    'Data collection intervals mean latest market changes may not be immediately reflected.',
  ],

  disclaimer: 'This algorithm and its results are for informational purposes only, not investment advice. High scores indicate strong theme momentum, not necessarily investment opportunity — they may signal overheating.',
}

const SECTION_KEY_MAP: Record<string, string> = {
  data_sources: 'dataSources',
  update_schedule: 'updateSchedule',
  data_flow: 'dataFlow',
  database_tables: 'databaseTables',
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const section = searchParams.get('section')

  const updatedAt = getKSTDateString()

  if (!section || section === 'all') {
    return apiSuccess({ ...METHODOLOGY, updatedAt }, undefined, 'long')
  }

  const mappedKey = (SECTION_KEY_MAP[section] || section) as keyof typeof METHODOLOGY
  const sectionData = METHODOLOGY[mappedKey]

  const result = {
    section,
    ...(Array.isArray(sectionData)
      ? { items: sectionData }
      : typeof sectionData === 'object'
        ? sectionData
        : { value: sectionData }),
  }

  return apiSuccess(result, undefined, 'long')
}

export const runtime = 'nodejs'
