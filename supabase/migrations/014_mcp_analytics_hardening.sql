-- MCP Analytics 보안 강화: RPC 함수 + rate limit + TTL + DB 집계
-- C-2: service_role key를 Edge에서 제거하기 위한 SECURITY DEFINER 함수
-- H-3: DB 레벨 rate limit (ip_hash 기준 분당 60회)
-- H-4: DB 집계 함수 (인메모리 집계 대체)
-- M-1: UA 길이 512자 제한
-- M-2: TTL cleanup 함수 (90일)

-- ip_hash 인덱스 (rate limit 조회용)
CREATE INDEX IF NOT EXISTS idx_mcp_analytics_ip_hash
  ON mcp_analytics (ip_hash, created_at DESC);

-- 1. INSERT RPC (SECURITY DEFINER — anon key로 호출 가능)
CREATE OR REPLACE FUNCTION insert_mcp_analytics(
  p_tool_name text,
  p_path text,
  p_user_agent text,
  p_ip_hash text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- H-3: rate limit — 동일 ip_hash 분당 60회 초과 시 무시
  IF (
    SELECT COUNT(*) FROM mcp_analytics
    WHERE ip_hash = p_ip_hash
      AND created_at > NOW() - interval '1 minute'
  ) >= 60 THEN
    RETURN;
  END IF;

  INSERT INTO mcp_analytics (tool_name, path, user_agent, ip_hash)
  VALUES (
    LEFT(p_tool_name, 128),
    LEFT(p_path, 512),
    LEFT(p_user_agent, 512),  -- M-1: UA 길이 제한
    p_ip_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION insert_mcp_analytics(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION insert_mcp_analytics(text, text, text, text) TO service_role;

-- 2. 통계 집계 RPC (service_role 전용 — admin API에서 사용)
CREATE OR REPLACE FUNCTION get_mcp_analytics_stats(p_since timestamptz)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'totalCalls', (
      SELECT COUNT(*) FROM mcp_analytics WHERE created_at >= p_since
    ),
    'uniqueUsers', (
      SELECT COUNT(DISTINCT ip_hash) FROM mcp_analytics WHERE created_at >= p_since
    ),
    'byTool', COALESCE((
      SELECT json_object_agg(tool_name, cnt)
      FROM (
        SELECT tool_name, COUNT(*) AS cnt
        FROM mcp_analytics WHERE created_at >= p_since
        GROUP BY tool_name ORDER BY cnt DESC
      ) t
    ), '{}'::json),
    'byDay', COALESCE((
      SELECT json_object_agg(day, cnt)
      FROM (
        SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS day,
               COUNT(*) AS cnt
        FROM mcp_analytics WHERE created_at >= p_since
        GROUP BY day ORDER BY day
      ) d
    ), '{}'::json),
    'byUserAgent', COALESCE((
      SELECT json_object_agg(ua, cnt)
      FROM (
        SELECT COALESCE(user_agent, 'unknown') AS ua, COUNT(*) AS cnt
        FROM mcp_analytics WHERE created_at >= p_since
        GROUP BY ua ORDER BY cnt DESC
      ) u
    ), '{}'::json)
  ) INTO result;

  RETURN result;
END;
$$;

-- PostgreSQL 기본 PUBLIC 권한 제거 후 service_role만 허용
REVOKE EXECUTE ON FUNCTION get_mcp_analytics_stats(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_mcp_analytics_stats(timestamptz) TO service_role;

-- 3. TTL cleanup 함수 (M-2: 수동 또는 pg_cron으로 실행)
CREATE OR REPLACE FUNCTION cleanup_mcp_analytics(p_retention_days int DEFAULT 90)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM mcp_analytics
  WHERE created_at < NOW() - (p_retention_days || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_mcp_analytics(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_mcp_analytics(int) TO service_role;
