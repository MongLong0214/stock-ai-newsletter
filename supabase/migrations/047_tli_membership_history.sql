BEGIN;

-- Bitemporal theme-stock membership.
--   business time  : [valid_from, COALESCE(valid_to,'infinity'))    — when the mapping actually held
--   system-known   : [recorded_at, COALESCE(superseded_at,'infinity')) — when we believed it
-- as-of query contract:
--   valid_from <= base_date AND (valid_to IS NULL OR base_date < valid_to)
--   AND recorded_at <= cutoff AND (superseded_at IS NULL OR cutoff < superseded_at)
-- No backfill is performed here on purpose: theme_stocks.created_at cannot prove when a
-- mapping existed, so every pre-history instant is deliberately absent rather than fabricated.
CREATE TABLE public.theme_stock_membership_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE RESTRICT,
  symbol VARCHAR(20) NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at TIMESTAMPTZ,
  source VARCHAR(20) NOT NULL DEFAULT 'naver',
  collection_run_id UUID REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT,
  relevance NUMERIC(3,2),
  market VARCHAR(10),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  CHECK (superseded_at IS NULL OR superseded_at >= recorded_at)
);

-- At most one system-current open version per mapping; forces close-before-append on every diff.
CREATE UNIQUE INDEX uniq_theme_stock_membership_history_open
  ON public.theme_stock_membership_history (theme_id, symbol)
  WHERE valid_to IS NULL AND superseded_at IS NULL;

-- At most one system-current version per business-time start; blocks duplicate segment appends.
CREATE UNIQUE INDEX uniq_theme_stock_membership_history_current_version
  ON public.theme_stock_membership_history (theme_id, symbol, valid_from)
  WHERE superseded_at IS NULL;

CREATE INDEX idx_theme_stock_membership_history_theme_valid
  ON public.theme_stock_membership_history (theme_id, valid_from, valid_to);

CREATE INDEX idx_theme_stock_membership_history_recorded
  ON public.theme_stock_membership_history (recorded_at, superseded_at);

CREATE INDEX idx_theme_stock_membership_history_symbol
  ON public.theme_stock_membership_history (symbol);

ALTER TABLE public.theme_stock_membership_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_theme_stock_membership_history
  ON public.theme_stock_membership_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.theme_stock_membership_history FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reject_theme_stock_membership_history_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'theme_stock_membership_history is append-only: % is never allowed', TG_OP
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER guard_theme_stock_membership_history_removal
  BEFORE DELETE OR TRUNCATE ON public.theme_stock_membership_history
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.reject_theme_stock_membership_history_removal();

-- The only permitted UPDATE is a one-time close: valid_to and/or superseded_at moving
-- NULL -> value. Every other field edit, close-timestamp rewrite, and reopen is rejected.
CREATE OR REPLACE FUNCTION public.enforce_theme_stock_membership_history_close_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.theme_id IS DISTINCT FROM OLD.theme_id
    OR NEW.symbol IS DISTINCT FROM OLD.symbol
    OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
    OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.collection_run_id IS DISTINCT FROM OLD.collection_run_id
    OR NEW.relevance IS DISTINCT FROM OLD.relevance
    OR NEW.market IS DISTINCT FROM OLD.market
  THEN
    RAISE EXCEPTION 'theme_stock_membership_history permits only closing valid_to/superseded_at, not field edits'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.valid_to IS NOT NULL AND NEW.valid_to IS DISTINCT FROM OLD.valid_to THEN
    RAISE EXCEPTION 'theme_stock_membership_history valid_to closes once and can never be rewritten or reopened'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.superseded_at IS NOT NULL AND NEW.superseded_at IS DISTINCT FROM OLD.superseded_at THEN
    RAISE EXCEPTION 'theme_stock_membership_history superseded_at closes once and can never be rewritten or reopened'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.valid_to IS NOT DISTINCT FROM OLD.valid_to
    AND NEW.superseded_at IS NOT DISTINCT FROM OLD.superseded_at
  THEN
    RAISE EXCEPTION 'theme_stock_membership_history update must close valid_to or superseded_at exactly once'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_theme_stock_membership_history_close_only
  BEFORE UPDATE ON public.theme_stock_membership_history
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_theme_stock_membership_history_close_only();

COMMENT ON TABLE public.theme_stock_membership_history IS
  'Bitemporal theme-stock membership: business time (valid_from/valid_to) and system-known time (recorded_at/superseded_at) are both preserved; rows are append-only with one-time closes';
COMMENT ON COLUMN public.theme_stock_membership_history.valid_to IS
  'Business-time end (exclusive). NULL means the mapping was still open in the recording vintage';
COMMENT ON COLUMN public.theme_stock_membership_history.superseded_at IS
  'System-time end (exclusive). NULL means this version is still the current belief';

COMMIT;
