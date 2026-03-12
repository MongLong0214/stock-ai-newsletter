CREATE OR REPLACE FUNCTION promote_comparison_v4_release(
  p_run_ids UUID[],
  p_published_at TIMESTAMPTZ,
  p_production_version TEXT,
  p_actor TEXT,
  p_source_surface TEXT,
  p_calibration_version TEXT,
  p_weight_version TEXT,
  p_drift_version TEXT,
  p_gate_status TEXT,
  p_gate_summary TEXT,
  p_gate_failures JSONB,
  p_previous_stable_version TEXT,
  p_auto_hold_enabled BOOLEAN,
  p_hold_state TEXT,
  p_hold_reason TEXT,
  p_hold_report_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  promoted_count INTEGER := 0;
BEGIN
  UPDATE theme_comparison_runs_v2
  SET status = 'published',
      published_at = p_published_at
  WHERE id = ANY(p_run_ids);

  GET DIAGNOSTICS promoted_count = ROW_COUNT;

  UPDATE comparison_v4_control
  SET serving_enabled = false
  WHERE serving_enabled = true;

  INSERT INTO comparison_v4_control (
    production_version,
    serving_enabled,
    promoted_by,
    promoted_at,
    source_surface,
    calibration_version,
    weight_version,
    drift_version,
    promotion_gate_status,
    promotion_gate_summary,
    promotion_gate_failures,
    previous_stable_version,
    auto_hold_enabled,
    hold_state,
    hold_reason,
    hold_report_date,
    updated_at,
    decision_trace
  ) VALUES (
    p_production_version,
    true,
    p_actor,
    p_published_at,
    p_source_surface,
    p_calibration_version,
    p_weight_version,
    p_drift_version,
    p_gate_status,
    p_gate_summary,
    COALESCE(p_gate_failures, '[]'::jsonb),
    p_previous_stable_version,
    p_auto_hold_enabled,
    p_hold_state,
    p_hold_reason,
    p_hold_report_date,
    p_published_at,
    jsonb_build_object(
      'source_surface', p_source_surface,
      'calibration_version', p_calibration_version,
      'weight_version', p_weight_version,
      'drift_version', p_drift_version,
      'gate_status', p_gate_status,
      'gate_summary', p_gate_summary,
      'gate_failures', COALESCE(p_gate_failures, '[]'::jsonb),
      'previous_stable_version', p_previous_stable_version,
      'hold_state', p_hold_state,
      'hold_reason', p_hold_reason,
      'hold_report_date', p_hold_report_date
    )
  )
  ON CONFLICT (production_version)
  DO UPDATE SET
    serving_enabled = EXCLUDED.serving_enabled,
    promoted_by = EXCLUDED.promoted_by,
    promoted_at = EXCLUDED.promoted_at,
    source_surface = EXCLUDED.source_surface,
    calibration_version = EXCLUDED.calibration_version,
    weight_version = EXCLUDED.weight_version,
    drift_version = EXCLUDED.drift_version,
    promotion_gate_status = EXCLUDED.promotion_gate_status,
    promotion_gate_summary = EXCLUDED.promotion_gate_summary,
    promotion_gate_failures = EXCLUDED.promotion_gate_failures,
    previous_stable_version = EXCLUDED.previous_stable_version,
    auto_hold_enabled = EXCLUDED.auto_hold_enabled,
    hold_state = EXCLUDED.hold_state,
    hold_reason = EXCLUDED.hold_reason,
    hold_report_date = EXCLUDED.hold_report_date,
    updated_at = EXCLUDED.updated_at,
    decision_trace = EXCLUDED.decision_trace;

  RETURN jsonb_build_object(
    'promoted_count', promoted_count,
    'production_version', p_production_version
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION promote_comparison_v4_release(UUID[], TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, BOOLEAN, TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION promote_comparison_v4_release(UUID[], TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, BOOLEAN, TEXT, TEXT, DATE) TO service_role;
