BEGIN;

CREATE TABLE public.tli_datalab_quota_ledger (
  kst_date DATE PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ceiling INTEGER NOT NULL CHECK (ceiling > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.tli_datalab_quota_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_tli_datalab_quota_ledger
  ON public.tli_datalab_quota_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.reserve_tli_datalab_quota(
  p_kst_date DATE,
  p_count INTEGER,
  p_ceiling INTEGER
)
RETURNS TABLE (
  granted BOOLEAN,
  attempts INTEGER,
  ceiling INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_kst_date IS NULL THEN
    RAISE EXCEPTION 'p_kst_date must not be null';
  END IF;
  IF p_count IS NULL OR p_count < 1 THEN
    RAISE EXCEPTION 'p_count must be at least 1';
  END IF;
  IF p_ceiling IS NULL OR p_ceiling < 1 THEN
    RAISE EXCEPTION 'p_ceiling must be at least 1';
  END IF;

  RETURN QUERY
  INSERT INTO public.tli_datalab_quota_ledger AS ledger (
    kst_date,
    attempts,
    ceiling,
    updated_at
  )
  SELECT p_kst_date, p_count, p_ceiling, clock_timestamp()
  WHERE p_count <= p_ceiling
  ON CONFLICT (kst_date) DO UPDATE SET
    attempts = ledger.attempts + p_count,
    ceiling = LEAST(ledger.ceiling, p_ceiling),
    updated_at = clock_timestamp()
  WHERE ledger.attempts + p_count <= LEAST(ledger.ceiling, p_ceiling)
  RETURNING true, ledger.attempts, ledger.ceiling;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      false,
      COALESCE(ledger.attempts, 0),
      COALESCE(LEAST(ledger.ceiling, p_ceiling), p_ceiling)
    FROM (SELECT 1) AS singleton
    LEFT JOIN public.tli_datalab_quota_ledger AS ledger
      ON ledger.kst_date = p_kst_date;
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.tli_datalab_quota_ledger
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tli_datalab_quota_ledger TO service_role;

REVOKE EXECUTE ON FUNCTION public.reserve_tli_datalab_quota(DATE, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tli_datalab_quota(DATE, INTEGER, INTEGER)
  TO service_role;

COMMENT ON TABLE public.tli_datalab_quota_ledger IS
  'KST calendar-day ledger reserving every outbound Naver DataLab HTTP attempt before the request.';
COMMENT ON FUNCTION public.reserve_tli_datalab_quota(DATE, INTEGER, INTEGER) IS
  'Atomically reserves DataLab attempts without allowing the effective daily ceiling to increase.';

COMMIT;
