BEGIN;

-- 기존 (theme_id, trading_date DESC, collection_run_id) 인덱스는 theme_id가 leading이라
-- trading_date 단독 조건이나 최신 날짜 조회를 seek할 수 없어 전체 인덱스를 훑는다.
-- 워치독의 max(trading_date)와 날짜 단독 조회가 즉시 끝나도록 날짜 전용 인덱스를 둔다.
CREATE INDEX idx_tli_interest_observations_trading_date
  ON public.tli_interest_observations (trading_date DESC);

COMMENT ON INDEX public.idx_tli_interest_observations_trading_date IS
  'Supports the interest-observation gap watchdog with indexed latest-date and trading-date-only lookups.';

COMMIT;
