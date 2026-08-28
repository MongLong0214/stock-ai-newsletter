BEGIN;

ALTER TABLE public.stock_daily_prices
  ADD COLUMN open NUMERIC,
  ADD COLUMN high NUMERIC,
  ADD COLUMN low NUMERIC,
  ADD CONSTRAINT stock_daily_prices_open_positive
    CHECK (open IS NULL OR open > 0),
  ADD CONSTRAINT stock_daily_prices_high_positive
    CHECK (high IS NULL OR high > 0),
  ADD CONSTRAINT stock_daily_prices_low_positive
    CHECK (low IS NULL OR low > 0),
  ADD CONSTRAINT stock_daily_prices_high_gte_low
    CHECK (high IS NULL OR low IS NULL OR high >= low);

CREATE TABLE public.stock_master (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  market TEXT NOT NULL CONSTRAINT stock_master_market_check
    CHECK (market IN ('KOSPI', 'KOSDAQ')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  status_flags JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stock_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_stock_master
  ON public.stock_master
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.stock_master FROM anon, authenticated;

COMMENT ON COLUMN public.stock_daily_prices.open IS 'Daily open price when available';
COMMENT ON COLUMN public.stock_daily_prices.high IS 'Daily high price when available';
COMMENT ON COLUMN public.stock_daily_prices.low IS 'Daily low price when available';
COMMENT ON TABLE public.stock_master IS 'KIS Korean stock master for canonical symbol and company-name mapping';
COMMENT ON COLUMN public.stock_master.symbol IS 'Market-prefixed symbol such as KOSPI:005930';
COMMENT ON COLUMN public.stock_master.status_flags IS 'Raw KIS management, suspension, and related status flags';

COMMIT;
