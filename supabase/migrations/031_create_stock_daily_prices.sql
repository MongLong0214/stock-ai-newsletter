CREATE TABLE IF NOT EXISTS public.stock_daily_prices (
  symbol TEXT NOT NULL,
  trade_date DATE NOT NULL,
  close NUMERIC NOT NULL,
  volume BIGINT,
  source TEXT NOT NULL DEFAULT 'kis',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, trade_date),
  CONSTRAINT stock_daily_prices_close_positive CHECK (close > 0),
  CONSTRAINT stock_daily_prices_volume_nonnegative CHECK (volume IS NULL OR volume >= 0),
  CONSTRAINT stock_daily_prices_source_check CHECK (source IN ('kis', 'naver_backfill'))
);

CREATE INDEX IF NOT EXISTS idx_stock_daily_prices_trade_date
  ON public.stock_daily_prices (trade_date DESC);

ALTER TABLE public.stock_daily_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to stock_daily_prices"
  ON public.stock_daily_prices;
DROP POLICY IF EXISTS service_role_all_stock_daily_prices
  ON public.stock_daily_prices;

CREATE POLICY service_role_all_stock_daily_prices
  ON public.stock_daily_prices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.stock_daily_prices IS
  'Daily stock price history for TLI GT-B labels and basket price/volume features';
COMMENT ON COLUMN public.stock_daily_prices.symbol IS 'Korean stock symbol or index symbol such as KOSPI';
COMMENT ON COLUMN public.stock_daily_prices.trade_date IS 'KST trading date';
COMMENT ON COLUMN public.stock_daily_prices.close IS 'Daily close price';
COMMENT ON COLUMN public.stock_daily_prices.volume IS 'Daily traded volume when available';
COMMENT ON COLUMN public.stock_daily_prices.source IS 'Source adapter: kis or naver_backfill';
