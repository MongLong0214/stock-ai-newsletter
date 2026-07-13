DO $protected_contracts$
DECLARE
  v_guard TEXT := pg_get_functiondef(
    'public.guard_tli_gta_v2_label_transition()'::REGPROCEDURE
  );
BEGIN
  IF position('current_user IS DISTINCT FROM pg_get_userbyid' IN v_guard) = 0
     OR position(
       'current_setting(''tli.finalize_gta_v2_label_id'', true) IS DISTINCT FROM OLD.id::text'
       IN v_guard
     ) = 0
     OR to_regprocedure('public.finalize_tli_gta_v2_label(text,text)') IS NULL
     OR to_regprocedure('public.finalize_tli_legacy_labels(jsonb)') IS NULL
  THEN
    RAISE EXCEPTION 'migration 055 changed a protected label guard or finalizer contract';
  END IF;
END;
$protected_contracts$;

SELECT jsonb_build_object(
  'protected_function_contracts', 'unchanged',
  'gta_v2_owner_and_guc_guard', 'unchanged'
);

DO $truncate_guard_catalog$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.theme_labels'::REGCLASS
      AND trigger_row.tgname = 'guard_tli_theme_labels_truncate'
      AND trigger_row.tgenabled = 'O'
      AND NOT trigger_row.tgisinternal
  )
     OR has_table_privilege('service_role', 'public.theme_labels', 'TRUNCATE')
     OR has_function_privilege(
       'service_role',
       'public.reject_tli_theme_labels_truncate()',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.load_tli_latest_public_scientific_predictions_v3(uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.load_tli_latest_public_scientific_predictions_v3(uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.load_tli_latest_public_scientific_predictions_v3(uuid)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'migration 055 trigger or privilege catalog contract failed';
  END IF;
END;
$truncate_guard_catalog$;

SELECT jsonb_build_object(
  'truncate_guard_catalog', 'pass',
  'rpc_acl_catalog', 'pass'
);

DO $index_contract$
BEGIN
  IF to_regclass('public.idx_theme_labels_forecast_origin_base_date_id') IS NULL
     OR pg_get_indexdef('public.idx_theme_labels_forecast_origin_base_date_id'::REGCLASS)
       NOT LIKE '%(forecast_origin_manifest_id, base_date, id)%'
  THEN
    RAISE EXCEPTION 'migration 055 general label index is missing or malformed';
  END IF;
END;
$index_contract$;

SELECT jsonb_build_object(
  'general_label_index', 'present',
  'index_name', 'idx_theme_labels_forecast_origin_base_date_id'
);

DO $index_plan_contract$
DECLARE
  v_plan JSON;
BEGIN
  PERFORM set_config('enable_seqscan', 'off', true);
  EXECUTE $explain$
    EXPLAIN (FORMAT JSON, COSTS OFF)
    SELECT id
    FROM public.theme_labels
    WHERE forecast_origin_manifest_id = '55000000-0000-4000-8000-000000000099'
      AND base_date = DATE '2026-07-13'
    ORDER BY id
  $explain$ INTO v_plan;

  IF position('idx_theme_labels_forecast_origin_base_date_id' IN v_plan::TEXT) = 0 THEN
    RAISE EXCEPTION 'migration 055 general label index is not selected by the target query';
  END IF;
END;
$index_plan_contract$;

INSERT INTO public.themes (id, name)
VALUES
  ('55000000-0000-4000-8000-000000000001', 'migration-055-theme-a'),
  ('55000000-0000-4000-8000-000000000002', 'migration-055-theme-b'),
  ('55000000-0000-4000-8000-000000000003', 'migration-055-theme-c');

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
VALUES (
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000001',
  DATE '2026-07-13',
  'gt_b',
  5,
  'pending',
  'gta-v1',
  1
);

SET ROLE service_role;
DO $service_truncate$
BEGIN
  TRUNCATE TABLE public.theme_labels;
  RAISE EXCEPTION 'service-role TRUNCATE unexpectedly succeeded' USING ERRCODE = '55000';
EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
END;
$service_truncate$;

DO $service_truncate_cascade$
BEGIN
  TRUNCATE TABLE public.theme_labels CASCADE;
  RAISE EXCEPTION 'service-role TRUNCATE CASCADE unexpectedly succeeded' USING ERRCODE = '55000';
EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
END;
$service_truncate_cascade$;
RESET ROLE;

GRANT TRUNCATE ON TABLE public.theme_labels TO service_role;
SET ROLE service_role;
DO $service_owner_bypass$
BEGIN
  PERFORM set_config(
    'tli.theme_labels_truncate_xid',
    pg_current_xact_id()::TEXT,
    true
  );
  TRUNCATE TABLE public.theme_labels;
  RAISE EXCEPTION 'service-role owner bypass unexpectedly succeeded' USING ERRCODE = '55000';
EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
END;
$service_owner_bypass$;
RESET ROLE;
REVOKE TRUNCATE ON TABLE public.theme_labels FROM service_role;

DO $owner_truncate$
BEGIN
  TRUNCATE TABLE public.theme_labels;
  RAISE EXCEPTION 'owner TRUNCATE unexpectedly succeeded' USING ERRCODE = '55000';
EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
END;
$owner_truncate$;

DO $owner_truncate_cascade$
BEGIN
  TRUNCATE TABLE public.theme_labels CASCADE;
  RAISE EXCEPTION 'owner TRUNCATE CASCADE unexpectedly succeeded' USING ERRCODE = '55000';
EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
END;
$owner_truncate_cascade$;

DO $owner_dual_guard$
BEGIN
  PERFORM set_config(
    'tli.theme_labels_truncate_xid',
    pg_current_xact_id()::TEXT,
    true
  );
  BEGIN
    TRUNCATE TABLE public.theme_labels;
    RAISE EXCEPTION 'rollback authorized owner probe' USING ERRCODE = 'P0550';
  EXCEPTION WHEN SQLSTATE 'P0550' THEN NULL;
  END;
END;
$owner_dual_guard$;

DO $label_rows_preserved$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.theme_labels
    WHERE id = '55000000-0000-4000-8000-000000000010'
  ) THEN
    RAISE EXCEPTION 'migration 055 TRUNCATE probes removed the label fixture';
  END IF;
END;
$label_rows_preserved$;

SELECT jsonb_build_object(
  'service_truncate_sqlstate', '42501',
  'service_truncate_cascade_sqlstate', '42501',
  'service_correct_guc_sqlstate', '42501',
  'owner_truncate_sqlstate', '42501',
  'owner_truncate_cascade_sqlstate', '42501',
  'owner_dual_guard_path', 'pass_rolled_back',
  'label_rows_preserved', 'pass'
);

ALTER TABLE public.model_registry DISABLE TRIGGER ALL;
ALTER TABLE public.theme_predictions_v3 DISABLE TRIGGER ALL;

INSERT INTO public.model_registry (
  model_version,
  model_type,
  coefficients,
  train_range,
  val_metrics,
  gate_result,
  status,
  scientific_claim_status,
  scientific_release_status,
  scientific_claim_reason,
  experiment_cycle_id
)
VALUES
  (
    'migration-055-old', 'logistic', '{}'::JSONB,
    daterange(DATE '2026-01-01', DATE '2026-02-01', '[)'), '{}'::JSONB, '{}'::JSONB,
    'champion', 'eligible', 'public', 'migration_055_old_public',
    '55000000-0000-4000-8000-000000000020'
  ),
  (
    'migration-055-new', 'logistic', '{}'::JSONB,
    daterange(DATE '2026-02-01', DATE '2026-03-01', '[)'), '{}'::JSONB, '{}'::JSONB,
    'challenger', 'eligible', 'internal', 'migration_055_new_internal',
    '55000000-0000-4000-8000-000000000021'
  );

INSERT INTO public.theme_predictions_v3 (
  id, theme_id, prediction_date, horizon_days, serving_role,
  p_rise, ci_lower, ci_upper, abstain, abstain_reasons, features,
  model_version, labeler_version, param_version, score_status,
  experiment_cycle_id, experiment_origin_manifest_id, scientific_prediction_role,
  model_artifact_sha256, feature_contract_hash, feature_snapshot_hash,
  forecast_cutoff, forecast_origin_week
)
VALUES
  (
    '55000000-0000-4000-8000-000000000030',
    '55000000-0000-4000-8000-000000000001', DATE '2026-07-06', 5, 'shadow',
    0.70, 0.60, 0.80, FALSE, ARRAY[]::TEXT[], '{}'::JSONB,
    'migration-055-old', 'gta-v2', 'migration-055-v1', 'pending',
    '55000000-0000-4000-8000-000000000020',
    '55000000-0000-4000-8000-000000000040', 'candidate',
    repeat('a', 64), repeat('b', 64), repeat('c', 64),
    TIMESTAMPTZ '2026-07-06 00:00:00+00', DATE '2026-07-06'
  ),
  (
    '55000000-0000-4000-8000-000000000031',
    '55000000-0000-4000-8000-000000000002', DATE '2026-07-06', 5, 'shadow',
    0.40, 0.30, 0.50, FALSE, ARRAY[]::TEXT[], '{}'::JSONB,
    'migration-055-old', 'gta-v2', 'migration-055-v1', 'pending',
    '55000000-0000-4000-8000-000000000020',
    '55000000-0000-4000-8000-000000000040', 'candidate',
    repeat('a', 64), repeat('b', 64), repeat('d', 64),
    TIMESTAMPTZ '2026-07-06 00:00:00+00', DATE '2026-07-06'
  ),
  (
    '55000000-0000-4000-8000-000000000032',
    '55000000-0000-4000-8000-000000000003', DATE '2026-06-29', 5, 'shadow',
    0.55, 0.45, 0.65, FALSE, ARRAY[]::TEXT[], '{}'::JSONB,
    'migration-055-old', 'gta-v2', 'migration-055-v1', 'pending',
    '55000000-0000-4000-8000-000000000020',
    '55000000-0000-4000-8000-000000000041', 'candidate',
    repeat('a', 64), repeat('b', 64), repeat('e', 64),
    TIMESTAMPTZ '2026-06-29 00:00:00+00', DATE '2026-06-29'
  ),
  (
    '55000000-0000-4000-8000-000000000033',
    '55000000-0000-4000-8000-000000000001', DATE '2026-07-13', 5, 'shadow',
    0.75, 0.65, 0.85, FALSE, ARRAY[]::TEXT[], '{}'::JSONB,
    'migration-055-new', 'gta-v2', 'migration-055-v1', 'pending',
    '55000000-0000-4000-8000-000000000021',
    '55000000-0000-4000-8000-000000000042', 'candidate',
    repeat('f', 64), repeat('b', 64), repeat('1', 64),
    TIMESTAMPTZ '2026-07-13 00:00:00+00', DATE '2026-07-13'
  ),
  (
    '55000000-0000-4000-8000-000000000034',
    '55000000-0000-4000-8000-000000000002', DATE '2026-07-13', 5, 'shadow',
    0.35, 0.25, 0.45, FALSE, ARRAY[]::TEXT[], '{}'::JSONB,
    'migration-055-new', 'gta-v2', 'migration-055-v1', 'pending',
    '55000000-0000-4000-8000-000000000021',
    '55000000-0000-4000-8000-000000000042', 'candidate',
    repeat('f', 64), repeat('b', 64), repeat('2', 64),
    TIMESTAMPTZ '2026-07-13 00:00:00+00', DATE '2026-07-13'
  );

ALTER TABLE public.theme_predictions_v3 ENABLE TRIGGER ALL;
ALTER TABLE public.model_registry ENABLE TRIGGER ALL;

DO $cohort_contracts$
BEGIN
  IF (
    SELECT count(*)
    FROM public.load_tli_latest_public_scientific_predictions_v3(NULL)
  ) <> 2
  OR EXISTS (
    SELECT 1
    FROM public.load_tli_latest_public_scientific_predictions_v3(NULL)
    WHERE prediction_date <> DATE '2026-07-06'
       OR model_version <> 'migration-055-old'
  )
  OR (
    SELECT count(*)
    FROM public.load_tli_latest_public_scientific_predictions_v3(
      '55000000-0000-4000-8000-000000000003'
    )
  ) <> 1
  OR EXISTS (
    SELECT 1
    FROM public.load_tli_latest_public_scientific_predictions_v3(
      '55000000-0000-4000-8000-000000000003'
    )
    WHERE prediction_date <> DATE '2026-06-29'
  )
  THEN
    RAISE EXCEPTION 'migration 055 latest cohort contract failed';
  END IF;
END;
$cohort_contracts$;

SELECT jsonb_build_object(
  'global_latest_cohort', 'pass',
  'theme_scoped_latest_cohort', 'pass'
);
