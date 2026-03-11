-- CMPV4-011: Serving view for published comparison results
-- anon users read this view only; raw v2 tables remain service_role only.

-- View: latest published comparison candidates per theme
CREATE OR REPLACE VIEW v_comparison_v4_serving AS
SELECT
  r.current_theme_id AS theme_id,
  r.id AS run_id,
  r.algorithm_version,
  r.candidate_pool,
  r.published_at,
  c.candidate_theme_id,
  c.rank,
  c.similarity_score,
  c.current_day,
  c.past_peak_day,
  c.past_total_days,
  c.estimated_days_to_peak,
  c.message,
  c.feature_sim,
  c.curve_sim,
  c.keyword_sim,
  c.past_peak_score,
  c.past_final_stage,
  c.past_decline_days,
  c.is_selected_top3
FROM theme_comparison_runs_v2 r
JOIN theme_comparison_candidates_v2 c ON c.run_id = r.id
WHERE r.status = 'published'
  AND r.publish_ready = true
  AND c.is_selected_top3 = true
ORDER BY r.current_theme_id, c.rank;

-- Grant anon/authenticated read-only access to the view
GRANT SELECT ON v_comparison_v4_serving TO anon, authenticated;

-- View: latest published prediction snapshot per theme
CREATE OR REPLACE VIEW v_prediction_v4_serving AS
SELECT
  ps.theme_id,
  ps.snapshot_date,
  ps.comparison_run_id,
  ps.comparison_count,
  ps.avg_similarity,
  ps.phase,
  ps.confidence,
  ps.risk_level,
  ps.momentum,
  ps.avg_peak_day,
  ps.avg_total_days,
  ps.avg_days_to_peak,
  ps.current_progress,
  ps.days_since_spike,
  ps.best_scenario,
  ps.median_scenario,
  ps.worst_scenario,
  ps.prediction_intervals,
  ps.algorithm_version,
  ps.candidate_pool
FROM prediction_snapshots_v2 ps
JOIN theme_comparison_runs_v2 r ON r.id = ps.comparison_run_id
WHERE r.status = 'published'
  AND r.publish_ready = true
  AND ps.status = 'pending'
ORDER BY ps.theme_id, ps.snapshot_date DESC;

GRANT SELECT ON v_prediction_v4_serving TO anon, authenticated;
