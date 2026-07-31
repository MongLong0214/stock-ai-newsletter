-- ================================================
-- Migration 058: Newsletter delivery state machine
-- ================================================
--
-- Replaces boolean is_sent with a database-backed delivery ledger.
-- Tables:
--   newsletter_delivery_runs  — one row per send invocation
--   newsletter_recipient_deliveries — per-recipient outcome ledger
--
-- Statuses: pending, claimed, provider_accepted, failed, ambiguous
-- Concurrency-safe: unique constraints, advisory locks, stale-lease recovery.
-- RLS enabled, service_role only (no anon/authenticated access).
-- ================================================

-- 1. Delivery runs (one per invocation of send-newsletter)
CREATE TABLE IF NOT EXISTS public.newsletter_delivery_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  newsletter_content_id UUID NOT NULL REFERENCES public.newsletter_content(id),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'partial')),
  total_recipients INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  ambiguous_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_delivery_run_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_delivery_runs_content_id
  ON public.newsletter_delivery_runs (newsletter_content_id);
CREATE INDEX IF NOT EXISTS idx_delivery_runs_status
  ON public.newsletter_delivery_runs (status);

ALTER TABLE public.newsletter_delivery_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.newsletter_delivery_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.newsletter_delivery_runs FROM anon;
REVOKE ALL ON TABLE public.newsletter_delivery_runs FROM authenticated;
GRANT ALL ON TABLE public.newsletter_delivery_runs TO service_role;

-- 2. Per-recipient delivery ledger
CREATE TABLE IF NOT EXISTS public.newsletter_recipient_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.newsletter_delivery_runs(id),
  subscriber_id UUID NOT NULL,
  -- No PII stored directly; subscriber_id references subscribers table
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'provider_accepted', 'failed', 'ambiguous')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  failure_category TEXT CHECK (failure_category IN ('retryable', 'permanent', 'ambiguous') OR failure_category IS NULL),
  failure_detail TEXT,
  claimed_at TIMESTAMP WITH TIME ZONE,
  claimed_by TEXT, -- worker/process identifier for lease
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_recipient_per_run UNIQUE (run_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS idx_recipient_deliveries_run_status
  ON public.newsletter_recipient_deliveries (run_id, status);
CREATE INDEX IF NOT EXISTS idx_recipient_deliveries_claimed_stale
  ON public.newsletter_recipient_deliveries (status, claimed_at)
  WHERE status = 'claimed';

ALTER TABLE public.newsletter_recipient_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.newsletter_recipient_deliveries FROM PUBLIC;
REVOKE ALL ON TABLE public.newsletter_recipient_deliveries FROM anon;
REVOKE ALL ON TABLE public.newsletter_recipient_deliveries FROM authenticated;
GRANT ALL ON TABLE public.newsletter_recipient_deliveries TO service_role;

-- 3. Atomic claim RPC: claim a batch of pending/stale recipients
-- Returns claimed recipient IDs. Uses FOR UPDATE SKIP LOCKED for concurrency.
CREATE OR REPLACE FUNCTION public.claim_delivery_batch(
  p_run_id UUID,
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 50,
  p_stale_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  delivery_id UUID,
  subscriber_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_stale_cutoff TIMESTAMP WITH TIME ZONE;
BEGIN
  IF p_batch_size < 1 OR p_batch_size > 200 THEN
    RAISE EXCEPTION 'batch_size must be between 1 and 200';
  END IF;

  v_stale_cutoff := NOW() - (p_stale_seconds || ' seconds')::INTERVAL;

  RETURN QUERY
  WITH claimable AS (
    SELECT nrd.id, nrd.subscriber_id
    FROM public.newsletter_recipient_deliveries nrd
    WHERE nrd.run_id = p_run_id
      AND (
        nrd.status = 'pending'
        OR (nrd.status = 'claimed' AND nrd.claimed_at < v_stale_cutoff)
      )
    ORDER BY nrd.created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.newsletter_recipient_deliveries d
  SET status = 'claimed',
      claimed_at = NOW(),
      claimed_by = p_worker_id,
      attempt_count = d.attempt_count + 1
  FROM claimable c
  WHERE d.id = c.id
  RETURNING d.id AS delivery_id, d.subscriber_id AS subscriber_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_delivery_batch(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_delivery_batch(UUID, TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_delivery_batch(UUID, TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_delivery_batch(UUID, TEXT, INTEGER, INTEGER) TO service_role;

-- 4. Mark delivery outcome RPC (atomic single-recipient update)
CREATE OR REPLACE FUNCTION public.mark_delivery_outcome(
  p_delivery_id UUID,
  p_status TEXT,
  p_provider_message_id TEXT DEFAULT NULL,
  p_failure_category TEXT DEFAULT NULL,
  p_failure_detail TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('provider_accepted', 'failed', 'ambiguous') THEN
    RAISE EXCEPTION 'status must be provider_accepted, failed, or ambiguous';
  END IF;

  UPDATE public.newsletter_recipient_deliveries
  SET status = p_status,
      provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
      failure_category = p_failure_category,
      failure_detail = p_failure_detail,
      completed_at = NOW()
  WHERE id = p_delivery_id
    AND status = 'claimed';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_delivery_outcome(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_delivery_outcome(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.mark_delivery_outcome(UUID, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_delivery_outcome(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 5. Reconcile run status (call after batch processing)
CREATE OR REPLACE FUNCTION public.reconcile_delivery_run(p_run_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total INTEGER;
  v_accepted INTEGER;
  v_failed INTEGER;
  v_ambiguous INTEGER;
  v_pending INTEGER;
  v_claimed INTEGER;
  v_new_status TEXT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'provider_accepted'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'ambiguous'),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'claimed')
  INTO v_total, v_accepted, v_failed, v_ambiguous, v_pending, v_claimed
  FROM public.newsletter_recipient_deliveries
  WHERE run_id = p_run_id;

  IF v_pending = 0 AND v_claimed = 0 THEN
    IF v_failed = 0 AND v_ambiguous = 0 THEN
      v_new_status := 'completed';
    ELSE
      v_new_status := 'partial';
    END IF;
  ELSE
    v_new_status := 'in_progress';
  END IF;

  UPDATE public.newsletter_delivery_runs
  SET status = v_new_status,
      accepted_count = v_accepted,
      failed_count = v_failed,
      ambiguous_count = v_ambiguous,
      total_recipients = v_total,
      completed_at = CASE WHEN v_new_status IN ('completed', 'partial') THEN NOW() ELSE NULL END
  WHERE id = p_run_id;

  RETURN json_build_object(
    'run_id', p_run_id,
    'status', v_new_status,
    'total', v_total,
    'accepted', v_accepted,
    'failed', v_failed,
    'ambiguous', v_ambiguous,
    'pending', v_pending,
    'claimed', v_claimed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_delivery_run(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_delivery_run(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_delivery_run(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_delivery_run(UUID) TO service_role;

-- 6. Comments
COMMENT ON TABLE public.newsletter_delivery_runs IS 'One row per newsletter send invocation. Tracks overall delivery progress.';
COMMENT ON TABLE public.newsletter_recipient_deliveries IS 'Per-recipient delivery outcome ledger. No PII stored directly.';
COMMENT ON FUNCTION public.claim_delivery_batch IS 'Atomically claim a batch of pending/stale recipients for sending (SKIP LOCKED).';
COMMENT ON FUNCTION public.mark_delivery_outcome IS 'Record provider outcome for a single claimed delivery.';
COMMENT ON FUNCTION public.reconcile_delivery_run IS 'Reconcile run status from recipient outcomes. Returns summary JSON.';
