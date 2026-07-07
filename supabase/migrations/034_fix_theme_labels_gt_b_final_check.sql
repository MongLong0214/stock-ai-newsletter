BEGIN;

ALTER TABLE public.theme_labels
  DROP CONSTRAINT IF EXISTS theme_labels_check;

ALTER TABLE public.theme_labels
  DROP CONSTRAINT IF EXISTS theme_labels_final_payload_check;

ALTER TABLE public.theme_labels
  ADD CONSTRAINT theme_labels_final_payload_check
  CHECK (
    label_status <> 'final'
    OR (
      label_type = 'gt_a'
      AND g_log_ratio IS NOT NULL
      AND y_binary IS NOT NULL
    )
    OR (
      label_type = 'gt_b'
      AND basket_excess_return IS NOT NULL
      AND basket_size IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.theme_labels
  VALIDATE CONSTRAINT theme_labels_final_payload_check;

COMMIT;
