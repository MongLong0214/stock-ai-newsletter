# T5: 신규 도구 — compare_themes (테마 비교)

**PRD Ref**: PRD-mcp-production-ready > US-4
**Priority**: P1 (High)
**Size**: L (4-8h)
**Status**: Todo
**Depends On**: T2

---

## 1. Objective
2~5개 테마를 나란히 비교하는 도구. 각 테마의 점수/stage/stocks + 겹치는 종목 + 상호 유사도 참조.

## 2. Acceptance Criteria
- [ ] AC-1: `compare_themes` 도구가 2~5개 theme_id 배열 수신
- [ ] AC-2: 각 테마의 현재 점수/stage/7일 sparkline/상위 종목 반환
- [ ] AC-3: theme_comparison_candidates_v2에서 상호 참조 유사도 표시 (A의 후보에 B가 있는 경우). 없으면 `similarity: null`
- [ ] AC-4: 겹치는 종목 목록 (`theme_stocks` 교집합)
- [ ] AC-5: 존재하지 않는 themeId → 해당 테마 제외 + 경고 메시지 (부분 결과)
- [ ] AC-6: 1개 미만 또는 6개 이상 → Zod 검증 에러

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `compare API returns comparison for 2 themes` | Integration | 유효한 2개 themeId | themes 배열 2개 + overlappingStocks |
| 2 | `compare API shows mutual similarity when available` | Integration | A↔B 후보 존재 | similarity score 포함 |
| 3 | `compare API returns null similarity when no mutual reference` | Integration | 상호 참조 없음 | similarity: null |
| 4 | `compare API handles invalid themeId gracefully` | Integration | 1 유효 + 1 무효 | 부분 결과 + warnings |
| 5 | `compare API rejects fewer than 2 themes` | Integration | 1개 | 400 에러 |
| 6 | `MCP compare_themes validates theme_ids array` | Unit | 빈 배열 | Zod 에러 |
| 7 | `overlapping stocks calculation` | Unit | 테마 A 종목 [a,b,c], B [b,c,d] | [b,c] |
| 8 | `unidirectional similarity still returns score` | Unit | A의 후보에 B 있지만 B의 후보에 A 없음 | similarity: A→B score |

### 3.2 Test File Location
- `app/api/tli/compare/__tests__/route.test.ts`
- `mcp/src/__tests__/tools-compare.test.ts`

### 3.3 Mock/Setup Required
- Vitest: Supabase client mock (lifecycle_scores, theme_stocks, theme_comparison_candidates_v2)

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `app/api/tli/compare/route.ts` | Create | 비교 API 엔드포인트 |
| `app/api/tli/compare/build-comparison.ts` | Create | 비교 로직 (점수, 종목 교집합, 상호 유사도) |
| `mcp/src/tools/compare-themes.ts` | Create | MCP 도구 등록 |
| `mcp/src/index.ts` | Modify | registerCompareThemes import |

### 4.2 Implementation Steps (Green Phase)
1. `build-comparison.ts`:
   - lifecycle_scores에서 각 테마 최신 점수/stage + 7일 sparkline
   - theme_stocks에서 각 테마 활성 종목 조회
   - 종목 symbol 기반 교집합 계산
   - theme_comparison_candidates_v2에서 상호 참조: A 기준 published run의 후보에 B가 있는지 + 역방향
2. `route.ts`: GET query `?ids=uuid1,uuid2,...` (comma-separated, 최대 5개). fetchApi는 GET만 지원하므로 POST 불가. URL 길이: 5 UUID × 36자 ≈ 200자 — 충분
3. `compare-themes.ts`: Zod `theme_ids: z.array(z.string().uuid()).min(2).max(5)`, fetchApi('/api/tli/compare', { ids: theme_ids.join(',') }), formatResult
4. `index.ts`: registerCompareThemes 추가

### 4.3 Refactor Phase
- 없음

## 5. Edge Cases
- E4: 잘못된 UUID → Zod 검증
- E10: 비교 데이터 없음 → similarity: null + 안내
- AC-4.4: 부분 결과 + 경고

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
- [ ] 코드 스타일 준수
- [ ] 불필요한 변경 없음
