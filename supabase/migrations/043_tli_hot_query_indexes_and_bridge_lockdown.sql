BEGIN;

-- P1 근거: theme_predictions_v3 서빙/채점 조회가 role/status/version 및 date/version 조건으로 반복되어 핫 쿼리 복합 인덱스를 추가한다.
CREATE INDEX IF NOT EXISTS idx_theme_predictions_v3_serving_role_score_status_ver
  ON public.theme_predictions_v3 (serving_role, score_status, model_version);

CREATE INDEX IF NOT EXISTS idx_theme_predictions_v3_prediction_date_model_version
  ON public.theme_predictions_v3 (prediction_date, model_version);

-- P1 근거: 메트릭 시계열 로더가 time 범위 조건을 반복 사용하므로 단일 컬럼 시간 인덱스를 추가한다.
CREATE INDEX IF NOT EXISTS idx_interest_metrics_time
  ON public.interest_metrics (time);

CREATE INDEX IF NOT EXISTS idx_news_metrics_time
  ON public.news_metrics (time);

-- P1 근거: prediction_snapshots_v2 런타입별 스냅샷 조회가 run_type/snapshot_date 조건으로 반복되어 복합 인덱스를 추가한다.
CREATE INDEX IF NOT EXISTS idx_prediction_snapshots_v2_run_type_snapshot_date
  ON public.prediction_snapshots_v2 (run_type, snapshot_date);

-- P1 근거: pending/final 라벨 조회가 label_type/status/date/version 조건으로 반복되어 기존 인덱스는 유지하고 보강 인덱스만 추가한다.
CREATE INDEX IF NOT EXISTS idx_theme_labels_label_type_label_status_base_date
  ON public.theme_labels (label_type, label_status, base_date)
  WHERE label_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_theme_labels_label_type_labeler_status_base_date
  ON public.theme_labels (label_type, labeler_version, label_status, base_date);

-- P1 근거: 종료된 episode_registry_v1 에피소드 탐색은 inactive 행의 episode_end 범위 조회가 핵심이므로 부분 인덱스를 추가한다.
CREATE INDEX IF NOT EXISTS idx_episode_registry_v1_episode_end
  ON public.episode_registry_v1 (episode_end)
  WHERE is_active = false;

-- P2 근거: 브리지 산출물 테이블은 service_role 경로만 쓰므로 anon/authenticated 직접 접근 권한을 회수한다.
REVOKE ALL ON TABLE public.prediction_snapshots_v2 FROM anon, authenticated;
REVOKE ALL ON TABLE public.theme_state_history_v2 FROM anon, authenticated;
REVOKE ALL ON TABLE public.episode_registry_v1 FROM anon, authenticated;

COMMIT;
