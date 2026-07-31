-- ================================================
-- Migration 059: Delivery hardening (adversarial second-pass)
-- ================================================
--
-- Fixes:
-- 1. getOrCreateRun must not reset terminal runs (insert-then-select, no upsert that resets status)
-- 2. Snapshot immutability: snapshot_completed_at column + transactional RPC
-- 3. Stale claims → ambiguous (never auto-reclaim); claim only pending + retryable
-- 4. Retryable vs permanent: max_attempts, skipped status, retryable rows
-- 5. Reconcile counts retryable separately, terminal only when no pending/claimed/retryable/ambiguous
-- 6. mark_delivery_outcome requires nonempty claimed_by match (no NULL bypass)
-- 7. Drop obsolete 5-argument mark_delivery_outcome overload from 058
-- 8. Validate stale_seconds parameter
-- 9. Retry exhaustion: convert retryable rows at max_attempts into terminal failed/permanent
-- ================================================

-- 1. Add snapshot_completed_at to runs
ALTER TABLE public.newsletter_delivery_runs
  ADD COLUMN IF NOT EXISTS snapshot_completed_at TIMESTAMP WITH TIME ZONE;

-- 2. Expand status CHECK to include 'skipped' and 'retryable'
-- Drop old constraint, add new one
ALTER TABLE public.newsletter_recipient_deliveries
  DROP CONSTRAINT IF EXISTS newsletter_recipient_deliveries_status_check;

ALTER TABLE public.newsletter_recipient_deliveries
  ADD CONSTRAINT newsletter_recipient_deliveries_status_check
  CHECK (status IN ('pending', 'claimed', 'provider_accepted', 'failed', 'ambiguous', 'skipped', 'retryable'));

-- 3. Add max_attempts column (default 3)
ALTER TABLE public.newsletter_recipient_deliveries
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3;

-- ================================================
-- Drop obsolete 5-argument mark_delivery_outcome overload from migration 058
-- Only the hardened 6-argument signature (with p_claimed_by) should remain.
-- ================================================
DROP FUNCTION IF EXISTS public.mark_delivery_outcome(UUID, TEXT, TEXT, TEXT, TEXT);

-- ================================================
-- RPC: get_or_create_delivery_run
-- Atomic insert-then-select. Never mutates a terminal run.
-- Uses IF NOT FOUND instead of record-null check after SELECT.
-- ================================================
CREATE OR REPLACE FUNCTION public.get_or_create_delivery_run(
  p_content_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run RECORD;
BEGIN
  -- Try insert first (only succeeds for new runs)
  INSERT INTO public.newsletter_delivery_runs (newsletter_content_id, idempotency_key, status)
  VALUES (p_content_id, p_idempotency_key, 'pending')
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- Select the existing or newly inserted row
  SELECT id, status, snapshot_completed_at
  INTO v_run
  FROM public.newsletter_delivery_runs
  WHERE idempotency_key = p_idempotency_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to get or create delivery run for key %', p_idempotency_key;
  END IF;

  -- If run is in a terminal state, return it as-is (never reset)
  IF v_run.status IN ('completed', 'failed') THEN
    RETURN json_build_object(
      'id', v_run.id,
      'status', v_run.status,
      'snapshot_completed', v_run.snapshot_completed_at IS NOT NULL,
      'is_terminal', true
    );
  END IF;

  -- Transition to in_progress if pending (atomic conditional update)
  UPDATE public.newsletter_delivery_runs
  SET status = 'in_progress',
      started_at = COALESCE(started_at, NOW())
  WHERE id = v_run.id
    AND status IN ('pending', 'in_progress', 'partial');

  RETURN json_build_object(
    'id', v_run.id,
    'status', 'in_progress',
    'snapshot_completed', v_run.snapshot_completed_at IS NOT NULL,
    'is_terminal', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_delivery_run(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_or_create_delivery_run(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.get_or_create_delivery_run(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_delivery_run(UUID, TEXT) TO service_role;

-- ================================================
-- RPC: snapshot_delivery_recipients
-- Transactional set-based INSERT...SELECT of all active subscribers.
-- ON CONFLICT safe. Records total and snapshot_completed_at atomically.
-- Refuses to expand a completed snapshot (idempotent).
-- ================================================
CREATE OR REPLACE FUNCTION public.snapshot_delivery_recipients(p_run_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_already_completed TIMESTAMP WITH TIME ZONE;
  v_total INTEGER;
  v_existing_count INTEGER;
BEGIN
  -- Lock the run row to prevent concurrent snapshots
  SELECT snapshot_completed_at
  INTO v_already_completed
  FROM public.newsletter_delivery_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run % not found', p_run_id;
  END IF;

  -- If snapshot already completed, return existing count (immutable)
  IF v_already_completed IS NOT NULL THEN
    SELECT COUNT(*) INTO v_existing_count
    FROM public.newsletter_recipient_deliveries
    WHERE run_id = p_run_id;

    RETURN json_build_object(
      'total', v_existing_count,
      'already_completed', true
    );
  END IF;

  -- Single atomic INSERT...SELECT of all currently active subscribers
  INSERT INTO public.newsletter_recipient_deliveries (run_id, subscriber_id, status)
  SELECT p_run_id, s.id, 'pending'
  FROM public.subscribers s
  WHERE s.is_active = true
  ON CONFLICT (run_id, subscriber_id) DO NOTHING;

  -- Count total (includes any pre-existing from partial earlier run)
  SELECT COUNT(*) INTO v_total
  FROM public.newsletter_recipient_deliveries
  WHERE run_id = p_run_id;

  -- Atomically record total and completion timestamp
  UPDATE public.newsletter_delivery_runs
  SET total_recipients = v_total,
      snapshot_completed_at = NOW()
  WHERE id = p_run_id;

  RETURN json_build_object(
    'total', v_total,
    'already_completed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_delivery_recipients(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.snapshot_delivery_recipients(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.snapshot_delivery_recipients(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_delivery_recipients(UUID) TO service_role;

-- ================================================
-- RPC: recover_stale_claims
-- Marks stale claimed rows as 'ambiguous'. Never auto-reclaims.
-- Must be called explicitly before claiming new batches.
-- Validates p_stale_seconds is a positive integer.
-- Uses integer ROW_COUNT (not BOOLEAN).
-- ================================================
CREATE OR REPLACE FUNCTION public.recover_stale_claims(
  p_run_id UUID,
  p_stale_seconds INTEGER DEFAULT 300
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_stale_cutoff TIMESTAMP WITH TIME ZONE;
  v_count INTEGER;
BEGIN
  -- Validate stale_seconds: must be positive
  IF p_stale_seconds < 1 OR p_stale_seconds > 86400 THEN
    RAISE EXCEPTION 'p_stale_seconds must be between 1 and 86400, got %', p_stale_seconds;
  END IF;

  v_stale_cutoff := NOW() - (p_stale_seconds || ' seconds')::INTERVAL;

  UPDATE public.newsletter_recipient_deliveries
  SET status = 'ambiguous',
      failure_category = 'ambiguous',
      failure_detail = 'stale_claim_recovery',
      completed_at = NOW()
  WHERE run_id = p_run_id
    AND status = 'claimed'
    AND claimed_at < v_stale_cutoff;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stale_claims(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recover_stale_claims(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.recover_stale_claims(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_claims(UUID, INTEGER) TO service_role;

-- ================================================
-- Replace claim_delivery_batch: claim only pending and retryable (within max_attempts).
-- No stale claim reclamation here.
-- ================================================
CREATE OR REPLACE FUNCTION public.claim_delivery_batch(
  p_run_id UUID,
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 50,
  p_stale_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  delivery_id UUID,
  subscriber_id UUID,
  attempt_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_batch_size < 1 OR p_batch_size > 200 THEN
    RAISE EXCEPTION 'batch_size must be between 1 and 200';
  END IF;

  -- p_stale_seconds is now ignored (stale recovery is separate RPC)
  -- but kept for backward compat signature

  RETURN QUERY
  WITH claimable AS (
    SELECT nrd.id, nrd.subscriber_id
    FROM public.newsletter_recipient_deliveries nrd
    WHERE nrd.run_id = p_run_id
      AND (
        nrd.status = 'pending'
        OR (nrd.status = 'retryable' AND nrd.attempt_count < nrd.max_attempts)
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
  RETURNING d.id AS delivery_id, d.subscriber_id AS subscriber_id, d.attempt_count AS attempt_count;
END;
$$;

-- ================================================
-- Replace mark_delivery_outcome: require nonempty claimed_by match, return boolean.
-- p_claimed_by is mandatory and must be non-empty; NULL bypass is not allowed.
-- Uses integer ROW_COUNT declaration (not BOOLEAN).
-- ================================================
CREATE OR REPLACE FUNCTION public.mark_delivery_outcome(
  p_delivery_id UUID,
  p_status TEXT,
  p_provider_message_id TEXT DEFAULT NULL,
  p_failure_category TEXT DEFAULT NULL,
  p_failure_detail TEXT DEFAULT NULL,
  p_claimed_by TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_status NOT IN ('provider_accepted', 'failed', 'ambiguous', 'skipped', 'retryable') THEN
    RAISE EXCEPTION 'status must be provider_accepted, failed, ambiguous, skipped, or retryable';
  END IF;

  -- Require non-empty p_claimed_by: no NULL bypass allowed
  IF p_claimed_by IS NULL OR p_claimed_by = '' THEN
    RAISE EXCEPTION 'p_claimed_by is required and must be non-empty';
  END IF;

  UPDATE public.newsletter_recipient_deliveries
  SET status = p_status,
      provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
      failure_category = p_failure_category,
      failure_detail = p_failure_detail,
      completed_at = CASE WHEN p_status IN ('provider_accepted', 'failed', 'ambiguous', 'skipped') THEN NOW() ELSE NULL END
  WHERE id = p_delivery_id
    AND status = 'claimed'
    AND claimed_by = p_claimed_by;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- ================================================
-- Replace reconcile_delivery_run: count retryable separately,
-- terminal only when no pending/claimed/retryable/ambiguous.
-- At reconciliation start, convert retryable rows whose attempt_count >= max_attempts
-- into terminal failed/permanent with code 'retry_exhausted'.
-- ================================================
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
  v_retryable INTEGER;
  v_skipped INTEGER;
  v_new_status TEXT;
BEGIN
  -- Convert retryable rows that have exhausted their attempts into terminal failed
  UPDATE public.newsletter_recipient_deliveries
  SET status = 'failed',
      failure_category = 'permanent',
      failure_detail = 'retry_exhausted',
      completed_at = NOW()
  WHERE run_id = p_run_id
    AND status = 'retryable'
    AND attempt_count >= max_attempts;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'provider_accepted'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'ambiguous'),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'claimed'),
    COUNT(*) FILTER (WHERE status = 'retryable'),
    COUNT(*) FILTER (WHERE status = 'skipped')
  INTO v_total, v_accepted, v_failed, v_ambiguous, v_pending, v_claimed, v_retryable, v_skipped
  FROM public.newsletter_recipient_deliveries
  WHERE run_id = p_run_id;

  -- Terminal: no pending, claimed, retryable, or ambiguous
  -- permanent failure와 skip은 그 자체로 terminal이므로 completed에 포함된다.
  -- "한 명도 수락되지 않음"은 상태가 아니라 호출부에서 판정한다(isSuccessfulDelivery).
  IF v_pending = 0 AND v_claimed = 0 AND v_retryable = 0 AND v_ambiguous = 0 THEN
    v_new_status := 'completed';
  ELSIF v_pending = 0 AND v_claimed = 0 AND v_retryable = 0 AND v_ambiguous > 0 THEN
    -- Ambiguous blocks full completion but no more work to do
    v_new_status := 'partial';
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
    'retryable', v_retryable,
    'skipped', v_skipped,
    'pending', v_pending,
    'claimed', v_claimed
  );
END;
$$;

-- Permissions for mark_delivery_outcome (6-arg hardened signature only)
REVOKE ALL ON FUNCTION public.mark_delivery_outcome(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_delivery_outcome(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.mark_delivery_outcome(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_delivery_outcome(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Permissions for reconcile_delivery_run
REVOKE ALL ON FUNCTION public.reconcile_delivery_run(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_delivery_run(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_delivery_run(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_delivery_run(UUID) TO service_role;

-- Index for retryable rows
CREATE INDEX IF NOT EXISTS idx_recipient_deliveries_retryable
  ON public.newsletter_recipient_deliveries (run_id, status, attempt_count)
  WHERE status = 'retryable';

COMMENT ON FUNCTION public.get_or_create_delivery_run IS 'Atomic insert-or-select for delivery runs. Never resets terminal state.';
COMMENT ON FUNCTION public.snapshot_delivery_recipients IS 'Transactional atomic snapshot of all active subscribers. Immutable once completed.';
COMMENT ON FUNCTION public.recover_stale_claims IS 'Marks stale claimed rows as ambiguous. Never auto-reclaims. Validates stale seconds.';
COMMENT ON FUNCTION public.mark_delivery_outcome IS 'Record provider outcome for a claimed delivery. Requires exact worker match.';
COMMENT ON FUNCTION public.reconcile_delivery_run IS 'Reconcile run status. Converts exhausted retries to terminal failed first.';
