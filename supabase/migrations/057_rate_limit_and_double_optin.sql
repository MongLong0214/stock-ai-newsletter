-- ================================================
-- Migration 057: Atomic rate limiting + double opt-in
-- ================================================
--
-- Rate limiting: fixed-window counter using INSERT ... ON CONFLICT DO UPDATE ... RETURNING
-- keyed by (identity_hash, bucket, window_start). Time derived inside PostgreSQL.
-- Double opt-in: service-role-only transactional confirm_subscription RPC.
-- ================================================

-- 1. Rate limit table: atomic fixed-window counter
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  identity_hash TEXT NOT NULL,
  bucket TEXT NOT NULL,
  window_start BIGINT NOT NULL, -- epoch seconds, derived server-side
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (identity_hash, bucket, window_start)
);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only (bypasses RLS)

-- 2. Atomic check-and-increment RPC (SECURITY DEFINER)
-- Derives time inside PostgreSQL; ignores caller-supplied timestamps.
-- Validates max_requests (1..10000) and window_seconds (1..86400).
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identity_hash TEXT,
  p_bucket TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now BIGINT;
  v_window_start BIGINT;
  v_count INTEGER;
  v_limited BOOLEAN;
BEGIN
  -- Validate ranges
  IF p_max_requests < 1 OR p_max_requests > 10000 THEN
    RAISE EXCEPTION 'max_requests must be between 1 and 10000';
  END IF;
  IF p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'window_seconds must be between 1 and 86400';
  END IF;

  v_now := EXTRACT(EPOCH FROM clock_timestamp())::BIGINT;
  v_window_start := v_now - (v_now % p_window_seconds);

  -- Atomic upsert: increment or insert
  INSERT INTO public.rate_limit_counters (identity_hash, bucket, window_start, request_count)
  VALUES (p_identity_hash, p_bucket, v_window_start, 1)
  ON CONFLICT (identity_hash, bucket, window_start)
  DO UPDATE SET request_count = public.rate_limit_counters.request_count + 1
  RETURNING request_count INTO v_count;

  v_limited := v_count > p_max_requests;

  RETURN json_build_object(
    'limited', v_limited,
    'request_count', v_count,
    'window_start', v_window_start,
    'window_seconds', p_window_seconds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- 3. Safe retention cleanup (delete windows older than 2 hours)
CREATE OR REPLACE FUNCTION public.clean_rate_limit_counters()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER;
  v_cutoff BIGINT;
BEGIN
  v_cutoff := EXTRACT(EPOCH FROM clock_timestamp())::BIGINT - 7200;
  DELETE FROM public.rate_limit_counters WHERE window_start < v_cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.clean_rate_limit_counters() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clean_rate_limit_counters() FROM anon;
REVOKE ALL ON FUNCTION public.clean_rate_limit_counters() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.clean_rate_limit_counters() TO service_role;

-- Schedule cleanup if pg_cron exists (safe: checks existence, no unschedule call)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Use upsert-style: schedule only if not already scheduled
    IF NOT EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'cleanup-rate-limit-counters'
    ) THEN
      PERFORM cron.schedule(
        'cleanup-rate-limit-counters',
        '*/15 * * * *',
        $sched$ SELECT public.clean_rate_limit_counters() $sched$
      );
    END IF;
  END IF;
END $$;

-- 4. Pending subscribers table for double opt-in
CREATE TABLE IF NOT EXISTS public.pending_subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  confirm_token_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  confirmed_at TIMESTAMP WITH TIME ZONE
);

-- Unconditional unique constraint on email (suitable for upsert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pending_subscribers_email_key'
  ) THEN
    ALTER TABLE public.pending_subscribers ADD CONSTRAINT pending_subscribers_email_key UNIQUE (email);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pending_subscribers_expires
  ON public.pending_subscribers (expires_at);

ALTER TABLE public.pending_subscribers ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only

-- 5. Transactional confirm_subscription RPC (SECURITY DEFINER)
-- Locks pending row, verifies token hash + expiry, activates subscriber atomically.
CREATE OR REPLACE FUNCTION public.confirm_subscription(
  p_token_hash TEXT,
  p_email TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pending RECORD;
BEGIN
  -- Lock the pending row
  SELECT id, email, name, expires_at, confirmed_at
  INTO v_pending
  FROM public.pending_subscribers
  WHERE email = p_email
    AND confirm_token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_pending.confirmed_at IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'already_confirmed');
  END IF;

  IF v_pending.expires_at < NOW() THEN
    RETURN json_build_object('success', false, 'error', 'expired');
  END IF;

  -- Mark pending as confirmed (consume the token)
  UPDATE public.pending_subscribers
  SET confirmed_at = NOW()
  WHERE id = v_pending.id;

  -- Upsert into subscribers (activate or create)
  INSERT INTO public.subscribers (email, name, is_active)
  VALUES (v_pending.email, v_pending.name, true)
  ON CONFLICT (email)
  DO UPDATE SET is_active = true, name = COALESCE(EXCLUDED.name, public.subscribers.name);

  RETURN json_build_object('success', true, 'email', v_pending.email);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_subscription(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_subscription(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_subscription(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_subscription(TEXT, TEXT) TO service_role;

-- 6. Cleanup expired pending subscriptions
CREATE OR REPLACE FUNCTION public.clean_expired_pending_subscribers()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.pending_subscribers
  WHERE expires_at < NOW() AND confirmed_at IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.clean_expired_pending_subscribers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clean_expired_pending_subscribers() FROM anon;
REVOKE ALL ON FUNCTION public.clean_expired_pending_subscribers() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.clean_expired_pending_subscribers() TO service_role;

-- Revoke table access from public/anon/authenticated
REVOKE ALL ON TABLE public.rate_limit_counters FROM PUBLIC;
REVOKE ALL ON TABLE public.rate_limit_counters FROM anon;
REVOKE ALL ON TABLE public.rate_limit_counters FROM authenticated;
GRANT ALL ON TABLE public.rate_limit_counters TO service_role;

REVOKE ALL ON TABLE public.pending_subscribers FROM PUBLIC;
REVOKE ALL ON TABLE public.pending_subscribers FROM anon;
REVOKE ALL ON TABLE public.pending_subscribers FROM authenticated;
GRANT ALL ON TABLE public.pending_subscribers TO service_role;

COMMENT ON TABLE public.rate_limit_counters IS 'Atomic fixed-window rate limit counters (service_role only)';
COMMENT ON TABLE public.pending_subscribers IS 'Double opt-in pending confirmations (service_role only)';
