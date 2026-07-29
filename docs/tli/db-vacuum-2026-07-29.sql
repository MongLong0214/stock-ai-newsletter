-- TLI DB 크기 회수 (2026-07-29) — theme_news_articles 30일 프루닝(305,272행 삭제) 후 dead tuple 회수.
-- VACUUM FULL은 트랜잭션 밖에서 실행되어야 하며 대상 테이블을 잠깐 배타 잠금한다(초 단위).
-- display/캐시 테이블 위주라 안전. CI 미실행 시간대 권장. Supabase SQL Editor에 그대로 붙여넣기.
VACUUM (FULL, ANALYZE) public.theme_news_articles;         -- 최대 회수 (~122MB)
VACUUM (FULL, ANALYZE) public.lifecycle_scores;            -- 일일 upsert churn
VACUUM (FULL, ANALYZE) public.prediction_snapshots_v2;
VACUUM (FULL, ANALYZE) public.theme_labels;
VACUUM (FULL, ANALYZE) public.tli_news_observations;
VACUUM (FULL, ANALYZE) public.blog_posts;
VACUUM (FULL, ANALYZE) public.theme_comparison_candidates_v2;
VACUUM (FULL, ANALYZE) public.stock_daily_prices;
