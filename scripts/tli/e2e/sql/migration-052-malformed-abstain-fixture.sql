BEGIN;

SET LOCAL session_replication_role = replica;

INSERT INTO public.theme_predictions_v3 (
  id,
  theme_id,
  prediction_date,
  horizon_days,
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
  score_status,
  experiment_cycle_id,
  experiment_origin_manifest_id,
  scientific_prediction_role,
  model_artifact_sha256,
  feature_contract_hash,
  feature_snapshot_hash,
  forecast_cutoff,
  forecast_origin_week
) VALUES (
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000002',
  DATE '2026-07-06',
  5,
  'shadow',
  0.5,
  0.25,
  0.75,
  TRUE,
  ARRAY['r5-service-role-bypass'],
  '{}'::JSONB,
  'migration-052-malformed-candidate',
  'gta-v2',
  'migration-052-rehearsal-v1',
  'pending',
  '52000000-0000-4000-8000-000000000003',
  '52000000-0000-4000-8000-000000000004',
  'candidate',
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64),
  TIMESTAMPTZ '2026-07-06 09:00:00+00',
  DATE '2026-07-06'
);

COMMIT;
