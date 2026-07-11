BEGIN;

INSERT INTO public.themes (id, name)
VALUES ('53000000-0000-4000-8000-000000000001', 'migration-053-label-guard');

INSERT INTO public.stock_daily_prices (symbol, trade_date, close, volume, source)
SELECT 'KOSPI', trade_date, 100, 1000, 'kis'
FROM unnest(ARRAY[
  DATE '2026-07-07', DATE '2026-07-08', DATE '2026-07-09', DATE '2026-07-10',
  DATE '2026-07-13', DATE '2026-07-14', DATE '2026-07-15', DATE '2026-07-16',
  DATE '2026-07-17', DATE '2026-07-20'
]) AS trading_days(trade_date);

INSERT INTO public.tli_forecast_origin_manifests (
  id, manifest_version, origin_date, forecast_cutoff, expected_theme_ids,
  expected_theme_count, expected_universe_sha256, keyword_group_manifest_sha256,
  payload_sha256
) VALUES (
  '53000000-0000-4000-8000-000000000002',
  'migration-053-rehearsal-v1',
  DATE '2026-07-13',
  TIMESTAMPTZ '2026-07-13 09:00:00+00',
  '["53000000-0000-4000-8000-000000000001"]'::JSONB,
  1,
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64)
);

INSERT INTO public.tli_forecast_origin_theme_inputs (
  forecast_origin_manifest_id, theme_id, keyword_group_spec, keyword_group_sha256,
  forecast_interest_run_id, forecast_interest_response_sha256, news_observation_ids,
  news_input_sha256, input_status, abstain_reason
) VALUES (
  '53000000-0000-4000-8000-000000000002',
  '53000000-0000-4000-8000-000000000001',
  '{"fixture":"migration-053"}'::JSONB,
  repeat('d', 64),
  NULL,
  NULL,
  '[]'::JSONB,
  NULL,
  'abstain',
  'migration_053_rehearsal'
);

DO $prepare_finalizer_payload$
DECLARE
  v_payload JSONB := jsonb_build_object(
    'theme_id', '53000000-0000-4000-8000-000000000001',
    'base_date', '2026-07-13',
    'forecast_origin_manifest_id', '53000000-0000-4000-8000-000000000002',
    'as_of', '2026-07-20T00:00:00.000Z',
    'label_source_run_id', NULL,
    'label_request_sha256', NULL,
    'label_response_sha256', NULL,
    'g_log_ratio', NULL,
    'y_binary', NULL
  );
  v_canonical TEXT;
BEGIN
  v_canonical := public.tli_render_canonical_json_v1(v_payload);
  PERFORM set_config('tli.rehearsal_gta_v2_canonical', v_canonical, true);
  PERFORM set_config(
    'tli.rehearsal_gta_v2_sha256',
    public.tli_sha256_text(v_canonical),
    true
  );
END;
$prepare_finalizer_payload$;

SET ROLE service_role;

DO $direct_final_insert$
BEGIN
  INSERT INTO public.theme_labels (
    theme_id, base_date, label_type, horizon_days, g_log_ratio, y_binary,
    denominator, label_status, labeler_version, finalized_at,
    scientific_use_status, scientific_use_reason, forecast_origin_manifest_id,
    forecast_interest_run_id, label_source_run_id, source_cutoff, source_max_date,
    label_request_sha256, label_response_sha256, past_dates, future_dates,
    past_observation_count, future_observation_count, forecast_keyword_group_sha256
  ) VALUES (
    '53000000-0000-4000-8000-000000000001', DATE '2026-07-13', 'gt_a', 5,
    0.1, TRUE, 10, 'final', 'gta-v2', clock_timestamp(),
    'confirmatory_eligible', 'gta_v2_exact_contract',
    '53000000-0000-4000-8000-000000000002',
    '53000000-0000-4000-8000-000000000003',
    '53000000-0000-4000-8000-000000000004',
    TIMESTAMPTZ '2026-07-13 09:00:00+00', DATE '2026-07-20',
    repeat('e', 64), repeat('f', 64),
    '["2026-07-07","2026-07-08","2026-07-09","2026-07-10","2026-07-13"]'::JSONB,
    '["2026-07-14","2026-07-15","2026-07-16","2026-07-17","2026-07-20"]'::JSONB,
    5, 5, repeat('d', 64)
  );
  RAISE EXCEPTION 'direct final gta-v2 insert unexpectedly succeeded' USING ERRCODE = '55000';
EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
END;
$direct_final_insert$;

DO $direct_excluded_insert$
BEGIN
  INSERT INTO public.theme_labels (
    theme_id, base_date, label_type, horizon_days, label_status, exclude_reason,
    labeler_version, finalized_at, scientific_use_status, scientific_use_reason,
    forecast_origin_manifest_id
  ) VALUES (
    '53000000-0000-4000-8000-000000000001', DATE '2026-07-13', 'gt_a', 5,
    'excluded', 'spec_mismatch', 'gta-v2', clock_timestamp(),
    'exploratory_only', 'spec_mismatch', '53000000-0000-4000-8000-000000000002'
  );
  RAISE EXCEPTION 'direct excluded gta-v2 insert unexpectedly succeeded' USING ERRCODE = '55000';
EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
END;
$direct_excluded_insert$;

DO $preloaded_pending_insert$
BEGIN
  INSERT INTO public.theme_labels (
    theme_id, base_date, label_type, horizon_days, label_status, labeler_version,
    scientific_use_status, scientific_use_reason, forecast_origin_manifest_id,
    low_signal, keyword_epoch, basket_excess_return, basket_size
  ) VALUES (
    '53000000-0000-4000-8000-000000000001', DATE '2026-07-13', 'gt_a', 5,
    'pending', 'gta-v2', 'exploratory_only', 'pending_gta_v2',
    '53000000-0000-4000-8000-000000000002', TRUE, 99, 0.5, 10
  );
  RAISE EXCEPTION 'preloaded gta-v2 pending insert unexpectedly succeeded' USING ERRCODE = '55000';
EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
END;
$preloaded_pending_insert$;

INSERT INTO public.theme_labels (
  id, theme_id, base_date, label_type, horizon_days, label_status,
  labeler_version, scientific_use_status, scientific_use_reason,
  forecast_origin_manifest_id
) VALUES (
  '53000000-0000-4000-8000-000000000005',
  '53000000-0000-4000-8000-000000000001',
  DATE '2026-07-13', 'gt_a', 5, 'pending', 'gta-v2',
  'exploratory_only', 'pending_gta_v2',
  '53000000-0000-4000-8000-000000000002'
);

DO $spoofed_guc_update$
BEGIN
  PERFORM set_config(
    'tli.finalize_gta_v2_label_id',
    '53000000-0000-4000-8000-000000000005',
    true
  );
  UPDATE public.theme_labels
  SET label_status = 'excluded',
      exclude_reason = 'spec_mismatch',
      finalized_at = clock_timestamp()
  WHERE id = '53000000-0000-4000-8000-000000000005';
  RAISE EXCEPTION 'spoofed gta-v2 finalizer GUC unexpectedly authorized an update'
    USING ERRCODE = '55000';
EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
END;
$spoofed_guc_update$;

DO $real_finalizer$
BEGIN
  PERFORM public.finalize_tli_gta_v2_label(
    current_setting('tli.rehearsal_gta_v2_canonical'),
    current_setting('tli.rehearsal_gta_v2_sha256')
  );
END;
$real_finalizer$;

INSERT INTO public.theme_labels (
  id, theme_id, base_date, label_type, horizon_days, label_status,
  labeler_version, keyword_epoch
) VALUES (
  '53000000-0000-4000-8000-000000000006',
  '53000000-0000-4000-8000-000000000001',
  DATE '2026-07-13', 'gt_b', 5, 'pending', 'gta-v1', 1
);

UPDATE public.theme_labels
SET keyword_epoch = 2
WHERE id = '53000000-0000-4000-8000-000000000006';

DO $protected_column_update$
BEGIN
  UPDATE public.theme_labels
  SET scientific_use_reason = 'forged'
  WHERE id = '53000000-0000-4000-8000-000000000006';
  RAISE EXCEPTION 'protected label column update unexpectedly succeeded'
    USING ERRCODE = '55000';
EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
END;
$protected_column_update$;

RESET ROLE;

DO $old_legacy_upsert$
BEGIN
  INSERT INTO public.theme_predictions_v3 (
    theme_id, prediction_date, horizon_days, serving_role, p_rise, ci_lower,
    ci_upper, abstain, abstain_reasons, features, model_version,
    labeler_version, param_version, score_status
  ) VALUES (
    '53000000-0000-4000-8000-000000000001', DATE '2026-07-13', 5,
    'champion', 0.5, NULL, NULL, FALSE, ARRAY[]::TEXT[], '{}'::JSONB,
    'migration-053-legacy', 'gta-v1', 'migration-053-v1', 'pending'
  )
  ON CONFLICT (theme_id, prediction_date, horizon_days, model_version)
  DO UPDATE SET p_rise = EXCLUDED.p_rise;
  RAISE EXCEPTION 'old legacy upsert unexpectedly inferred a partial unique index'
    USING ERRCODE = '55000';
EXCEPTION WHEN SQLSTATE '42P10' THEN NULL;
END;
$old_legacy_upsert$;

SET ROLE service_role;

DO $legacy_rpc_upsert$
DECLARE
  v_rows JSONB := jsonb_build_array(jsonb_build_object(
    'theme_id', '53000000-0000-4000-8000-000000000001',
    'prediction_date', '2026-07-13',
    'horizon_days', 5,
    'serving_role', 'champion',
    'p_rise', 0.5,
    'ci_lower', NULL,
    'ci_upper', NULL,
    'abstain', FALSE,
    'abstain_reasons', jsonb_build_array(),
    'features', jsonb_build_object(),
    'model_version', 'migration-053-legacy',
    'labeler_version', 'gta-v1',
    'param_version', 'migration-053-v1',
    'score_status', 'pending'
  ));
BEGIN
  IF public.upsert_tli_legacy_predictions_v3(v_rows) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'legacy prediction RPC insert returned the wrong affected count';
  END IF;
  v_rows := jsonb_set(v_rows, '{0,p_rise}', '0.6'::JSONB);
  IF public.upsert_tli_legacy_predictions_v3(v_rows) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'legacy prediction RPC update returned the wrong affected count';
  END IF;
END;
$legacy_rpc_upsert$;

RESET ROLE;

DO $final_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.theme_labels
    WHERE id = '53000000-0000-4000-8000-000000000005'
      AND label_status = 'excluded'
      AND scientific_use_reason = 'spec_mismatch'
      AND low_signal = FALSE
      AND keyword_epoch = 1
      AND basket_excess_return IS NULL
      AND basket_size IS NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.theme_labels
    WHERE id = '53000000-0000-4000-8000-000000000006'
      AND labeler_version = 'gta-v1'
      AND keyword_epoch = 2
      AND scientific_use_reason = 'legacy_non_pit_evidence'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.theme_predictions_v3
    WHERE theme_id = '53000000-0000-4000-8000-000000000001'
      AND prediction_date = DATE '2026-07-13'
      AND model_version = 'migration-053-legacy'
      AND experiment_cycle_id IS NULL
      AND p_rise = 0.6
  ) THEN
    RAISE EXCEPTION 'migration 053 final state assertion failed';
  END IF;
END;
$final_assertions$;

SELECT jsonb_build_object(
  'status', 'pass',
  'direct_final_insert_sqlstate', '42501',
  'direct_excluded_insert_sqlstate', '42501',
  'preloaded_pending_insert_sqlstate', '42501',
  'spoofed_guc_update_sqlstate', '42501',
  'protected_column_update_sqlstate', '42501',
  'legacy_column_update', 'pass',
  'finalizer_status', label_status,
  'finalizer_reason', scientific_use_reason,
  'old_upsert_sqlstate', '42P10',
  'legacy_rpc_upsert', 'pass'
)
FROM public.theme_labels
WHERE id = '53000000-0000-4000-8000-000000000005'
  AND label_status = 'excluded'
  AND scientific_use_reason = 'spec_mismatch'
  AND EXISTS (
    SELECT 1
    FROM public.theme_predictions_v3
    WHERE theme_id = '53000000-0000-4000-8000-000000000001'
      AND prediction_date = DATE '2026-07-13'
      AND model_version = 'migration-053-legacy'
      AND experiment_cycle_id IS NULL
      AND p_rise = 0.6
  );

ROLLBACK;
