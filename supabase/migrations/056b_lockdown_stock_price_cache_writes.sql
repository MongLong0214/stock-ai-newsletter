-- ================================================
-- Migration: Revoke anonymous INSERT/UPDATE on stock_price_cache
-- and restrict SECURITY DEFINER function grants
-- ================================================
--
-- Before: anon role could INSERT/UPDATE stock_price_cache rows via RLS policies
-- After:  Only authenticated (service_role) can write; public can still read
--
-- Also restricts clean_expired_stock_price_cache SECURITY DEFINER function
-- to be executable only by service_role (was previously public).
-- ================================================

-- 1. Drop overly permissive INSERT/UPDATE policies
DROP POLICY IF EXISTS "Public insert access" ON public.stock_price_cache;
DROP POLICY IF EXISTS "Public update access" ON public.stock_price_cache;

-- 2. Create service-role-only write policies
CREATE POLICY "Service role insert access"
  ON public.stock_price_cache
  FOR INSERT
  WITH CHECK (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'role' = 'service_role')
  );

CREATE POLICY "Service role update access"
  ON public.stock_price_cache
  FOR UPDATE
  USING (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'role' = 'service_role')
  )
  WITH CHECK (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'role' = 'service_role')
  );

-- 3. Revoke public EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION clean_expired_stock_price_cache() FROM public;
REVOKE EXECUTE ON FUNCTION clean_expired_stock_price_cache() FROM anon;
REVOKE EXECUTE ON FUNCTION clean_expired_stock_price_cache() FROM authenticated;

-- Grant only to service_role (Supabase internal cron uses service_role)
GRANT EXECUTE ON FUNCTION clean_expired_stock_price_cache() TO service_role;

-- ================================================
-- Notes:
-- - Existing server-side code using service_role key continues to work
-- - Client-side/anon reads still work (SELECT policy unchanged)
-- - The pg_cron job runs as service_role so cleanup continues working
-- ================================================

-- ================================================
-- 4. Revoke anon EXECUTE on insert_mcp_analytics
--    This RPC trusts caller-provided ip_hash for rate-limit enforcement.
--    Since the function is not called from any current client code,
--    restrict to service_role only to prevent spoofed ip_hash abuse.
-- ================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'insert_mcp_analytics'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION insert_mcp_analytics(text, text, text, text) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION insert_mcp_analytics(text, text, text, text) FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION insert_mcp_analytics(text, text, text, text) FROM public';
  END IF;
END $$;

-- 5. Remove table-level write privileges as defense in depth and clear any
-- rows that may have been written through the former anonymous policies.
TRUNCATE TABLE public.stock_price_cache;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.stock_price_cache FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.stock_price_cache FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.stock_price_cache FROM authenticated;
GRANT SELECT ON TABLE public.stock_price_cache TO anon, authenticated;
GRANT ALL ON TABLE public.stock_price_cache TO service_role;

-- 6. Keep the scientific prediction containment boundary canonical: callers
-- must use the validated public scientific RPC, not the legacy v4 view.
REVOKE SELECT ON TABLE public.v_prediction_v4_serving FROM PUBLIC;
REVOKE SELECT ON TABLE public.v_prediction_v4_serving FROM anon;
REVOKE SELECT ON TABLE public.v_prediction_v4_serving FROM authenticated;
GRANT SELECT ON TABLE public.v_prediction_v4_serving TO service_role;

-- 7. View counting is performed by the server repository with service_role.
-- Public execution allowed arbitrary counter inflation.
REVOKE EXECUTE ON FUNCTION public.increment_blog_view_count(VARCHAR) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_blog_view_count(VARCHAR) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_blog_view_count(VARCHAR) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_blog_view_count(VARCHAR) TO service_role;
