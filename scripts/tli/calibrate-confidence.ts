/**
 * Monthly confidence calibration script
 * Uses prediction_snapshots (evaluated=true) to calibrate confidence thresholds via ECE minimization
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { supabaseAdmin } from './supabase-admin';
import { calibrateConfidenceThresholds } from '../../lib/tli/confidence-calibration';
import { setConfidenceThresholds } from '../../lib/tli/constants/score-config';
import { getKSTDate } from './utils';

export async function calibrateConfidence(): Promise<{
  highCoverage: number;
  highDays: number;
  mediumCoverage: number;
  mediumDays: number;
  ece: number;
} | null> {
  // Load evaluated prediction snapshots
  const { data: snapshots, error } = await supabaseAdmin
    .from('prediction_snapshots')
    .select('theme_id, snapshot_date, phase_correct, status')
    .eq('status', 'evaluated')
    .not('phase_correct', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error || !snapshots?.length) {
    console.log('   ⊘ Confidence 교정 데이터 부족 (evaluated snapshots 없음)');
    return null;
  }

  // Join with lifecycle_scores to get actual confidence metrics
  const themeIds = [...new Set(snapshots.map(s => s.theme_id))];
  const dates = [...new Set(snapshots.map(s => s.snapshot_date))];

  const { data: scores } = await supabaseAdmin
    .from('lifecycle_scores')
    .select('theme_id, calculated_at, components')
    .in('theme_id', themeIds)
    .in('calculated_at', dates);

  const scoreMap = new Map<string, { interestCoverage: number; newsCoverage: number; dataAge: number }>();
  for (const s of scores ?? []) {
    const conf = (s.components as { confidence?: { interestCoverage?: number; newsCoverage?: number; dataAge?: number } } | null)?.confidence;
    if (conf) {
      scoreMap.set(`${s.theme_id}|${s.calculated_at}`, {
        interestCoverage: conf.interestCoverage ?? 0,
        newsCoverage: conf.newsCoverage ?? 0,
        dataAge: conf.dataAge ?? 0,
      });
    }
  }

  // Build calibration samples from real confidence metrics
  const samples: Array<{
    coverageScore: number;
    interestDays: number;
    accurate: boolean;
  }> = [];

  for (const snap of snapshots) {
    const conf = scoreMap.get(`${snap.theme_id}|${snap.snapshot_date}`);
    if (!conf) continue;

    const coverageScore = conf.interestCoverage * 0.6 + conf.newsCoverage * 0.4;
    const interestDays = conf.dataAge;
    const accurate = snap.phase_correct === true;

    samples.push({ coverageScore, interestDays, accurate });
  }

  if (samples.length < 30) {
    console.log(`   ⊘ Confidence 교정 샘플 부족 (${samples.length}/30)`);
    return null;
  }

  const result = calibrateConfidenceThresholds(samples);
  if (!result) {
    console.log('   ⊘ Confidence 교정 실패');
    return null;
  }

  // Save to DB
  const today = getKSTDate();
  await supabaseAdmin.from('confidence_calibration').upsert({
    calculated_at: today,
    calibration_type: 'confidence_thresholds',
    high_coverage: result.highCoverage,
    high_days: result.highDays,
    medium_coverage: result.mediumCoverage,
    medium_days: result.mediumDays,
    ece: result.ece,
    sample_size: samples.length,
  }, { onConflict: 'calculated_at,calibration_type' });

  setConfidenceThresholds(result);
  console.log(`   ✅ Confidence 교정: high≥${result.highCoverage}/${result.highDays}d, medium≥${result.mediumCoverage}/${result.mediumDays}d (ECE=${result.ece.toFixed(4)}, N=${samples.length})`);

  return result;
}
