-- RLS 정책 변경: service_role → 모든 역할 허용
DROP POLICY IF EXISTS "service_role_insert" ON mcp_analytics;
DROP POLICY IF EXISTS "service_role_select" ON mcp_analytics;
DROP POLICY IF EXISTS "allow_insert" ON mcp_analytics;
DROP POLICY IF EXISTS "allow_select" ON mcp_analytics;

CREATE POLICY "allow_insert" ON mcp_analytics
  FOR INSERT WITH CHECK (true);

CREATE POLICY "allow_select" ON mcp_analytics
  FOR SELECT USING (true);
