BEGIN;

CREATE TABLE IF NOT EXISTS public.stock_pick_snapshots (
  signal_date DATE NOT NULL,
  strategy TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  parameters_hash TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  git_sha TEXT,
  run_id TEXT,
  funnel JSONB NOT NULL,
  picks JSONB NOT NULL,
  top_candidates JSONB NOT NULL,
  PRIMARY KEY (signal_date, strategy)
);

ALTER TABLE public.stock_pick_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stock_pick_snapshots'
      AND policyname = 'service_role_all_stock_pick_snapshots'
  ) THEN
    CREATE POLICY service_role_all_stock_pick_snapshots ON public.stock_pick_snapshots
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$$;

REVOKE ALL ON TABLE public.stock_pick_snapshots FROM anon, authenticated;

COMMENT ON TABLE public.stock_pick_snapshots IS '예측 당일 저장하는 불변 픽 스냅샷 — 포워드 측정·사전등록 섀도우의 진실 원본';

COMMIT;
