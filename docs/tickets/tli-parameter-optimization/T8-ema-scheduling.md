# T8: EMA Momentum Scheduling

**PRD Ref**: PRD-tli-parameter-optimization > US-4
**Priority**: P2 (Medium)
**Size**: S (< 2h)
**Status**: Todo
**Depends On**: T7

---

## 1. Objective

테마 나이(daysSinceSpike)에 따라 EMA alpha를 선형 보간으로 조절. 신생 테마(0일): alpha=0.6 (반응적), 성숙 테마(30일+): alpha=0.3 (안정적). §4.8 + §4.7 Step C 통합.

## 2. Acceptance Criteria

- [ ] AC-1: `computeAlpha(firstSpikeDate, today)` 함수 추가. daysSinceSpike 기반 선형 보간 0.6→0.3 (30일 clamp)
- [ ] AC-2: T7에서 추가된 options object의 `firstSpikeDate`, `today` 필드를 활용. 추가 시그니처 변경 불필요 (T7의 options에 이미 포함)
- [ ] AC-3: firstSpikeDate null 시 기본 alpha = 0.4 (기존 EMA_ALPHA)
- [ ] AC-4: calculate-scores.ts에서 firstSpikeDate, today 전달 추가
- [ ] AC-5: 기존 테스트 전체 통과 + 신규 테스트 케이스 추가

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `computeAlpha returns 0.6 for day 0` | Unit | daysSinceSpike=0 | alpha=0.6 |
| 2 | `computeAlpha returns 0.45 for day 15` | Unit | 중간점 | alpha=0.45 |
| 3 | `computeAlpha returns 0.3 for day 30` | Unit | clamp 경계 | alpha=0.3 |
| 4 | `computeAlpha returns 0.3 for day 60` | Unit | clamp 초과 | alpha=0.3 |
| 5 | `computeAlpha returns 0.4 for null firstSpikeDate` | Unit | null fallback | alpha=0.4 |
| 6 | `applyEMASmoothing uses computed alpha` | Unit | day 0 → alpha 0.6 적용 | smoothed 값 검증 |
| 7 | `applyEMASmoothing without dates uses default 0.4` | Unit | 미전달 (하위 호환) | 기존 결과와 동일 |

### 3.2 Test File Location
- `lib/tli/__tests__/score-smoothing.test.ts` (기존 파일에 케이스 추가)

### 3.3 Mock/Setup Required
- 날짜 fixture (`2026-02-15`, `2026-03-17` 등)

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `lib/tli/score-smoothing.ts` | Modify | `computeAlpha` 함수 추가 + Step C에서 EMA_ALPHA 대신 computeAlpha 사용 |
| `scripts/tli/calculate-scores.ts` | Modify | applyEMASmoothing 호출 시 firstSpikeDate, today 전달 |

### 4.2 Implementation Steps (Green Phase)
1. `computeAlpha(firstSpikeDate, today)` 함수 구현
2. applyEMASmoothing Step C에서 `const alpha = computeAlpha(firstSpikeDate, today)` 사용
3. 시그니처에 optional params 추가 (하위 호환)
4. calculate-scores.ts caller 수정
5. export `computeAlpha` (evaluate.ts에서도 사용)

### 4.3 Refactor Phase
- 기존 `const EMA_ALPHA = 0.4` 상수를 `computeAlpha`의 null fallback으로만 사용하도록 정리

## 5. Edge Cases
- EC-1: firstSpikeDate가 미래 날짜 → daysSinceSpike 음수 → clamp(0, 1)에 의해 frac=0 → alpha=0.6 (안전)
- EC-2: firstSpikeDate 파싱 실패 (invalid date) → daysBetween returns 0 → alpha=0.6

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨 (7개 신규)
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
- [ ] §4.7 Step C 통합 준수
