-- MCP 서버 사용량 추적 테이블
CREATE TABLE IF NOT EXISTS mcp_analytics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tool_name text NOT NULL,
  path text NOT NULL,
  user_agent text,
  ip_hash text,
  created_at timestamptz DEFAULT now()
);

-- 일별 집계 조회용 인덱스
CREATE INDEX idx_mcp_analytics_created_at ON mcp_analytics (created_at DESC);
CREATE INDEX idx_mcp_analytics_tool_name ON mcp_analytics (tool_name, created_at DESC);

-- RLS 비활성화 (서버사이드에서만 삽입)
ALTER TABLE mcp_analytics ENABLE ROW LEVEL SECURITY;

-- service_role만 삽입 가능
CREATE POLICY "service_role_insert" ON mcp_analytics
  FOR INSERT TO service_role WITH CHECK (true);

-- service_role만 조회 가능
CREATE POLICY "service_role_select" ON mcp_analytics
  FOR SELECT TO service_role USING (true);
