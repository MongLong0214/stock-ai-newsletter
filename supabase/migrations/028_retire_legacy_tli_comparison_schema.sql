-- =====================================================
-- Migration: 028_retire_legacy_tli_comparison_schema.sql
-- Description: Retire legacy comparison schema after v4 cutover
-- =====================================================

DROP TABLE IF EXISTS comparison_calibration;
DROP TABLE IF EXISTS prediction_snapshots;
DROP TABLE IF EXISTS theme_comparisons;
DROP TABLE IF EXISTS comparison_backfill_manifest_v2;
