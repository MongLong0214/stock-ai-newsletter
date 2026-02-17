-- =====================================================
-- Migration: 009_tli_algorithm_v3.sql
-- Description: TLI Algorithm v3 — Stage rename + smoothing columns
-- Date: 2026-02-17
-- =====================================================

-- 1. Add smoothing columns to lifecycle_scores
--    raw_score: 가중합 원점수 (smoothing 전)
--    smoothed_score: EMA smoothing 적용 후 최종 점수
ALTER TABLE lifecycle_scores ADD COLUMN IF NOT EXISTS raw_score INTEGER;
ALTER TABLE lifecycle_scores ADD COLUMN IF NOT EXISTS smoothed_score INTEGER;

-- 2. Stage rename in lifecycle_scores: Early → Emerging, Decay → Decline
UPDATE lifecycle_scores SET stage = 'Emerging' WHERE stage = 'Early';
UPDATE lifecycle_scores SET stage = 'Decline' WHERE stage = 'Decay';

-- 3. prev_stage rename (동일 테이블)
UPDATE lifecycle_scores SET prev_stage = 'Emerging' WHERE prev_stage = 'Early';
UPDATE lifecycle_scores SET prev_stage = 'Decline' WHERE prev_stage = 'Decay';

-- 4. Comparison table: past_final_stage rename
UPDATE theme_comparisons SET past_final_stage = 'Emerging' WHERE past_final_stage = 'Early';
UPDATE theme_comparisons SET past_final_stage = 'Decline' WHERE past_final_stage = 'Decay';

-- =====================================================
-- ROLLBACK (수동 실행 — 되돌리기 필요 시)
-- =====================================================
-- ALTER TABLE lifecycle_scores DROP COLUMN IF EXISTS raw_score;
-- ALTER TABLE lifecycle_scores DROP COLUMN IF EXISTS smoothed_score;
--
-- UPDATE lifecycle_scores SET stage = 'Early' WHERE stage = 'Emerging';
-- UPDATE lifecycle_scores SET stage = 'Decay' WHERE stage = 'Decline';
-- UPDATE lifecycle_scores SET prev_stage = 'Early' WHERE prev_stage = 'Emerging';
-- UPDATE lifecycle_scores SET prev_stage = 'Decay' WHERE prev_stage = 'Decline';
--
-- UPDATE theme_comparisons SET past_final_stage = 'Early' WHERE past_final_stage = 'Emerging';
-- UPDATE theme_comparisons SET past_final_stage = 'Decay' WHERE past_final_stage = 'Decline';
