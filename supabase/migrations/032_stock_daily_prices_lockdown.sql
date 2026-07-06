-- stock_daily_prices lockdown (031 후속)
-- 030_security_rls_lockdown.sql 기조 유지: RLS 정책(031)에 더해
-- anon/authenticated의 테이블 grant 자체를 회수 (defense-in-depth).
-- Idempotent: REVOKE는 미보유 권한에 대해 no-op.

REVOKE ALL ON TABLE public.stock_daily_prices FROM anon, authenticated;
