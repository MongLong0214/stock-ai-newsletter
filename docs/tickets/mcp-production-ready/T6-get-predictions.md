# T6: 신규 도구 — get_predictions (예측 필터)

**PRD Ref**: PRD-mcp-production-ready > US-5
**Priority**: P1 (High)
**Size**: L (4-8h)
**Status**: Todo
**Depends On**: T2

---

## 1. Objective
Rising/Hot/Cooling 예측 테마를 직접 조회하는 도구. v4 forecast 경로 우선 + v2 fallback.

## 2. Acceptance Criteria
- [ ] AC-1: `GET /api/tli/predictions?phase=rising` — 해당 phase 테마 반환
- [ ] AC-2: v4 forecast 경로: forecast_control_v1 fail-closed 게이트 → query_snapshot_v1 + analog_candidates_v1 + analog_evidence_v1
- [ ] AC-3: v4 미서빙 시 fallback: v_prediction_v4_serving 뷰 (v2 레거시)
- [ ] AC-4: 응답에 `dataSource: "v4-forecast" | "v2-legacy"` 명시
- [ ] AC-5: 각 테마에 예측 근거: daysSinceEpisodeStart, expectedPeakDay, topAnalog(name, similarity), evidenceQuality
- [ ] AC-6: v4+v2 모두 빈 경우 → 빈 배열 + `"Prediction data not yet available."` 가이던스
- [ ] AC-7: MCP `get_predictions` 도구 등록
- [ ] AC-8: 캐시 preset `medium` (5분)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `predictions API returns v4 data when serving` | Integration | forecast_control serving=true | dataSource: "v4-forecast" |
| 2 | `predictions API falls back to v2 when v4 not serving` | Integration | forecast_control fail-closed | dataSource: "v2-legacy" |
| 3 | `predictions API returns empty with guidance when no data` | Integration | 양쪽 모두 빈 데이터 | 빈 배열 + guidance |
| 4 | `predictions API filters by phase` | Integration | phase=rising | rising 테마만 |
| 5 | `predictions API returns all phases when no filter` | Integration | 파라미터 없음 | 모든 phase |
| 6 | `v4 forecast reader extracts analog info` | Unit | analog_candidates + evidence | topAnalog 구조 |
| 7 | `MCP get_predictions calls correct API` | Unit | phase=cooling | fetchApi('/api/tli/predictions', { phase: 'cooling' }) |
| 8 | `predictions API returns shadow mode guidance when v4 fail-closed and v2 empty` | Integration | forecast_control fail-closed + v_prediction empty | guidance: "shadow mode" (E11 distinct from E5) |

### 3.2 Test File Location
- `app/api/tli/predictions/__tests__/route.test.ts`
- `mcp/src/__tests__/tools-predictions.test.ts`

### 3.3 Mock/Setup Required
- Vitest: Supabase mock (forecast_control_v1, query_snapshot_v1, analog_candidates_v1, analog_evidence_v1, v_prediction_v4_serving)
- forecast-serving.ts의 readServingVersion mock

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `app/api/tli/predictions/route.ts` | Create | 예측 API 엔드포인트 |
| `app/api/tli/predictions/build-predictions.ts` | Create | v4 forecast 배치 조회 + v2 fallback 로직 |
| `app/api/tli/predictions/batch-forecast-reader.ts` | Create | 전체 테마 배치 쿼리 (per-theme forecast-reader와 별도) |
| `mcp/src/tools/get-predictions.ts` | Create | MCP 도구 등록 |
| `mcp/src/index.ts` | Modify | registerGetPredictions import |

### 4.2 Implementation Steps (Green Phase)
1. `build-predictions.ts`:
   - Step 1: forecast_control_v1에서 최신 row 조회 → readServingVersion() 로직 재사용
   - Step 2 (v4 배치): serving=true → **기존 forecast-reader.ts는 per-theme이므로 배치 전용 쿼리 필요:**
     - (a) `query_snapshot_v1` 전체 활성 테마 최신 row 배치 조회 (`.neq('reconstruction_status', 'failed').order('snapshot_date', desc)` → 테마별 첫 row)
     - (b) 전체 snapshot_id에 대해 `analog_candidates_v1` 배치 조회 (`.in('query_snapshot_id', snapshotIds).order('rank').limit(snapshotIds.length)` → 테마당 top 1)
     - (c) 전체 candidate_id에 대해 `analog_evidence_v1` 배치 조회
     - (d) candidate_theme_id로 `themes` 테이블 조인하여 테마명 획득
     - (e) phase 매핑: Emerging+Growth+상승=Rising, Peak=Hot, Decline+Dormant=Cooling
   - Step 3 (v2 fallback): serving=false → `v_prediction_v4_serving` 뷰 배치 조회 → phase/confidence/avg_peak_day 활용
   - Step 4: phase 필터 적용, 결과 조립
2. `route.ts`: searchParams.get('phase'), build-predictions 호출, apiSuccess + medium 캐시
3. `get-predictions.ts`: Zod `phase: z.enum(['rising', 'hot', 'cooling']).optional()`, fetchApi, formatResult
4. `index.ts`: registerGetPredictions 추가

### 4.3 Refactor Phase
- forecast-serving.ts의 readServingVersion 재사용 가능한지 검토

## 5. Edge Cases
- E5: predictions 데이터 없음 → 가이던스
- E11: v4 fail-closed + v2 빈 경우 → "Forecast system is in shadow mode"

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
- [ ] 코드 스타일 준수
- [ ] 불필요한 변경 없음
