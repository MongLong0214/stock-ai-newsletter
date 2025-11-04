-- ================================================
-- 주식 가격 캐시 테이블 생성 (3-tier 캐싱 시스템)
-- ================================================
--
-- 목적: 한국 주식 시장 마감 시 API 호출 최소화
-- 전략: 메모리 캐시 → Supabase 캐시 → API
-- TTL: 장 중 1분, 장 마감 후 다음 영업일 09:00까지
-- ================================================

CREATE TABLE IF NOT EXISTS public.stock_price_cache (
  ticker TEXT PRIMARY KEY,
  current_price NUMERIC NOT NULL,
  previous_close NUMERIC NOT NULL,
  change_rate NUMERIC NOT NULL,
  volume BIGINT NOT NULL CHECK (volume >= 0),
  timestamp BIGINT NOT NULL CHECK (timestamp > 0),
  expires_at BIGINT NOT NULL CHECK (expires_at > timestamp),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- 인덱스
-- ================================================

-- expires_at 기준 인덱스 (캐시 조회 및 정리 성능 향상)
CREATE INDEX IF NOT EXISTS idx_stock_price_cache_expires_at
  ON public.stock_price_cache(expires_at);

-- ================================================
-- Row Level Security (RLS)
-- ================================================

ALTER TABLE public.stock_price_cache ENABLE ROW LEVEL SECURITY;

-- 읽기: 모든 사용자 허용 (익명 포함)
-- 캐시 조회는 공개 데이터이므로 인증 불필요
CREATE POLICY "Public read access"
  ON public.stock_price_cache
  FOR SELECT
  USING (true);

-- 쓰기: INSERT와 UPDATE 분리 정책
CREATE POLICY "Public insert access"
  ON public.stock_price_cache
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public update access"
  ON public.stock_price_cache
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 삭제: Service Role 전용 (정리 작업)
-- 수동 또는 cron job으로만 실행
CREATE POLICY "Service role delete access"
  ON public.stock_price_cache
  FOR DELETE
  USING (
    auth.jwt() IS NOT NULL
    AND auth.jwt()->>'role' = 'service_role'
  );

-- ================================================
-- 만료된 캐시 자동 정리 함수
-- ================================================

CREATE OR REPLACE FUNCTION clean_expired_stock_price_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.stock_price_cache
  WHERE expires_at < EXTRACT(EPOCH FROM NOW()) * 1000;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 자동 캐시 정리 스케줄 (pg_cron)
-- ================================================
-- 매 시간 정각에 만료된 캐시 자동 삭제
-- Supabase에서 pg_cron extension이 활성화되어 있어야 함
--
-- 수동 실행: SELECT clean_expired_stock_price_cache();
-- 스케줄 확인: SELECT * FROM cron.job WHERE jobname = 'cleanup-expired-stock-cache';

DO $$
BEGIN
  -- pg_cron extension이 있는지 확인
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- 기존 스케줄이 있으면 제거
    PERFORM cron.unschedule('cleanup-expired-stock-cache');

    -- 새로운 스케줄 등록 (매 시간 정각)
    PERFORM cron.schedule(
      'cleanup-expired-stock-cache',
      '0 * * * *', -- 매 시간 정각
      $schedule$ SELECT clean_expired_stock_price_cache() $schedule$
    );
  END IF;
END $$;

-- ================================================
-- 테이블 및 컬럼 주석
-- ================================================

COMMENT ON TABLE public.stock_price_cache IS
  '주식 가격 3-tier 캐시 시스템 (메모리 LRU → Supabase → API) - 한국 시장 마감 시 API 호출 최소화';

COMMENT ON COLUMN public.stock_price_cache.ticker IS '주식 티커 심볼 (Primary Key, 예: 005930)';
COMMENT ON COLUMN public.stock_price_cache.current_price IS '현재가 (KRW)';
COMMENT ON COLUMN public.stock_price_cache.previous_close IS '전일 종가 (KRW)';
COMMENT ON COLUMN public.stock_price_cache.change_rate IS '변동률 (%, 소수점 표현)';
COMMENT ON COLUMN public.stock_price_cache.volume IS '거래량 (주)';
COMMENT ON COLUMN public.stock_price_cache.timestamp IS '데이터 수집 시간 (Unix timestamp, 밀리초)';
COMMENT ON COLUMN public.stock_price_cache.expires_at IS '캐시 만료 시간 (Unix timestamp, 밀리초) - 장 중: timestamp + 1분, 장 마감 후: 다음 영업일 09:00 KST';
COMMENT ON COLUMN public.stock_price_cache.updated_at IS '마지막 업데이트 시간 (ISO 8601, UTC) - upsert 시 자동 갱신';