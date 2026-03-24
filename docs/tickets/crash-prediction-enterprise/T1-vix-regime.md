# T1: VIX 레짐 감지 함수

**PRD Ref**: PRD-crash-prediction-enterprise > US-4
**Priority**: P1 (High)
**Size**: S (< 2h)
**Status**: Todo
**Depends On**: None

---

## 1. Objective
VIX 가격 기반 4구간 레짐 분류 함수와 regimeMultiplier 반환 로직을 구현한다.

## 2. Acceptance Criteria
- [ ] AC-1: `getVixRegime(vixPrice: number | null): VixRegime` 함수가 4구간 반환: low(<15), normal(15-25), elevated(25-35), extreme(≥35)
- [ ] AC-2: `getRegimeMultiplier(regime: VixRegime): number` 반환: low=1.5, normal=1.0, elevated=0.7, extreme=0.4
- [ ] AC-3: VIX null 시 `'normal'` 반환 (기본값)
- [ ] AC-4: stateless 단순 구간 매핑 — 히스테리시스 없음
- [ ] AC-5: VIX=NaN 시 null과 동일하게 'normal' 반환

> **Note**: VIX decline→normalizedDrop=0 처리는 T3(calculateNormalizedDrop) 책임. T1은 레짐 분류만 담당.

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `returns low regime for VIX 12` | Unit | VIX < 15 | regime='low', multiplier=1.5 |
| 2 | `returns normal regime for VIX 20` | Unit | 15 ≤ VIX < 25 | regime='normal', multiplier=1.0 |
| 3 | `returns elevated regime for VIX 30` | Unit | 25 ≤ VIX < 35 | regime='elevated', multiplier=0.7 |
| 4 | `returns extreme regime for VIX 45` | Unit | VIX ≥ 35 | regime='extreme', multiplier=0.4 |
| 5 | `returns normal for null VIX` | Unit | VIX null | regime='normal', multiplier=1.0 |
| 6 | `boundary: VIX exactly 15` | Unit | 경계값 | regime='normal' |
| 7 | `boundary: VIX exactly 25` | Unit | 경계값 | regime='elevated' |
| 8 | `boundary: VIX exactly 35` | Unit | 경계값 | regime='extreme' |

### 3.2 Test File Location
- `lib/market-data/__tests__/kis-market-assessment.test.ts` (기존 파일에 describe 블록 추가)

### 3.3 Mock/Setup Required
- 없음 (순수 함수, 외부 의존성 없음)

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `lib/market-data/kis-market-assessment.ts` | Modify | `VixRegime` 타입 + `getVixRegime()` + `getRegimeMultiplier()` 함수 추가 |

### 4.2 Implementation Steps (Green Phase)
1. `VixRegime` 타입 export: `'low' | 'normal' | 'elevated' | 'extreme'`
2. `VIX_REGIME_CONFIG` 상수 정의 (구간 경계 + multiplier)
3. `getVixRegime(vixPrice)` 구현
4. `getRegimeMultiplier(regime)` 구현
5. export하여 T3에서 사용 가능하게

### 4.3 Refactor Phase
- 상수 테이블을 `pipeline-config.ts`로 이동 검토 (불필요하면 유지)

## 5. Edge Cases
- EC-1: VIX = 0 → low
- EC-2: VIX = NaN → null 처리와 동일하게 normal

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
