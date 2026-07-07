BEGIN;

-- P0 핫픽스: /themes SSR 랭킹의 batchLoadNewsCounts가 theme_id IN (...) AND pub_date >= ? 조건으로
-- 32만+ 행 테이블을 조회하며 statement timeout → getRankingServer가 EMPTY_RANKING을 반환해
-- 테마 페이지 전체가 "활성 0"으로 렌더되는 전면 장애 발생 (2026-07-07).
-- 단일 컬럼 인덱스(theme_id / pub_date 각각)로는 복합 조건에 비효율 → 복합 인덱스 추가.

CREATE INDEX IF NOT EXISTS idx_theme_news_articles_theme_pub
  ON theme_news_articles (theme_id, pub_date DESC);

COMMIT;
