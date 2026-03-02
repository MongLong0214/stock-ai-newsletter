/**
 * Noise threshold calibration using ROC analysis + Youden's J statistic
 * Signal = themes that eventually reached Growth/Peak stage
 * Noise = themes that stayed Dormant/Emerging
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { supabaseAdmin } from './supabase-admin';
import { setMinRawInterest } from '../../lib/tli/constants/score-config';
import { getKSTDate } from './utils';

interface LabeledTheme {
  rawAvg: number;
  isSignal: boolean;
}

/** Compute True Positive Rate and False Positive Rate at a given threshold */
function computeRates(data: LabeledTheme[], threshold: number): { tpr: number; fpr: number } {
  let tp = 0, fn = 0, fp = 0, tn = 0;
  for (const d of data) {
    const predicted = d.rawAvg >= threshold;
    if (d.isSignal && predicted) tp++;
    else if (d.isSignal && !predicted) fn++;
    else if (!d.isSignal && predicted) fp++;
    else tn++;
  }
  const tpr = tp + fn > 0 ? tp / (tp + fn) : 0;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
  return { tpr, fpr };
}

/** Compute AUC using trapezoidal rule */
export function computeAUC(points: Array<{ fpr: number; tpr: number }>): number {
  const sorted = [...points].sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr);
  let auc = 0;
  for (let i = 1; i < sorted.length; i++) {
    const dx = sorted[i].fpr - sorted[i - 1].fpr;
    const avgY = (sorted[i].tpr + sorted[i - 1].tpr) / 2;
    auc += dx * avgY;
  }
  return auc;
}

/** Find optimal threshold using Youden's J statistic (J = TPR - FPR) */
export function findOptimalThreshold(
  data: LabeledTheme[],
  candidates: number[],
): { threshold: number; youdenJ: number; auc: number } | null {
  if (data.length < 10) return null;

  const rocPoints: Array<{ fpr: number; tpr: number; threshold: number; j: number }> = [];

  for (const t of candidates) {
    const { tpr, fpr } = computeRates(data, t);
    rocPoints.push({ fpr, tpr, threshold: t, j: tpr - fpr });
  }

  const auc = computeAUC(rocPoints);

  // Find threshold with maximum Youden's J
  let best = rocPoints[0];
  for (const p of rocPoints) {
    if (p.j > best.j) best = p;
  }

  return { threshold: best.threshold, youdenJ: best.j, auc };
}

/** Label score records by ever-reached stage (pure function, testable) */
export function labelScoreRecords(
  scores: Array<{ theme_id: string; stage: string; components: unknown }>
): LabeledTheme[] {
  const themeMap = new Map<string, { rawAvg: number; stages: string[] }>();
  for (const s of scores) {
    const existing = themeMap.get(s.theme_id);
    if (existing) {
      existing.stages.push(s.stage);
    } else {
      const components = s.components as { raw?: { raw_interest_avg?: number } } | null;
      const rawAvg = components?.raw?.raw_interest_avg ?? 0;
      themeMap.set(s.theme_id, { rawAvg, stages: [s.stage] });
    }
  }

  const labeled: LabeledTheme[] = [];
  for (const { rawAvg, stages } of themeMap.values()) {
    const isSignal = stages.some(s => s === 'Growth' || s === 'Peak');
    labeled.push({ rawAvg, isSignal });
  }
  return labeled;
}

/** Collect labeled data from historical scores */
async function collectLabeledData(): Promise<LabeledTheme[] | null> {
  // Get themes that have at least 30 days of data
  const { data: themes, error } = await supabaseAdmin
    .from('themes')
    .select('id')
    .eq('is_active', true);

  if (error || !themes?.length) return null;

  const themeIds = themes.map(t => t.id);
  const labeled: LabeledTheme[] = [];

  // 180-day lookback to stay within Supabase row limits per batch
  const lookbackDate = new Date(Date.now() + 9 * 60 * 60 * 1000 - 180 * 86_400_000)
    .toISOString().split('T')[0];

  // Batch process
  const BATCH = 50;
  for (let i = 0; i < themeIds.length; i += BATCH) {
    const chunk = themeIds.slice(i, i + BATCH);

    // Get scores within lookback window for each theme
    const { data: scores } = await supabaseAdmin
      .from('lifecycle_scores')
      .select('theme_id, stage, components')
      .in('theme_id', chunk)
      .gte('calculated_at', lookbackDate)
      .order('calculated_at', { ascending: false });

    if (!scores) continue;

    labeled.push(...labelScoreRecords(scores));
  }

  return labeled.length >= 20 ? labeled : null;
}

export async function calibrateNoiseThreshold(): Promise<{
  threshold: number;
  youdenJ: number;
  auc: number;
} | null> {
  const data = await collectLabeledData();
  if (!data) {
    console.log('   ⊘ 노이즈 교정 데이터 부족');
    return null;
  }

  // Test thresholds from 1 to 20 in steps of 0.5
  const candidates = Array.from({ length: 39 }, (_, i) => 1 + i * 0.5);
  const result = findOptimalThreshold(data, candidates);

  if (!result) {
    console.log('   ⊘ 노이즈 임계값 최적화 실패');
    return null;
  }

  // Only apply if AUC >= 0.65 (meaningful discriminative power)
  if (result.auc < 0.65) {
    console.log(`   ⊘ AUC ${result.auc.toFixed(3)} < 0.65 — 기본 임계값 유지`);
    return null;
  }

  // Save and apply
  const today = getKSTDate();
  await supabaseAdmin.from('confidence_calibration').upsert({
    calculated_at: today,
    calibration_type: 'noise_threshold',
    threshold_value: result.threshold,
    auc: result.auc,
    youden_j: result.youdenJ,
    sample_size: data.length,
  }, { onConflict: 'calculated_at,calibration_type' });

  setMinRawInterest(result.threshold);
  console.log(`   ✅ 노이즈 임계값 교정: ${result.threshold} (AUC=${result.auc.toFixed(3)}, J=${result.youdenJ.toFixed(3)}, N=${data.length})`);

  return result;
}
