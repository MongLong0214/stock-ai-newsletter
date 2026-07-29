-- 미사용 인덱스 정리 (2026-07-29) — index-stats 실측 0 scans + 코드 전수조사로 미사용 확인.
-- DROP INDEX는 공간을 즉시 OS에 반환(VACUUM 불필요)하고 해당 테이블 쓰기 오버헤드를 줄인다.
-- IF EXISTS로 멱등 — 재적용 안전.
--
-- 드롭 대상 (근거):
--  · idx_blog_posts_fts (7.9MB, GIN FTS): 코드베이스에 textSearch/tsquery 쿼리 0개 — 완전 미사용.
--  · idx_theme_comparison_candidates_v2_candidate_run (5.2MB): compare 라우트가 (run_id, candidate_theme_id)
--    순으로 필터해 unique key가 처리 → 이 역순 인덱스는 미사용. candidate_theme_id 단독 쿼리도 없음.
--
-- 보존 (드롭 안 함): idx_theme_labels_forecast_origin_base_date_id — 048이 만든 gta-v2 study 경로용.
-- study 시계 2026-07-27 시작이라 아직 0 scans일 뿐, 과학 파이프라인 스키마는 보존한다.

BEGIN;

DROP INDEX IF EXISTS public.idx_blog_posts_fts;
DROP INDEX IF EXISTS public.idx_theme_comparison_candidates_v2_candidate_run;

COMMIT;
