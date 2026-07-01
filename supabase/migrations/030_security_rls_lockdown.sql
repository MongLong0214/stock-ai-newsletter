-- =====================================================
-- Migration: 030_security_rls_lockdown.sql
-- Description: 라이브 스키마 기준 RLS 보안 잠금.
--   Supabase 보안경고(rls_disabled_in_public + sensitive_columns_exposed) 대응.
--   대상 테이블은 모두 service_role 전용으로 전환하고 anon/authenticated 접근을 차단한다.
--   서버(스크립트 GH Actions + API 라우트)는 SUPABASE_SERVICE_ROLE_KEY를 사용하도록 선행 전환됨.
--   구독/해지 플로우는 /api/subscribe, /api/unsubscribe (service_role) 경유로 이전됨.
--
-- Tables:
--   * kis_tokens           (RLS off → 한투 access_token 노출)  [Critical]
--   * subscribers          (public SELECT/UPDATE USING(true) → 이메일 열람/변조) [Critical]
--   * email_logs           (public SELECT USING(true) → 이메일 로그 노출) [Critical]
--   * newsletter_content   (RLS off → anon 삭제/변조)
--   * calibration_artifact (RLS off → anon 접근; 029 대체)
-- Idempotent: DROP POLICY IF EXISTS + ENABLE RLS(no-op) + REVOKE.
-- Rollback: docs/security/rollback/030_rollback.sql
-- =====================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. Enable RLS
-- ---------------------------------------------------------------
ALTER TABLE public.kis_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_artifact ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- 2. Drop legacy permissive anon/public policies
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public select" ON public.subscribers;
DROP POLICY IF EXISTS "Allow public update" ON public.subscribers;
DROP POLICY IF EXISTS "Allow public insert" ON public.subscribers;
DROP POLICY IF EXISTS "Allow public select logs" ON public.email_logs;
DROP POLICY IF EXISTS "Allow public insert logs" ON public.email_logs;

-- ---------------------------------------------------------------
-- 3. service_role ALL policies (idempotent)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS service_role_all_kis_tokens ON public.kis_tokens;
CREATE POLICY service_role_all_kis_tokens ON public.kis_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_subscribers ON public.subscribers;
CREATE POLICY service_role_all_subscribers ON public.subscribers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_email_logs ON public.email_logs;
CREATE POLICY service_role_all_email_logs ON public.email_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_newsletter_content ON public.newsletter_content;
CREATE POLICY service_role_all_newsletter_content ON public.newsletter_content
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_calibration_artifact ON public.calibration_artifact;
CREATE POLICY service_role_all_calibration_artifact ON public.calibration_artifact
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 4. Revoke table-level grants from anon/authenticated (defense-in-depth)
-- ---------------------------------------------------------------
REVOKE ALL ON TABLE
  public.kis_tokens,
  public.subscribers,
  public.email_logs,
  public.newsletter_content,
  public.calibration_artifact
FROM anon, authenticated;

-- ---------------------------------------------------------------
-- 5. Assertion: RLS enabled on all 5 target tables
-- ---------------------------------------------------------------
DO $$
DECLARE cnt int;
BEGIN
  SELECT COUNT(*) INTO cnt FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('kis_tokens','subscribers','email_logs','newsletter_content','calibration_artifact')
    AND rowsecurity = true;
  IF cnt <> 5 THEN
    RAISE EXCEPTION 'RLS not enabled on all 5 target tables (expected 5, got %)', cnt;
  END IF;
END $$;

COMMIT;
