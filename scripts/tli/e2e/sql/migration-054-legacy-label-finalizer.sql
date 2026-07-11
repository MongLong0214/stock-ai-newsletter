BEGIN;

INSERT INTO public.themes (id, name)
SELECT
  ('54000000-0000-4000-8000-' || lpad(series_no::TEXT, 12, '0'))::UUID,
  'migration-054-theme-' || series_no::TEXT
FROM generate_series(1, 992) AS fixture(series_no);

INSERT INTO public.theme_labels (
  id,
  theme_id,
  base_date,
  label_type,
  horizon_days,
  label_status,
  labeler_version,
  keyword_epoch
)
SELECT
  ('54000001-0000-4000-8000-' || lpad(series_no::TEXT, 12, '0'))::UUID,
  ('54000000-0000-4000-8000-' || lpad(series_no::TEXT, 12, '0'))::UUID,
  CASE
    WHEN series_no <= 269 THEN DATE '2026-07-03'
    WHEN series_no <= 510 THEN DATE '2026-06-19'
    WHEN series_no <= 751 THEN DATE '2026-06-26'
    ELSE DATE '2026-07-03'
  END,
  CASE WHEN series_no <= 269 THEN 'gt_a' ELSE 'gt_b' END,
  5,
  'pending',
  CASE WHEN series_no <= 269 THEN 'gta-v1' ELSE 'gtb-v1' END,
  1
FROM generate_series(1, 992) AS fixture(series_no);

INSERT INTO public.themes (id, name)
VALUES ('54000010-0000-4000-8000-000000000001', 'migration-054-atomic-probe');

INSERT INTO public.theme_labels (
  id, theme_id, base_date, label_type, horizon_days, label_status,
  labeler_version, keyword_epoch
) VALUES (
  '54000011-0000-4000-8000-000000000001',
  '54000010-0000-4000-8000-000000000001',
  DATE '2026-07-03', 'gt_a', 5, 'pending', 'gta-v1', 1
);

SET ROLE service_role;

DO $finalize_backlog$
DECLARE
  v_offset INTEGER;
  v_rows JSONB;
  v_expected INTEGER;
  v_affected INTEGER;
BEGIN
  FOREACH v_offset IN ARRAY ARRAY[0, 500]
  LOOP
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', label.id::TEXT,
        'theme_id', label.theme_id::TEXT,
        'base_date', label.base_date::TEXT,
        'label_type', label.label_type,
        'horizon_days', label.horizon_days,
        'labeler_version', label.labeler_version,
        'g_log_ratio', CASE WHEN label.label_type = 'gt_a' THEN 0.1823215568::NUMERIC ELSE NULL::NUMERIC END,
        'y_binary', CASE WHEN label.label_type = 'gt_a' THEN TRUE ELSE NULL::BOOLEAN END,
        'denominator', CASE WHEN label.label_type = 'gt_a' THEN 100::NUMERIC ELSE NULL::NUMERIC END,
        'rescale_suspect', FALSE,
        'low_signal', FALSE,
        'keyword_epoch', 1,
        'basket_excess_return', CASE WHEN label.label_type = 'gt_b' THEN 0.05::NUMERIC ELSE NULL::NUMERIC END,
        'basket_size', CASE WHEN label.label_type = 'gt_b' THEN 5 ELSE NULL::INTEGER END,
        'label_status', 'final',
        'exclude_reason', NULL::TEXT
      )
      ORDER BY label.id
    ), count(*)
    INTO v_rows, v_expected
    FROM (
      SELECT fixture_label.*
      FROM public.theme_labels AS fixture_label
      WHERE fixture_label.id::TEXT LIKE '54000001-%'
      ORDER BY fixture_label.id
      OFFSET v_offset
      LIMIT 500
    ) AS label;

    v_affected := public.finalize_tli_legacy_labels(v_rows);
    IF v_affected IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'migration 054 batch affected % of % rows', v_affected, v_expected;
    END IF;
  END LOOP;
END;
$finalize_backlog$;

DO $zero_row_rejection$
DECLARE
  v_rows JSONB;
BEGIN
  SELECT jsonb_build_array(jsonb_build_object(
    'id', label.id::TEXT,
    'theme_id', label.theme_id::TEXT,
    'base_date', label.base_date::TEXT,
    'label_type', label.label_type,
    'horizon_days', label.horizon_days,
    'labeler_version', label.labeler_version,
    'g_log_ratio', label.g_log_ratio,
    'y_binary', label.y_binary,
    'denominator', label.denominator,
    'rescale_suspect', label.rescale_suspect,
    'low_signal', label.low_signal,
    'keyword_epoch', label.keyword_epoch,
    'basket_excess_return', label.basket_excess_return,
    'basket_size', label.basket_size,
    'label_status', label.label_status,
    'exclude_reason', label.exclude_reason
  ))
  INTO v_rows
  FROM public.theme_labels AS label
  WHERE label.id = '54000001-0000-4000-8000-000000000001';

  PERFORM public.finalize_tli_legacy_labels(v_rows);
  RAISE EXCEPTION 'terminal legacy row unexpectedly matched a second finalization'
    USING ERRCODE = '55001';
EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
END;
$zero_row_rejection$;

DO $partial_batch_rollback$
DECLARE
  v_valid_row JSONB := jsonb_build_object(
    'id', '54000011-0000-4000-8000-000000000001',
    'theme_id', '54000010-0000-4000-8000-000000000001',
    'base_date', '2026-07-03',
    'label_type', 'gt_a',
    'horizon_days', 5,
    'labeler_version', 'gta-v1',
    'g_log_ratio', 0.1823215568,
    'y_binary', TRUE,
    'denominator', 100,
    'rescale_suspect', FALSE,
    'low_signal', FALSE,
    'keyword_epoch', 1,
    'basket_excess_return', NULL,
    'basket_size', NULL,
    'label_status', 'final',
    'exclude_reason', NULL
  );
BEGIN
  BEGIN
    PERFORM public.finalize_tli_legacy_labels(jsonb_build_array(
      v_valid_row,
      jsonb_set(v_valid_row, '{id}', '"54000011-0000-4000-8000-000000000002"'::JSONB)
    ));
    RAISE EXCEPTION 'partial legacy batch unexpectedly committed'
      USING ERRCODE = '55001';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.theme_labels
    WHERE id = '54000011-0000-4000-8000-000000000001'
      AND label_status = 'pending'
      AND finalized_at IS NULL
  ) THEN
    RAISE EXCEPTION 'partial legacy batch did not roll back its matched row';
  END IF;
END;
$partial_batch_rollback$;

DO $gta_v2_rejection$
BEGIN
  PERFORM public.finalize_tli_legacy_labels(jsonb_build_array(jsonb_build_object(
    'id', '54000001-0000-4000-8000-000000000001',
    'theme_id', '54000000-0000-4000-8000-000000000001',
    'base_date', '2026-07-03',
    'label_type', 'gt_a',
    'horizon_days', 5,
    'labeler_version', 'gta-v2',
    'g_log_ratio', 0.1823215568,
    'y_binary', TRUE,
    'denominator', 100,
    'rescale_suspect', FALSE,
    'low_signal', FALSE,
    'keyword_epoch', 1,
    'basket_excess_return', NULL,
    'basket_size', NULL,
    'label_status', 'final',
    'exclude_reason', NULL
  )));
  RAISE EXCEPTION 'gta-v2 payload unexpectedly entered the legacy finalizer'
    USING ERRCODE = '55001';
EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
END;
$gta_v2_rejection$;

RESET ROLE;

DO $final_assertions$
BEGIN
  IF (SELECT count(*) FROM public.theme_labels WHERE id::TEXT LIKE '54000001-%') <> 992
     OR (SELECT count(*) FROM public.theme_labels WHERE id::TEXT LIKE '54000001-%' AND label_status = 'final') <> 992
     OR (SELECT count(*) FROM public.theme_labels WHERE id::TEXT LIKE '54000001-%' AND label_status = 'pending') <> 0
     OR (SELECT count(*) FROM public.theme_labels WHERE id::TEXT LIKE '54000001-%' AND label_type = 'gt_a') <> 269
     OR (SELECT count(*) FROM public.theme_labels WHERE id::TEXT LIKE '54000001-%' AND label_type = 'gt_b') <> 723
     OR EXISTS (
       SELECT 1
       FROM public.theme_labels
       WHERE id::TEXT LIKE '54000001-%'
         AND (
           scientific_use_status <> 'exploratory_only'
           OR scientific_use_reason <> 'legacy_non_pit_evidence'
         )
     )
  THEN
    RAISE EXCEPTION 'migration 054 final state assertion failed';
  END IF;
END;
$final_assertions$;

SELECT jsonb_build_object(
  'status', 'pass',
  'requested', count(*),
  'finalized', count(*) FILTER (WHERE label_status = 'final'),
  'gt_a', count(*) FILTER (WHERE label_type = 'gt_a'),
  'gt_b', count(*) FILTER (WHERE label_type = 'gt_b'),
  'batches', jsonb_build_array(500, 492),
  'zero_row_sqlstate', '55000',
  'partial_batch_atomic', 'pass',
  'gta_v2_sqlstate', '22023',
  'scientific_contract', 'unchanged'
)
FROM public.theme_labels
WHERE id::TEXT LIKE '54000001-%';

ROLLBACK;
