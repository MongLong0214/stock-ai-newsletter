create table if not exists calibration_artifact (
  calibration_version text primary key,
  source_surface text not null,
  source_run_date_from date not null,
  source_run_date_to date not null,
  source_row_count integer not null,
  positive_count integer not null,
  calibration_method text not null,
  ci_method text not null,
  bootstrap_iterations integer not null,
  brier_score_before double precision not null,
  brier_score_after double precision not null,
  ece_before double precision not null,
  ece_after double precision not null,
  bin_summary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
