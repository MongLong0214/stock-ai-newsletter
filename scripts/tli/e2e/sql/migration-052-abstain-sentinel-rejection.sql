DO $validator_matrix$
DECLARE
  v_case RECORD;
BEGIN
  PERFORM public.tli_assert_scientific_prediction_sentinel(TRUE, NULL, NULL, NULL);
  PERFORM public.tli_assert_scientific_prediction_sentinel(FALSE, 0, 0, 0);
  PERFORM public.tli_assert_scientific_prediction_sentinel(FALSE, 1, 1, 1);
  PERFORM public.tli_assert_scientific_prediction_sentinel(FALSE, 0.5, 0, 1);

  FOR v_case IN
    SELECT *
    FROM (VALUES
      ('null-abstain', NULL::BOOLEAN, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
      ('abstain-p-rise', TRUE, 0.5, NULL, NULL),
      ('abstain-ci-lower', TRUE, NULL, 0.25, NULL),
      ('abstain-ci-upper', TRUE, NULL, NULL, 0.75),
      ('non-abstain-null-p-rise', FALSE, NULL, 0, 1),
      ('non-abstain-null-ci-lower', FALSE, 0.5, NULL, 1),
      ('non-abstain-null-ci-upper', FALSE, 0.5, 0, NULL),
      ('non-abstain-nan', FALSE, 'NaN'::NUMERIC, 0, 1),
      ('non-abstain-positive-infinity', FALSE, 'Infinity'::NUMERIC, 0, 1),
      ('non-abstain-negative-infinity', FALSE, '-Infinity'::NUMERIC, 0, 1),
      ('non-abstain-reversed', FALSE, 0.5, 0.75, 0.25),
      ('non-abstain-p-below-interval', FALSE, 0.1, 0.2, 0.8),
      ('non-abstain-p-above-interval', FALSE, 0.9, 0.2, 0.8),
      ('non-abstain-lower-out-of-range', FALSE, 0.5, -0.1, 0.8),
      ('non-abstain-upper-out-of-range', FALSE, 0.5, 0.2, 1.1)
    ) AS invalid_case(name, abstain, p_rise, ci_lower, ci_upper)
  LOOP
    BEGIN
      PERFORM public.tli_assert_scientific_prediction_sentinel(
        v_case.abstain,
        v_case.p_rise,
        v_case.ci_lower,
        v_case.ci_upper
      );
      RAISE EXCEPTION 'migration 052 invalid validator case unexpectedly succeeded: %', v_case.name
        USING ERRCODE = '55000';
    EXCEPTION
      WHEN SQLSTATE '23514' THEN NULL;
    END;
  END LOOP;
END;
$validator_matrix$;

INSERT INTO public.themes (id, name)
VALUES ('52000000-0000-4000-8000-000000000021', 'migration-052-legacy-sentinel-rehearsal');

INSERT INTO public.theme_predictions_v3 (
  id,
  theme_id,
  prediction_date,
  serving_role,
  p_rise,
  ci_lower,
  ci_upper,
  abstain,
  abstain_reasons,
  features,
  model_version,
  labeler_version,
  param_version
) VALUES (
  '52000000-0000-4000-8000-000000000022',
  '52000000-0000-4000-8000-000000000021',
  DATE '2026-07-06',
  'shadow',
  0.5,
  0.25,
  0.75,
  TRUE,
  ARRAY['legacy-cycle-null-remains-unchanged'],
  '{}'::JSONB,
  'migration-052-legacy',
  'legacy-v1',
  'legacy-v1'
);

DELETE FROM public.theme_predictions_v3
WHERE id = '52000000-0000-4000-8000-000000000022';
DELETE FROM public.themes
WHERE id = '52000000-0000-4000-8000-000000000021';

DO $insert_rejection$
BEGIN
  INSERT INTO public.theme_predictions_v3 (
    id,
    theme_id,
    prediction_date,
    serving_role,
    p_rise,
    ci_lower,
    ci_upper,
    abstain,
    abstain_reasons,
    features,
    model_version,
    labeler_version,
    param_version,
    experiment_cycle_id,
    experiment_origin_manifest_id,
    scientific_prediction_role,
    model_artifact_sha256,
    feature_contract_hash,
    feature_snapshot_hash,
    forecast_cutoff,
    forecast_origin_week
  ) VALUES (
    '52000000-0000-4000-8000-000000000011',
    '52000000-0000-4000-8000-000000000012',
    DATE '2026-07-06',
    'shadow',
    0.5,
    0.25,
    0.75,
    TRUE,
    ARRAY['r5-direct-insert-bypass'],
    '{}'::JSONB,
    'migration-052-insert-candidate',
    'gta-v2',
    'migration-052-rehearsal-v1',
    '52000000-0000-4000-8000-000000000013',
    '52000000-0000-4000-8000-000000000014',
    'candidate',
    repeat('d', 64),
    repeat('e', 64),
    repeat('f', 64),
    TIMESTAMPTZ '2026-07-06 09:00:00+00',
    DATE '2026-07-06'
  );
  RAISE EXCEPTION 'migration 052 malformed scientific insert unexpectedly succeeded'
    USING ERRCODE = '55000';
EXCEPTION
  WHEN SQLSTATE '23514' THEN
    IF SQLERRM IS DISTINCT FROM
       'scientific abstain prediction requires the all-null probability and interval sentinel'
    THEN
      RAISE EXCEPTION 'migration 052 insert returned the wrong check violation: %', SQLERRM
        USING ERRCODE = '55000';
    END IF;
END;
$insert_rejection$;

SET ROLE service_role;

DO $finalize_rejection$
BEGIN
  PERFORM public.finalize_tli_scientific_prediction_score(
    '{"actual_label_id":"52000000-0000-4000-8000-000000000005","prediction_id":"52000000-0000-4000-8000-000000000001","score_exclusion_reason":null,"score_status":"scored","scored_at":"2026-07-11T00:00:00.000Z"}',
    'b76a7d2a7b246964069c9d3ed7732d2a6e5a677447102863f2711611cb578442'
  );
  RAISE EXCEPTION 'migration 052 malformed scientific finalization unexpectedly succeeded'
    USING ERRCODE = '55000';
EXCEPTION
  WHEN SQLSTATE '23514' THEN
    IF SQLERRM IS DISTINCT FROM
       'scientific abstain prediction requires the all-null probability and interval sentinel'
    THEN
      RAISE EXCEPTION 'migration 052 finalization returned the wrong check violation: %', SQLERRM
        USING ERRCODE = '55000';
    END IF;
END;
$finalize_rejection$;

RESET ROLE;

SELECT json_build_object(
  'status', 'pass',
  'validator_valid_case_count', 4,
  'validator_rejection_case_count', 15,
  'legacy_cycle_null_insert', 'pass',
  'insert_sqlstate', '23514',
  'finalize_role', 'service_role',
  'finalize_sqlstate', '23514',
  'malformed_prediction_id', '52000000-0000-4000-8000-000000000001'
)::TEXT;
