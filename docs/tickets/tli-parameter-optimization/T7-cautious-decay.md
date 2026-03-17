# T7: Cautious Score Decay

**PRD Ref**: PRD-tli-parameter-optimization > US-3
**Priority**: P2 (Medium)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: T2

---

## 1. Objective

score-smoothing.ts의 applyEMASmoothing에 Cautious Decay 로직 추가. 3개 binary 신호 중 2개 이상이 하락을 확인할 때만 정상 하락 반영. 미확인 시 cautious floor 적용. §4.7 통합 파이프라인 순서 준수 (Step A → B → C).

## 2. Acceptance Criteria

- [ ] AC-1: 점수 하락 시 3개 binary 신호(`components.raw.interest_slope < 0`, `components.raw.news_this_week < components.raw.news_last_week`, `components.raw.dvi < 0.4`) 중 2개 이상 확인 시 정상 하락. undefined는 미확인(false) 처리
- [ ] AC-2: confirmCount < 2 시 effectiveRaw = max(rawScore, prevSmoothed × cautious_floor_ratio). 기본 ratio = 0.90
- [ ] AC-3: 실행 순서: Cautious Decay (Step A) → Bollinger clamp (Step B) → EMA (Step C)
- [ ] AC-4: applyEMASmoothing에 `options?: { components?: ScoreComponents; firstSpikeDate?: string | null; today?: string }` 4번째 인자 추가 (options object 패턴으로 시그니처 비대화 방지. T8에서 firstSpikeDate/today 활용)
- [ ] AC-5: 기존 `score-smoothing.test.ts` 전체 통과 + 신규 테스트 케이스 추가

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `no decay protection when 3/3 signals confirm decline` | Unit | 모든 신호 하락 확인 | rawScore 그대로 반영 |
| 2 | `no decay protection when 2/3 signals confirm decline` | Unit | 2개 신호 확인 | rawScore 그대로 반영 |
| 3 | `cautious floor applied when 1/3 signals confirm` | Unit | 1개만 확인 | effectiveRaw = max(raw, prev×0.90) |
| 4 | `cautious floor applied when 0/3 signals confirm (all neutral)` | Unit | 모든 신호 neutral | effectiveRaw = max(raw, prev×0.90) |
| 5 | `no protection on score increase` | Unit | rawScore > prevSmoothed | effectiveRaw = rawScore (bypass) |
| 6 | `cautious floor does not exceed prevSmoothedScore` | Unit | floor 계산 검증 | floor <= prevSmoothed |
| 7 | `Step A before Step B: floor then Bollinger clamp` | Unit | floor 적용 후 Bollinger | 순서 검증 |
| 8 | `components undefined falls back to no protection` | Unit | components 미전달 | 기존 로직 (하위 호환) |
| 9 | `dvi undefined treated as decline unconfirmed` | Unit | components.raw.dvi = undefined | confirmCount에 미포함 (false) |
| 10 | `interest_slope undefined treated as decline unconfirmed` | Unit | components.raw.interest_slope = undefined | confirmCount에 미포함 |

### 3.2 Test File Location
- `lib/tli/__tests__/score-smoothing.test.ts` (기존 파일에 케이스 추가)

### 3.3 Mock/Setup Required
- ScoreComponents fixture (interest_slope, dvi, news 값 조합)
- prevSmoothedScore fixture

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `lib/tli/score-smoothing.ts` | Modify | applyEMASmoothing에 Cautious Decay Step A 삽입 + 시그니처 변경 |
| `scripts/tli/calculate-scores.ts` | Modify | applyEMASmoothing 호출 시 components 전달 |

### 4.2 Implementation Steps (Green Phase)
1. applyEMASmoothing 시그니처에 `components?: ScoreComponents` 추가
2. Step A: rawScore < prevSmoothedScore 분기 → signal 추출 → confirmCount 계산
3. confirmCount < 2 → cautious floor 적용
4. 기존 Bollinger (Step B) + EMA (Step C) 로직은 그대로 유지
5. components 미전달 시 기존 로직 (하위 호환)
6. calculate-scores.ts에서 components 전달 추가

### 4.3 Refactor Phase
- cautious_floor_ratio를 TLIParams에서 읽도록 연결 (getTLIParams().cautious_floor_ratio)

## 5. Edge Cases
- EC-1: components가 undefined → Cautious Decay 건너뜀 (기존 로직 유지, PRD 하위 호환)
- EC-2: 신생 테마(< 7일) + cautious floor → 이중 보호 가능하나 신호 2/3 확인 시 정상 하락 (PRD E10)
- EC-3: interest_slope가 NaN/undefined → false 취급 (하락 미확인)

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨 (8개 신규)
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 score-smoothing 테스트 깨지지 않음
- [ ] Step A → B → C 순서 준수
