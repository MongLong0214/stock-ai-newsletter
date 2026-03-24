# T5: 프롬프트 스코어링 컨텍스트 통합

**PRD Ref**: PRD-crash-prediction-enterprise > §4.1
**Priority**: P2 (Medium)
**Size**: S (< 2h)
**Status**: Todo
**Depends On**: T4

---

## 1. Objective
market-assessment 프롬프트에 crashScore, directionCoherence, vixRegime을 "📊 스코어링 컨텍스트" 섹션으로 추가한다. **snapshot 존재 시에만 표시**. Gemini fallback(snapshot=null, evidence=null) 경로에서는 스코어링 섹션을 생략한다 — fallback은 Gemini search 기반 독자 판정이므로 의도된 동작.

## 2. Acceptance Criteria
- [ ] AC-1: `buildApiSnapshotSection`에 "📊 스코어링 컨텍스트" 섹션 추가
- [ ] AC-2: crashScore, directionCoherence, vixRegime, crossValidationRatio 표시
- [ ] AC-3: staleness 경고 (stale_recovery 시) 포함
- [ ] AC-4: 기존 Tier signals 구조 유지 (삭제하지 않음)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `prompt includes scoring context section` | Integration | evidence with crashScore | prompt에 '스코어링 컨텍스트' 포함 |
| 2 | `prompt shows staleness warning when stale` | Integration | stale_recovery | prompt에 '전일 주간장' 경고 포함 |
| 3 | `prompt preserves tier signals` | Integration | evidence with tiers | prompt에 'Tier 1 신호' 유지 |
| 4 | `prompt includes crossValidationRatio` | Integration | ratio=0.67 | prompt에 '교차검증' + '0.67' 포함 |
| 5 | `null evidence omits scoring section` | Integration | evidence=null (fallback) | prompt에 '스코어링 컨텍스트' 미포함 |

### 3.2 Test File Location
- `lib/market-data/__tests__/kis-market-assessment.test.ts` (prompt 생성 테스트)

### 3.3 Mock/Setup Required
- `MarketAssessmentEvidence` with 신규 필드 (crashScore, directionCoherence 등)

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `lib/prompts/korea/market-assessment.ts` | Modify | `buildApiSnapshotSection` 함수에 스코어링 컨텍스트 섹션 추가 |

### 4.2 Implementation Steps (Green Phase)
1. evidence 파라미터에서 crashScore, directionCoherence, vixRegime, crossValidationRatio 추출
2. "📊 스코어링 컨텍스트" 텍스트 블록 생성
3. 기존 Tier signals 블록 아래에 삽입
4. stale_recovery 시 경고 메시지 추가

### 4.3 Refactor Phase
- 없음

## 5. Edge Cases
- EC-1: evidence가 null인 경우 (no-snapshot fallback) → 스코어링 섹션 생략

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
