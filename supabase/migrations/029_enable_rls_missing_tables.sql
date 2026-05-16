-- =====================================================
-- Migration: 029_enable_rls_missing_tables.sql
-- Description: Enable Row Level Security on 4 public tables that were
--              created without RLS (pre-dates the security-hardening initiative).
--              Restrict access to service_role only; anon/authenticated fully blocked.
-- Tables:
--   * newsletter_content       (from 001)
--   * prediction_snapshots     (from 007, legacy v1)
--   * comparison_calibration   (from 008)
--   * calibration_artifact     (from 021)
-- Idempotent: safe to run multiple times (DROP POLICY IF EXISTS, ENABLE RLS no-op).
-- =====================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. Enable Row Level Security on target tables
--    ALTER ... ENABLE ROW LEVEL SECURITY is idempotent in Postgres.
-- ---------------------------------------------------------------
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.newsletter_content ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.prediction_snapshots ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.comparison_calibration ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.calibration_artifact ENABLE ROW LEVEL SECURITY';
END $$;

-- ---------------------------------------------------------------
-- 2. Service-role ALL policies (idempotent via DROP + CREATE)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_all_newsletter_content" ON public.newsletter_content;
CREATE POLICY "service_role_all_newsletter_content" ON public.newsletter_content
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_prediction_snapshots" ON public.prediction_snapshots;
CREATE POLICY "service_role_all_prediction_snapshots" ON public.prediction_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_comparison_calibration" ON public.comparison_calibration;
CREATE POLICY "service_role_all_comparison_calibration" ON public.comparison_calibration
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_calibration_artifact" ON public.calibration_artifact;
CREATE POLICY "service_role_all_calibration_artifact" ON public.calibration_artifact
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 3. Revoke all grants from anon and authenticated roles.
--    Defense-in-depth: even if a future policy is mistakenly added,
--    GRANT-level ACL still blocks anon/authenticated.
-- ---------------------------------------------------------------
REVOKE ALL ON TABLE
  public.newsletter_content,
  public.prediction_snapshots,
  public.comparison_calibration,
  public.calibration_artifact
FROM anon, authenticated;

-- ---------------------------------------------------------------
-- 4. Assertion: verify RLS is actually enabled on all 4 tables.
--    Fails the transaction (COMMIT aborts) if any table is missing RLS.
-- ---------------------------------------------------------------
DO $$
DECLARE
  cnt int;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN (
      'newsletter_content',
      'prediction_snapshots',
      'comparison_calibration',
      'calibration_artifact'
    )
    AND rowsecurity = true;

  IF cnt <> 4 THEN
    RAISE EXCEPTION 'RLS not enabled on all 4 target tables (expected 4, got %)', cnt;
  END IF;
END $$;

COMMIT;
