-- ================================================
-- Migration 060: Delivery retry classification and pre-provider claim release
-- ================================================

-- Return the prior normalized failure code with every claim so the worker can
-- give 429 responses a longer recovery window without delaying ordinary 5xx.
-- DROP is required because PostgreSQL cannot change a function return type via
-- CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.claim_delivery_batch(UUID, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.claim_delivery_batch(
  p_run_id UUID,
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 50,
  p_stale_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  delivery_id UUID,
  subscriber_id UUID,
  attempt_count INTEGER,
  failure_detail TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_batch_size < 1 OR p_batch_size > 200 THEN
    RAISE EXCEPTION 'batch_size must be between 1 and 200';
  END IF;

  -- p_stale_seconds is ignored; stale claims are explicitly made ambiguous.
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
  RETURNING d.id AS delivery_id, d.subscriber_id AS subscriber_id,
    d.attempt_count AS attempt_count, d.failure_detail AS failure_detail;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_delivery_batch(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_delivery_batch(UUID, TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_delivery_batch(UUID, TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_delivery_batch(UUID, TEXT, INTEGER, INTEGER) TO service_role;

-- A failure before the provider request is known to be safe to retry. Restore
-- only rows still leased by this worker, and undo the claim's attempt charge.
-- Rows that were retryable retain their prior retry classification; first
-- attempts return to pending. This never touches ambiguous rows.
CREATE OR REPLACE FUNCTION public.release_delivery_claim_batch(
  p_delivery_ids UUID[],
  p_worker_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_worker_id IS NULL OR p_worker_id = '' THEN
    RAISE EXCEPTION 'p_worker_id is required and must be non-empty';
  END IF;

  UPDATE public.newsletter_recipient_deliveries
  SET status = CASE WHEN failure_category = 'retryable' THEN 'retryable' ELSE 'pending' END,
      attempt_count = GREATEST(attempt_count - 1, 0),
      claimed_at = NULL,
      claimed_by = NULL
  WHERE id = ANY(p_delivery_ids)
    AND status = 'claimed'
    AND claimed_by = p_worker_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.release_delivery_claim_batch(UUID[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_delivery_claim_batch(UUID[], TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.release_delivery_claim_batch(UUID[], TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_delivery_claim_batch(UUID[], TEXT) TO service_role;
