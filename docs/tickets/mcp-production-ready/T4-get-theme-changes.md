# T4: 신규 도구 — get_theme_changes (일간 변동)

**PRD Ref**: PRD-mcp-production-ready > US-3
**Priority**: P1 (High)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: T2

---

## 1. Objective
"어제 대비 뭐가 올랐어?" 질문에 직접 답하는 일간/주간 테마 변동 도구. API 엔드포인트 + MCP 도구.

## 2. Acceptance Criteria
- [ ] AC-1: `GET /api/tli/changes?period=1d` — 전일 대비 점수 변동 상위/하위 테마 반환
- [ ] AC-2: `period=7d` — 7일 전 대비 변동
- [ ] AC-3: stageTransitions — 최신 stage ≠ 비교 시점 stage인 테마
- [ ] AC-4: newlyEmerging — 비교 시점에 Dormant/없음 → 최신 Emerging
- [ ] AC-5: MCP `get_theme_changes` 도구 등록 + 적절한 description
- [ ] AC-6: 빈 결과 시 `"No score changes detected for this period."` 가이던스
- [ ] AC-7: 캐시 preset `medium` (5분)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `changes API returns rising and falling movers for 1d` | Integration | period=1d | movers.rising/falling 배열 |
| 2 | `changes API returns stage transitions` | Integration | stage 변경된 테마 존재 시 | stageTransitions 비어있지 않음 |
| 3 | `changes API returns newly emerging themes` | Integration | 신규 Emerging 존재 시 | newlyEmerging 비어있지 않음 |
| 4 | `changes API defaults to period=1d` | Integration | 파라미터 없음 | period: "1d" |
| 5 | `changes API returns empty with guidance when no data` | Integration | 데이터 없을 때 | 빈 배열 + guidance |
| 6 | `MCP get_theme_changes calls correct API path` | Unit | period=7d | fetchApi('/api/tli/changes', { period: '7d' }) |
| 7 | `changes calculation: score diff is absolute points` | Unit | 75→83 | change: 8 (not percentage) |
| 8 | `changes API rejects invalid period value` | Unit | period="3d" | Zod 검증 에러 (400) |

### 3.2 Test File Location
- `app/api/tli/changes/__tests__/route.test.ts`
- `mcp/src/__tests__/tools-changes.test.ts`

### 3.3 Mock/Setup Required
- Vitest: Supabase client mock (lifecycle_scores 데이터)
- MCP 도구: fetchApi mock

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `app/api/tli/changes/route.ts` | Create | 변동 계산 API 엔드포인트 |
| `app/api/tli/changes/build-changes.ts` | Create | 변동 계산 로직 (score diff, stage transition, newly emerging) |
| `mcp/src/tools/get-theme-changes.ts` | Create | MCP 도구 등록 |
| `mcp/src/index.ts` | Modify | registerGetThemeChanges import |

### 4.2 Implementation Steps (Green Phase)
1. `build-changes.ts`: lifecycle_scores에서 최근 2일(1d) 또는 8일(7d) 조회 → 테마별 최신/비교 시점 점수 추출 → diff 계산 → movers(상위10/하위10), stageTransitions, newlyEmerging 분류
2. `route.ts`: searchParams에서 period 추출, build-changes 호출, apiSuccess + medium 캐시
3. `get-theme-changes.ts`: Zod `period: z.enum(['1d', '7d']).optional()`, fetchApi, formatResult with context
4. `index.ts`: registerGetThemeChanges 추가

### 4.3 Refactor Phase
- 없음

## 5. Edge Cases
- AC-3.5(PRD): 변동 데이터 없을 시 빈 배열 + 가이던스
- AC-3.6(PRD): 무효한 period → Zod 검증 에러

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
- [ ] 코드 스타일 준수
- [ ] 불필요한 변경 없음
