-- 기본 PUBLIC 권한 제거: admin 전용 함수는 service_role만 실행 가능
REVOKE EXECUTE ON FUNCTION get_mcp_analytics_stats(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION cleanup_mcp_analytics(int) FROM PUBLIC, anon, authenticated;
