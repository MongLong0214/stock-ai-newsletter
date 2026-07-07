import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { FEATURE_NAMES } from '@/lib/tli/features/build-features'
import type { FeatureVector } from '@/lib/tli/features/build-features'
import type { M1ModelArtifact } from '@/lib/tli/model/m1'
import type { PredictionResult } from '@/lib/tli/prediction'
import {
  TLI_V3_BASELINE_MODEL_VERSION,
  buildBaselineChampionPredictionV3Row,
  buildM1ShadowPredictionV3Row,
  parseThemePredictionV3Row,
  toThemePredictionV3Record,
} from '@/scripts/tli/comparison/theme-predictions-v3'

const featureVector = (overrides?: Partial<FeatureVector>): FeatureVector => ({
  values: FEATURE_NAMES.map(() => 0),
  missingFlags: FEATURE_NAMES.map(() => false),
  abstain: false,
  abstainReasons: [],
  ...overrides,
})

const prediction = (phase: PredictionResult['phase']): PredictionResult => ({
  daysSinceSpike: 4,
  confidence: 'medium',
  comparisonCount: 3,
  avgSimilarity: 0.62,
  avgPeakDay: 10,
  avgTotalDays: 25,
  avgDaysToPeak: 6,
  currentProgress: 16,
  peakProgress: 40,
  scenarios: {
    best: { themeName: 'best', peakDay: 8, totalDays: 20, similarity: 0.8 },
    median: { themeName: 'median', peakDay: 10, totalDays: 25, similarity: 0.7 },
    worst: { themeName: 'worst', peakDay: 14, totalDays: 30, similarity: 0.6 },
  },
  phase,
  momentum: 'stable',
  phaseMessage: 'message',
  riskLevel: 'moderate',
  keyInsight: 'insight',
  stageConfidence: 0.6,
})

const artifact = (): M1ModelArtifact => ({
  artifact_version: 'tli-model-artifact-v1',
  model_type: 'm1_logistic',
  feature_schema: FEATURE_NAMES,
  scaler: {
    median: FEATURE_NAMES.map(() => 0),
    mad: FEATURE_NAMES.map(() => 1),
  },
  coefficients: {
    intercept: 0,
    weights: [
      1,
      ...FEATURE_NAMES.slice(1).map(() => 0),
      ...FEATURE_NAMES.map(() => 0),
    ],
  },
  calibrator: {
    type: 'platt',
    a: -1,
    b: 0,
  },
  trained_at: '2026-08-02',
  train_range: ['2026-01-07', '2026-07-05'],
  labeler_version: 'gta-v1',
  seed: 42,
  sample_report: {},
})

const validDraft = () => ({
  themeId: '00000000-0000-0000-0000-000000000001',
  predictionDate: '2026-07-06',
  horizonDays: 5,
  servingRole: 'champion',
  pRise: 0.5,
  ciLower: null,
  ciUpper: null,
  abstain: false,
  abstainReasons: [],
  features: {
    featureSchema: FEATURE_NAMES,
    values: FEATURE_NAMES.map(() => 0),
    missingFlags: FEATURE_NAMES.map(() => false),
  },
  modelVersion: TLI_V3_BASELINE_MODEL_VERSION,
  labelerVersion: 'gta-v1',
  paramVersion: 'tli-v3-baseline-v1',
  scoreStatus: 'pending',
})

describe('T-207 theme_predictions_v3 schema and rows', () => {
  it('adds additive DDL with champion uniqueness, CHECK constraints, and service_role-only RLS', async () => {
    const sql = await readFile('supabase/migrations/035_create_theme_predictions_v3.sql', 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.theme_predictions_v3')
    expect(sql).toContain("CHECK (serving_role IN ('champion','challenger','shadow'))")
    expect(sql).toContain("CHECK (score_status IN ('pending','scored','censored','excluded'))")
    expect(sql).toContain('CHECK (abstain OR p_rise IS NOT NULL)')
    expect(sql).toContain('CHECK (ci_lower IS NULL OR ci_upper IS NULL OR ci_lower <= ci_upper)')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uniq_predictions_v3_champion')
    expect(sql).toContain("WHERE serving_role = 'champion'")
    expect(sql).toContain('ALTER TABLE public.theme_predictions_v3 ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('TO service_role')
    expect(sql).toContain('REVOKE ALL ON TABLE public.theme_predictions_v3 FROM anon, authenticated')
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i)
  })

  it('rejects local row drafts that would violate DB CHECK constraints', () => {
    expect(() => parseThemePredictionV3Row({ ...validDraft(), pRise: null })).toThrow(/p_rise/)
    expect(() => parseThemePredictionV3Row({ ...validDraft(), pRise: 1.2 })).toThrow(/p_rise/)
    expect(() => parseThemePredictionV3Row({ ...validDraft(), ciLower: 0.8, ciUpper: 0.2 })).toThrow(/ci/)
    expect(() => parseThemePredictionV3Row({ ...validDraft(), servingRole: 'prod' })).toThrow(/serving_role/)
    expect(() => parseThemePredictionV3Row({ ...validDraft(), scoreStatus: 'done' })).toThrow(/score_status/)
  })

  it('builds No-Go baseline champion rows from v2 phase snapshots', () => {
    const row = buildBaselineChampionPredictionV3Row({
      themeId: 'theme-1',
      predictionDate: '2026-07-06',
      prediction: prediction('rising'),
      featureVector: featureVector(),
    })

    expect(row.servingRole).toBe('champion')
    expect(row.modelVersion).toBe(TLI_V3_BASELINE_MODEL_VERSION)
    expect(row.pRise).toBe(1)
    expect(row.features.featureSchema).toEqual(FEATURE_NAMES)
    expect(toThemePredictionV3Record(row)).toMatchObject({
      theme_id: 'theme-1',
      prediction_date: '2026-07-06',
      serving_role: 'champion',
      p_rise: 1,
    })
  })

  it('builds M1 shadow rows and preserves abstain rows without p_rise', () => {
    const scored = buildM1ShadowPredictionV3Row({
      themeId: 'theme-1',
      predictionDate: '2026-07-06',
      featureVector: featureVector({ values: [1.4826, ...FEATURE_NAMES.slice(1).map(() => 0)] }),
      artifact: artifact(),
      modelVersion: 'm1-golden',
      paramVersion: 'tli-v3-m1-shadow-v1',
    })
    const abstained = buildM1ShadowPredictionV3Row({
      themeId: 'theme-2',
      predictionDate: '2026-07-06',
      featureVector: featureVector({ abstain: true, abstainReasons: ['missing_features_gt_3'] }),
      artifact: artifact(),
      modelVersion: 'm1-golden',
      paramVersion: 'tli-v3-m1-shadow-v1',
    })

    expect(scored.servingRole).toBe('shadow')
    expect(scored.pRise).toBeCloseTo(0.7310585786300049, 10)
    expect(abstained.abstain).toBe(true)
    expect(abstained.pRise).toBeNull()
    expect(abstained.abstainReasons).toEqual(['missing_features_gt_3'])
  })
})
