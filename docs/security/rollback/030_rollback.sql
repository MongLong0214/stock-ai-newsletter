-- =====================================================
-- Rollback for 030_security_rls_lockdown.sql
-- 긴급 시 이전(허용적) 상태로 복구. 취약점이 재노출되므로 최후수단.
-- 코드가 service_role로 전환되어 있으면 롤백 불필요.
-- =====================================================

BEGIN;

-- service_role 잠금 정책 제거
DROP POLICY IF EXISTS service_role_all_kis_tokens ON public.kis_tokens;
DROP POLICY IF EXISTS service_role_all_subscribers ON public.subscribers;
DROP POLICY IF EXISTS service_role_all_email_logs ON public.email_logs;
DROP POLICY IF EXISTS service_role_all_newsletter_content ON public.newsletter_content;
DROP POLICY IF EXISTS service_role_all_calibration_artifact ON public.calibration_artifact;

-- 이전 허용적 정책 복구 (subscribers / email_logs)
CREATE POLICY "Allow public select" ON public.subscribers FOR SELECT TO public USING (true);
CREATE POLICY "Allow public update" ON public.subscribers FOR UPDATE TO public USING (true);
CREATE POLICY "Allow public insert" ON public.subscribers FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public select logs" ON public.email_logs FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert logs" ON public.email_logs FOR INSERT TO public WITH CHECK (true);

-- 이전 grant 복구
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.kis_tokens,
  public.subscribers,
  public.email_logs,
  public.newsletter_content,
  public.calibration_artifact
TO anon, authenticated;

-- RLS 비활성 (이전 상태: kis_tokens/newsletter_content/calibration_artifact는 원래 off)
ALTER TABLE public.kis_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_content DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_artifact DISABLE ROW LEVEL SECURITY;
-- subscribers, email_logs는 원래 RLS on이었으므로 유지

COMMIT;
