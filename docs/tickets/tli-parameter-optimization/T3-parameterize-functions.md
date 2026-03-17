# T3: Parameterize Calculator, Stage, Sentiment Functions

**PRD Ref**: PRD-tli-parameter-optimization > US-1
**Priority**: P1 (High)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: T2

---

## 1. Objective

calculator.ts, stage.ts, sentiment-proxy.ts의 하드코딩 파라미터를 optional config 인자로 추출. 기본값 = 현재값. 기존 caller에 영향 없음 (하위 호환).

## 2. Acceptance Criteria

- [ ] AC-1: `calculateLifecycleScore`에 `config?: Partial<TLIParams>` 인자 추가. 미전달 시 `getTLIParams()` 사용
- [ ] AC-2: `determineStage`에 `config?: Partial<TLIParams>` 인자 추가. 기존 `thresholds?` 파라미터를 config로 대체. resolveStageWithHysteresis 내 determineStage 호출부도 함께 변경
- [ ] AC-3: `computeSentimentProxy`에 `config?: Partial<TLIParams>` 인자 추가
- [ ] AC-4: 기존 33개 테스트 파일 전체 통과 (regression 0)
- [ ] AC-5: config 인자 없이 호출 시 현재와 동일한 결과

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `calculateLifecycleScore with default config matches current` | Unit | config 미전달 시 기존 결과와 동일 | score 일치 |
| 2 | `calculateLifecycleScore with custom interest_level_center` | Unit | center=50으로 변경 시 점수 변화 | score ≠ default |
| 3 | `determineStage with custom thresholds` | Unit | dormant=20으로 변경 | 15점 테마가 Dormant → Emerging |
| 4 | `computeSentimentProxy with custom weights` | Unit | price weight 0.7로 변경 | 결과값 변화 |
| 5 | `determineStage replaces legacy thresholds param` | Unit | 기존 thresholds 제거 + config 사용 | stage 결과 동일 |

### 3.2 Test File Location
- `lib/tli/__tests__/calculator.test.ts` (기존 파일에 케이스 추가)
- `lib/tli/__tests__/stage.test.ts` (기존 파일에 케이스 추가)
- `lib/tli/__tests__/sentiment-proxy.test.ts` (기존 파일에 케이스 추가)

### 3.3 Mock/Setup Required
- 기존 테스트의 fixture 데이터 재사용

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `lib/tli/calculator.ts` | Modify | `CalculateScoreInput`에 `config?: Partial<TLIParams>` 추가. 내부 상수를 `config.xxx ?? DEFAULT` 패턴으로 교체 |
| `lib/tli/stage.ts` | Modify | `determineStage`에 config 인자 추가. TREND_THRESHOLD, 임계값, bypass 조건을 config에서 읽기 |
| `lib/tli/sentiment-proxy.ts` | Modify | `computeSentimentProxy`에 config 인자 추가. 가중치, scale을 config에서 읽기 |
| `lib/tli/score-smoothing.ts` | Modify | `resolveStageWithHysteresis` 내 `determineStage` 호출에서 기존 thresholds 대신 config 전달 |

### 4.2 Implementation Steps (Green Phase)
1. calculator.ts: 시그니처 변경 + 14개 파라미터를 config 기반으로 교체
2. stage.ts: 시그니처 변경 + 7개 파라미터를 config 기반으로 교체
3. sentiment-proxy.ts: 시그니처 변경 + 4개 파라미터를 config 기반으로 교체
4. 기존 테스트 전체 실행 → regression 0 확인

### 4.3 Refactor Phase
- 중복 파라미터 추출 패턴 통일 (destructuring at function top)

## 5. Edge Cases
- EC-1: config에 일부 필드만 전달 → 나머지는 기본값 (Partial<TLIParams>)
- EC-2: stage thresholds가 역전된 config 전달 → determineStage는 받은 대로 사용 (검증은 Optuna 측에서)

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음 (33개 파일)
- [ ] 코드 스타일 준수 (conventions.md)
