BEGIN;

CREATE TEMP TABLE lifecycle_transition_log (
  step_order INTEGER PRIMARY KEY,
  transition TEXT NOT NULL,
  before_status TEXT,
  after_status TEXT,
  observed JSONB NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict = 'pass')
);

CREATE TEMP TABLE lifecycle_rejection_log (
  probe TEXT PRIMARY KEY,
  expected_sqlstate TEXT NOT NULL,
  observed_sqlstate TEXT NOT NULL,
  message TEXT NOT NULL,
  state_unchanged BOOLEAN NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict = 'pass')
);

CREATE TEMP TABLE lifecycle_origin_fixture (
  ordinal INTEGER PRIMARY KEY,
  origin_date DATE NOT NULL,
  forecast_id UUID NOT NULL,
  study_origin_id UUID NOT NULL,
  enrolled_id UUID,
  candidate_prediction_id UUID NOT NULL,
  comparator_prediction_id UUID NOT NULL,
  label_id UUID NOT NULL
);

CREATE TEMP TABLE lifecycle_fixture_payload (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);

CREATE TEMP TABLE lifecycle_transaction_log (
  stage_order INTEGER PRIMARY KEY,
  stage TEXT NOT NULL UNIQUE,
  guards_reset BOOLEAN NOT NULL CHECK (guards_reset)
);

CREATE OR REPLACE FUNCTION pg_temp.assert_rpc_guards_reset(
  p_stage_order INTEGER,
  p_stage TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $assert_rpc_guards_reset$
DECLARE
  v_cycle_rpc TEXT := NULLIF(current_setting('tli.cycle_rpc', true), '');
  v_registry_rpc TEXT := NULLIF(current_setting('tli.cycle_registry_rpc', true), '');
BEGIN
  IF v_cycle_rpc IS NOT NULL OR v_registry_rpc IS NOT NULL THEN
    RAISE EXCEPTION 'RPC guard leaked into stage %: cycle=%, registry=%',
      p_stage, v_cycle_rpc, v_registry_rpc;
  END IF;
  INSERT INTO lifecycle_transaction_log VALUES (p_stage_order, p_stage, true);
END;
$assert_rpc_guards_reset$;

SELECT pg_temp.assert_rpc_guards_reset(1, 'draft_setup');

CREATE OR REPLACE FUNCTION pg_temp.fixture_uuid(p_namespace INTEGER, p_ordinal INTEGER)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $fixture_uuid$
  SELECT (
    '12' || lpad(p_namespace::TEXT, 6, '0') || '-0000-4000-8000-' ||
    lpad(p_ordinal::TEXT, 12, '0')
  )::UUID;
$fixture_uuid$;

CREATE OR REPLACE FUNCTION pg_temp.payload_sha(p_payload JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $payload_sha$
  SELECT encode(
    extensions.digest(public.tli_render_canonical_json_v1(p_payload), 'sha256'),
    'hex'
  );
$payload_sha$;

CREATE OR REPLACE FUNCTION pg_temp.evidence_envelope(
  p_cycle_id UUID,
  p_artifact_type TEXT,
  p_artifact_key TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $evidence_envelope$
  SELECT jsonb_build_object(
    'artifact_type', p_artifact_type,
    'artifact_key', p_artifact_key,
    'content_sha256', pg_temp.payload_sha(p_payload),
    'canonical_json', public.tli_render_canonical_json_v1(p_payload),
    'git_commit_sha', repeat('1', 40),
    'git_blob_sha', repeat('2', 40),
    'repo_relative_path',
      'docs/evidence/tli-v3-scientific-rebuild/' || p_cycle_id::TEXT || '/' ||
      replace(p_artifact_type, '_', '-') ||
      CASE WHEN p_artifact_key = 'singleton' THEN '.json' ELSE '-' || p_artifact_key || '.json' END,
    'verifier_version', 'todo12-live-rehearsal-v1',
    'verifier_code_sha', repeat('3', 64),
    'verified_at', '2026-07-10T00:00:00.000Z'
  );
$evidence_envelope$;

CREATE OR REPLACE FUNCTION pg_temp.origin_evidence_envelope(
  p_cycle_id UUID,
  p_origin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $origin_evidence_envelope$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_origin public.tli_experiment_origin_manifests%ROWTYPE;
  v_study public.tli_study_origin_manifests%ROWTYPE;
  v_forecast public.tli_forecast_origin_manifests%ROWTYPE;
  v_payload JSONB;
BEGIN
  SELECT * INTO STRICT v_cycle FROM public.tli_experiment_cycles WHERE id = p_cycle_id;
  SELECT * INTO STRICT v_origin FROM public.tli_experiment_origin_manifests WHERE id = p_origin_id;
  SELECT * INTO STRICT v_study FROM public.tli_study_origin_manifests WHERE id = v_origin.study_origin_manifest_id;
  SELECT * INTO STRICT v_forecast FROM public.tli_forecast_origin_manifests WHERE id = v_origin.forecast_origin_manifest_id;

  v_payload := jsonb_build_object(
    'manifest_version', 'origin-manifest-v1',
    'experiment_origin_manifest_id', v_origin.id::TEXT,
    'cycle_id', v_cycle.id::TEXT,
    'study_origin_manifest_id', v_study.id::TEXT,
    'forecast_origin_manifest_id', v_forecast.id::TEXT,
    'study_contract_id', v_cycle.study_contract_id::TEXT,
    'study_contract_sha256', v_cycle.study_contract_sha256,
    'enrollment_role', v_origin.enrollment_role,
    'sequence_no', v_origin.sequence_no,
    'public_canary_no', to_jsonb(v_origin.public_canary_no),
    'origin_date', to_char(v_forecast.origin_date, 'YYYY-MM-DD'),
    'forecast_cutoff', to_char(v_forecast.forecast_cutoff AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expected_universe_sha256', v_forecast.expected_universe_sha256,
    'keyword_group_manifest_sha256', v_forecast.keyword_group_manifest_sha256,
    'forecast_payload_sha256', v_forecast.payload_sha256,
    'study_origin_payload_sha256', v_study.payload_sha256,
    'candidate_model_sha256', v_origin.candidate_model_sha256,
    'comparator_artifact_sha256', v_origin.comparator_artifact_sha256,
    'kospi_base_trade_date', to_char(v_origin.kospi_base_trade_date, 'YYYY-MM-DD'),
    'kospi_base_close', v_origin.kospi_base_close,
    'kospi_lookback_trade_date', to_char(v_origin.kospi_lookback_trade_date, 'YYYY-MM-DD'),
    'kospi_lookback_close', v_origin.kospi_lookback_close,
    'kospi_source_ids', v_origin.kospi_source_ids,
    'kospi_input_sha256', v_origin.kospi_input_sha256,
    'regime', v_origin.regime
  );
  RETURN pg_temp.evidence_envelope(
    p_cycle_id,
    'origin_manifest',
    to_char(v_forecast.origin_date, 'YYYY-MM-DD'),
    v_payload
  );
END;
$origin_evidence_envelope$;

CREATE OR REPLACE FUNCTION pg_temp.insert_origin_scoring_rows(p_ordinal INTEGER)
RETURNS VOID
LANGUAGE plpgsql
AS $insert_origin_scoring_rows$
DECLARE
  v_fixture lifecycle_origin_fixture%ROWTYPE;
  v_origin public.tli_experiment_origin_manifests%ROWTYPE;
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_theme_id UUID := pg_temp.fixture_uuid(1, 1);
BEGIN
  SELECT * INTO STRICT v_fixture FROM lifecycle_origin_fixture WHERE ordinal = p_ordinal;
  SELECT * INTO STRICT v_origin FROM public.tli_experiment_origin_manifests WHERE id = v_fixture.enrolled_id;
  SELECT * INTO STRICT v_cycle FROM public.tli_experiment_cycles WHERE id = v_origin.cycle_id;

  INSERT INTO public.theme_labels (
    id, theme_id, base_date, label_type, horizon_days, label_status, exclude_reason,
    labeler_version, finalized_at, scientific_use_status, scientific_use_reason,
    forecast_origin_manifest_id
  ) VALUES (
    v_fixture.label_id, v_theme_id, v_fixture.origin_date, 'gt_a', 5, 'excluded',
    'source_gap_sla', 'gta-v2', '2026-07-10T00:00:00.000Z'::TIMESTAMPTZ,
    'exploratory_only', 'source_gap_sla', v_fixture.forecast_id
  );

  INSERT INTO public.theme_predictions_v3 (
    id, theme_id, prediction_date, horizon_days, serving_role, p_rise, ci_lower,
    ci_upper, abstain, abstain_reasons, features, model_version, labeler_version,
    param_version, score_status, created_at, experiment_cycle_id,
    experiment_origin_manifest_id, scientific_prediction_role,
    model_artifact_sha256, feature_contract_hash, feature_snapshot_hash,
    forecast_cutoff, forecast_origin_week
  )
  SELECT
    CASE role WHEN 'candidate' THEN v_fixture.candidate_prediction_id ELSE v_fixture.comparator_prediction_id END,
    v_theme_id,
    v_fixture.origin_date,
    5,
    'shadow',
    CASE role WHEN 'candidate' THEN 0.60 ELSE 0.50 END,
    CASE role WHEN 'candidate' THEN 0.50 ELSE 0.50 END,
    CASE role WHEN 'candidate' THEN 0.70 ELSE 0.50 END,
    false,
    ARRAY[]::TEXT[],
    '{}'::JSONB,
    CASE role WHEN 'candidate' THEN v_cycle.candidate_model_version ELSE v_cycle.comparator_version END,
    'gta-v2',
    'todo12-live-rehearsal-v1',
    'pending',
    '2026-07-10T00:30:00.000Z'::TIMESTAMPTZ,
    v_cycle.id,
    v_origin.id,
    role,
    CASE role WHEN 'candidate' THEN v_cycle.candidate_model_sha256 ELSE v_cycle.comparator_artifact_sha256 END,
    v_cycle.feature_contract_sha256,
    pg_temp.payload_sha(jsonb_build_object('ordinal', p_ordinal, 'role', role)),
    forecast.forecast_cutoff,
    forecast.origin_date
  FROM unnest(ARRAY['candidate','comparator']) AS roles(role)
  JOIN public.tli_forecast_origin_manifests AS forecast ON forecast.id = v_fixture.forecast_id;
END;
$insert_origin_scoring_rows$;

CREATE OR REPLACE FUNCTION pg_temp.score_prediction(p_prediction_id UUID, p_label_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $score_prediction$
DECLARE
  v_payload JSONB;
  v_canonical TEXT;
BEGIN
  v_payload := jsonb_build_object(
    'prediction_id', p_prediction_id::TEXT,
    'actual_label_id', p_label_id::TEXT,
    'score_status', 'excluded',
    'score_exclusion_reason', 'source_gap_sla',
    'scored_at', '2026-07-10T01:00:00.000Z'
  );
  v_canonical := public.tli_render_canonical_json_v1(v_payload);
  PERFORM public.finalize_tli_scientific_prediction_score(v_canonical, pg_temp.payload_sha(v_payload));
END;
$score_prediction$;

CREATE OR REPLACE FUNCTION pg_temp.canary_evidence_envelope(p_cycle_id UUID, p_origin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $canary_evidence_envelope$
DECLARE
  v_origin public.tli_experiment_origin_manifests%ROWTYPE;
  v_origin_date DATE;
  v_payload JSONB;
BEGIN
  SELECT * INTO STRICT v_origin FROM public.tli_experiment_origin_manifests WHERE id = p_origin_id;
  SELECT origin_date INTO STRICT v_origin_date
  FROM public.tli_forecast_origin_manifests
  WHERE id = v_origin.forecast_origin_manifest_id;
  v_payload := jsonb_build_object(
    'cycle_id', p_cycle_id::TEXT,
    'experiment_origin_manifest_id', v_origin.id::TEXT,
    'public_canary_no', v_origin.public_canary_no,
    'gate_pass', true,
    'probability_interval_completeness', 1,
    'expected_universe_coverage', 1,
    'critical_incident_count', 0,
    'probability_invalid_count', 0,
    'candidate_brier', 0.10,
    'pooled_fixed_bin_ece', 0.05,
    'pooled_ece_upper95', 0.08,
    'bootstrap_replicates', 10000,
    'ece_bins', 10,
    'bootstrap_quantile_type', 7
  );
  RETURN pg_temp.evidence_envelope(
    p_cycle_id,
    'public_canary',
    to_char(v_origin_date, 'YYYY-MM-DD'),
    v_payload
  );
END;
$canary_evidence_envelope$;

CREATE OR REPLACE FUNCTION pg_temp.canary_evidence_array(
  p_cycle_id UUID,
  p_add_placeholder BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $canary_evidence_array$
DECLARE
  v_result JSONB;
  v_placeholder_payload JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(pg_temp.canary_evidence_envelope(p_cycle_id, origin.id) ORDER BY origin.public_canary_no),
    '[]'::JSONB
  ) INTO v_result
  FROM public.tli_experiment_origin_manifests AS origin
  WHERE origin.cycle_id = p_cycle_id
    AND origin.enrollment_role = 'public_canary';

  IF p_add_placeholder THEN
    v_placeholder_payload := jsonb_build_object(
      'cycle_id', p_cycle_id::TEXT,
      'experiment_origin_manifest_id', pg_temp.fixture_uuid(9, 4)::TEXT,
      'public_canary_no', 4,
      'gate_pass', true
    );
    v_result := v_result || jsonb_build_array(pg_temp.evidence_envelope(
      p_cycle_id,
      'public_canary',
      '2099-01-04',
      v_placeholder_payload
    ));
  END IF;
  RETURN v_result;
END;
$canary_evidence_array$;

INSERT INTO lifecycle_origin_fixture (
  ordinal, origin_date, forecast_id, study_origin_id,
  candidate_prediction_id, comparator_prediction_id, label_id
)
SELECT
  ordinal,
  '2026-07-13'::DATE + ((ordinal - 1) * 7),
  pg_temp.fixture_uuid(2, ordinal),
  pg_temp.fixture_uuid(3, ordinal),
  pg_temp.fixture_uuid(4, ordinal),
  pg_temp.fixture_uuid(5, ordinal),
  pg_temp.fixture_uuid(6, ordinal)
FROM generate_series(1, 20) AS ordinals(ordinal);

INSERT INTO public.themes (id, name)
VALUES (pg_temp.fixture_uuid(1, 1), 'todo12-live-rehearsal-theme')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stock_daily_prices (symbol, trade_date, close, volume, source, created_at)
SELECT 'KOSPI', trade_date::DATE, 100, 1000, 'kis', '2026-07-01T00:00:00.000Z'::TIMESTAMPTZ
FROM generate_series('2026-05-01'::DATE, '2026-12-31'::DATE, INTERVAL '1 day') AS days(trade_date)
WHERE EXTRACT(ISODOW FROM trade_date) BETWEEN 1 AND 5
ON CONFLICT (symbol, trade_date) DO NOTHING;

INSERT INTO public.tli_forecast_origin_manifests (
  id, manifest_version, origin_date, forecast_cutoff, expected_theme_ids,
  expected_theme_count, expected_universe_sha256, keyword_group_manifest_sha256,
  payload_sha256, created_at
)
SELECT
  fixture.forecast_id,
  'forecast-origin-v1',
  fixture.origin_date,
  ((fixture.origin_date::TIMESTAMP + TIME '18:00') AT TIME ZONE 'Asia/Seoul'),
  jsonb_build_array(pg_temp.fixture_uuid(1, 1)::TEXT),
  1,
  pg_temp.payload_sha(jsonb_build_object('kind', 'universe', 'ordinal', fixture.ordinal)),
  pg_temp.payload_sha(jsonb_build_object('kind', 'keyword', 'ordinal', fixture.ordinal)),
  pg_temp.payload_sha(jsonb_build_object('kind', 'forecast', 'ordinal', fixture.ordinal)),
  '2026-07-10T00:00:00.000Z'::TIMESTAMPTZ
FROM lifecycle_origin_fixture AS fixture;

INSERT INTO public.tli_forecast_origin_theme_inputs (
  forecast_origin_manifest_id, theme_id, keyword_group_spec, keyword_group_sha256,
  forecast_interest_run_id, forecast_interest_response_sha256, news_observation_ids,
  news_input_sha256, input_status, abstain_reason
)
SELECT
  fixture.forecast_id,
  pg_temp.fixture_uuid(1, 1),
  jsonb_build_object('fixture', 'todo12-live'),
  pg_temp.payload_sha(jsonb_build_object('kind', 'keyword-input', 'ordinal', fixture.ordinal)),
  NULL,
  NULL,
  '[]'::JSONB,
  NULL,
  'abstain',
  'todo12_live_rehearsal'
FROM lifecycle_origin_fixture AS fixture;

INSERT INTO public.tli_study_origin_manifests (
  id, study_contract_id, forecast_origin_manifest_id, payload_sha256, created_at
)
SELECT
  fixture.study_origin_id,
  '20000000-0000-4000-8000-000000000015'::UUID,
  fixture.forecast_id,
  pg_temp.payload_sha(jsonb_build_object('kind', 'study-origin', 'ordinal', fixture.ordinal)),
  '2026-07-10T00:00:00.000Z'::TIMESTAMPTZ
FROM lifecycle_origin_fixture AS fixture;

INSERT INTO public.tli_study_origin_theme_inputs (
  study_origin_manifest_id, theme_id, babl_observation_id, babl_input_sha256,
  babl_candidate_pool, babl_missing_reason
)
SELECT
  fixture.study_origin_id,
  pg_temp.fixture_uuid(1, 1),
  NULL,
  NULL,
  NULL,
  'no_matching_observation'
FROM lifecycle_origin_fixture AS fixture;

DO $lifecycle_setup$
DECLARE
  v_cycle_id CONSTANT UUID := '12000012-0000-4000-8000-000000000012'::UUID;
  v_study public.tli_attention_study_contracts%ROWTYPE;
  v_candidate_sha CONSTANT TEXT := repeat('a', 64);
  v_comparator_sha CONSTANT TEXT := repeat('b', 64);
  v_calibration_sha CONSTANT TEXT := repeat('c', 64);
  v_power_sha CONSTANT TEXT := repeat('d', 64);
  v_dataset_payload JSONB;
  v_dataset_sha TEXT;
  v_model_payload JSONB;
  v_model_sha TEXT;
  v_preregistration_payload JSONB;
  v_preregistration_sha TEXT;
  v_cycle_payload JSONB;
  v_envelopes JSONB;
BEGIN
  SELECT * INTO STRICT v_study
  FROM public.tli_attention_study_contracts
  WHERE id = '20000000-0000-4000-8000-000000000015'::UUID;

  v_dataset_payload := jsonb_build_object(
    'cycle_id', v_cycle_id::TEXT,
    'study_contract_id', v_study.id::TEXT,
    'study_contract_sha256', v_study.payload_sha256,
    'feature_contract_sha256', v_study.feature_contract_sha256,
    'label_contract_sha256', v_study.label_contract_sha256
  );
  v_dataset_sha := pg_temp.payload_sha(v_dataset_payload);
  v_model_payload := jsonb_build_object(
    'cycle_id', v_cycle_id::TEXT,
    'study_contract_id', v_study.id::TEXT,
    'study_contract_sha256', v_study.payload_sha256,
    'candidate_model_version', 'todo12-live-m1-v1',
    'candidate_model_sha256', v_candidate_sha,
    'comparator_version', 'todo12-live-climatology-v1',
    'comparator_artifact_sha256', v_comparator_sha,
    'calibration_artifact_sha256', v_calibration_sha,
    'model_type', 'logistic',
    'coefficients', jsonb_build_object('intercept', 0, 'weights', jsonb_build_array()),
    'train_start', '2025-01-01',
    'train_end', '2026-01-01',
    'val_metrics', jsonb_build_object('brier', 0.20),
    'gate_result', jsonb_build_object('model_artifact_sha256', v_candidate_sha)
  );
  v_model_sha := pg_temp.payload_sha(v_model_payload);
  v_preregistration_payload := jsonb_build_object(
    'cycle_id', v_cycle_id::TEXT,
    'study_contract_id', v_study.id::TEXT,
    'study_contract_sha256', v_study.payload_sha256,
    'candidate_model_sha256', v_candidate_sha,
    'comparator_artifact_sha256', v_comparator_sha,
    'dataset_manifest_sha256', v_dataset_sha,
    'feature_contract_sha256', v_study.feature_contract_sha256,
    'label_contract_sha256', v_study.label_contract_sha256,
    'calibration_artifact_sha256', v_calibration_sha,
    'babl_contract_sha256', v_study.babl_control_sha256,
    'primary_endpoint', 'paired_brier_delta',
    'alpha', 0.01,
    'thresholds', jsonb_build_object('paired_brier_delta_upper99_max', 0),
    'power_simulation_sha256', v_power_sha,
    'power_simulation_result', jsonb_build_object('power', 0.90, 'data_floor_pass', true),
    'planned_origins', 16,
    'safety_origins', 8,
    'calendar_start', '2026-07-13',
    'initial_calendar_end', (SELECT to_char(origin_date, 'YYYY-MM-DD') FROM lifecycle_origin_fixture WHERE ordinal = 16)
  );
  v_preregistration_sha := pg_temp.payload_sha(v_preregistration_payload);
  v_cycle_payload := v_preregistration_payload || jsonb_build_object(
    'candidate_model_version', 'todo12-live-m1-v1',
    'comparator_version', 'todo12-live-climatology-v1',
    'feature_contract_version', v_study.feature_contract_version,
    'labeler_version', v_study.labeler_version,
    'calibration_version', 'todo12-live-calibration-v1',
    'model_manifest_sha256', v_model_sha,
    'preregistration_sha256', v_preregistration_sha
  );

  INSERT INTO public.tli_experiment_cycles (
    id, study_contract_id, study_contract_sha256, candidate_model_version,
    candidate_model_sha256, comparator_version, comparator_artifact_sha256,
    dataset_manifest_sha256, feature_contract_version, feature_contract_sha256,
    labeler_version, label_contract_sha256, calibration_version,
    calibration_artifact_sha256, babl_contract_sha256, primary_endpoint, alpha,
    thresholds, power_simulation_sha256, power_simulation_result, planned_origins,
    safety_origins, calendar_start, initial_calendar_end, preregistration_sha256,
    preregistration_payload
  ) VALUES (
    v_cycle_id, v_study.id, v_study.payload_sha256, 'todo12-live-m1-v1',
    v_candidate_sha, 'todo12-live-climatology-v1', v_comparator_sha,
    v_dataset_sha, v_study.feature_contract_version, v_study.feature_contract_sha256,
    v_study.labeler_version, v_study.label_contract_sha256, 'todo12-live-calibration-v1',
    v_calibration_sha, v_study.babl_control_sha256, 'paired_brier_delta', 0.01,
    jsonb_build_object('paired_brier_delta_upper99_max', 0), v_power_sha,
    jsonb_build_object('power', 0.90, 'data_floor_pass', true), 16, 8,
    '2026-07-13'::DATE,
    (SELECT origin_date FROM lifecycle_origin_fixture WHERE ordinal = 16),
    v_preregistration_sha,
    v_preregistration_payload
  );

  PERFORM set_config('tli.cycle_registry_rpc', 'todo12-live-legacy-seed', true);
  INSERT INTO public.model_registry (
    model_version, model_type, coefficients, train_range, val_metrics, gate_result,
    status, scientific_claim_status, scientific_release_status, scientific_claim_reason
  ) VALUES (
    'todo12-live-legacy-champion-v1', 'logistic', '{}'::JSONB,
    daterange('2024-01-01'::DATE, '2025-01-01'::DATE, '[)'), '{}'::JSONB, '{}'::JSONB,
    'champion', 'eligible', 'public', 'todo12_live_fixture_champion'
  );

  INSERT INTO lifecycle_transition_log VALUES (
    1, 'draft', NULL, 'draft',
    jsonb_build_object('cycleId', v_cycle_id::TEXT, 'persistedStatus', 'draft'), 'pass'
  );

  v_envelopes := jsonb_build_array(
    pg_temp.evidence_envelope(v_cycle_id, 'preregistration', 'singleton', v_preregistration_payload),
    pg_temp.evidence_envelope(v_cycle_id, 'dataset_manifest', 'singleton', v_dataset_payload),
    pg_temp.evidence_envelope(v_cycle_id, 'model_manifest', 'singleton', v_model_payload),
    pg_temp.evidence_envelope(v_cycle_id, 'cycle_manifest', 'singleton', v_cycle_payload)
  );
  INSERT INTO lifecycle_fixture_payload VALUES ('freeze_envelopes', v_envelopes);
END;
$lifecycle_setup$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(2, 'freeze');

DO $lifecycle_freeze$
DECLARE
  v_cycle_id CONSTANT UUID := '12000012-0000-4000-8000-000000000012'::UUID;
  v_envelopes JSONB;
BEGIN
  SELECT payload INTO STRICT v_envelopes
  FROM lifecycle_fixture_payload
  WHERE key = 'freeze_envelopes';
  PERFORM public.freeze_tli_cycle(v_cycle_id, v_envelopes);
  INSERT INTO lifecycle_transition_log VALUES (
    2, 'freeze', 'draft', 'frozen',
    jsonb_build_object(
      'rpc', 'freeze_tli_cycle',
      'persistedStatus', (SELECT status FROM public.tli_experiment_cycles WHERE id = v_cycle_id),
      'attestedArtifacts', (SELECT count(*) FROM public.tli_evidence_attestations)
    ), 'pass'
  );
END;
$lifecycle_freeze$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(3, 'start');

DO $lifecycle_start$
DECLARE
  v_cycle_id CONSTANT UUID := '12000012-0000-4000-8000-000000000012'::UUID;
  v_candidate_sha CONSTANT TEXT := repeat('a', 64);
BEGIN
  PERFORM public.start_tli_cycle(
    v_cycle_id,
    'logistic',
    jsonb_build_object('intercept', 0, 'weights', jsonb_build_array()),
    '2025-01-01'::DATE,
    '2026-01-01'::DATE,
    jsonb_build_object('brier', 0.20),
    jsonb_build_object('model_artifact_sha256', v_candidate_sha)
  );
  INSERT INTO lifecycle_transition_log VALUES (
    3, 'start', 'frozen', 'running',
    jsonb_build_object(
      'rpc', 'start_tli_cycle',
      'persistedStatus', (SELECT status FROM public.tli_experiment_cycles WHERE id = v_cycle_id),
      'challengerStatus', (SELECT status FROM public.model_registry WHERE experiment_cycle_id = v_cycle_id)
    ), 'pass'
  );
END;
$lifecycle_start$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(4, 'confirmatory_enroll');

DO $confirmatory_enrollment$
DECLARE
  v_fixture lifecycle_origin_fixture%ROWTYPE;
BEGIN
  FOR v_fixture IN SELECT * FROM lifecycle_origin_fixture WHERE ordinal <= 16 ORDER BY ordinal
  LOOP
    UPDATE lifecycle_origin_fixture
    SET enrolled_id = public.enroll_tli_origin(
      '12000012-0000-4000-8000-000000000012'::UUID,
      v_fixture.study_origin_id,
      v_fixture.forecast_id
    )
    WHERE ordinal = v_fixture.ordinal;
  END LOOP;
END;
$confirmatory_enrollment$;

INSERT INTO lifecycle_transition_log
SELECT 4, 'confirmatory_enroll', 'running', 'running', jsonb_build_object(
  'rpc', 'enroll_tli_origin',
  'originCount', count(*),
  'sequenceStart', min(sequence_no),
  'sequenceEnd', max(sequence_no),
  'roles', jsonb_agg(DISTINCT enrollment_role)
), 'pass'
FROM public.tli_experiment_origin_manifests
WHERE cycle_id = '12000012-0000-4000-8000-000000000012'::UUID;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(5, 'origin_attest');

DO $confirmatory_attestation$
DECLARE
  v_fixture lifecycle_origin_fixture%ROWTYPE;
BEGIN
  FOR v_fixture IN SELECT * FROM lifecycle_origin_fixture WHERE ordinal <= 16 ORDER BY ordinal
  LOOP
    PERFORM public.attest_tli_origin(
      '12000012-0000-4000-8000-000000000012'::UUID,
      v_fixture.enrolled_id,
      pg_temp.origin_evidence_envelope(
        '12000012-0000-4000-8000-000000000012'::UUID,
        v_fixture.enrolled_id
      )
    );
  END LOOP;
END;
$confirmatory_attestation$;

INSERT INTO lifecycle_transition_log
SELECT 5, 'origin_attest', 'running', 'running', jsonb_build_object(
  'rpc', 'attest_tli_origin',
  'attestedOriginCount', count(*)
), 'pass'
FROM public.tli_evidence_artifacts
WHERE cycle_id = '12000012-0000-4000-8000-000000000012'::UUID
  AND artifact_type = 'origin_manifest';

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(6, 'prediction_insert');

DO $confirmatory_predictions$
DECLARE
  v_ordinal INTEGER;
BEGIN
  FOR v_ordinal IN 1..16 LOOP
    PERFORM pg_temp.insert_origin_scoring_rows(v_ordinal);
  END LOOP;
END;
$confirmatory_predictions$;

INSERT INTO lifecycle_transition_log
SELECT 6, 'prediction_insert', 'running', 'running', jsonb_build_object(
  'candidateCount', count(*) FILTER (WHERE scientific_prediction_role = 'candidate'),
  'comparatorCount', count(*) FILTER (WHERE scientific_prediction_role = 'comparator'),
  'pendingCount', count(*) FILTER (WHERE score_status = 'pending')
), 'pass'
FROM public.theme_predictions_v3
WHERE experiment_cycle_id = '12000012-0000-4000-8000-000000000012'::UUID;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(7, 'scoring_rpc');

DO $confirmatory_scoring$
DECLARE
  v_fixture lifecycle_origin_fixture%ROWTYPE;
BEGIN
  FOR v_fixture IN SELECT * FROM lifecycle_origin_fixture WHERE ordinal <= 16 ORDER BY ordinal
  LOOP
    PERFORM pg_temp.score_prediction(v_fixture.candidate_prediction_id, v_fixture.label_id);
    PERFORM pg_temp.score_prediction(v_fixture.comparator_prediction_id, v_fixture.label_id);
  END LOOP;
END;
$confirmatory_scoring$;

INSERT INTO lifecycle_transition_log
SELECT 7, 'scoring_rpc', 'running', 'running', jsonb_build_object(
  'rpc', 'finalize_tli_scientific_prediction_score',
  'excludedFinalizations', count(*) FILTER (WHERE score_status = 'excluded'),
  'eligibleOrigins', count(DISTINCT experiment_origin_manifest_id)
), 'pass'
FROM public.theme_predictions_v3
WHERE experiment_cycle_id = '12000012-0000-4000-8000-000000000012'::UUID;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(8, 'direct_prediction_update_probe');

DO $direct_update_probe$
DECLARE
  v_prediction_id UUID := pg_temp.fixture_uuid(4, 1);
  v_sqlstate TEXT;
  v_message TEXT;
  v_unchanged BOOLEAN;
BEGIN
  BEGIN
    UPDATE public.theme_predictions_v3 SET p_rise = 0.40 WHERE id = v_prediction_id;
    RAISE EXCEPTION 'direct prediction update unexpectedly succeeded' USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
  END;
  SELECT p_rise = 0.60 INTO STRICT v_unchanged
  FROM public.theme_predictions_v3 WHERE id = v_prediction_id;
  IF v_sqlstate IS DISTINCT FROM '42501' OR v_unchanged IS NOT TRUE THEN
    RAISE EXCEPTION 'direct prediction update rejection probe was not exact';
  END IF;
  INSERT INTO lifecycle_rejection_log VALUES (
    'direct_prediction_update', '42501', v_sqlstate, v_message, v_unchanged, 'pass'
  );
END;
$direct_update_probe$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(9, 'safety');

DO $safety$
DECLARE
  v_cycle_id CONSTANT UUID := '12000012-0000-4000-8000-000000000012'::UUID;
  v_safety_payload JSONB;
BEGIN
  v_safety_payload := jsonb_build_object(
    'cycle_id', v_cycle_id::TEXT,
    'sequence_start', 1,
    'sequence_end', 8,
    'decision', 'pass',
    'probabilities_valid', true,
    'pooled_brier', 0.20,
    'fixed_bin_ece', 0.10,
    'critical_incident_count', 0
  );
  PERFORM public.record_tli_safety_decision(
    v_cycle_id,
    true,
    pg_temp.evidence_envelope(v_cycle_id, 'safety_report', 'singleton', v_safety_payload)
  );
  INSERT INTO lifecycle_transition_log VALUES (
    8, 'safety', 'running', 'running',
    jsonb_build_object(
      'rpc', 'record_tli_safety_decision',
      'eligibleSequenceEnd', 8,
      'persistedStatus', (SELECT status FROM public.tli_experiment_cycles WHERE id = v_cycle_id),
      'safetyChecked', (SELECT safety_checked_at IS NOT NULL FROM public.tli_experiment_cycles WHERE id = v_cycle_id)
    ), 'pass'
  );
END;
$safety$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(10, 'final');

DO $final$
DECLARE
  v_cycle_id CONSTANT UUID := '12000012-0000-4000-8000-000000000012'::UUID;
  v_final_payload JSONB;
BEGIN
  v_final_payload := jsonb_build_object(
    'cycle_id', v_cycle_id::TEXT,
    'planned_origins', 16,
    'decision_origin_date', (SELECT to_char(origin_date, 'YYYY-MM-DD') FROM lifecycle_origin_fixture WHERE ordinal = 16),
    'decision', 'pass'
  );
  PERFORM public.record_tli_final_decision(
    v_cycle_id,
    true,
    pg_temp.evidence_envelope(v_cycle_id, 'final_decision', 'singleton', v_final_payload)
  );
  INSERT INTO lifecycle_transition_log VALUES (
    9, 'final', 'running', 'ready_for_decision',
    jsonb_build_object(
      'rpc', 'record_tli_final_decision',
      'eligibleSequenceEnd', 16,
      'persistedStatus', (SELECT status FROM public.tli_experiment_cycles WHERE id = v_cycle_id),
      'decisionOriginDate', (SELECT decision_origin_date FROM public.tli_experiment_cycles WHERE id = v_cycle_id)
    ), 'pass'
  );
END;
$final$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(11, 'terminal_enrollment_probe');

DO $terminal_enrollment_probe$
DECLARE
  v_fixture lifecycle_origin_fixture%ROWTYPE;
  v_sqlstate TEXT;
  v_message TEXT;
  v_before_count INTEGER;
  v_after_count INTEGER;
BEGIN
  SELECT * INTO STRICT v_fixture FROM lifecycle_origin_fixture WHERE ordinal = 17;
  SELECT count(*) INTO v_before_count
  FROM public.tli_experiment_origin_manifests
  WHERE cycle_id = '12000012-0000-4000-8000-000000000012'::UUID;
  BEGIN
    PERFORM public.enroll_tli_origin(
      '12000012-0000-4000-8000-000000000012'::UUID,
      v_fixture.study_origin_id,
      v_fixture.forecast_id
    );
    RAISE EXCEPTION 'terminal enrollment unexpectedly succeeded' USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
  END;
  SELECT count(*) INTO v_after_count
  FROM public.tli_experiment_origin_manifests
  WHERE cycle_id = '12000012-0000-4000-8000-000000000012'::UUID;
  IF v_sqlstate IS DISTINCT FROM '55000' OR v_before_count IS DISTINCT FROM v_after_count THEN
    RAISE EXCEPTION 'terminal enrollment rejection probe was not exact';
  END IF;
  INSERT INTO lifecycle_rejection_log VALUES (
    'terminal_enrollment', '55000', v_sqlstate, v_message,
    v_before_count = v_after_count, 'pass'
  );
END;
$terminal_enrollment_probe$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(12, 'internal');

SELECT public.promote_tli_internal('12000012-0000-4000-8000-000000000012'::UUID);

INSERT INTO lifecycle_transition_log
SELECT 10, 'internal', 'ready_for_decision', 'promoted_internal', jsonb_build_object(
  'rpc', 'promote_tli_internal',
  'persistedStatus', cycle.status,
  'challengerClaim', registry.scientific_claim_status,
  'challengerRelease', registry.scientific_release_status
), 'pass'
FROM public.tli_experiment_cycles AS cycle
JOIN public.model_registry AS registry ON registry.experiment_cycle_id = cycle.id
WHERE cycle.id = '12000012-0000-4000-8000-000000000012'::UUID;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(13, 'canary_enroll_first_three');

DO $first_three_canary_enrollment$
DECLARE
  v_fixture lifecycle_origin_fixture%ROWTYPE;
BEGIN
  FOR v_fixture IN SELECT * FROM lifecycle_origin_fixture WHERE ordinal BETWEEN 17 AND 19 ORDER BY ordinal
  LOOP
    UPDATE lifecycle_origin_fixture
    SET enrolled_id = public.enroll_tli_origin(
      '12000012-0000-4000-8000-000000000012'::UUID,
      v_fixture.study_origin_id,
      v_fixture.forecast_id
    )
    WHERE ordinal = v_fixture.ordinal;
  END LOOP;
END;
$first_three_canary_enrollment$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(14, 'canary_attest_first_three');

DO $first_three_canary_attestation$
DECLARE
  v_fixture lifecycle_origin_fixture%ROWTYPE;
BEGIN
  FOR v_fixture IN SELECT * FROM lifecycle_origin_fixture WHERE ordinal BETWEEN 17 AND 19 ORDER BY ordinal
  LOOP
    PERFORM public.attest_tli_origin(
      '12000012-0000-4000-8000-000000000012'::UUID,
      v_fixture.enrolled_id,
      pg_temp.origin_evidence_envelope(
        '12000012-0000-4000-8000-000000000012'::UUID,
        v_fixture.enrolled_id
      )
    );
  END LOOP;
END;
$first_three_canary_attestation$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(15, 'canary_prediction_insert_first_three');

DO $first_three_canary_predictions$
DECLARE
  v_ordinal INTEGER;
BEGIN
  FOR v_ordinal IN 17..19 LOOP
    PERFORM pg_temp.insert_origin_scoring_rows(v_ordinal);
  END LOOP;
END;
$first_three_canary_predictions$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(16, 'canary_scoring_rpc_first_three');

DO $first_three_canary_scoring$
DECLARE
  v_fixture lifecycle_origin_fixture%ROWTYPE;
BEGIN
  FOR v_fixture IN SELECT * FROM lifecycle_origin_fixture WHERE ordinal BETWEEN 17 AND 19 ORDER BY ordinal
  LOOP
    PERFORM pg_temp.score_prediction(v_fixture.candidate_prediction_id, v_fixture.label_id);
    PERFORM pg_temp.score_prediction(v_fixture.comparator_prediction_id, v_fixture.label_id);
  END LOOP;
END;
$first_three_canary_scoring$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(17, 'three_canary_release_probe');

DO $three_canary_release_probe$
DECLARE
  v_cycle_id CONSTANT UUID := '12000012-0000-4000-8000-000000000012'::UUID;
  v_sqlstate TEXT;
  v_message TEXT;
  v_artifacts_before INTEGER;
  v_artifacts_after INTEGER;
  v_state_unchanged BOOLEAN;
BEGIN
  SELECT count(*) INTO v_artifacts_before
  FROM public.tli_evidence_artifacts
  WHERE cycle_id = v_cycle_id AND artifact_type = 'public_canary';
  BEGIN
    PERFORM public.release_tli_public(
      v_cycle_id,
      pg_temp.canary_evidence_array(v_cycle_id, true)
    );
    RAISE EXCEPTION 'three-canary public release unexpectedly succeeded' USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
  END;
  SELECT count(*) INTO v_artifacts_after
  FROM public.tli_evidence_artifacts
  WHERE cycle_id = v_cycle_id AND artifact_type = 'public_canary';
  SELECT status = 'promoted_internal'
    AND (SELECT count(*) FROM public.tli_experiment_origin_manifests
         WHERE cycle_id = v_cycle_id AND enrollment_role = 'public_canary') = 3
    AND v_artifacts_before = v_artifacts_after
  INTO STRICT v_state_unchanged
  FROM public.tli_experiment_cycles
  WHERE id = v_cycle_id;
  IF v_sqlstate IS DISTINCT FROM '55000' OR v_state_unchanged IS NOT TRUE THEN
    RAISE EXCEPTION 'three-canary release rejection probe was not exact';
  END IF;
  INSERT INTO lifecycle_rejection_log VALUES (
    'three_canary_release', '55000', v_sqlstate, v_message, v_state_unchanged, 'pass'
  );
END;
$three_canary_release_probe$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(18, 'canary_enroll_fourth');

DO $fourth_canary_enrollment$
DECLARE
  v_fixture lifecycle_origin_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_fixture FROM lifecycle_origin_fixture WHERE ordinal = 20;
  UPDATE lifecycle_origin_fixture
  SET enrolled_id = public.enroll_tli_origin(
    '12000012-0000-4000-8000-000000000012'::UUID,
    v_fixture.study_origin_id,
    v_fixture.forecast_id
  )
  WHERE ordinal = 20;
END;
$fourth_canary_enrollment$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(19, 'canary_attest_fourth');

DO $fourth_canary_attestation$
DECLARE
  v_fixture lifecycle_origin_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_fixture FROM lifecycle_origin_fixture WHERE ordinal = 20;
  PERFORM public.attest_tli_origin(
    '12000012-0000-4000-8000-000000000012'::UUID,
    v_fixture.enrolled_id,
    pg_temp.origin_evidence_envelope(
      '12000012-0000-4000-8000-000000000012'::UUID,
      v_fixture.enrolled_id
    )
  );
END;
$fourth_canary_attestation$;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(20, 'canary_prediction_insert_fourth');

SELECT pg_temp.insert_origin_scoring_rows(20);

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(21, 'canary_scoring_rpc_fourth');

DO $fourth_canary_scoring$
DECLARE
  v_fixture lifecycle_origin_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_fixture FROM lifecycle_origin_fixture WHERE ordinal = 20;
  PERFORM pg_temp.score_prediction(v_fixture.candidate_prediction_id, v_fixture.label_id);
  PERFORM pg_temp.score_prediction(v_fixture.comparator_prediction_id, v_fixture.label_id);
END;
$fourth_canary_scoring$;

INSERT INTO lifecycle_transition_log
SELECT 11, 'canary_enroll', 'promoted_internal', 'promoted_internal', jsonb_build_object(
  'rpc', 'enroll_tli_origin',
  'canaryCount', count(*),
  'sequenceStart', min(sequence_no),
  'sequenceEnd', max(sequence_no),
  'canaryNumbers', jsonb_agg(public_canary_no ORDER BY public_canary_no)
), 'pass'
FROM public.tli_experiment_origin_manifests
WHERE cycle_id = '12000012-0000-4000-8000-000000000012'::UUID
  AND enrollment_role = 'public_canary';

INSERT INTO lifecycle_transition_log
SELECT 12, 'canary_attest', 'promoted_internal', 'promoted_internal', jsonb_build_object(
  'rpc', 'attest_tli_origin',
  'attestedCanaryCount', count(*)
), 'pass'
FROM public.tli_evidence_artifacts AS artifact
JOIN public.tli_experiment_origin_manifests AS origin
  ON origin.id = artifact.experiment_origin_manifest_id
WHERE artifact.cycle_id = '12000012-0000-4000-8000-000000000012'::UUID
  AND artifact.artifact_type = 'origin_manifest'
  AND origin.enrollment_role = 'public_canary';

INSERT INTO lifecycle_transition_log
SELECT 13, 'canary_prediction_insert', 'promoted_internal', 'promoted_internal', jsonb_build_object(
  'candidateCount', count(*) FILTER (WHERE prediction.scientific_prediction_role = 'candidate'),
  'comparatorCount', count(*) FILTER (WHERE prediction.scientific_prediction_role = 'comparator')
), 'pass'
FROM public.theme_predictions_v3 AS prediction
JOIN public.tli_experiment_origin_manifests AS origin
  ON origin.id = prediction.experiment_origin_manifest_id
WHERE prediction.experiment_cycle_id = '12000012-0000-4000-8000-000000000012'::UUID
  AND origin.enrollment_role = 'public_canary';

INSERT INTO lifecycle_transition_log
SELECT 14, 'canary_scoring_rpc', 'promoted_internal', 'promoted_internal', jsonb_build_object(
  'rpc', 'finalize_tli_scientific_prediction_score',
  'terminalPredictionCount', count(*) FILTER (WHERE prediction.score_status IN ('scored','excluded')),
  'eligibleCanaryCount', count(DISTINCT prediction.experiment_origin_manifest_id)
), 'pass'
FROM public.theme_predictions_v3 AS prediction
JOIN public.tli_experiment_origin_manifests AS origin
  ON origin.id = prediction.experiment_origin_manifest_id
WHERE prediction.experiment_cycle_id = '12000012-0000-4000-8000-000000000012'::UUID
  AND origin.enrollment_role = 'public_canary';

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(22, 'public_swap');

SELECT public.release_tli_public(
  '12000012-0000-4000-8000-000000000012'::UUID,
  pg_temp.canary_evidence_array('12000012-0000-4000-8000-000000000012'::UUID, false)
);

INSERT INTO lifecycle_transition_log
SELECT 15, 'public_swap', 'promoted_internal', 'public_approved', jsonb_build_object(
  'rpc', 'release_tli_public',
  'persistedStatus', cycle.status,
  'oldChampionStatus', old_registry.status,
  'candidateStatus', candidate_registry.status,
  'candidateRelease', candidate_registry.scientific_release_status
), 'pass'
FROM public.tli_experiment_cycles AS cycle
JOIN public.model_registry AS candidate_registry ON candidate_registry.experiment_cycle_id = cycle.id
JOIN public.model_registry AS old_registry ON old_registry.model_version = 'todo12-live-legacy-champion-v1'
WHERE cycle.id = '12000012-0000-4000-8000-000000000012'::UUID;

COMMIT;
BEGIN;
SELECT pg_temp.assert_rpc_guards_reset(23, 'final_invariants');

DO $final_invariants$
DECLARE
  v_transition_count INTEGER;
  v_rejection_count INTEGER;
  v_confirmatory INTEGER;
  v_canaries INTEGER;
  v_attestations INTEGER;
  v_predictions INTEGER;
  v_finalizations INTEGER;
  v_guard_reset_checks INTEGER;
BEGIN
  SELECT count(*) INTO v_transition_count FROM lifecycle_transition_log;
  SELECT count(*) INTO v_rejection_count FROM lifecycle_rejection_log;
  SELECT count(*) FILTER (WHERE enrollment_role = 'confirmatory'),
         count(*) FILTER (WHERE enrollment_role = 'public_canary')
  INTO v_confirmatory, v_canaries
  FROM public.tli_experiment_origin_manifests
  WHERE cycle_id = '12000012-0000-4000-8000-000000000012'::UUID;
  SELECT count(*) INTO v_attestations
  FROM public.tli_evidence_artifacts
  WHERE cycle_id = '12000012-0000-4000-8000-000000000012'::UUID
    AND artifact_type = 'origin_manifest';
  SELECT count(*), count(*) FILTER (WHERE score_status IN ('scored','excluded'))
  INTO v_predictions, v_finalizations
  FROM public.theme_predictions_v3
  WHERE experiment_cycle_id = '12000012-0000-4000-8000-000000000012'::UUID;
  SELECT count(*) INTO v_guard_reset_checks FROM lifecycle_transaction_log;

  IF v_transition_count <> 15
     OR v_rejection_count <> 3
     OR v_guard_reset_checks <> 23
     OR v_confirmatory <> 16
     OR v_canaries <> 4
     OR v_attestations <> 20
     OR v_predictions <> 40
     OR v_finalizations <> 40
     OR NOT EXISTS (
       SELECT 1 FROM public.tli_experiment_cycles
       WHERE id = '12000012-0000-4000-8000-000000000012'::UUID
         AND status = 'public_approved'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.model_registry
       WHERE experiment_cycle_id = '12000012-0000-4000-8000-000000000012'::UUID
         AND status = 'champion'
         AND scientific_release_status = 'public'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.model_registry
       WHERE model_version = 'todo12-live-legacy-champion-v1'
         AND status = 'archived'
     )
  THEN
    RAISE EXCEPTION 'Todo 12 live lifecycle final invariants failed';
  END IF;
END;
$final_invariants$;

COMMIT;

SELECT jsonb_build_object(
  'receiptVersion', 'todo12-lifecycle-rehearsal-v1',
  'status', 'pass',
  'cycleId', '12000012-0000-4000-8000-000000000012',
  'transactionIsolation', jsonb_build_object(
    'mode', 'committed_stage_groups',
    'guardGucResetChecks', (SELECT count(*) FROM lifecycle_transaction_log),
    'allGuardsReset', (SELECT bool_and(guards_reset) FROM lifecycle_transaction_log)
  ),
  'transitions', (
    SELECT jsonb_agg(jsonb_build_object(
      'order', step_order,
      'transition', transition,
      'beforeStatus', before_status,
      'afterStatus', after_status,
      'observed', observed,
      'verdict', verdict
    ) ORDER BY step_order)
    FROM lifecycle_transition_log
  ),
  'rejections', (
    SELECT jsonb_agg(jsonb_build_object(
      'probe', probe,
      'expectedSqlstate', expected_sqlstate,
      'observedSqlstate', observed_sqlstate,
      'message', message,
      'stateUnchanged', state_unchanged,
      'verdict', verdict
    ) ORDER BY CASE probe
      WHEN 'terminal_enrollment' THEN 1
      WHEN 'three_canary_release' THEN 2
      ELSE 3
    END)
    FROM lifecycle_rejection_log
  ),
  'counts', jsonb_build_object(
    'confirmatoryOrigins', 16,
    'safetyOrigins', 8,
    'finalOrigins', 16,
    'publicCanaries', 4,
    'originAttestations', 20,
    'scientificPredictions', 40,
    'scoringFinalizations', 40
  ),
  'publicSwap', jsonb_build_object(
    'oldChampionStatus', 'archived',
    'candidateStatus', 'champion',
    'candidateRelease', 'public'
  )
)::TEXT;
