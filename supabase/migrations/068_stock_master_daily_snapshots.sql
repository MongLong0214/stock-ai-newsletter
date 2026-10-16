BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.stock_master_daily_snapshots (
  signal_date DATE NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('KOSPI', 'KOSDAQ')),
  is_active BOOLEAN NOT NULL,
  status_flags JSONB,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (signal_date, symbol)
);

CREATE FUNCTION public.stamp_stock_master_daily_snapshot_captured_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.captured_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_stock_master_daily_snapshot_captured_at()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER stamp_stock_master_daily_snapshots_captured_at
  BEFORE INSERT ON public.stock_master_daily_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.stamp_stock_master_daily_snapshot_captured_at();

CREATE TRIGGER guard_stock_master_daily_snapshots_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.stock_master_daily_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();

ALTER TABLE public.stock_master_daily_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_select_stock_master_daily_snapshots
  ON public.stock_master_daily_snapshots FOR SELECT TO service_role USING (true);
CREATE POLICY service_role_insert_stock_master_daily_snapshots
  ON public.stock_master_daily_snapshots FOR INSERT TO service_role WITH CHECK (true);
REVOKE ALL ON TABLE public.stock_master_daily_snapshots
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.stock_master_daily_snapshots TO service_role;

CREATE FUNCTION public.record_stock_master_daily_snapshot(p_signal_date DATE, p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('stock_master_daily_snapshots:' || p_signal_date::text, 0));
  IF EXISTS (SELECT 1 FROM public.stock_master_daily_snapshots WHERE signal_date = p_signal_date) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.stock_master_daily_snapshots (signal_date, symbol, name, market, is_active, status_flags)
  SELECT p_signal_date, r.symbol, r.name, r.market, r.is_active, r.status_flags
  FROM jsonb_to_recordset(p_rows) AS r(symbol TEXT, name TEXT, market TEXT, is_active BOOLEAN, status_flags JSONB);
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.record_stock_master_daily_snapshot(DATE, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stock_master_daily_snapshot(DATE, JSONB) TO service_role;

COMMENT ON TABLE public.stock_master_daily_snapshots IS 'Append-only KIS master rows parsed by Prepare; symbols absent from the downloaded files are absent from the snapshot. First capture per signal_date wins under a per-date advisory lock in record_stock_master_daily_snapshot.';
COMMENT ON COLUMN public.stock_master_daily_snapshots.signal_date IS 'KRX signal session whose Prepare run captured this KIS master, downloaded on the morning of the next session: the master state production selection used for that signal. Intentionally signal_date, not trade_date: this keys the selection signal, not the download or capture session, and does not assert historical master availability at the signal close.';
COMMENT ON COLUMN public.stock_master_daily_snapshots.captured_at IS 'Server transaction time forced by trigger; client values are ignored. Distinct from the KRX signal session in signal_date.';

COMMIT;
