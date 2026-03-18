import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

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

  limitations: [
    'Naver DataLab 5-keyword batch limit requires self-normalization across batches — precision is limited.',
    'News momentum is article-count-based; sentiment analysis is not included (removed due to low accuracy).',
    'Data collection intervals mean latest market changes may not be immediately reflected.',
  ],

  disclaimer: 'This algorithm and its results are for informational purposes only, not investment advice. High scores indicate strong theme momentum, not necessarily investment opportunity — they may signal overheating.',
};

const SECTIONS = ['scoring', 'stabilization', 'stages', 'comparison', 'prediction', 'all'] as const;

export const registerGetMethodology = (server: McpServer): void => {
  server.tool(
    'get_methodology',
    `Get the TLI (Theme Lifecycle Index) algorithm methodology — how scores, stages, and predictions work.

Use when the user asks:
- How are theme scores calculated?
- What do the lifecycle stages mean?
- How does the prediction work?
- TLI 알고리즘 설명, 점수 산출 방식, 단계 판정 기준
- What data sources are used?

Returns structured documentation of the scoring algorithm, stage determination, stabilization techniques, comparison analysis, and prediction methodology.`,
    {
      section: z
        .enum(SECTIONS)
        .optional()
        .describe('Specific section: scoring, stabilization, stages, comparison, prediction, or all (default: all)'),
    },
    async ({ section }) => {
      const selected = section || 'all';

      if (selected === 'all') {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(METHODOLOGY, null, 2) }],
        };
      }

      const sectionData = METHODOLOGY[selected as keyof typeof METHODOLOGY];
      const result = {
        section: selected,
        ...(typeof sectionData === 'object' ? sectionData : { value: sectionData }),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
};