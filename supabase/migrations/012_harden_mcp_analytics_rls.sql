-- RLS 강화: service_role만 INSERT/SELECT, DELETE/UPDATE 명시적 차단
DROP POLICY IF EXISTS "allow_insert" ON mcp_analytics;
DROP POLICY IF EXISTS "allow_select" ON mcp_analytics;

CREATE POLICY "service_role_insert" ON mcp_analytics
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "service_role_select" ON mcp_analytics
  FOR SELECT TO service_role USING (true);

CREATE POLICY "deny_update" ON mcp_analytics
  FOR UPDATE USING (false);

CREATE POLICY "deny_delete" ON mcp_analytics
  FOR DELETE USING (false);
