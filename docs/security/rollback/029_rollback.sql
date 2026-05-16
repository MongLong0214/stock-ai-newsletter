-- =====================================================
-- ROLLBACK for Migration 029 — OUT-OF-BAND ONLY
--
-- THIS FILE MUST NOT BE APPLIED BY `supabase db push`.
-- Location: docs/security/rollback/ (outside supabase/migrations/)
-- Usage: psql "$DATABASE_URL" -f docs/security/rollback/029_rollback.sql
--
-- Description: Drop service_role policies and disable RLS on the 4 tables.
--              Note: REVOKE from anon/authenticated is intentionally NOT restored —
--              restoring default grants to untrusted roles is unsafe. If a future
--              change truly needs anon access, explicit GRANT statements should be
--              added in a new migration rather than blanket-restored here.
-- Idempotent: safe to run multiple times.
-- Authorization: Isaac approval required (security regression).
-- =====================================================

BEGIN;

-- 1. Drop the service_role policies (no-op if absent).
DROP POLICY IF EXISTS "service_role_all_newsletter_content" ON public.newsletter_content;
DROP POLICY IF EXISTS "service_role_all_prediction_snapshots" ON public.prediction_snapshots;
DROP POLICY IF EXISTS "service_role_all_comparison_calibration" ON public.comparison_calibration;
DROP POLICY IF EXISTS "service_role_all_calibration_artifact" ON public.calibration_artifact;

-- 2. Disable Row Level Security on target tables.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.newsletter_content DISABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.prediction_snapshots DISABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.comparison_calibration DISABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.calibration_artifact DISABLE ROW LEVEL SECURITY';
END $$;

COMMIT;
