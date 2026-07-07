BEGIN;

CREATE TABLE IF NOT EXISTS public.theme_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  base_date DATE NOT NULL,
  label_type TEXT NOT NULL CHECK (label_type IN ('gt_a', 'gt_b', 'gt_c_peak')),
  horizon_days INT NOT NULL DEFAULT 5,
  g_log_ratio NUMERIC,
  y_binary BOOLEAN,
  denominator NUMERIC,
  rescale_suspect BOOLEAN NOT NULL DEFAULT false,
  low_signal BOOLEAN NOT NULL DEFAULT false,
  keyword_epoch INT NOT NULL DEFAULT 1,
  basket_excess_return NUMERIC,
  basket_size INT,
  label_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (label_status IN ('pending', 'final', 'censored', 'excluded')),
  exclude_reason TEXT,
  labeler_version TEXT NOT NULL,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (theme_id, base_date, label_type, horizon_days),
  CHECK (
    (label_status = 'final' AND g_log_ratio IS NOT NULL AND y_binary IS NOT NULL)
    OR label_status <> 'final'
  )
);

CREATE INDEX IF NOT EXISTS idx_theme_labels_pending
  ON public.theme_labels (label_status, base_date)
  WHERE label_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_theme_labels_final
  ON public.theme_labels (label_type, base_date)
  WHERE label_status = 'final';

ALTER TABLE public.theme_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_theme_labels ON public.theme_labels;
CREATE POLICY service_role_all_theme_labels
  ON public.theme_labels
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.theme_labels FROM anon, authenticated;

ALTER TABLE public.interest_metrics
  ADD COLUMN IF NOT EXISTS anchor_scaled_value NUMERIC;

ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS keyword_epoch INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS keyword_hash TEXT;

COMMENT ON TABLE public.theme_labels IS
  'TLI v3 ground-truth labels for GT-A/GT-B/GT-C with labeler version pins';
COMMENT ON COLUMN public.theme_labels.keyword_epoch IS
  'Theme keyword generation recorded at label base date; mismatches exclude GT-A labels';
COMMENT ON COLUMN public.interest_metrics.anchor_scaled_value IS
  'Anchor-bridged DataLab raw value; raw_value remains immutable';
COMMENT ON COLUMN public.themes.keyword_epoch IS
  'Monotonic keyword set generation used to break labels across keyword changes';
COMMENT ON COLUMN public.themes.keyword_hash IS
  'SHA-256 hash of the sorted keyword list used to detect keyword generation changes';

COMMIT;
