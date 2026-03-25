# Pipeline Status: MCP Production Ready

**PRD**: docs/prd/PRD-mcp-production-ready.md
**Size**: L
**Current Phase**: 7 (done)

## Ticket Status 정의
- **Todo**: 미착수
- **In Progress**: 구현 중
- **In Review**: 리뷰 진행 중
- **Done**: 완료 (AC 충족 + 테스트 PASS)
- **Invalidated**: 역행으로 무효화됨

## Tickets

| Ticket | Title | Size | Status | Review | Depends | Deploy Phase |
|--------|-------|------|--------|--------|---------|-------------|
| T1 | 버그 수정 (limitations + ESM + query limits) | M | Done | PASS | None | A |
| T2 | 인프라 (TTL 캐시 + Zod 검증 + 패키지 메타) | M | Done | PASS | T1 | B |
| T3a | methodology API + MCP 전환 | M | Done | PASS | T1,T2 | C |
| T3b | ranking limit/sort + summary themeId + context | M | Done | PASS | T1,T2 | C |
| T4 | 신규 도구: get_theme_changes | M | Done | PASS | T2 | D |
| T5 | 신규 도구: compare_themes | L | Done | PASS | T2 | D |
| T6 | 신규 도구: get_predictions | L | Done | PASS | T2 | D |
| T7 | 도구 통합 + 빈 결과 가이던스 | M | Done | PASS | T2,T4,T5,T6 | E |
| T8 | 테스트 + README | M | Done | PASS | T7 | E |

## Dependency Graph

```
T1 ──→ T2 ──→ T3a (methodology)
  │      ├──→ T3b (ranking/summary)
  │      ├──→ T4 ──┐
  │      ├──→ T5 ──┤
  │      └──→ T6 ──┤
  │                 └→ T7 ──→ T8
```

## Review History

| Phase | Round | Verdict | P0 | P1 | P2 | Notes |
|-------|-------|---------|----|----|-----|-------|
| 2     | 1     | HAS ISSUE | 1 | 7 | 6 | v0.1 → v0.2 수정 |
| 2     | 2(Boomer) | ALL PASS | 0 | 0 | 0 | v0.2 수렴 |
| 4     | 1     | HAS ISSUE | 2 | 10 | 9 | T3 분할, 테스트 보강, 배치 쿼리 추가 |
| 6     | 1     | HAS ISSUE | 0 | 2 | 5 | cli.ts 3도구, smithery pin, limit, cache, README |
| 6     | 2(Boomer) | ALL PASS | 0 | 0 | 0 | 수정 후 수렴 |
