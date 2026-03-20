/**
 * Monthly weight calibration script — Shannon Entropy + domain bounds
 * Reads recent lifecycle_scores, computes entropy weights, saves to weight_calibration table
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin';
import { computeEntropyWeights } from '@/lib/tli/weights/entropy-weights';
import { setScoreWeights } from '@/lib/tli/constants/score-config';
import { getKSTDate } from '@/scripts/tli/shared/utils';
import type { ScoreComponents } from '@/lib/tli/types';

/** Build decision matrix from recent scores */
async function buildDecisionMatrix(): Promise<number[][] | null> {
  const thirtyDaysAgo = new Date(Date.now() + 9 * 60 * 60 * 1000 - 30 * 86_400_000)
    .toISOString().split('T')[0];

  const { data, error } = await supabaseAdmin
    .from('lifecycle_scores')
    .select('components')
    .gte('calculated_at', thirtyDaysAgo)
    .order('calculated_at', { ascending: false })
    .limit(500);

  if (error || !data?.length) return null;

  const matrix: number[][] = [];
  for (const row of data) {
    const c = row.components as ScoreComponents | null;
    if (!c) continue;
    matrix.push([
      c.interest_score ?? 0,
      c.news_momentum ?? 0,
      c.volatility_score ?? 0,
      c.activity_score ?? 0,
    ]);
  }

  return matrix.length >= 10 ? matrix : null;
}

export async function calibrateWeights(): Promise<{
  weights: { interest: number; newsMomentum: number; volatility: number; activity: number };
  sampleSize: number;
} | null> {
  const matrix = await buildDecisionMatrix();
  if (!matrix) {
    console.log('   ⊘ 가중치 교정 데이터 부족');
    return null;
  }

  const weights = computeEntropyWeights(matrix);
  if (!weights) {
    console.log('   ⊘ Entropy 가중치 계산 실패 (균등 분포)');
    return null;
  }

  // Save to calibration table
  const today = getKSTDate();
  const { error } = await supabaseAdmin
    .from('weight_calibration')
    .upsert({
      calculated_at: today,
      interest_weight: weights.interest,
      news_weight: weights.newsMomentum,
      volatility_weight: weights.volatility,
      activity_weight: weights.activity,
      sample_size: matrix.length,
      method: 'shannon_entropy',
    }, { onConflict: 'calculated_at' });

  if (error) {
    console.error('   ❌ 가중치 교정 저장 실패:', error.message);
    return null;
  }

  // Apply to runtime
  setScoreWeights(weights);
  console.log(`   ✅ Entropy 가중치 교정: interest=${weights.interest} news=${weights.newsMomentum} vol=${weights.volatility} act=${weights.activity} (N=${matrix.length})`);

  return { weights, sampleSize: matrix.length };
}
