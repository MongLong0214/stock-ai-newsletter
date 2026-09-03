BEGIN;

ALTER TABLE public.newsletter_content
  ADD COLUMN IF NOT EXISTS sending_owner TEXT,
  ADD COLUMN IF NOT EXISTS sending_lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sending_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.newsletter_content.sending_owner IS '현재 발송 리스를 소유한 실행 ID';
COMMENT ON COLUMN public.newsletter_content.sending_lease_until IS '현재 발송 리스의 UTC 만료 시각';
COMMENT ON COLUMN public.newsletter_content.sending_started_at IS '최초 발송 시도가 시작된 UTC 시각';

CREATE TABLE IF NOT EXISTS public.newsletter_deliveries (
  newsletter_date DATE NOT NULL,
  subscriber_id UUID NOT NULL,
  email_domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT newsletter_deliveries_status_check
    CHECK (status IN ('pending','sending','accepted','failed_retryable','failed_terminal','unknown')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  provider_message_id TEXT,
  accepted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (newsletter_date, subscriber_id)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_date_status
  ON public.newsletter_deliveries (newsletter_date, status);

ALTER TABLE public.newsletter_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_newsletter_deliveries ON public.newsletter_deliveries;
CREATE POLICY service_role_all_newsletter_deliveries ON public.newsletter_deliveries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.newsletter_deliveries FROM anon, authenticated;

COMMENT ON TABLE public.newsletter_deliveries IS '뉴스레터 수신자별 발송 원장 — exactly-once 재시도의 진실 원본';

COMMIT;
