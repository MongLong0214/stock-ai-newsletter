/**
 * Load persisted calibration values from DB on pipeline startup.
 * Ensures calibrated thresholds survive across process restarts.
 */

import { supabaseAdmin } from './supabase-admin';
import { setMinRawInterest, setScoreWeights, setConfidenceThresholds } from '../../lib/tli/constants/score-config';

export async function loadCalibrationsFromDB(): Promise<void> {
  // Load noise threshold
  const { data: noiseRow } = await supabaseAdmin
    .from('confidence_calibration')
    .select('threshold_value')
    .eq('calibration_type', 'noise_threshold')
    .order('calculated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (noiseRow?.threshold_value) {
    setMinRawInterest(noiseRow.threshold_value);
    console.log(`   📥 노이즈 임계값 로드: ${noiseRow.threshold_value}`);
  }

  // Load confidence thresholds
  const { data: confRow } = await supabaseAdmin
    .from('confidence_calibration')
    .select('high_coverage, high_days, medium_coverage, medium_days')
    .eq('calibration_type', 'confidence_thresholds')
    .order('calculated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (confRow?.high_coverage) {
    setConfidenceThresholds({
      highCoverage: confRow.high_coverage,
      highDays: confRow.high_days,
      mediumCoverage: confRow.medium_coverage,
      mediumDays: confRow.medium_days,
    });
    console.log(`   📥 Confidence 임계값 로드: high≥${confRow.high_coverage}/${confRow.high_days}d`);
  }

  // Load entropy weights
  const { data: weightRow } = await supabaseAdmin
    .from('weight_calibration')
    .select('interest_weight, news_weight, volatility_weight, activity_weight')
    .order('calculated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (weightRow?.interest_weight) {
    setScoreWeights({
      interest: weightRow.interest_weight,
      newsMomentum: weightRow.news_weight,
      volatility: weightRow.volatility_weight,
      activity: weightRow.activity_weight,
    });
    console.log(`   📥 Entropy 가중치 로드: i=${weightRow.interest_weight} n=${weightRow.news_weight} v=${weightRow.volatility_weight} a=${weightRow.activity_weight}`);
  }
}
