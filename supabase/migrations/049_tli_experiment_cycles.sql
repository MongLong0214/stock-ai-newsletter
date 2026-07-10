BEGIN;

CREATE TABLE public.tli_experiment_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','frozen','running','safety_hold','ready_for_decision','rejected','promoted_internal','public_approved')),
  study_contract_id UUID REFERENCES public.tli_attention_study_contracts(id) ON DELETE RESTRICT,
  study_contract_sha256 TEXT,
  candidate_model_version TEXT,
  candidate_model_sha256 TEXT,
  comparator_version TEXT,
  comparator_artifact_sha256 TEXT,
  dataset_manifest_sha256 TEXT,
  feature_contract_version TEXT,
  feature_contract_sha256 TEXT,
  labeler_version TEXT,
  label_contract_sha256 TEXT,
  calibration_version TEXT,
  calibration_artifact_sha256 TEXT,
  babl_contract_sha256 TEXT,
  primary_endpoint TEXT CHECK (primary_endpoint = 'paired_brier_delta'),
  alpha NUMERIC CHECK (alpha = 0.01),
  thresholds JSONB,
  power_simulation_sha256 TEXT,
  power_simulation_result JSONB,
  planned_origins INTEGER CHECK (planned_origins BETWEEN 16 AND 52),
  safety_origins INTEGER CHECK (safety_origins = 8),
  calendar_start DATE,
  initial_calendar_end DATE,
  frozen_at TIMESTAMPTZ,
  running_at TIMESTAMPTZ,
  safety_checked_at TIMESTAMPTZ,
  decision_at TIMESTAMPTZ,
  decision_origin_date DATE,
  promoted_internal_at TIMESTAMPTZ,
  public_approved_at TIMESTAMPTZ,
  preregistration_sha256 TEXT,
  preregistration_payload JSONB,
  CHECK (calendar_start IS NULL OR initial_calendar_end IS NULL OR initial_calendar_end >= calendar_start)
);

CREATE UNIQUE INDEX uniq_tli_active_cycle ON public.tli_experiment_cycles ((true)) WHERE status IN ('frozen','running','ready_for_decision','promoted_internal');

CREATE TABLE public.tli_evidence_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.tli_experiment_cycles(id) ON DELETE RESTRICT,
  experiment_origin_manifest_id UUID,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('preregistration','dataset_manifest','model_manifest','cycle_manifest','origin_manifest','calendar_extension','safety_report','final_decision','public_canary','monitoring_hold','monitoring_resume')),
  artifact_key TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, artifact_type, artifact_key),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (
    ((artifact_type IN ('origin_manifest','public_canary')) AND experiment_origin_manifest_id IS NOT NULL)
    OR
    ((artifact_type NOT IN ('origin_manifest','public_canary')) AND experiment_origin_manifest_id IS NULL)
  ),
  CHECK (
    (artifact_type IN ('preregistration','dataset_manifest','model_manifest','cycle_manifest','safety_report','final_decision') AND artifact_key = 'singleton')
    OR
    (artifact_type IN ('origin_manifest','public_canary','calendar_extension') AND artifact_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    OR
    (artifact_type IN ('monitoring_hold','monitoring_resume') AND artifact_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  )
);

CREATE TABLE public.tli_evidence_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL UNIQUE REFERENCES public.tli_evidence_artifacts(id) ON DELETE RESTRICT,
  git_commit_sha TEXT NOT NULL,
  git_blob_sha TEXT NOT NULL,
  repo_relative_path TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  verifier_version TEXT NOT NULL,
  verifier_code_sha TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  CHECK (git_commit_sha ~ '^[0-9a-f]{40}$' OR git_commit_sha ~ '^[0-9a-f]{64}$'),
  CHECK (git_blob_sha ~ '^[0-9a-f]{40}$' OR git_blob_sha ~ '^[0-9a-f]{64}$'),
  CHECK (verifier_code_sha ~ '^[0-9a-f]{64}$')
);

CREATE TABLE public.tli_cycle_calendar_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.tli_experiment_cycles(id) ON DELETE RESTRICT,
  previous_end DATE NOT NULL,
  new_end DATE NOT NULL,
  reason_code TEXT NOT NULL CHECK (reason_code IN ('source_maturity_delay','market_calendar_delay','operational_outage')),
  evidence_artifact_id UUID NOT NULL UNIQUE REFERENCES public.tli_evidence_artifacts(id) ON DELETE RESTRICT,
  evidence_sha256 TEXT NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, new_end),
  CHECK (new_end > previous_end)
);

CREATE TABLE public.tli_experiment_origin_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.tli_experiment_cycles(id) ON DELETE RESTRICT,
  study_origin_manifest_id UUID NOT NULL REFERENCES public.tli_study_origin_manifests(id) ON DELETE RESTRICT,
  forecast_origin_manifest_id UUID NOT NULL REFERENCES public.tli_forecast_origin_manifests(id) ON DELETE RESTRICT,
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  enrollment_role TEXT NOT NULL CHECK (enrollment_role IN ('confirmatory','predecision_diagnostic','public_canary','prepublic_diagnostic','monitoring')),
  public_canary_no SMALLINT CHECK (public_canary_no BETWEEN 1 AND 4),
  candidate_model_sha256 TEXT NOT NULL CHECK (candidate_model_sha256 ~ '^[0-9a-f]{64}$'),
  comparator_artifact_sha256 TEXT NOT NULL CHECK (comparator_artifact_sha256 ~ '^[0-9a-f]{64}$'),
  kospi_base_trade_date DATE NOT NULL,
  kospi_base_close NUMERIC NOT NULL CHECK (
    kospi_base_close > 0 AND kospi_base_close::text NOT IN ('NaN','Infinity','-Infinity')
  ),
  kospi_lookback_trade_date DATE NOT NULL,
  kospi_lookback_close NUMERIC NOT NULL CHECK (
    kospi_lookback_close > 0 AND kospi_lookback_close::text NOT IN ('NaN','Infinity','-Infinity')
  ),
  kospi_source_ids JSONB NOT NULL,
  kospi_input_sha256 TEXT NOT NULL CHECK (kospi_input_sha256 ~ '^[0-9a-f]{64}$'),
  regime TEXT NOT NULL CHECK (regime IN ('risk_off','neutral','risk_on')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, study_origin_manifest_id),
  UNIQUE (cycle_id, forecast_origin_manifest_id),
  UNIQUE (cycle_id, sequence_no),
  CHECK (jsonb_typeof(kospi_source_ids) = 'array' AND jsonb_array_length(kospi_source_ids) = 2),
  CHECK (
    (enrollment_role = 'public_canary' AND public_canary_no IS NOT NULL AND public_canary_no BETWEEN 1 AND 4)
    OR
    (enrollment_role <> 'public_canary' AND public_canary_no IS NULL)
  )
);

CREATE UNIQUE INDEX uniq_tli_experiment_origin_canary ON public.tli_experiment_origin_manifests (cycle_id, public_canary_no) WHERE public_canary_no IS NOT NULL;

ALTER TABLE public.tli_evidence_artifacts
  ADD CONSTRAINT tli_evidence_artifacts_origin_fkey
  FOREIGN KEY (experiment_origin_manifest_id)
  REFERENCES public.tli_experiment_origin_manifests(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX uniq_tli_evidence_origin_artifact
  ON public.tli_evidence_artifacts (cycle_id, artifact_type, experiment_origin_manifest_id)
  WHERE experiment_origin_manifest_id IS NOT NULL
    AND artifact_type IN ('origin_manifest','public_canary');

ALTER TABLE public.model_registry
  ADD CONSTRAINT model_registry_experiment_cycle_id_fkey
    FOREIGN KEY (experiment_cycle_id) REFERENCES public.tli_experiment_cycles(id) ON DELETE RESTRICT,
  ADD CONSTRAINT model_registry_experiment_cycle_id_key UNIQUE (experiment_cycle_id);

CREATE TABLE public.tli_model_release_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_registry_id UUID REFERENCES public.model_registry(experiment_cycle_id) ON DELETE RESTRICT,
  cycle_id UUID NOT NULL REFERENCES public.tli_experiment_cycles(id) ON DELETE RESTRICT,
  from_status TEXT NOT NULL CHECK (from_status IN ('challenger','champion','archived','rolled_back')),
  to_status TEXT NOT NULL CHECK (to_status IN ('challenger','champion','archived','rolled_back')),
  reason_code TEXT NOT NULL,
  evidence_sha256 TEXT NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  v_constraint_name NAME;
BEGIN
  SELECT constraint_row.conname
  INTO v_constraint_name
  FROM pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.theme_predictions_v3'::REGCLASS
    AND constraint_row.contype = 'u'
    AND pg_get_constraintdef(constraint_row.oid)
      = 'UNIQUE (theme_id, prediction_date, horizon_days, model_version)';

  IF v_constraint_name IS NULL THEN
    RAISE EXCEPTION 'legacy theme_predictions_v3 table-level identity constraint is missing'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE format(
    'ALTER TABLE public.theme_predictions_v3 DROP CONSTRAINT %I',
    v_constraint_name
  );
END;
$$;

ALTER TABLE public.theme_predictions_v3
  ADD COLUMN experiment_cycle_id UUID REFERENCES public.tli_experiment_cycles(id) ON DELETE RESTRICT,
  ADD COLUMN experiment_origin_manifest_id UUID REFERENCES public.tli_experiment_origin_manifests(id) ON DELETE RESTRICT,
  ADD COLUMN scientific_prediction_role TEXT CHECK (scientific_prediction_role IN ('candidate','comparator')),
  ADD COLUMN model_artifact_sha256 TEXT,
  ADD COLUMN feature_contract_hash TEXT,
  ADD COLUMN feature_snapshot_hash TEXT,
  ADD COLUMN forecast_cutoff TIMESTAMPTZ,
  ADD COLUMN forecast_origin_week DATE,
  ADD COLUMN actual_label_id UUID REFERENCES public.theme_labels(id) ON DELETE RESTRICT,
  ADD COLUMN score_payload_sha256 TEXT,
  ADD COLUMN score_exclusion_reason TEXT;

ALTER TABLE public.theme_predictions_v3
  ADD CONSTRAINT theme_predictions_v3_scientific_identity_check CHECK (
    (experiment_cycle_id IS NULL AND experiment_origin_manifest_id IS NULL AND scientific_prediction_role IS NULL)
    OR
    (experiment_cycle_id IS NOT NULL AND experiment_origin_manifest_id IS NOT NULL AND scientific_prediction_role IS NOT NULL)
  ),
  ADD CONSTRAINT theme_predictions_v3_scientific_sha_check CHECK (
    experiment_cycle_id IS NULL
    OR (
      model_artifact_sha256 IS NOT NULL
      AND model_artifact_sha256 ~ '^[0-9a-f]{64}$'
      AND feature_contract_hash IS NOT NULL
      AND feature_contract_hash ~ '^[0-9a-f]{64}$'
      AND feature_snapshot_hash IS NOT NULL
      AND feature_snapshot_hash ~ '^[0-9a-f]{64}$'
      AND forecast_cutoff IS NOT NULL
      AND forecast_origin_week IS NOT NULL
      AND (score_payload_sha256 IS NULL OR score_payload_sha256 ~ '^[0-9a-f]{64}$')
    )
  ),
  ADD CONSTRAINT theme_predictions_v3_scientific_lifecycle_check CHECK (
    experiment_cycle_id IS NULL
    OR (
      serving_role = 'shadow'
      AND (
        (
          score_status = 'pending'
          AND actual_g IS NULL
          AND actual_y IS NULL
          AND actual_label_id IS NULL
          AND score_payload_sha256 IS NULL
          AND score_exclusion_reason IS NULL
          AND scored_at IS NULL
        )
        OR (
          score_status IN ('scored','excluded')
          AND actual_label_id IS NOT NULL
          AND score_payload_sha256 IS NOT NULL
          AND scored_at IS NOT NULL
        )
      )
    )
  );

CREATE UNIQUE INDEX uniq_theme_predictions_v3_legacy_identity
  ON public.theme_predictions_v3 (theme_id, prediction_date, horizon_days, model_version)
  WHERE experiment_cycle_id IS NULL;

CREATE UNIQUE INDEX uniq_theme_predictions_v3_scientific_identity
  ON public.theme_predictions_v3 (
    experiment_cycle_id,
    experiment_origin_manifest_id,
    theme_id,
    prediction_date,
    horizon_days,
    scientific_prediction_role
  )
  WHERE experiment_cycle_id IS NOT NULL;

CREATE VIEW public.tli_public_scientific_predictions_v3
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  prediction.theme_id,
  prediction.prediction_date,
  prediction.p_rise,
  prediction.ci_lower,
  prediction.ci_upper,
  prediction.abstain,
  prediction.abstain_reasons,
  prediction.model_version
FROM public.theme_predictions_v3 AS prediction
JOIN public.model_registry AS registry
  ON registry.experiment_cycle_id = prediction.experiment_cycle_id
 AND registry.model_version = prediction.model_version
WHERE registry.status = 'champion'
  AND registry.scientific_claim_status = 'eligible'
  AND registry.scientific_release_status = 'public'
  AND prediction.scientific_prediction_role = 'candidate';

REVOKE ALL ON TABLE public.tli_public_scientific_predictions_v3
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tli_public_scientific_predictions_v3 TO service_role;

CREATE OR REPLACE FUNCTION public.tli_utf16_sort_key_v1(p_value TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
  v_result BYTEA := decode('', 'hex');
  v_codepoint INTEGER;
  v_unit INTEGER;
  v_index INTEGER;
BEGIN
  FOR v_index IN 1..char_length(p_value)
  LOOP
    v_codepoint := ascii(substr(p_value, v_index, 1));
    IF v_codepoint <= 65535 THEN
      v_result := v_result || decode(lpad(to_hex(v_codepoint), 4, '0'), 'hex');
    ELSE
      v_codepoint := v_codepoint - 65536;
      v_unit := 55296 + (v_codepoint / 1024);
      v_result := v_result || decode(lpad(to_hex(v_unit), 4, '0'), 'hex');
      v_unit := 56320 + (v_codepoint % 1024);
      v_result := v_result || decode(lpad(to_hex(v_unit), 4, '0'), 'hex');
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.tli_canonical_number_v1(p_value JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
SET extra_float_digits = 3
AS $$
DECLARE
  v_float DOUBLE PRECISION;
  v_short TEXT;
  v_sign TEXT := '';
  v_mantissa TEXT;
  v_exponent INTEGER := 0;
  v_integer TEXT;
  v_fraction TEXT;
  v_raw_digits TEXT;
  v_digits TEXT;
  v_leading_zeros INTEGER;
  v_decimal_position INTEGER;
  v_digit_count INTEGER;
  v_scientific_exponent INTEGER;
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'canonical-json-v1 numeric renderer requires a JSON number'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_float := (p_value #>> '{}')::DOUBLE PRECISION;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'canonical-json-v1 number is outside finite IEEE 754'
      USING ERRCODE = '22023';
  END;

  v_short := lower(v_float::text);
  IF v_short IN ('nan','infinity','-infinity') THEN
    RAISE EXCEPTION 'canonical-json-v1 number is outside finite IEEE 754'
      USING ERRCODE = '22023';
  END IF;

  IF left(v_short, 1) = '-' THEN
    v_sign := '-';
    v_short := substr(v_short, 2);
  END IF;

  IF position('e' IN v_short) > 0 THEN
    v_mantissa := split_part(v_short, 'e', 1);
    v_exponent := split_part(v_short, 'e', 2)::INTEGER;
  ELSE
    v_mantissa := v_short;
  END IF;

  IF position('.' IN v_mantissa) > 0 THEN
    v_integer := split_part(v_mantissa, '.', 1);
    v_fraction := split_part(v_mantissa, '.', 2);
  ELSE
    v_integer := v_mantissa;
    v_fraction := '';
  END IF;

  v_raw_digits := v_integer || v_fraction;
  v_leading_zeros := length(v_raw_digits) - length(ltrim(v_raw_digits, '0'));
  v_digits := substr(v_raw_digits, v_leading_zeros + 1);
  IF v_digits = '' THEN
    RETURN '0';
  END IF;

  v_decimal_position := length(v_integer) + v_exponent - v_leading_zeros;
  v_digits := rtrim(v_digits, '0');
  v_digit_count := length(v_digits);

  IF v_digit_count <= v_decimal_position AND v_decimal_position <= 21 THEN
    RETURN v_sign || v_digits || repeat('0', v_decimal_position - v_digit_count);
  ELSIF v_decimal_position > 0 AND v_decimal_position <= 21 THEN
    RETURN v_sign || substr(v_digits, 1, v_decimal_position) || '.' ||
      substr(v_digits, v_decimal_position + 1);
  ELSIF v_decimal_position > -6 AND v_decimal_position <= 0 THEN
    RETURN v_sign || '0.' || repeat('0', -v_decimal_position) || v_digits;
  END IF;

  v_scientific_exponent := v_decimal_position - 1;
  RETURN v_sign || left(v_digits, 1) ||
    CASE WHEN v_digit_count = 1 THEN '' ELSE '.' || substr(v_digits, 2) END ||
    'e' || CASE WHEN v_scientific_exponent >= 0 THEN '+' ELSE '' END ||
    v_scientific_exponent::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.tli_render_canonical_json_v1(p_value JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, pg_catalog
AS $$
BEGIN
  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      RETURN (
        SELECT '{' || COALESCE(string_agg(
          to_jsonb(item.key)::text || ':' || public.tli_render_canonical_json_v1(item.value),
          ',' ORDER BY public.tli_utf16_sort_key_v1(item.key)
        ), '') || '}'
        FROM jsonb_each(p_value) AS item(key, value)
      );
    WHEN 'array' THEN
      RETURN (
        SELECT '[' || COALESCE(string_agg(
          public.tli_render_canonical_json_v1(item.value), ',' ORDER BY item.ordinal
        ), '') || ']'
        FROM jsonb_array_elements(p_value) WITH ORDINALITY AS item(value, ordinal)
      );
    WHEN 'number' THEN
      RETURN public.tli_canonical_number_v1(p_value);
    WHEN 'string' THEN
      RETURN p_value::text;
    WHEN 'boolean' THEN
      RETURN p_value::text;
    WHEN 'null' THEN
      RETURN 'null';
    ELSE
      RAISE EXCEPTION 'canonical-json-v1 contains an unsupported JSON value'
        USING ERRCODE = '22023';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.tli_require_canonical_json_v1(
  p_canonical_json TEXT,
  p_expected_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  v_payload := public.tli_parse_canonical_json_v1(p_canonical_json, p_expected_sha256);
  IF public.tli_render_canonical_json_v1(v_payload) IS DISTINCT FROM p_canonical_json THEN
    RAISE EXCEPTION 'canonical-json-v1 input is not the unique RFC 8785 representation'
      USING ERRCODE = '22023';
  END IF;
  RETURN v_payload;
END;
$$;

ALTER TABLE public.tli_experiment_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_evidence_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_evidence_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_cycle_calendar_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_experiment_origin_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_model_release_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_tli_experiment_cycles
  ON public.tli_experiment_cycles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tli_evidence_artifacts
  ON public.tli_evidence_artifacts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tli_evidence_attestations
  ON public.tli_evidence_attestations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tli_cycle_calendar_extensions
  ON public.tli_cycle_calendar_extensions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tli_experiment_origin_manifests
  ON public.tli_experiment_origin_manifests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tli_model_release_events
  ON public.tli_model_release_events FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.tli_experiment_cycles, public.tli_cycle_calendar_extensions,
  public.tli_experiment_origin_manifests, public.tli_model_release_events
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tli_evidence_artifacts, public.tli_evidence_attestations FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.tli_experiment_cycles FROM service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.tli_evidence_artifacts,
  public.tli_evidence_attestations, public.tli_cycle_calendar_extensions,
  public.tli_experiment_origin_manifests, public.tli_model_release_events
  FROM service_role;
GRANT SELECT, INSERT ON TABLE public.tli_experiment_cycles TO service_role;
GRANT SELECT ON TABLE public.tli_evidence_artifacts, public.tli_evidence_attestations,
  public.tli_cycle_calendar_extensions, public.tli_experiment_origin_manifests,
  public.tli_model_release_events TO service_role;

CREATE TRIGGER guard_tli_evidence_artifacts_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_evidence_artifacts
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();
CREATE TRIGGER guard_tli_evidence_attestations_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_evidence_attestations
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();
CREATE TRIGGER guard_tli_cycle_calendar_extensions_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_cycle_calendar_extensions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();
CREATE TRIGGER guard_tli_experiment_origin_manifests_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_experiment_origin_manifests
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();
CREATE TRIGGER guard_tli_model_release_events_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_model_release_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();

CREATE OR REPLACE FUNCTION public.validate_tli_evidence_attestation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_artifact public.tli_evidence_artifacts%ROWTYPE;
  v_expected_path TEXT;
BEGIN
  SELECT * INTO v_artifact
  FROM public.tli_evidence_artifacts
  WHERE id = NEW.artifact_id;

  IF NOT FOUND OR NEW.content_sha256 IS DISTINCT FROM v_artifact.content_sha256 THEN
    RAISE EXCEPTION 'evidence attestation content SHA must match its immutable artifact'
      USING ERRCODE = '22023';
  END IF;

  v_expected_path :=
    'docs/evidence/tli-v3-scientific-rebuild/' || v_artifact.cycle_id::text || '/' ||
    replace(v_artifact.artifact_type, '_', '-') ||
    CASE
      WHEN v_artifact.artifact_key = 'singleton' THEN '.json'
      ELSE '-' || v_artifact.artifact_key || '.json'
    END;

  IF NEW.repo_relative_path IS DISTINCT FROM v_expected_path THEN
    RAISE EXCEPTION 'evidence path is not the canonical cycle evidence path'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_tli_evidence_attestation_insert
  BEFORE INSERT ON public.tli_evidence_attestations
  FOR EACH ROW EXECUTE FUNCTION public.validate_tli_evidence_attestation();

CREATE OR REPLACE FUNCTION public.guard_tli_experiment_cycle_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IS DISTINCT FROM pg_get_userbyid((
       SELECT function_row.proowner
       FROM pg_proc AS function_row
       WHERE function_row.oid = 'public.guard_tli_experiment_cycle_transition()'::REGPROCEDURE
     ))
     OR current_setting('tli.cycle_rpc', true) IS DISTINCT FROM OLD.id::text
  THEN
    RAISE EXCEPTION 'cycle updates require a Todo 12 RPC'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.study_contract_id IS DISTINCT FROM OLD.study_contract_id
     OR NEW.study_contract_sha256 IS DISTINCT FROM OLD.study_contract_sha256
     OR NEW.candidate_model_version IS DISTINCT FROM OLD.candidate_model_version
     OR NEW.candidate_model_sha256 IS DISTINCT FROM OLD.candidate_model_sha256
     OR NEW.comparator_version IS DISTINCT FROM OLD.comparator_version
     OR NEW.comparator_artifact_sha256 IS DISTINCT FROM OLD.comparator_artifact_sha256
     OR NEW.dataset_manifest_sha256 IS DISTINCT FROM OLD.dataset_manifest_sha256
     OR NEW.feature_contract_version IS DISTINCT FROM OLD.feature_contract_version
     OR NEW.feature_contract_sha256 IS DISTINCT FROM OLD.feature_contract_sha256
     OR NEW.labeler_version IS DISTINCT FROM OLD.labeler_version
     OR NEW.label_contract_sha256 IS DISTINCT FROM OLD.label_contract_sha256
     OR NEW.calibration_version IS DISTINCT FROM OLD.calibration_version
     OR NEW.calibration_artifact_sha256 IS DISTINCT FROM OLD.calibration_artifact_sha256
     OR NEW.babl_contract_sha256 IS DISTINCT FROM OLD.babl_contract_sha256
     OR NEW.primary_endpoint IS DISTINCT FROM OLD.primary_endpoint
     OR NEW.alpha IS DISTINCT FROM OLD.alpha
     OR NEW.thresholds IS DISTINCT FROM OLD.thresholds
     OR NEW.power_simulation_sha256 IS DISTINCT FROM OLD.power_simulation_sha256
     OR NEW.power_simulation_result IS DISTINCT FROM OLD.power_simulation_result
     OR NEW.planned_origins IS DISTINCT FROM OLD.planned_origins
     OR NEW.safety_origins IS DISTINCT FROM OLD.safety_origins
     OR NEW.calendar_start IS DISTINCT FROM OLD.calendar_start
     OR NEW.initial_calendar_end IS DISTINCT FROM OLD.initial_calendar_end
     OR NEW.preregistration_sha256 IS DISTINCT FROM OLD.preregistration_sha256
     OR NEW.preregistration_payload IS DISTINCT FROM OLD.preregistration_payload
  THEN
    RAISE EXCEPTION 'frozen experiment-cycle contract fields are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    (OLD.status = 'draft' AND NEW.status = 'frozen')
    OR (OLD.status = 'frozen' AND NEW.status = 'running')
    OR (OLD.status = 'running' AND NEW.status IN ('running','safety_hold','ready_for_decision','rejected'))
    OR (OLD.status = 'ready_for_decision' AND NEW.status = 'promoted_internal')
    OR (OLD.status = 'promoted_internal' AND NEW.status IN ('safety_hold','public_approved'))
  ) THEN
    RAISE EXCEPTION 'cycle state transition is not allowed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_tli_experiment_cycle_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'draft'
     OR NEW.frozen_at IS NOT NULL
     OR NEW.running_at IS NOT NULL
     OR NEW.safety_checked_at IS NOT NULL
     OR NEW.decision_at IS NOT NULL
     OR NEW.decision_origin_date IS NOT NULL
     OR NEW.promoted_internal_at IS NOT NULL
     OR NEW.public_approved_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'new experiment cycles must enter as draft without transition timestamps'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_tli_experiment_cycle_insert
  BEFORE INSERT ON public.tli_experiment_cycles
  FOR EACH ROW EXECUTE FUNCTION public.validate_tli_experiment_cycle_insert();

CREATE TRIGGER guard_tli_experiment_cycle_transition
  BEFORE UPDATE ON public.tli_experiment_cycles
  FOR EACH ROW EXECUTE FUNCTION public.guard_tli_experiment_cycle_transition();
CREATE TRIGGER guard_tli_experiment_cycles_removal
  BEFORE DELETE OR TRUNCATE ON public.tli_experiment_cycles
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();

DROP TRIGGER guard_model_registry_before_scientific_cycles ON public.model_registry;
DROP FUNCTION public.reject_model_registry_mutation_before_scientific_cycles();

CREATE OR REPLACE FUNCTION public.guard_model_registry_scientific_cycle_rpc()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IS DISTINCT FROM pg_get_userbyid((
       SELECT function_row.proowner
       FROM pg_proc AS function_row
       WHERE function_row.oid = 'public.guard_model_registry_scientific_cycle_rpc()'::REGPROCEDURE
     ))
     OR current_setting('tli.cycle_registry_rpc', true) IS NULL
     OR current_setting('tli.cycle_registry_rpc', true) = ''
  THEN
    RAISE EXCEPTION 'model_registry scientific lifecycle mutates only through cycle RPCs'
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER guard_model_registry_scientific_cycle_rpc
  BEFORE INSERT OR UPDATE OR DELETE ON public.model_registry
  FOR EACH ROW EXECUTE FUNCTION public.guard_model_registry_scientific_cycle_rpc();
CREATE TRIGGER guard_model_registry_scientific_cycle_truncate
  BEFORE TRUNCATE ON public.model_registry
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.model_registry FROM service_role;

CREATE OR REPLACE FUNCTION public.validate_tli_scientific_prediction_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_origin public.tli_experiment_origin_manifests%ROWTYPE;
  v_study_origin public.tli_study_origin_manifests%ROWTYPE;
  v_forecast public.tli_forecast_origin_manifests%ROWTYPE;
BEGIN
  IF NEW.experiment_cycle_id IS NULL
     AND NEW.experiment_origin_manifest_id IS NULL
     AND NEW.scientific_prediction_role IS NULL
  THEN
    RETURN NEW;
  END IF;

  IF NEW.experiment_cycle_id IS NULL
     OR NEW.experiment_origin_manifest_id IS NULL
     OR NEW.scientific_prediction_role IS NULL
  THEN
    RAISE EXCEPTION 'scientific rows require cycle, origin, and role together'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('tli-cycle-v1|' || NEW.experiment_cycle_id::text, 0)
  );

  IF NEW.serving_role IS DISTINCT FROM 'shadow'
     OR NEW.score_status IS DISTINCT FROM 'pending'
     OR NEW.actual_g IS NOT NULL
     OR NEW.actual_y IS NOT NULL
     OR NEW.actual_label_id IS NOT NULL
     OR NEW.score_payload_sha256 IS NOT NULL
     OR NEW.score_exclusion_reason IS NOT NULL
     OR NEW.scored_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'scientific insert requires serving_role = ''shadow'', score_status = ''pending'', and null outcomes'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = NEW.experiment_cycle_id;
  SELECT * INTO v_origin
  FROM public.tli_experiment_origin_manifests
  WHERE id = NEW.experiment_origin_manifest_id;

  IF v_cycle.id IS NULL OR v_origin.id IS NULL
     OR v_origin.cycle_id IS DISTINCT FROM v_cycle.id
     OR v_cycle.status NOT IN ('running','promoted_internal','public_approved')
     OR NOT (
       (v_cycle.status = 'running' AND v_origin.enrollment_role IN ('confirmatory','predecision_diagnostic'))
       OR (v_cycle.status = 'promoted_internal' AND v_origin.enrollment_role IN ('public_canary','prepublic_diagnostic'))
       OR (
         v_cycle.status = 'public_approved'
         AND v_origin.enrollment_role = 'monitoring'
         AND EXISTS (
           SELECT 1
           FROM public.model_registry AS registry
           WHERE registry.experiment_cycle_id = v_cycle.id
             AND registry.model_version = v_cycle.candidate_model_version
             AND registry.status = 'champion'
             AND registry.scientific_claim_status = 'eligible'
             AND registry.scientific_release_status IN ('public','blocked')
             AND registry.gate_result ->> 'model_artifact_sha256' = v_cycle.candidate_model_sha256
         )
       )
     )
  THEN
    RAISE EXCEPTION 'scientific prediction cycle and enrolled origin are not active and exact'
      USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tli_evidence_artifacts AS artifact
    JOIN public.tli_evidence_attestations AS attestation
      ON attestation.artifact_id = artifact.id
     AND attestation.content_sha256 = artifact.content_sha256
    WHERE artifact.cycle_id = v_cycle.id
      AND artifact.experiment_origin_manifest_id = v_origin.id
      AND artifact.artifact_type = 'origin_manifest'
  ) THEN
    RAISE EXCEPTION 'matching origin artifact and attestation are required before scientific prediction insert'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_study_origin
  FROM public.tli_study_origin_manifests
  WHERE id = v_origin.study_origin_manifest_id;
  SELECT * INTO v_forecast
  FROM public.tli_forecast_origin_manifests
  WHERE id = v_origin.forecast_origin_manifest_id;

  IF v_study_origin.id IS NULL
     OR v_forecast.id IS NULL
     OR v_study_origin.study_contract_id IS DISTINCT FROM v_cycle.study_contract_id
     OR v_study_origin.forecast_origin_manifest_id IS DISTINCT FROM v_forecast.id
     OR NEW.prediction_date IS DISTINCT FROM v_forecast.origin_date
     OR NEW.forecast_origin_week IS DISTINCT FROM v_forecast.origin_date
     OR NEW.forecast_cutoff IS DISTINCT FROM v_forecast.forecast_cutoff
     OR NEW.labeler_version IS DISTINCT FROM v_cycle.labeler_version
     OR NEW.feature_contract_hash IS DISTINCT FROM v_cycle.feature_contract_sha256
     OR NOT EXISTS (
       SELECT 1 FROM public.tli_forecast_origin_theme_inputs
       WHERE forecast_origin_manifest_id = v_forecast.id AND theme_id = NEW.theme_id
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.tli_study_origin_theme_inputs
       WHERE study_origin_manifest_id = v_study_origin.id AND theme_id = NEW.theme_id
     )
  THEN
    RAISE EXCEPTION 'scientific prediction foundation, theme, cutoff, label, or feature contract is not exact'
      USING ERRCODE = '23503';
  END IF;

  IF (
    NEW.scientific_prediction_role = 'candidate'
    AND (
      NEW.model_version IS DISTINCT FROM v_cycle.candidate_model_version
      OR NEW.model_artifact_sha256 IS DISTINCT FROM v_cycle.candidate_model_sha256
    )
  ) OR (
    NEW.scientific_prediction_role = 'comparator'
    AND (
      NEW.model_version IS DISTINCT FROM v_cycle.comparator_version
      OR NEW.model_artifact_sha256 IS DISTINCT FROM v_cycle.comparator_artifact_sha256
    )
  ) THEN
    RAISE EXCEPTION 'scientific prediction role does not match the frozen model version and artifact'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_tli_scientific_prediction_insert
  BEFORE INSERT ON public.theme_predictions_v3
  FOR EACH ROW EXECUTE FUNCTION public.validate_tli_scientific_prediction_insert();

CREATE OR REPLACE FUNCTION public.guard_tli_scientific_prediction_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.experiment_cycle_id IS NOT NULL THEN
      RAISE EXCEPTION 'scientific predictions cannot be deleted'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.experiment_cycle_id IS NULL AND NEW.experiment_cycle_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_user IS DISTINCT FROM pg_get_userbyid((
       SELECT function_row.proowner
       FROM pg_proc AS function_row
       WHERE function_row.oid = 'public.finalize_tli_scientific_prediction_score(text,text)'::REGPROCEDURE
     ))
     OR current_setting('tli.finalize_scientific_prediction_id', true) IS DISTINCT FROM OLD.id::text
  THEN
    RAISE EXCEPTION 'scientific prediction updates require finalize_tli_scientific_prediction_score'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.score_status <> 'pending' THEN
    RAISE EXCEPTION 'scientific terminal scores are immutable'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.score_status NOT IN ('scored','excluded') THEN
    RAISE EXCEPTION 'scientific pending scores transition only to scored or excluded'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.theme_id IS DISTINCT FROM OLD.theme_id
     OR NEW.prediction_date IS DISTINCT FROM OLD.prediction_date
     OR NEW.horizon_days IS DISTINCT FROM OLD.horizon_days
     OR NEW.serving_role IS DISTINCT FROM OLD.serving_role
     OR NEW.p_rise IS DISTINCT FROM OLD.p_rise
     OR NEW.ci_lower IS DISTINCT FROM OLD.ci_lower
     OR NEW.ci_upper IS DISTINCT FROM OLD.ci_upper
     OR NEW.abstain IS DISTINCT FROM OLD.abstain
     OR NEW.abstain_reasons IS DISTINCT FROM OLD.abstain_reasons
     OR NEW.features IS DISTINCT FROM OLD.features
     OR NEW.model_version IS DISTINCT FROM OLD.model_version
     OR NEW.labeler_version IS DISTINCT FROM OLD.labeler_version
     OR NEW.param_version IS DISTINCT FROM OLD.param_version
     OR NEW.experiment_cycle_id IS DISTINCT FROM OLD.experiment_cycle_id
     OR NEW.experiment_origin_manifest_id IS DISTINCT FROM OLD.experiment_origin_manifest_id
     OR NEW.scientific_prediction_role IS DISTINCT FROM OLD.scientific_prediction_role
     OR NEW.model_artifact_sha256 IS DISTINCT FROM OLD.model_artifact_sha256
     OR NEW.feature_contract_hash IS DISTINCT FROM OLD.feature_contract_hash
     OR NEW.feature_snapshot_hash IS DISTINCT FROM OLD.feature_snapshot_hash
     OR NEW.forecast_cutoff IS DISTINCT FROM OLD.forecast_cutoff
     OR NEW.forecast_origin_week IS DISTINCT FROM OLD.forecast_origin_week
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'scientific inference and provenance are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.actual_label_id IS NULL
     OR NEW.score_payload_sha256 !~ '^[0-9a-f]{64}$'
     OR NEW.scored_at IS NULL
     OR (
       NEW.score_status = 'scored'
       AND (
         NEW.actual_g IS NULL
         OR NEW.actual_g::text IN ('NaN','Infinity','-Infinity')
         OR NEW.actual_y IS NULL
         OR NEW.score_exclusion_reason IS NOT NULL
       )
     )
     OR (
       NEW.score_status = 'excluded'
       AND (
         NEW.actual_g IS NOT NULL
         OR NEW.actual_y IS NOT NULL
         OR NEW.score_exclusion_reason IS NULL
       )
     )
  THEN
    RAISE EXCEPTION 'scientific terminal score payload is malformed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_tli_scientific_prediction_mutation
  BEFORE UPDATE OR DELETE ON public.theme_predictions_v3
  FOR EACH ROW EXECUTE FUNCTION public.guard_tli_scientific_prediction_mutation();
CREATE TRIGGER guard_tli_scientific_prediction_truncate
  BEFORE TRUNCATE ON public.theme_predictions_v3
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.theme_predictions_v3 FROM service_role;
GRANT UPDATE (actual_g, actual_y, scored_at, score_status) ON public.theme_predictions_v3 TO service_role;

CREATE OR REPLACE FUNCTION public.tli_create_evidence_from_envelope(
  p_cycle_id UUID,
  p_origin_id UUID,
  p_expected_type TEXT,
  p_expected_key TEXT,
  p_envelope JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_payload JSONB;
  v_artifact_id UUID;
  v_content_sha TEXT;
  v_verified_at TIMESTAMPTZ;
BEGIN
  IF jsonb_typeof(p_envelope) IS DISTINCT FROM 'object'
     OR public.tli_jsonb_object_key_count(p_envelope) <> 10
     OR p_envelope ->> 'artifact_type' IS DISTINCT FROM p_expected_type
     OR p_envelope ->> 'artifact_key' IS DISTINCT FROM p_expected_key
  THEN
    RAISE EXCEPTION 'evidence envelope has unknown, missing, or mismatched fields'
      USING ERRCODE = '22023';
  END IF;

  v_content_sha := p_envelope ->> 'content_sha256';
  v_payload := public.tli_require_canonical_json_v1(
    p_envelope ->> 'canonical_json',
    v_content_sha
  );

  BEGIN
    v_verified_at := (p_envelope ->> 'verified_at')::TIMESTAMPTZ;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'evidence verified_at is malformed'
      USING ERRCODE = '22023';
  END;

  IF NOT isfinite(v_verified_at)
     OR p_envelope ->> 'verified_at' IS DISTINCT FROM to_char(
       v_verified_at AT TIME ZONE 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
     )
     OR v_verified_at > clock_timestamp()
  THEN
    RAISE EXCEPTION 'evidence verified_at must be canonical UTC and not in the future'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tli_evidence_artifacts (
    cycle_id,
    experiment_origin_manifest_id,
    artifact_type,
    artifact_key,
    content_sha256,
    payload
  )
  VALUES (
    p_cycle_id,
    p_origin_id,
    p_expected_type,
    p_expected_key,
    v_content_sha,
    v_payload
  )
  RETURNING id INTO v_artifact_id;

  INSERT INTO public.tli_evidence_attestations (
    artifact_id,
    git_commit_sha,
    git_blob_sha,
    repo_relative_path,
    content_sha256,
    verifier_version,
    verifier_code_sha,
    verified_at
  )
  VALUES (
    v_artifact_id,
    p_envelope ->> 'git_commit_sha',
    p_envelope ->> 'git_blob_sha',
    p_envelope ->> 'repo_relative_path',
    v_content_sha,
    p_envelope ->> 'verifier_version',
    p_envelope ->> 'verifier_code_sha',
    v_verified_at
  );

  RETURN v_artifact_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tli_origin_is_eligible(p_origin_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tli_experiment_origin_manifests AS enrolled
    JOIN public.tli_forecast_origin_manifests AS forecast
      ON forecast.id = enrolled.forecast_origin_manifest_id
    WHERE enrolled.id = p_origin_id
      AND EXISTS (
        SELECT 1
        FROM public.tli_evidence_artifacts AS artifact
        JOIN public.tli_evidence_attestations AS attestation
          ON attestation.artifact_id = artifact.id
         AND attestation.content_sha256 = artifact.content_sha256
        WHERE artifact.experiment_origin_manifest_id = enrolled.id
          AND artifact.artifact_type = 'origin_manifest'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.tli_forecast_origin_theme_inputs AS expected
        WHERE expected.forecast_origin_manifest_id = forecast.id
          AND (
            NOT EXISTS (
              SELECT 1
              FROM public.theme_predictions_v3 AS candidate
              WHERE candidate.experiment_cycle_id = enrolled.cycle_id
                AND candidate.experiment_origin_manifest_id = enrolled.id
                AND candidate.theme_id = expected.theme_id
                AND candidate.scientific_prediction_role = 'candidate'
                AND candidate.score_status IN ('scored','excluded')
            )
            OR NOT EXISTS (
              SELECT 1
              FROM public.theme_predictions_v3 AS comparator
              WHERE comparator.experiment_cycle_id = enrolled.cycle_id
                AND comparator.experiment_origin_manifest_id = enrolled.id
                AND comparator.theme_id = expected.theme_id
                AND comparator.scientific_prediction_role = 'comparator'
                AND comparator.score_status IN ('scored','excluded')
            )
          )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.tli_sequence_range_is_eligible(
  p_cycle_id UUID,
  p_last_sequence INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    count(*) = p_last_sequence
    AND count(DISTINCT sequence_no) = p_last_sequence
    AND min(sequence_no) = 1
    AND max(sequence_no) = p_last_sequence
    AND bool_and(public.tli_origin_is_eligible(id)),
    false
  )
  FROM public.tli_experiment_origin_manifests
  WHERE cycle_id = p_cycle_id
    AND sequence_no BETWEEN 1 AND p_last_sequence
    AND enrollment_role = 'confirmatory';
$$;

CREATE OR REPLACE FUNCTION public.tli_artifact_is_attested(
  p_cycle_id UUID,
  p_type TEXT,
  p_key TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tli_evidence_artifacts AS artifact
    JOIN public.tli_evidence_attestations AS attestation
      ON attestation.artifact_id = artifact.id
     AND attestation.content_sha256 = artifact.content_sha256
    WHERE artifact.cycle_id = p_cycle_id
      AND artifact.artifact_type = p_type
      AND artifact.artifact_key = p_key
  );
$$;

CREATE OR REPLACE FUNCTION public.freeze_tli_cycle(
  p_cycle_id UUID,
  p_evidence_envelopes JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_study public.tli_attention_study_contracts%ROWTYPE;
  v_envelope JSONB;
  v_artifact_id UUID;
  v_payload JSONB;
  v_type TEXT;
  v_sha TEXT;
  v_model_manifest_sha TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-active-cycle-v1', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-cycle-v1|' || p_cycle_id::text, 0));

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;

  IF NOT FOUND OR v_cycle.status <> 'draft' THEN
    RAISE EXCEPTION 'freeze_tli_cycle requires an existing draft cycle'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tli_experiment_cycles
    WHERE id <> p_cycle_id
      AND status IN ('frozen','running','ready_for_decision','promoted_internal')
  ) THEN
    RAISE EXCEPTION 'another active challenger cycle already exists'
      USING ERRCODE = '23505';
  END IF;

  IF v_cycle.study_contract_id IS NULL
     OR v_cycle.study_contract_sha256 IS NULL
     OR v_cycle.candidate_model_version IS NULL
     OR v_cycle.candidate_model_sha256 IS NULL
     OR v_cycle.comparator_version IS NULL
     OR v_cycle.comparator_artifact_sha256 IS NULL
     OR v_cycle.dataset_manifest_sha256 IS NULL
     OR v_cycle.feature_contract_version IS NULL
     OR v_cycle.feature_contract_sha256 IS NULL
     OR v_cycle.labeler_version IS NULL
     OR v_cycle.label_contract_sha256 IS NULL
     OR v_cycle.calibration_version IS NULL
     OR v_cycle.calibration_artifact_sha256 IS NULL
     OR v_cycle.babl_contract_sha256 IS NULL
     OR v_cycle.primary_endpoint IS NULL
     OR v_cycle.alpha IS NULL
     OR v_cycle.thresholds IS NULL
     OR v_cycle.power_simulation_sha256 IS NULL
     OR v_cycle.power_simulation_result IS NULL
     OR v_cycle.planned_origins IS NULL
     OR v_cycle.safety_origins IS NULL
     OR v_cycle.calendar_start IS NULL
     OR v_cycle.initial_calendar_end IS NULL
     OR v_cycle.preregistration_sha256 IS NULL
     OR v_cycle.preregistration_payload IS NULL
  THEN
    RAISE EXCEPTION 'cycle freeze requires every preregistered contract field'
      USING ERRCODE = '23514';
  END IF;

  IF clock_timestamp() >= (
    (v_cycle.calendar_start::TIMESTAMP + INTERVAL '18 hours') AT TIME ZONE 'Asia/Seoul'
  ) THEN
    RAISE EXCEPTION 'cycle freeze must precede the first prospective origin cutoff'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_cycle.thresholds) IS DISTINCT FROM 'object'
     OR public.tli_jsonb_object_key_count(v_cycle.thresholds) = 0
     OR jsonb_typeof(v_cycle.power_simulation_result) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_cycle.power_simulation_result -> 'power') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_cycle.power_simulation_result -> 'data_floor_pass') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v_cycle.preregistration_payload) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'cycle freeze statistical and preregistration payloads must have exact JSON types'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      v_cycle.study_contract_sha256,
      v_cycle.candidate_model_sha256,
      v_cycle.comparator_artifact_sha256,
      v_cycle.dataset_manifest_sha256,
      v_cycle.feature_contract_sha256,
      v_cycle.label_contract_sha256,
      v_cycle.calibration_artifact_sha256,
      v_cycle.babl_contract_sha256,
      v_cycle.power_simulation_sha256,
      v_cycle.preregistration_sha256
    ]) AS hashes(value)
    WHERE value !~ '^[0-9a-f]{64}$'
  ) THEN
    RAISE EXCEPTION 'cycle freeze hashes must be lowercase 64-hex'
      USING ERRCODE = '22023';
  END IF;

  IF v_cycle.labeler_version <> 'gta-v2'
     OR v_cycle.primary_endpoint <> 'paired_brier_delta'
     OR v_cycle.alpha <> 0.01
     OR v_cycle.planned_origins NOT BETWEEN 16 AND 52
     OR v_cycle.safety_origins <> 8
     OR v_cycle.initial_calendar_end < v_cycle.calendar_start
     OR EXTRACT(ISODOW FROM v_cycle.calendar_start) <> 1
     OR (v_cycle.power_simulation_result ->> 'power')::NUMERIC NOT BETWEEN 0.80 AND 1
     OR COALESCE((v_cycle.power_simulation_result ->> 'data_floor_pass')::BOOLEAN, false) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'cycle freeze statistical, calendar, or data-floor contract is invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_study
  FROM public.tli_attention_study_contracts
  WHERE id = v_cycle.study_contract_id;

  IF NOT FOUND
     OR v_study.payload_sha256 IS DISTINCT FROM v_cycle.study_contract_sha256
     OR v_study.feature_contract_version IS DISTINCT FROM v_cycle.feature_contract_version
     OR v_study.feature_contract_sha256 IS DISTINCT FROM v_cycle.feature_contract_sha256
     OR v_study.labeler_version IS DISTINCT FROM v_cycle.labeler_version
     OR v_study.label_contract_sha256 IS DISTINCT FROM v_cycle.label_contract_sha256
     OR v_study.babl_control_sha256 IS DISTINCT FROM v_cycle.babl_contract_sha256
     OR v_cycle.calendar_start < v_study.first_origin_date
     OR v_study.locked_at >= (
       (v_cycle.calendar_start::TIMESTAMP + INTERVAL '18 hours') AT TIME ZONE 'Asia/Seoul'
     )
  THEN
    RAISE EXCEPTION 'cycle freeze must copy the exact immutable study contract'
      USING ERRCODE = '23503';
  END IF;

  IF jsonb_typeof(p_evidence_envelopes) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_evidence_envelopes) <> 4
     OR (
       SELECT count(DISTINCT envelope ->> 'artifact_type')
       FROM jsonb_array_elements(p_evidence_envelopes) AS items(envelope)
       WHERE envelope ->> 'artifact_type' IN (
         'preregistration','dataset_manifest','model_manifest','cycle_manifest'
       )
     ) <> 4
  THEN
    RAISE EXCEPTION 'freeze requires exactly four distinct attested contract artifacts'
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_type IN ARRAY ARRAY[
    'preregistration','dataset_manifest','model_manifest','cycle_manifest'
  ]
  LOOP
    SELECT envelope INTO v_envelope
    FROM jsonb_array_elements(p_evidence_envelopes) AS items(envelope)
    WHERE envelope ->> 'artifact_type' = v_type;

    v_artifact_id := public.tli_create_evidence_from_envelope(
      p_cycle_id,
      NULL,
      v_type,
      'singleton',
      v_envelope
    );

    SELECT content_sha256, payload
    INTO v_sha, v_payload
    FROM public.tli_evidence_artifacts
    WHERE id = v_artifact_id;

    IF v_payload ->> 'cycle_id' IS DISTINCT FROM p_cycle_id::text
       OR v_payload ->> 'study_contract_id' IS DISTINCT FROM v_cycle.study_contract_id::text
       OR v_payload ->> 'study_contract_sha256' IS DISTINCT FROM v_cycle.study_contract_sha256
    THEN
      RAISE EXCEPTION 'freeze artifact has a mixed cycle or study identity'
        USING ERRCODE = '22023';
    END IF;

    IF v_type = 'preregistration'
       AND (
         v_sha IS DISTINCT FROM v_cycle.preregistration_sha256
         OR v_payload IS DISTINCT FROM v_cycle.preregistration_payload
         OR v_payload ->> 'candidate_model_sha256' IS DISTINCT FROM v_cycle.candidate_model_sha256
         OR v_payload ->> 'comparator_artifact_sha256' IS DISTINCT FROM v_cycle.comparator_artifact_sha256
         OR v_payload ->> 'dataset_manifest_sha256' IS DISTINCT FROM v_cycle.dataset_manifest_sha256
         OR v_payload ->> 'feature_contract_sha256' IS DISTINCT FROM v_cycle.feature_contract_sha256
         OR v_payload ->> 'label_contract_sha256' IS DISTINCT FROM v_cycle.label_contract_sha256
         OR v_payload ->> 'calibration_artifact_sha256' IS DISTINCT FROM v_cycle.calibration_artifact_sha256
         OR v_payload ->> 'babl_contract_sha256' IS DISTINCT FROM v_cycle.babl_contract_sha256
         OR v_payload ->> 'primary_endpoint' IS DISTINCT FROM v_cycle.primary_endpoint
         OR (v_payload ->> 'alpha')::NUMERIC IS DISTINCT FROM v_cycle.alpha
         OR v_payload -> 'thresholds' IS DISTINCT FROM v_cycle.thresholds
         OR v_payload ->> 'power_simulation_sha256' IS DISTINCT FROM v_cycle.power_simulation_sha256
         OR v_payload -> 'power_simulation_result' IS DISTINCT FROM v_cycle.power_simulation_result
         OR (v_payload ->> 'planned_origins')::INTEGER IS DISTINCT FROM v_cycle.planned_origins
         OR (v_payload ->> 'safety_origins')::INTEGER IS DISTINCT FROM v_cycle.safety_origins
         OR v_payload ->> 'calendar_start' IS DISTINCT FROM to_char(v_cycle.calendar_start, 'YYYY-MM-DD')
         OR v_payload ->> 'initial_calendar_end' IS DISTINCT FROM to_char(v_cycle.initial_calendar_end, 'YYYY-MM-DD')
       )
    THEN
      RAISE EXCEPTION 'preregistration artifact does not match the draft cycle bytes'
        USING ERRCODE = '22023';
    ELSIF v_type = 'dataset_manifest'
       AND (
         v_sha IS DISTINCT FROM v_cycle.dataset_manifest_sha256
         OR v_payload ->> 'feature_contract_sha256' IS DISTINCT FROM v_cycle.feature_contract_sha256
         OR v_payload ->> 'label_contract_sha256' IS DISTINCT FROM v_cycle.label_contract_sha256
       )
    THEN
      RAISE EXCEPTION 'dataset manifest does not match the frozen contracts'
        USING ERRCODE = '22023';
    ELSIF v_type = 'model_manifest'
       AND (
         v_payload ->> 'candidate_model_version' IS DISTINCT FROM v_cycle.candidate_model_version
         OR v_payload ->> 'candidate_model_sha256' IS DISTINCT FROM v_cycle.candidate_model_sha256
         OR v_payload ->> 'comparator_version' IS DISTINCT FROM v_cycle.comparator_version
         OR v_payload ->> 'comparator_artifact_sha256' IS DISTINCT FROM v_cycle.comparator_artifact_sha256
         OR v_payload ->> 'calibration_artifact_sha256' IS DISTINCT FROM v_cycle.calibration_artifact_sha256
       )
    THEN
      RAISE EXCEPTION 'model manifest does not match the frozen model bundle'
        USING ERRCODE = '22023';
    ELSIF v_type = 'cycle_manifest'
       AND (
         v_payload ->> 'dataset_manifest_sha256' IS DISTINCT FROM v_cycle.dataset_manifest_sha256
         OR v_payload ->> 'candidate_model_version' IS DISTINCT FROM v_cycle.candidate_model_version
         OR v_payload ->> 'candidate_model_sha256' IS DISTINCT FROM v_cycle.candidate_model_sha256
         OR v_payload ->> 'comparator_version' IS DISTINCT FROM v_cycle.comparator_version
         OR v_payload ->> 'comparator_artifact_sha256' IS DISTINCT FROM v_cycle.comparator_artifact_sha256
         OR v_payload ->> 'feature_contract_version' IS DISTINCT FROM v_cycle.feature_contract_version
         OR v_payload ->> 'feature_contract_sha256' IS DISTINCT FROM v_cycle.feature_contract_sha256
         OR v_payload ->> 'labeler_version' IS DISTINCT FROM v_cycle.labeler_version
         OR v_payload ->> 'label_contract_sha256' IS DISTINCT FROM v_cycle.label_contract_sha256
         OR v_payload ->> 'calibration_version' IS DISTINCT FROM v_cycle.calibration_version
         OR v_payload ->> 'calibration_artifact_sha256' IS DISTINCT FROM v_cycle.calibration_artifact_sha256
         OR v_payload ->> 'babl_contract_sha256' IS DISTINCT FROM v_cycle.babl_contract_sha256
         OR v_payload ->> 'primary_endpoint' IS DISTINCT FROM v_cycle.primary_endpoint
         OR (v_payload ->> 'alpha')::NUMERIC IS DISTINCT FROM v_cycle.alpha
         OR v_payload -> 'thresholds' IS DISTINCT FROM v_cycle.thresholds
         OR v_payload ->> 'power_simulation_sha256' IS DISTINCT FROM v_cycle.power_simulation_sha256
         OR v_payload -> 'power_simulation_result' IS DISTINCT FROM v_cycle.power_simulation_result
         OR v_payload ->> 'model_manifest_sha256' IS DISTINCT FROM v_model_manifest_sha
         OR (v_payload ->> 'planned_origins')::INTEGER IS DISTINCT FROM v_cycle.planned_origins
         OR (v_payload ->> 'safety_origins')::INTEGER IS DISTINCT FROM v_cycle.safety_origins
         OR v_payload ->> 'calendar_start' IS DISTINCT FROM to_char(v_cycle.calendar_start, 'YYYY-MM-DD')
         OR v_payload ->> 'initial_calendar_end' IS DISTINCT FROM to_char(v_cycle.initial_calendar_end, 'YYYY-MM-DD')
         OR v_payload ->> 'preregistration_sha256' IS DISTINCT FROM v_cycle.preregistration_sha256
       )
    THEN
      RAISE EXCEPTION 'cycle manifest does not match the frozen hash bundle'
        USING ERRCODE = '22023';
    END IF;

    IF v_type = 'model_manifest' THEN
      v_model_manifest_sha := v_sha;
    END IF;
  END LOOP;

  PERFORM set_config('tli.cycle_rpc', p_cycle_id::text, true);
  UPDATE public.tli_experiment_cycles
  SET status = 'frozen',
      frozen_at = clock_timestamp()
  WHERE id = p_cycle_id;

  RETURN p_cycle_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_tli_cycle(
  p_cycle_id UUID,
  p_model_type TEXT,
  p_coefficients JSONB,
  p_train_start DATE,
  p_train_end DATE,
  p_val_metrics JSONB,
  p_gate_result JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_model_evidence_sha TEXT;
  v_model_manifest_payload JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-active-cycle-v1', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-cycle-v1|' || p_cycle_id::text, 0));

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;

  IF NOT FOUND OR v_cycle.status <> 'frozen' OR v_cycle.frozen_at IS NULL THEN
    RAISE EXCEPTION 'start_tli_cycle requires an attested frozen cycle'
      USING ERRCODE = '55000';
  END IF;

  IF clock_timestamp() >= (
    (v_cycle.calendar_start::TIMESTAMP + INTERVAL '18 hours') AT TIME ZONE 'Asia/Seoul'
  ) THEN
    RAISE EXCEPTION 'cycle start must precede the first prospective origin cutoff'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.tli_artifact_is_attested(p_cycle_id, 'preregistration', 'singleton')
    AND public.tli_artifact_is_attested(p_cycle_id, 'dataset_manifest', 'singleton')
    AND public.tli_artifact_is_attested(p_cycle_id, 'model_manifest', 'singleton')
    AND public.tli_artifact_is_attested(p_cycle_id, 'cycle_manifest', 'singleton')
  ) THEN
    RAISE EXCEPTION 'start requires all four frozen artifacts and attestations'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.model_registry
    WHERE status = 'challenger'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'an active challenger already exists; start never auto-replaces it'
      USING ERRCODE = '23505';
  END IF;

  SELECT artifact.content_sha256, artifact.payload
  INTO v_model_evidence_sha, v_model_manifest_payload
  FROM public.tli_evidence_artifacts AS artifact
  JOIN public.tli_evidence_attestations AS attestation
    ON attestation.artifact_id = artifact.id
   AND attestation.content_sha256 = artifact.content_sha256
  WHERE artifact.cycle_id = p_cycle_id
    AND artifact.artifact_type = 'model_manifest'
    AND artifact.artifact_key = 'singleton';

  IF p_model_type IS NULL
     OR jsonb_typeof(p_coefficients) IS DISTINCT FROM 'object'
     OR p_train_start IS NULL
     OR p_train_end IS NULL
     OR p_train_end <= p_train_start
     OR jsonb_typeof(p_val_metrics) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_gate_result) IS DISTINCT FROM 'object'
     OR p_gate_result ->> 'model_artifact_sha256' IS DISTINCT FROM v_cycle.candidate_model_sha256
     OR jsonb_typeof(v_model_manifest_payload) IS DISTINCT FROM 'object'
     OR v_model_manifest_payload ->> 'model_type' IS DISTINCT FROM p_model_type
     OR v_model_manifest_payload -> 'coefficients' IS DISTINCT FROM p_coefficients
     OR v_model_manifest_payload ->> 'train_start' IS DISTINCT FROM to_char(p_train_start, 'YYYY-MM-DD')
     OR v_model_manifest_payload ->> 'train_end' IS DISTINCT FROM to_char(p_train_end, 'YYYY-MM-DD')
     OR v_model_manifest_payload -> 'val_metrics' IS DISTINCT FROM p_val_metrics
     OR v_model_manifest_payload -> 'gate_result' IS DISTINCT FROM p_gate_result
  THEN
    RAISE EXCEPTION 'candidate registry row does not match the frozen model artifact'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('tli.cycle_registry_rpc', p_cycle_id::text, true);
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
  VALUES (
    v_cycle.candidate_model_version,
    p_model_type,
    p_coefficients,
    daterange(p_train_start, p_train_end, '[)'),
    p_val_metrics,
    p_gate_result,
    'challenger',
    'unvalidated',
    'blocked',
    'prospective_cycle_running',
    p_cycle_id
  );

  INSERT INTO public.tli_model_release_events (
    model_registry_id,
    cycle_id,
    from_status,
    to_status,
    reason_code,
    evidence_sha256
  )
  VALUES (
    p_cycle_id,
    p_cycle_id,
    'challenger',
    'challenger',
    'prospective_cycle_running',
    v_model_evidence_sha
  );

  PERFORM set_config('tli.cycle_rpc', p_cycle_id::text, true);
  UPDATE public.tli_experiment_cycles
  SET status = 'running',
      running_at = clock_timestamp()
  WHERE id = p_cycle_id;

  RETURN p_cycle_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_tli_safety_decision(
  p_cycle_id UUID,
  p_pass BOOLEAN,
  p_evidence_envelope JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_artifact_id UUID;
  v_artifact public.tli_evidence_artifacts%ROWTYPE;
  v_probability_valid BOOLEAN;
  v_brier NUMERIC;
  v_ece NUMERIC;
  v_incidents INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-active-cycle-v1', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-cycle-v1|' || p_cycle_id::text, 0));

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;

  IF NOT FOUND OR v_cycle.status <> 'running' OR v_cycle.safety_checked_at IS NOT NULL THEN
    RAISE EXCEPTION 'safety decision is available exactly once for a running cycle'
      USING ERRCODE = '55000';
  END IF;
  IF p_pass IS NULL THEN
    RAISE EXCEPTION 'safety decision verdict cannot be null'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.tli_sequence_range_is_eligible(p_cycle_id, 8) THEN
    RAISE EXCEPTION 'safety decision requires eligible confirmatory sequences 1 through 8'
      USING ERRCODE = '55000';
  END IF;

  v_artifact_id := public.tli_create_evidence_from_envelope(
    p_cycle_id,
    NULL,
    'safety_report',
    'singleton',
    p_evidence_envelope
  );
  SELECT * INTO v_artifact
  FROM public.tli_evidence_artifacts
  WHERE id = v_artifact_id;

  BEGIN
    v_probability_valid := (v_artifact.payload ->> 'probabilities_valid')::BOOLEAN;
    v_brier := (v_artifact.payload ->> 'pooled_brier')::NUMERIC;
    v_ece := (v_artifact.payload ->> 'fixed_bin_ece')::NUMERIC;
    v_incidents := (v_artifact.payload ->> 'critical_incident_count')::INTEGER;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'safety report metrics are malformed'
      USING ERRCODE = '22023';
  END;

  IF v_probability_valid IS NULL
     OR v_brier IS NULL
     OR v_brier::text IN ('NaN','Infinity','-Infinity')
     OR v_brier < 0
     OR v_brier > 1
     OR v_ece IS NULL
     OR v_ece::text IN ('NaN','Infinity','-Infinity')
     OR v_ece < 0
     OR v_ece > 1
     OR v_incidents IS NULL
     OR v_incidents < 0
  THEN
    RAISE EXCEPTION 'safety report metrics must be complete, finite, and in range'
      USING ERRCODE = '22023';
  END IF;

  IF v_artifact.payload ->> 'cycle_id' IS DISTINCT FROM p_cycle_id::text
     OR (v_artifact.payload ->> 'sequence_start')::INTEGER IS DISTINCT FROM 1
     OR (v_artifact.payload ->> 'sequence_end')::INTEGER IS DISTINCT FROM 8
     OR (
       p_pass
       AND (
         v_artifact.payload ->> 'decision' IS DISTINCT FROM 'pass'
         OR v_probability_valid IS NOT TRUE
         OR v_brier > 0.35
         OR v_ece > 0.20
         OR v_incidents <> 0
       )
     )
     OR (
       NOT p_pass
       AND (
         v_artifact.payload ->> 'decision' IS DISTINCT FROM 'safety_hold'
         OR NOT (
           v_probability_valid IS NOT TRUE
           OR v_brier > 0.35
           OR v_ece > 0.20
           OR v_incidents > 0
         )
       )
     )
  THEN
    RAISE EXCEPTION 'safety report does not prove the requested immutable decision'
      USING ERRCODE = '22023';
  END IF;

  IF NOT p_pass THEN
    PERFORM set_config('tli.cycle_registry_rpc', p_cycle_id::text, true);
    UPDATE public.model_registry
    SET status = 'archived',
        scientific_claim_status = 'invalidated',
        scientific_release_status = 'blocked',
        scientific_claim_reason = 'safety_gate_failed',
        invalidated_at = clock_timestamp()
    WHERE experiment_cycle_id = p_cycle_id
      AND status = 'challenger';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'safety failure has no exact linked challenger to archive'
        USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.tli_model_release_events (
      model_registry_id, cycle_id, from_status, to_status, reason_code, evidence_sha256
    )
    VALUES (
      p_cycle_id, p_cycle_id, 'challenger', 'archived', 'safety_gate_failed',
      v_artifact.content_sha256
    );
  END IF;

  PERFORM set_config('tli.cycle_rpc', p_cycle_id::text, true);
  UPDATE public.tli_experiment_cycles
  SET status = CASE WHEN p_pass THEN 'running' ELSE 'safety_hold' END,
      safety_checked_at = clock_timestamp()
  WHERE id = p_cycle_id;

  RETURN p_cycle_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_tli_final_decision(
  p_cycle_id UUID,
  p_pass BOOLEAN,
  p_evidence_envelope JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_artifact_id UUID;
  v_artifact public.tli_evidence_artifacts%ROWTYPE;
  v_decision_origin_date DATE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-active-cycle-v1', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-cycle-v1|' || p_cycle_id::text, 0));

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;

  IF NOT FOUND OR v_cycle.status <> 'running' OR v_cycle.decision_at IS NOT NULL THEN
    RAISE EXCEPTION 'final decision is available exactly once for a running cycle'
      USING ERRCODE = '55000';
  END IF;
  IF p_pass IS NULL THEN
    RAISE EXCEPTION 'final decision verdict cannot be null'
      USING ERRCODE = '22023';
  END IF;

  IF v_cycle.safety_checked_at IS NULL
     OR NOT public.tli_artifact_is_attested(p_cycle_id, 'safety_report', 'singleton')
     OR NOT EXISTS (
       SELECT 1
       FROM public.tli_evidence_artifacts
       WHERE cycle_id = p_cycle_id
         AND artifact_type = 'safety_report'
         AND artifact_key = 'singleton'
         AND payload ->> 'decision' = 'pass'
     )
  THEN
    RAISE EXCEPTION 'passing safety_report attestation and safety_checked_at are required before final decision'
      USING ERRCODE = '55000';
  END IF;

  IF NOT public.tli_sequence_range_is_eligible(p_cycle_id, v_cycle.planned_origins) THEN
    RAISE EXCEPTION 'final decision requires exact eligible sequences 1 through planned_origins'
      USING ERRCODE = '55000';
  END IF;

  SELECT forecast.origin_date
  INTO v_decision_origin_date
  FROM public.tli_experiment_origin_manifests AS enrolled
  JOIN public.tli_forecast_origin_manifests AS forecast
    ON forecast.id = enrolled.forecast_origin_manifest_id
  WHERE enrolled.cycle_id = p_cycle_id
    AND enrolled.sequence_no = v_cycle.planned_origins
    AND enrolled.enrollment_role = 'confirmatory';

  v_artifact_id := public.tli_create_evidence_from_envelope(
    p_cycle_id,
    NULL,
    'final_decision',
    'singleton',
    p_evidence_envelope
  );
  SELECT * INTO v_artifact
  FROM public.tli_evidence_artifacts
  WHERE id = v_artifact_id;

  IF v_artifact.payload ->> 'cycle_id' IS DISTINCT FROM p_cycle_id::text
     OR (v_artifact.payload ->> 'planned_origins')::INTEGER IS DISTINCT FROM v_cycle.planned_origins
     OR v_artifact.payload ->> 'decision_origin_date' IS DISTINCT FROM to_char(v_decision_origin_date, 'YYYY-MM-DD')
     OR v_artifact.payload ->> 'decision' IS DISTINCT FROM CASE WHEN p_pass THEN 'pass' ELSE 'reject' END
  THEN
    RAISE EXCEPTION 'final decision artifact does not match the exact planned set and verdict'
      USING ERRCODE = '22023';
  END IF;

  IF NOT p_pass THEN
    PERFORM set_config('tli.cycle_registry_rpc', p_cycle_id::text, true);
    UPDATE public.model_registry
    SET status = 'archived',
        scientific_claim_status = 'invalidated',
        scientific_release_status = 'blocked',
        scientific_claim_reason = 'final_decision_rejected',
        invalidated_at = clock_timestamp()
    WHERE experiment_cycle_id = p_cycle_id
      AND status = 'challenger';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'final rejection has no exact linked challenger to archive'
        USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.tli_model_release_events (
      model_registry_id, cycle_id, from_status, to_status, reason_code, evidence_sha256
    )
    VALUES (
      p_cycle_id, p_cycle_id, 'challenger', 'archived', 'final_decision_rejected',
      v_artifact.content_sha256
    );
  END IF;

  PERFORM set_config('tli.cycle_rpc', p_cycle_id::text, true);
  UPDATE public.tli_experiment_cycles
  SET status = CASE WHEN p_pass THEN 'ready_for_decision' ELSE 'rejected' END,
      decision_at = clock_timestamp(),
      decision_origin_date = v_decision_origin_date
  WHERE id = p_cycle_id;

  RETURN p_cycle_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_tli_internal(p_cycle_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_final_sha TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-cycle-v1|' || p_cycle_id::text, 0));

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;

  IF NOT FOUND OR v_cycle.status <> 'ready_for_decision' OR v_cycle.decision_at IS NULL THEN
    RAISE EXCEPTION 'internal promotion requires a ready_for_decision cycle'
      USING ERRCODE = '55000';
  END IF;

  SELECT artifact.content_sha256 INTO v_final_sha
  FROM public.tli_evidence_artifacts AS artifact
  JOIN public.tli_evidence_attestations AS attestation
    ON attestation.artifact_id = artifact.id
   AND attestation.content_sha256 = artifact.content_sha256
  WHERE artifact.cycle_id = p_cycle_id
    AND artifact.artifact_type = 'final_decision'
    AND artifact.artifact_key = 'singleton'
    AND artifact.payload ->> 'decision' = 'pass';

  IF v_final_sha IS NULL THEN
    RAISE EXCEPTION 'internal promotion requires an attested passing final decision'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.model_registry
    WHERE experiment_cycle_id = p_cycle_id
      AND model_version = v_cycle.candidate_model_version
      AND status = 'challenger'
      AND scientific_claim_status = 'unvalidated'
      AND scientific_release_status = 'blocked'
      AND gate_result ->> 'model_artifact_sha256' = v_cycle.candidate_model_sha256
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'internal promotion requires the unique exact frozen challenger'
      USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('tli.cycle_registry_rpc', p_cycle_id::text, true);
  UPDATE public.model_registry
  SET status = 'challenger',
      scientific_claim_status = 'eligible',
      scientific_release_status = 'internal',
      scientific_claim_reason = 'validated_internal_promotion'
  WHERE experiment_cycle_id = p_cycle_id
    AND model_version = v_cycle.candidate_model_version;

  INSERT INTO public.tli_model_release_events (
    model_registry_id, cycle_id, from_status, to_status, reason_code, evidence_sha256
  )
  VALUES (
    p_cycle_id, p_cycle_id, 'challenger', 'challenger',
    'validated_internal_promotion', v_final_sha
  );

  PERFORM set_config('tli.cycle_rpc', p_cycle_id::text, true);
  UPDATE public.tli_experiment_cycles
  SET status = 'promoted_internal',
      promoted_internal_at = clock_timestamp()
  WHERE id = p_cycle_id;

  RETURN p_cycle_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_tli_canary_failure(
  p_cycle_id UUID,
  p_origin_manifest_id UUID,
  p_evidence_envelope JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_origin public.tli_experiment_origin_manifests%ROWTYPE;
  v_origin_date DATE;
  v_artifact_id UUID;
  v_artifact public.tli_evidence_artifacts%ROWTYPE;
  v_gate_pass BOOLEAN;
  v_interval_completeness NUMERIC;
  v_universe_coverage NUMERIC;
  v_incident_count INTEGER;
  v_invalid_probability_count INTEGER;
  v_candidate_brier NUMERIC;
  v_pooled_ece NUMERIC;
  v_pooled_ece_upper95 NUMERIC;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-active-cycle-v1', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-cycle-v1|' || p_cycle_id::text, 0));

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;
  SELECT * INTO v_origin
  FROM public.tli_experiment_origin_manifests
  WHERE id = p_origin_manifest_id
  FOR UPDATE;
  SELECT origin_date INTO v_origin_date
  FROM public.tli_forecast_origin_manifests
  WHERE id = v_origin.forecast_origin_manifest_id;

  IF v_cycle.id IS NULL
     OR v_cycle.status <> 'promoted_internal'
     OR v_origin.id IS NULL
     OR v_origin.cycle_id IS DISTINCT FROM p_cycle_id
     OR v_origin.enrollment_role <> 'public_canary'
     OR v_origin.public_canary_no NOT BETWEEN 1 AND 4
     OR NOT public.tli_origin_is_eligible(v_origin.id)
  THEN
    RAISE EXCEPTION 'canary failure requires an eligible enrolled public canary'
      USING ERRCODE = '55000';
  END IF;

  v_artifact_id := public.tli_create_evidence_from_envelope(
    p_cycle_id,
    p_origin_manifest_id,
    'public_canary',
    to_char(v_origin_date, 'YYYY-MM-DD'),
    p_evidence_envelope
  );
  SELECT * INTO v_artifact
  FROM public.tli_evidence_artifacts
  WHERE id = v_artifact_id;

  BEGIN
    v_gate_pass := (v_artifact.payload ->> 'gate_pass')::BOOLEAN;
    v_interval_completeness := (v_artifact.payload ->> 'probability_interval_completeness')::NUMERIC;
    v_universe_coverage := (v_artifact.payload ->> 'expected_universe_coverage')::NUMERIC;
    v_incident_count := (v_artifact.payload ->> 'critical_incident_count')::INTEGER;
    v_invalid_probability_count := (v_artifact.payload ->> 'probability_invalid_count')::INTEGER;
    v_candidate_brier := (v_artifact.payload ->> 'candidate_brier')::NUMERIC;
    v_pooled_ece := (v_artifact.payload ->> 'pooled_fixed_bin_ece')::NUMERIC;
    v_pooled_ece_upper95 := (v_artifact.payload ->> 'pooled_ece_upper95')::NUMERIC;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'public canary failure metrics are malformed'
      USING ERRCODE = '22023';
  END;

  IF v_artifact.payload ->> 'cycle_id' IS DISTINCT FROM p_cycle_id::text
     OR v_artifact.payload ->> 'experiment_origin_manifest_id' IS DISTINCT FROM p_origin_manifest_id::text
     OR (v_artifact.payload ->> 'public_canary_no')::INTEGER IS DISTINCT FROM v_origin.public_canary_no::INTEGER
     OR v_gate_pass IS NOT FALSE
     OR v_interval_completeness IS NULL
     OR v_interval_completeness::text IN ('NaN','Infinity','-Infinity')
     OR v_interval_completeness NOT BETWEEN 0 AND 1
     OR v_universe_coverage IS NULL
     OR v_universe_coverage::text IN ('NaN','Infinity','-Infinity')
     OR v_universe_coverage NOT BETWEEN 0 AND 1
     OR v_incident_count IS NULL
     OR v_incident_count < 0
     OR v_invalid_probability_count IS NULL
     OR v_invalid_probability_count < 0
     OR v_candidate_brier IS NULL
     OR v_candidate_brier::text IN ('NaN','Infinity','-Infinity')
     OR v_candidate_brier < 0
     OR NOT (
       v_interval_completeness <> 1
       OR v_universe_coverage < 0.70
       OR v_incident_count > 0
       OR v_invalid_probability_count > 0
       OR v_candidate_brier > 0.35
       OR (
         v_origin.public_canary_no = 4
         AND v_pooled_ece IS NOT NULL
         AND v_pooled_ece_upper95 IS NOT NULL
         AND v_pooled_ece::text NOT IN ('NaN','Infinity','-Infinity')
         AND v_pooled_ece_upper95::text NOT IN ('NaN','Infinity','-Infinity')
         AND v_pooled_ece >= 0
         AND v_pooled_ece_upper95 >= 0
         AND (
           v_pooled_ece > 0.10
           OR v_pooled_ece_upper95 > 0.12
         )
       )
     )
  THEN
    RAISE EXCEPTION 'public canary failure artifact does not match the enrolled canary'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('tli.cycle_registry_rpc', p_cycle_id::text, true);
  UPDATE public.model_registry
  SET status = 'archived',
      scientific_claim_status = 'eligible',
      scientific_release_status = 'blocked',
      scientific_claim_reason = 'public_canary_failed'
  WHERE experiment_cycle_id = p_cycle_id
    AND status = 'challenger'
    AND scientific_claim_status = 'eligible'
    AND scientific_release_status = 'internal';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'canary failure has no exact internal challenger to archive'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.tli_model_release_events (
    model_registry_id, cycle_id, from_status, to_status, reason_code, evidence_sha256
  )
  VALUES (
    p_cycle_id, p_cycle_id, 'challenger', 'archived',
    'public_canary_failed', v_artifact.content_sha256
  );

  PERFORM set_config('tli.cycle_rpc', p_cycle_id::text, true);
  UPDATE public.tli_experiment_cycles
  SET status = 'safety_hold'
  WHERE id = p_cycle_id;

  RETURN p_cycle_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_tli_public(
  p_cycle_id UUID,
  p_canary_evidence_envelopes JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_origin public.tli_experiment_origin_manifests%ROWTYPE;
  v_origin_date DATE;
  v_envelope JSONB;
  v_artifact_id UUID;
  v_artifact public.tli_evidence_artifacts%ROWTYPE;
  v_canary_no INTEGER;
  v_fourth_sha TEXT;
  v_old_champion public.model_registry%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-active-cycle-v1', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-cycle-v1|' || p_cycle_id::text, 0));

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;

  IF NOT FOUND OR v_cycle.status <> 'promoted_internal' OR v_cycle.promoted_internal_at IS NULL THEN
    RAISE EXCEPTION 'public release requires a promoted_internal cycle'
      USING ERRCODE = '55000';
  END IF;

  IF jsonb_typeof(p_canary_evidence_envelopes) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_canary_evidence_envelopes) <> 4
     OR (
       SELECT count(DISTINCT envelope ->> 'artifact_key')
       FROM jsonb_array_elements(p_canary_evidence_envelopes) AS items(envelope)
       WHERE envelope ->> 'artifact_type' = 'public_canary'
     ) <> 4
  THEN
    RAISE EXCEPTION 'public release requires exactly four distinct canary evidence envelopes'
      USING ERRCODE = '22023';
  END IF;

  FOR v_canary_no IN 1..4
  LOOP
    SELECT * INTO v_origin
    FROM public.tli_experiment_origin_manifests
    WHERE cycle_id = p_cycle_id
      AND enrollment_role = 'public_canary'
      AND public_canary_no = v_canary_no;
    SELECT origin_date INTO v_origin_date
    FROM public.tli_forecast_origin_manifests
    WHERE id = v_origin.forecast_origin_manifest_id;

    IF v_origin.id IS NULL OR NOT public.tli_origin_is_eligible(v_origin.id) THEN
      RAISE EXCEPTION 'public release requires eligible public_canary_no %', v_canary_no
        USING ERRCODE = '55000';
    END IF;

    SELECT envelope INTO v_envelope
    FROM jsonb_array_elements(p_canary_evidence_envelopes) AS items(envelope)
    WHERE envelope ->> 'artifact_type' = 'public_canary'
      AND envelope ->> 'artifact_key' = to_char(v_origin_date, 'YYYY-MM-DD');

    IF v_envelope IS NULL THEN
      RAISE EXCEPTION 'public release is missing canary evidence for ordinal %', v_canary_no
        USING ERRCODE = '22023';
    END IF;

    v_artifact_id := public.tli_create_evidence_from_envelope(
      p_cycle_id,
      v_origin.id,
      'public_canary',
      to_char(v_origin_date, 'YYYY-MM-DD'),
      v_envelope
    );
    SELECT * INTO v_artifact
    FROM public.tli_evidence_artifacts
    WHERE id = v_artifact_id;

    IF v_artifact.payload ->> 'cycle_id' IS DISTINCT FROM p_cycle_id::text
       OR v_artifact.payload ->> 'experiment_origin_manifest_id' IS DISTINCT FROM v_origin.id::text
       OR (v_artifact.payload ->> 'public_canary_no')::INTEGER IS DISTINCT FROM v_canary_no
       OR COALESCE((v_artifact.payload ->> 'gate_pass')::BOOLEAN, false) IS NOT TRUE
       OR COALESCE((v_artifact.payload ->> 'probability_interval_completeness')::NUMERIC <> 1, true)
       OR COALESCE((v_artifact.payload ->> 'expected_universe_coverage')::NUMERIC NOT BETWEEN 0.70 AND 1, true)
       OR COALESCE((v_artifact.payload ->> 'critical_incident_count')::INTEGER <> 0, true)
       OR COALESCE((v_artifact.payload ->> 'probability_invalid_count')::INTEGER <> 0, true)
       OR COALESCE((v_artifact.payload ->> 'candidate_brier')::NUMERIC NOT BETWEEN 0 AND 0.35, true)
    THEN
      RAISE EXCEPTION 'canary ordinal % does not pass every per-origin public gate', v_canary_no
        USING ERRCODE = '22023';
    END IF;

    IF v_canary_no = 4 THEN
      IF COALESCE((v_artifact.payload ->> 'pooled_fixed_bin_ece')::NUMERIC NOT BETWEEN 0 AND 0.10, true)
         OR COALESCE((v_artifact.payload ->> 'pooled_ece_upper95')::NUMERIC NOT BETWEEN 0 AND 0.12, true)
         OR (v_artifact.payload ->> 'bootstrap_replicates')::INTEGER IS DISTINCT FROM 10000
         OR (v_artifact.payload ->> 'ece_bins')::INTEGER IS DISTINCT FROM 10
         OR (v_artifact.payload ->> 'bootstrap_quantile_type')::INTEGER IS DISTINCT FROM 7
      THEN
        RAISE EXCEPTION 'four-canary pooled ECE gate is not passing'
          USING ERRCODE = '22023';
      END IF;
      v_fourth_sha := v_artifact.content_sha256;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM public.tli_experiment_origin_manifests
    WHERE cycle_id = p_cycle_id
      AND enrollment_role = 'public_canary'
      AND public_canary_no BETWEEN 1 AND 4
  ) <> 4 THEN
    RAISE EXCEPTION 'public release requires public_canary_no 1 through 4 without replacement'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.model_registry
    WHERE experiment_cycle_id = p_cycle_id
      AND model_version = v_cycle.candidate_model_version
      AND status = 'challenger'
      AND scientific_claim_status = 'eligible'
      AND scientific_release_status = 'internal'
      AND gate_result ->> 'model_artifact_sha256' = v_cycle.candidate_model_sha256
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'public release requires the exact eligible internal challenger'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_old_champion
  FROM public.model_registry
  WHERE status = 'champion';

  IF v_old_champion.experiment_cycle_id IS NOT NULL
     AND v_old_champion.experiment_cycle_id IS DISTINCT FROM p_cycle_id
  THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'tli-cycle-v1|' || v_old_champion.experiment_cycle_id::text,
      0
    ));
  END IF;

  SELECT * INTO v_old_champion
  FROM public.model_registry
  WHERE status = 'champion'
  FOR UPDATE;

  PERFORM set_config('tli.cycle_registry_rpc', p_cycle_id::text, true);

  IF v_old_champion.model_version IS NOT NULL THEN
    UPDATE public.model_registry
    SET status = 'archived',
        scientific_release_status = 'blocked',
        scientific_claim_reason = 'superseded_by_validated_cycle'
    WHERE model_version = v_old_champion.model_version;

    INSERT INTO public.tli_model_release_events (
      model_registry_id, cycle_id, from_status, to_status, reason_code, evidence_sha256
    )
    VALUES (
      v_old_champion.experiment_cycle_id,
      p_cycle_id,
      'champion',
      'archived',
      'superseded_by_validated_cycle',
      v_fourth_sha
    );
  END IF;

  UPDATE public.model_registry
  SET status = 'champion',
      scientific_claim_status = 'eligible',
      scientific_release_status = 'public',
      scientific_claim_reason = 'validated_public_release',
      promoted_at = clock_timestamp()
  WHERE experiment_cycle_id = p_cycle_id
    AND model_version = v_cycle.candidate_model_version;

  INSERT INTO public.tli_model_release_events (
    model_registry_id, cycle_id, from_status, to_status, reason_code, evidence_sha256
  )
  VALUES (
    p_cycle_id, p_cycle_id, 'challenger', 'champion',
    'validated_public_release', v_fourth_sha
  );

  PERFORM set_config('tli.cycle_rpc', p_cycle_id::text, true);
  UPDATE public.tli_experiment_cycles
  SET status = 'public_approved',
      public_approved_at = clock_timestamp()
  WHERE id = p_cycle_id;

  RETURN p_cycle_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.hold_tli_public_release(
  p_cycle_id UUID,
  p_release_event_id UUID,
  p_reason_code TEXT,
  p_evidence_envelope JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_artifact_id UUID;
  v_artifact public.tli_evidence_artifacts%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-cycle-v1|' || p_cycle_id::text, 0));

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;

  IF NOT FOUND OR v_cycle.status <> 'public_approved' OR v_cycle.public_approved_at IS NULL THEN
    RAISE EXCEPTION 'monitoring hold requires a public_approved cycle'
      USING ERRCODE = '55000';
  END IF;
  IF p_reason_code IS NULL
     OR p_reason_code !~ '^[a-z][a-z0-9_]{0,63}$'
  THEN
    RAISE EXCEPTION 'monitoring hold reason must be a canonical nonempty reason code'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.model_registry
    WHERE experiment_cycle_id = p_cycle_id
      AND model_version = v_cycle.candidate_model_version
      AND status = 'champion'
      AND scientific_claim_status = 'eligible'
      AND scientific_release_status = 'public'
      AND gate_result ->> 'model_artifact_sha256' = v_cycle.candidate_model_sha256
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'monitoring hold requires the exact public champion'
      USING ERRCODE = '55000';
  END IF;

  v_artifact_id := public.tli_create_evidence_from_envelope(
    p_cycle_id,
    NULL,
    'monitoring_hold',
    p_release_event_id::text,
    p_evidence_envelope
  );
  SELECT * INTO v_artifact
  FROM public.tli_evidence_artifacts
  WHERE id = v_artifact_id;

  IF v_artifact.payload ->> 'cycle_id' IS DISTINCT FROM p_cycle_id::text
     OR v_artifact.payload ->> 'release_event_id' IS DISTINCT FROM p_release_event_id::text
     OR v_artifact.payload ->> 'model_version' IS DISTINCT FROM v_cycle.candidate_model_version
     OR v_artifact.payload ->> 'model_artifact_sha256' IS DISTINCT FROM v_cycle.candidate_model_sha256
     OR v_artifact.payload ->> 'reason_code' IS DISTINCT FROM p_reason_code
  THEN
    RAISE EXCEPTION 'monitoring hold evidence does not match the public champion and cause'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('tli.cycle_registry_rpc', p_cycle_id::text, true);
  UPDATE public.model_registry
  SET scientific_release_status = 'blocked',
      scientific_claim_reason = 'monitoring_hold:' || p_reason_code
  WHERE experiment_cycle_id = p_cycle_id;

  INSERT INTO public.tli_model_release_events (
    id, model_registry_id, cycle_id, from_status, to_status, reason_code, evidence_sha256
  )
  VALUES (
    p_release_event_id, p_cycle_id, p_cycle_id, 'champion', 'champion',
    p_reason_code, v_artifact.content_sha256
  );

  RETURN p_release_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_tli_public_release(
  p_cycle_id UUID,
  p_release_event_id UUID,
  p_hold_reason_code TEXT,
  p_evidence_envelope JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_artifact_id UUID;
  v_artifact public.tli_evidence_artifacts%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-cycle-v1|' || p_cycle_id::text, 0));

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;

  IF NOT FOUND OR v_cycle.status <> 'public_approved' THEN
    RAISE EXCEPTION 'monitoring resume requires a public_approved cycle'
      USING ERRCODE = '55000';
  END IF;
  IF p_hold_reason_code IS NULL
     OR p_hold_reason_code NOT IN ('source_outage','serving_incident','monitoring_data_delay')
  THEN
    RAISE EXCEPTION 'monitoring resume reason is not the held transient allowlisted cause'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.model_registry
    WHERE experiment_cycle_id = p_cycle_id
      AND model_version = v_cycle.candidate_model_version
      AND status = 'champion'
      AND scientific_claim_status = 'eligible'
      AND scientific_release_status = 'blocked'
      AND scientific_claim_reason = 'monitoring_hold:' || p_hold_reason_code
      AND gate_result ->> 'model_artifact_sha256' = v_cycle.candidate_model_sha256
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'monitoring resume must match the held cycle, model, hash, and transient cause'
      USING ERRCODE = '55000';
  END IF;

  v_artifact_id := public.tli_create_evidence_from_envelope(
    p_cycle_id,
    NULL,
    'monitoring_resume',
    p_release_event_id::text,
    p_evidence_envelope
  );
  SELECT * INTO v_artifact
  FROM public.tli_evidence_artifacts
  WHERE id = v_artifact_id;

  IF v_artifact.payload ->> 'cycle_id' IS DISTINCT FROM p_cycle_id::text
     OR v_artifact.payload ->> 'release_event_id' IS DISTINCT FROM p_release_event_id::text
     OR v_artifact.payload ->> 'model_version' IS DISTINCT FROM v_cycle.candidate_model_version
     OR v_artifact.payload ->> 'model_artifact_sha256' IS DISTINCT FROM v_cycle.candidate_model_sha256
     OR v_artifact.payload ->> 'hold_reason_code' IS DISTINCT FROM p_hold_reason_code
     OR COALESCE((v_artifact.payload ->> 'verified_resolved')::BOOLEAN, false) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'monitoring resume evidence does not verify the exact held cause'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('tli.cycle_registry_rpc', p_cycle_id::text, true);
  UPDATE public.model_registry
  SET scientific_release_status = 'public',
      scientific_claim_reason = 'monitoring_resume_verified'
  WHERE experiment_cycle_id = p_cycle_id;

  INSERT INTO public.tli_model_release_events (
    id, model_registry_id, cycle_id, from_status, to_status, reason_code, evidence_sha256
  )
  VALUES (
    p_release_event_id, p_cycle_id, p_cycle_id, 'champion', 'champion',
    'monitoring_resume_verified', v_artifact.content_sha256
  );

  RETURN p_release_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.attest_tli_origin(
  p_cycle_id UUID,
  p_origin_manifest_id UUID,
  p_evidence_envelope JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_origin public.tli_experiment_origin_manifests%ROWTYPE;
  v_study_origin public.tli_study_origin_manifests%ROWTYPE;
  v_forecast public.tli_forecast_origin_manifests%ROWTYPE;
  v_artifact_id UUID;
  v_payload JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-cycle-v1|' || p_cycle_id::text, 0));

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;
  SELECT * INTO v_origin
  FROM public.tli_experiment_origin_manifests
  WHERE id = p_origin_manifest_id;

  IF v_cycle.id IS NULL
     OR v_origin.id IS NULL
     OR v_origin.cycle_id IS DISTINCT FROM p_cycle_id
     OR NOT (
       (v_cycle.status = 'running' AND v_origin.enrollment_role IN ('confirmatory','predecision_diagnostic'))
       OR (v_cycle.status = 'promoted_internal' AND v_origin.enrollment_role IN ('public_canary','prepublic_diagnostic'))
       OR (
         v_cycle.status = 'public_approved'
         AND v_origin.enrollment_role = 'monitoring'
         AND EXISTS (
           SELECT 1
           FROM public.model_registry AS registry
           WHERE registry.experiment_cycle_id = v_cycle.id
             AND registry.model_version = v_cycle.candidate_model_version
             AND registry.status = 'champion'
             AND registry.scientific_claim_status = 'eligible'
             AND registry.scientific_release_status IN ('public','blocked')
             AND registry.gate_result ->> 'model_artifact_sha256' = v_cycle.candidate_model_sha256
         )
       )
     )
  THEN
    RAISE EXCEPTION 'origin attestation does not match the active cycle enrollment state'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_study_origin
  FROM public.tli_study_origin_manifests
  WHERE id = v_origin.study_origin_manifest_id;
  SELECT * INTO v_forecast
  FROM public.tli_forecast_origin_manifests
  WHERE id = v_origin.forecast_origin_manifest_id;

  v_artifact_id := public.tli_create_evidence_from_envelope(
    p_cycle_id,
    p_origin_manifest_id,
    'origin_manifest',
    to_char(v_forecast.origin_date, 'YYYY-MM-DD'),
    p_evidence_envelope
  );

  SELECT payload INTO v_payload
  FROM public.tli_evidence_artifacts
  WHERE id = v_artifact_id;

  IF v_payload ->> 'manifest_version' IS DISTINCT FROM 'origin-manifest-v1'
     OR v_payload ->> 'experiment_origin_manifest_id' IS DISTINCT FROM v_origin.id::text
     OR v_payload ->> 'cycle_id' IS DISTINCT FROM v_cycle.id::text
     OR v_payload ->> 'study_origin_manifest_id' IS DISTINCT FROM v_study_origin.id::text
     OR v_payload ->> 'forecast_origin_manifest_id' IS DISTINCT FROM v_forecast.id::text
     OR v_payload ->> 'study_contract_id' IS DISTINCT FROM v_cycle.study_contract_id::text
     OR v_payload ->> 'study_contract_sha256' IS DISTINCT FROM v_cycle.study_contract_sha256
     OR v_payload ->> 'enrollment_role' IS DISTINCT FROM v_origin.enrollment_role
     OR (v_payload ->> 'sequence_no')::INTEGER IS DISTINCT FROM v_origin.sequence_no
     OR (
       v_origin.public_canary_no IS NULL
       AND v_payload -> 'public_canary_no' IS DISTINCT FROM 'null'::JSONB
     )
     OR (
       v_origin.public_canary_no IS NOT NULL
       AND (v_payload ->> 'public_canary_no')::INTEGER IS DISTINCT FROM v_origin.public_canary_no::INTEGER
     )
     OR v_payload ->> 'origin_date' IS DISTINCT FROM to_char(v_forecast.origin_date, 'YYYY-MM-DD')
     OR NOT isfinite(v_forecast.forecast_cutoff)
     OR v_payload ->> 'forecast_cutoff' IS DISTINCT FROM to_char(
       v_forecast.forecast_cutoff AT TIME ZONE 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
     )
     OR v_payload ->> 'expected_universe_sha256' IS DISTINCT FROM v_forecast.expected_universe_sha256
     OR v_payload ->> 'keyword_group_manifest_sha256' IS DISTINCT FROM v_forecast.keyword_group_manifest_sha256
     OR v_payload ->> 'forecast_payload_sha256' IS DISTINCT FROM v_forecast.payload_sha256
     OR v_payload ->> 'study_origin_payload_sha256' IS DISTINCT FROM v_study_origin.payload_sha256
     OR v_payload ->> 'candidate_model_sha256' IS DISTINCT FROM v_origin.candidate_model_sha256
     OR v_payload ->> 'comparator_artifact_sha256' IS DISTINCT FROM v_origin.comparator_artifact_sha256
     OR v_payload ->> 'kospi_base_trade_date' IS DISTINCT FROM to_char(v_origin.kospi_base_trade_date, 'YYYY-MM-DD')
     OR (v_payload ->> 'kospi_base_close')::NUMERIC IS DISTINCT FROM v_origin.kospi_base_close
     OR v_payload ->> 'kospi_lookback_trade_date' IS DISTINCT FROM to_char(v_origin.kospi_lookback_trade_date, 'YYYY-MM-DD')
     OR (v_payload ->> 'kospi_lookback_close')::NUMERIC IS DISTINCT FROM v_origin.kospi_lookback_close
     OR v_payload -> 'kospi_source_ids' IS DISTINCT FROM v_origin.kospi_source_ids
     OR v_payload ->> 'kospi_input_sha256' IS DISTINCT FROM v_origin.kospi_input_sha256
     OR v_payload ->> 'regime' IS DISTINCT FROM v_origin.regime
  THEN
    RAISE EXCEPTION 'origin artifact payload does not match the enrolled DB provenance'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_artifact_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enroll_tli_origin(
  p_cycle_id UUID,
  p_study_origin_manifest_id UUID,
  p_forecast_origin_manifest_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_study_origin public.tli_study_origin_manifests%ROWTYPE;
  v_forecast public.tli_forecast_origin_manifests%ROWTYPE;
  v_sequence INTEGER;
  v_role TEXT;
  v_canary SMALLINT;
  v_canary_count INTEGER;
  v_effective_end DATE;
  v_latest_origin_date DATE;
  v_base_trade_date DATE;
  v_base_close NUMERIC;
  v_base_source TEXT;
  v_lookback_trade_date DATE;
  v_lookback_close NUMERIC;
  v_lookback_source TEXT;
  v_source_ids TEXT[];
  v_input_values TEXT[];
  v_source_ids_json JSONB;
  v_input_sha TEXT;
  v_return NUMERIC;
  v_regime TEXT;
  v_origin_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-cycle-v1|' || p_cycle_id::text, 0));

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;

  IF NOT FOUND OR v_cycle.status NOT IN ('running','promoted_internal','public_approved') THEN
    RAISE EXCEPTION 'origin enrollment is forbidden for this cycle status'
      USING ERRCODE = '55000';
  END IF;

  IF v_cycle.status = 'public_approved'
     AND NOT EXISTS (
       SELECT 1
       FROM public.model_registry AS registry
       WHERE registry.experiment_cycle_id = v_cycle.id
         AND registry.model_version = v_cycle.candidate_model_version
         AND registry.status = 'champion'
         AND registry.scientific_claim_status = 'eligible'
         AND registry.scientific_release_status IN ('public','blocked')
         AND registry.gate_result ->> 'model_artifact_sha256' = v_cycle.candidate_model_sha256
     )
  THEN
    RAISE EXCEPTION 'monitoring enrollment requires the current exact public champion'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tli_experiment_origin_manifests
    WHERE cycle_id = p_cycle_id
      AND (
        study_origin_manifest_id = p_study_origin_manifest_id
        OR forecast_origin_manifest_id = p_forecast_origin_manifest_id
      )
  ) THEN
    RAISE EXCEPTION 'same cycle origin is already enrolled'
      USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_study_origin
  FROM public.tli_study_origin_manifests
  WHERE id = p_study_origin_manifest_id;
  SELECT * INTO v_forecast
  FROM public.tli_forecast_origin_manifests
  WHERE id = p_forecast_origin_manifest_id;

  IF v_study_origin.id IS NULL
     OR v_forecast.id IS NULL
     OR v_study_origin.study_contract_id IS DISTINCT FROM v_cycle.study_contract_id
     OR v_study_origin.forecast_origin_manifest_id IS DISTINCT FROM v_forecast.id
     OR NOT EXISTS (
       SELECT 1
       FROM public.tli_attention_study_contracts
       WHERE id = v_study_origin.study_contract_id
         AND payload_sha256 = v_cycle.study_contract_sha256
     )
  THEN
    RAISE EXCEPTION 'enrolled study origin, forecast foundation, and cycle study must match exactly'
      USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(max(calendar_extension.new_end), v_cycle.initial_calendar_end)
  INTO v_effective_end
  FROM public.tli_cycle_calendar_extensions AS calendar_extension
  WHERE calendar_extension.cycle_id = p_cycle_id;

  IF v_cycle.status = 'running'
     AND (
       v_forecast.origin_date < v_cycle.calendar_start
       OR v_forecast.origin_date > v_effective_end
       OR v_forecast.forecast_cutoff <= v_cycle.running_at
     )
  THEN
    RAISE EXCEPTION 'running enrollment requires a prospective foundation inside the effective calendar'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(sequence_no), 0) + 1,
         max(forecast.origin_date)
  INTO v_sequence, v_latest_origin_date
  FROM public.tli_experiment_origin_manifests AS enrolled
  JOIN public.tli_forecast_origin_manifests AS forecast
    ON forecast.id = enrolled.forecast_origin_manifest_id
  WHERE enrolled.cycle_id = p_cycle_id;

  IF v_latest_origin_date IS NOT NULL AND v_forecast.origin_date <= v_latest_origin_date THEN
    RAISE EXCEPTION 'origin enrollment dates must be strictly increasing'
      USING ERRCODE = '22023';
  END IF;

  v_canary_count := (
    SELECT count(*)
    FROM public.tli_experiment_origin_manifests
    WHERE cycle_id = p_cycle_id
      AND enrollment_role = 'public_canary'
  );

  v_role := CASE
    WHEN v_cycle.status = 'running'
      THEN CASE WHEN v_sequence <= v_cycle.planned_origins THEN 'confirmatory' ELSE 'predecision_diagnostic' END
    WHEN v_cycle.status = 'promoted_internal'
      THEN CASE WHEN v_canary_count < 4 THEN 'public_canary' ELSE 'prepublic_diagnostic' END
    WHEN v_cycle.status = 'public_approved'
      THEN 'monitoring'
  END;

  IF v_cycle.status = 'promoted_internal' THEN
    IF v_forecast.forecast_cutoff <= v_cycle.promoted_internal_at THEN
      RAISE EXCEPTION 'public canary and prepublic origins must be after internal promotion'
        USING ERRCODE = '22023';
    END IF;
    IF v_canary_count < 4 THEN
      v_canary := (v_canary_count + 1)::SMALLINT;
    END IF;
  ELSIF v_cycle.status = 'public_approved'
        AND v_forecast.forecast_cutoff <= v_cycle.public_approved_at
  THEN
    RAISE EXCEPTION 'monitoring origins must be after public approval'
      USING ERRCODE = '22023';
  END IF;

  SELECT trade_date, close, source
  INTO v_base_trade_date, v_base_close, v_base_source
  FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI'
    AND trade_date <= v_forecast.origin_date
    AND created_at <= v_forecast.forecast_cutoff
  ORDER BY trade_date DESC
  LIMIT 1;

  IF v_base_trade_date IS NULL OR v_base_trade_date IS DISTINCT FROM v_forecast.origin_date THEN
    RAISE EXCEPTION 'enrollment requires a tradable Monday KOSPI base close at the forecast cutoff'
      USING ERRCODE = '55000';
  END IF;

  SELECT trade_date, close, source
  INTO v_lookback_trade_date, v_lookback_close, v_lookback_source
  FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI'
    AND trade_date <= v_base_trade_date
    AND created_at <= v_forecast.forecast_cutoff
  ORDER BY trade_date DESC
  OFFSET 20
  LIMIT 1;

  IF v_lookback_trade_date IS NULL THEN
    RAISE EXCEPTION 'KOSPI 20-trading-day lookback is unavailable at the forecast cutoff'
      USING ERRCODE = '55000';
  END IF;

  IF v_base_close IS NULL
     OR v_lookback_close IS NULL
     OR v_base_close::text IN ('NaN','Infinity','-Infinity')
     OR v_lookback_close::text IN ('NaN','Infinity','-Infinity')
  THEN
    RAISE EXCEPTION 'KOSPI provenance closes must be finite positive numbers'
      USING ERRCODE = '22023';
  END IF;

  v_source_ids := ARRAY[
    'KOSPI|' || to_char(v_base_trade_date, 'YYYY-MM-DD') || '|' || v_base_source,
    'KOSPI|' || to_char(v_lookback_trade_date, 'YYYY-MM-DD') || '|' || v_lookback_source
  ];
  v_source_ids_json := to_jsonb(v_source_ids);
  v_input_values := ARRAY[
    v_source_ids[1] || '|' || v_base_close::text,
    v_source_ids[2] || '|' || v_lookback_close::text
  ];
  v_input_sha := public.tli_sha256_ordered_json_string_array(v_input_values);
  v_return := (v_base_close / v_lookback_close) - 1;
  v_regime := CASE
    WHEN v_return <= -0.03 THEN 'risk_off'
    WHEN v_return >= 0.03 THEN 'risk_on'
    ELSE 'neutral'
  END;

  INSERT INTO public.tli_experiment_origin_manifests (
    cycle_id,
    study_origin_manifest_id,
    forecast_origin_manifest_id,
    sequence_no,
    enrollment_role,
    public_canary_no,
    candidate_model_sha256,
    comparator_artifact_sha256,
    kospi_base_trade_date,
    kospi_base_close,
    kospi_lookback_trade_date,
    kospi_lookback_close,
    kospi_source_ids,
    kospi_input_sha256,
    regime
  )
  VALUES (
    p_cycle_id,
    p_study_origin_manifest_id,
    p_forecast_origin_manifest_id,
    v_sequence,
    v_role,
    v_canary,
    v_cycle.candidate_model_sha256,
    v_cycle.comparator_artifact_sha256,
    v_base_trade_date,
    v_base_close,
    v_lookback_trade_date,
    v_lookback_close,
    v_source_ids_json,
    v_input_sha,
    v_regime
  )
  RETURNING id INTO v_origin_id;

  RETURN v_origin_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_tli_cycle_calendar(
  p_cycle_id UUID,
  p_previous_end DATE,
  p_new_end DATE,
  p_reason_code TEXT,
  p_evidence_envelope JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_effective_end DATE;
  v_artifact_id UUID;
  v_artifact public.tli_evidence_artifacts%ROWTYPE;
  v_extension_id UUID;
  v_cycle_manifest_sha TEXT;
  v_model_manifest_sha TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-cycle-v1|' || p_cycle_id::text, 0));

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_cycle.status <> 'running'
     OR v_cycle.decision_at IS NOT NULL
     OR public.tli_sequence_range_is_eligible(p_cycle_id, v_cycle.planned_origins)
  THEN
    RAISE EXCEPTION 'calendar extension requires an undecided running cycle before all planned origins are eligible'
      USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(max(new_end), v_cycle.initial_calendar_end)
  INTO v_effective_end
  FROM public.tli_cycle_calendar_extensions
  WHERE cycle_id = p_cycle_id;

  SELECT
    max(artifact.content_sha256) FILTER (WHERE artifact.artifact_type = 'cycle_manifest'),
    max(artifact.content_sha256) FILTER (WHERE artifact.artifact_type = 'model_manifest')
  INTO v_cycle_manifest_sha, v_model_manifest_sha
  FROM public.tli_evidence_artifacts AS artifact
  JOIN public.tli_evidence_attestations AS attestation
    ON attestation.artifact_id = artifact.id
   AND attestation.content_sha256 = artifact.content_sha256
  WHERE artifact.cycle_id = p_cycle_id
    AND artifact.artifact_key = 'singleton'
    AND artifact.artifact_type IN ('cycle_manifest','model_manifest');

  IF v_cycle_manifest_sha IS NULL OR v_model_manifest_sha IS NULL THEN
    RAISE EXCEPTION 'calendar extension requires the attested frozen manifest bundle'
      USING ERRCODE = '55000';
  END IF;

  IF p_previous_end IS DISTINCT FROM v_effective_end
     OR p_new_end <= p_previous_end
     OR p_reason_code NOT IN ('source_maturity_delay','market_calendar_delay','operational_outage')
  THEN
    RAISE EXCEPTION 'calendar extension previous end, new end, or reason is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_artifact_id := public.tli_create_evidence_from_envelope(
    p_cycle_id,
    NULL,
    'calendar_extension',
    to_char(p_new_end, 'YYYY-MM-DD'),
    p_evidence_envelope
  );
  SELECT * INTO v_artifact
  FROM public.tli_evidence_artifacts
  WHERE id = v_artifact_id;

  IF v_artifact.payload ->> 'cycle_id' IS DISTINCT FROM p_cycle_id::text
     OR v_artifact.payload ->> 'previous_end' IS DISTINCT FROM to_char(p_previous_end, 'YYYY-MM-DD')
     OR v_artifact.payload ->> 'new_end' IS DISTINCT FROM to_char(p_new_end, 'YYYY-MM-DD')
     OR v_artifact.payload ->> 'reason_code' IS DISTINCT FROM p_reason_code
     OR (v_artifact.payload ->> 'planned_origins')::INTEGER IS DISTINCT FROM v_cycle.planned_origins
     OR v_artifact.payload ->> 'study_contract_sha256' IS DISTINCT FROM v_cycle.study_contract_sha256
     OR v_artifact.payload ->> 'candidate_model_sha256' IS DISTINCT FROM v_cycle.candidate_model_sha256
     OR v_artifact.payload ->> 'comparator_artifact_sha256' IS DISTINCT FROM v_cycle.comparator_artifact_sha256
     OR v_artifact.payload ->> 'dataset_manifest_sha256' IS DISTINCT FROM v_cycle.dataset_manifest_sha256
     OR v_artifact.payload ->> 'feature_contract_sha256' IS DISTINCT FROM v_cycle.feature_contract_sha256
     OR v_artifact.payload ->> 'label_contract_sha256' IS DISTINCT FROM v_cycle.label_contract_sha256
     OR v_artifact.payload ->> 'calibration_artifact_sha256' IS DISTINCT FROM v_cycle.calibration_artifact_sha256
     OR v_artifact.payload ->> 'babl_contract_sha256' IS DISTINCT FROM v_cycle.babl_contract_sha256
     OR v_artifact.payload ->> 'power_simulation_sha256' IS DISTINCT FROM v_cycle.power_simulation_sha256
     OR v_artifact.payload ->> 'preregistration_sha256' IS DISTINCT FROM v_cycle.preregistration_sha256
     OR v_artifact.payload ->> 'cycle_manifest_sha256' IS DISTINCT FROM v_cycle_manifest_sha
     OR v_artifact.payload ->> 'model_manifest_sha256' IS DISTINCT FROM v_model_manifest_sha
  THEN
    RAISE EXCEPTION 'calendar extension evidence changes the frozen planned count or hash bundle'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tli_cycle_calendar_extensions (
    cycle_id,
    previous_end,
    new_end,
    reason_code,
    evidence_artifact_id,
    evidence_sha256
  )
  VALUES (
    p_cycle_id,
    p_previous_end,
    p_new_end,
    p_reason_code,
    v_artifact_id,
    v_artifact.content_sha256
  )
  RETURNING id INTO v_extension_id;

  RETURN v_extension_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_tli_scientific_prediction_score(
  p_score_canonical_json TEXT,
  p_score_payload_sha256 TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_payload JSONB;
  v_prediction public.theme_predictions_v3%ROWTYPE;
  v_origin public.tli_experiment_origin_manifests%ROWTYPE;
  v_label public.theme_labels%ROWTYPE;
  v_prediction_id UUID;
  v_label_id UUID;
  v_score_status TEXT;
  v_exclusion_reason TEXT;
  v_scored_at TIMESTAMPTZ;
BEGIN
  v_payload := public.tli_require_canonical_json_v1(
    p_score_canonical_json,
    p_score_payload_sha256
  );

  IF public.tli_jsonb_object_key_count(v_payload) <> 5
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(v_payload) AS payload_key(key)
       WHERE payload_key.key NOT IN (
         'prediction_id','actual_label_id','score_status','score_exclusion_reason','scored_at'
       )
     )
  THEN
    RAISE EXCEPTION 'scientific score payload has unknown or missing fields'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_prediction_id := (v_payload ->> 'prediction_id')::UUID;
    v_label_id := (v_payload ->> 'actual_label_id')::UUID;
    v_score_status := v_payload ->> 'score_status';
    v_exclusion_reason := v_payload ->> 'score_exclusion_reason';
    v_scored_at := (v_payload ->> 'scored_at')::TIMESTAMPTZ;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'scientific score payload contains malformed typed values'
      USING ERRCODE = '22023';
  END;

  IF v_payload ->> 'prediction_id' IS DISTINCT FROM v_prediction_id::text
     OR v_payload ->> 'actual_label_id' IS DISTINCT FROM v_label_id::text
     OR v_score_status NOT IN ('scored','excluded')
     OR v_scored_at IS NULL
     OR NOT isfinite(v_scored_at)
     OR v_payload ->> 'scored_at' IS DISTINCT FROM to_char(
       v_scored_at AT TIME ZONE 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
     )
  THEN
    RAISE EXCEPTION 'scientific score identity and terminal status must be canonical'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_prediction
  FROM public.theme_predictions_v3
  WHERE id = v_prediction_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_prediction.experiment_cycle_id IS NULL
     OR v_prediction.experiment_origin_manifest_id IS NULL
     OR v_prediction.scientific_prediction_role IS NULL
     OR v_prediction.score_status <> 'pending'
  THEN
    RAISE EXCEPTION 'scientific prediction is missing, legacy, or already terminal'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_origin
  FROM public.tli_experiment_origin_manifests
  WHERE id = v_prediction.experiment_origin_manifest_id
    AND cycle_id = v_prediction.experiment_cycle_id;
  SELECT * INTO v_label
  FROM public.theme_labels
  WHERE id = v_label_id
    AND labeler_version = 'gta-v2'
  FOR UPDATE;

  IF v_origin.id IS NULL
     OR v_label.id IS NULL
     OR v_label.theme_id IS DISTINCT FROM v_prediction.theme_id
     OR v_label.base_date IS DISTINCT FROM v_prediction.prediction_date
     OR v_label.horizon_days IS DISTINCT FROM v_prediction.horizon_days
     OR v_label.labeler_version IS DISTINCT FROM v_prediction.labeler_version
     OR v_label.labeler_version <> 'gta-v2'
     OR v_label.label_type <> 'gt_a'
     OR v_label.forecast_origin_manifest_id IS DISTINCT FROM v_origin.forecast_origin_manifest_id
     OR NOT EXISTS (
       SELECT 1
       FROM public.theme_predictions_v3 AS counterpart
       WHERE counterpart.experiment_cycle_id = v_prediction.experiment_cycle_id
         AND counterpart.experiment_origin_manifest_id = v_prediction.experiment_origin_manifest_id
         AND counterpart.theme_id = v_prediction.theme_id
         AND counterpart.prediction_date = v_prediction.prediction_date
         AND counterpart.horizon_days = v_prediction.horizon_days
         AND counterpart.labeler_version = v_prediction.labeler_version
         AND counterpart.scientific_prediction_role = CASE
           WHEN v_prediction.scientific_prediction_role = 'candidate' THEN 'comparator'
           ELSE 'candidate'
         END
     )
  THEN
    RAISE EXCEPTION 'prediction foundation does not match the exact label foundation'
      USING ERRCODE = '23503';
  END IF;

  IF v_label.finalized_at IS NULL
     OR v_scored_at < v_label.finalized_at
     OR v_scored_at > clock_timestamp()
  THEN
    RAISE EXCEPTION 'scientific scoring time must be after exact label finalization and not in the future'
      USING ERRCODE = '22023';
  END IF;

  IF v_score_status = 'scored' THEN
    IF v_label.label_status <> 'final'
       OR v_label.scientific_use_status <> 'confirmatory_eligible'
       OR v_label.g_log_ratio IS NULL
       OR v_label.g_log_ratio::text IN ('NaN','Infinity','-Infinity')
       OR v_label.y_binary IS NULL
       OR v_exclusion_reason IS NOT NULL
    THEN
      RAISE EXCEPTION 'scored scientific prediction requires an exact final gta-v2 label'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_label.label_status <> 'excluded'
       OR v_label.exclude_reason IS NULL
       OR v_exclusion_reason IS DISTINCT FROM v_label.exclude_reason
    THEN
      RAISE EXCEPTION 'excluded scientific prediction requires the exact terminal excluded label reason'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM set_config('tli.finalize_scientific_prediction_id', v_prediction_id::text, true);
  UPDATE public.theme_predictions_v3
  SET score_status = v_score_status,
      actual_g = CASE WHEN v_score_status = 'scored' THEN v_label.g_log_ratio ELSE NULL END,
      actual_y = CASE WHEN v_score_status = 'scored' THEN v_label.y_binary ELSE NULL END,
      actual_label_id = v_label.id,
      score_payload_sha256 = p_score_payload_sha256,
      score_exclusion_reason = CASE WHEN v_score_status = 'excluded' THEN v_exclusion_reason ELSE NULL END,
      scored_at = v_scored_at
  WHERE id = v_prediction_id;

  RETURN v_prediction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.freeze_tli_cycle(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.freeze_tli_cycle(UUID, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.start_tli_cycle(UUID, TEXT, JSONB, DATE, DATE, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_tli_cycle(UUID, TEXT, JSONB, DATE, DATE, JSONB, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_tli_safety_decision(UUID, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tli_safety_decision(UUID, BOOLEAN, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_tli_final_decision(UUID, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tli_final_decision(UUID, BOOLEAN, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.promote_tli_internal(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_tli_internal(UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_tli_canary_failure(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tli_canary_failure(UUID, UUID, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.release_tli_public(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_tli_public(UUID, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.hold_tli_public_release(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_tli_public_release(UUID, UUID, TEXT, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.resume_tli_public_release(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_tli_public_release(UUID, UUID, TEXT, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.attest_tli_origin(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attest_tli_origin(UUID, UUID, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.enroll_tli_origin(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_tli_origin(UUID, UUID, UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION public.extend_tli_cycle_calendar(UUID, DATE, DATE, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_tli_cycle_calendar(UUID, DATE, DATE, TEXT, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_tli_scientific_prediction_score(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_tli_scientific_prediction_score(TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.tli_create_evidence_from_envelope(UUID, UUID, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.tli_origin_is_eligible(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.tli_sequence_range_is_eligible(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.tli_artifact_is_attested(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.tli_utf16_sort_key_v1(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.tli_canonical_number_v1(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.tli_render_canonical_json_v1(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.tli_require_canonical_json_v1(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
