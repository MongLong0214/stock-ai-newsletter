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

-- RLS
ALTER TABLE mcp_analytics ENABLE ROW LEVEL SECURITY;

-- anon + service_role 삽입/조회 허용 (서버사이드 API에서만 호출)
CREATE POLICY "allow_insert" ON mcp_analytics
  FOR INSERT WITH CHECK (true);

CREATE POLICY "allow_select" ON mcp_analytics
  FOR SELECT USING (true);
