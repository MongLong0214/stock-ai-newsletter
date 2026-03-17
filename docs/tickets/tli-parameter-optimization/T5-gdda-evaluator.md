# T5: GDDA Evaluator (evaluate.ts)

**PRD Ref**: PRD-tli-parameter-optimization > US-1, US-2
**Priority**: P0 (Blocker)
**Size**: L (4-8h)
**Status**: Todo
**Depends On**: T3, T4

---

## 1. Objective

Sequential State Machine 기반 GDDA 평가 스크립트. 파라미터 세트를 받아 과거 데이터에서 Growth/Decline 방향 적중률을 계산하고 단일 메트릭을 stdout에 출력. Optuna optimizer의 objective function 역할.

## 2. Acceptance Criteria

- [ ] AC-1: `npx tsx scripts/tli-optimizer/evaluate.ts` 실행 시 현재 기본 파라미터로 GDDA 계산 → stdout에 JSON 출력
- [ ] AC-2: `--params '{...}'` 플래그로 커스텀 파라미터 전달 가능
- [ ] AC-3: `--split=train|val|all` 플래그로 평가 범위 선택. val 시 state는 Day 1부터 누적, HIT/MISS 판정만 val 범위
- [ ] AC-4: stdout 출력 형식: `{"gdda": 0.65, "growthHR": 0.70, "declineHR": 0.60, "growthCount": 120, "declineCount": 80, "flipRate": 0.15, "stabilityPenalty": 1.0, "samplePenalty": 1.0}`
- [ ] AC-5: GDDA 계산이 §4.6 pseudocode와 정확히 일치 (raw_value 기반, stability penalty, graduated sample penalty)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `GDDA returns 1.0 when all Growth themes rise and all Decline themes fall` | Unit | 완벽 적중 fixture | gdda: 1.0 |
| 2 | `GDDA returns 0.5 when Growth all miss and Decline all hit` | Unit | Growth 0%, Decline 100% | gdda: 0.5 |
| 3 | `stability penalty applied when flip rate > 0.30` | Unit | 높은 flip rate fixture | stabilityPenalty: 0.8 |
| 4 | `graduated sample penalty when decline count < 5` | Unit | decline 3건 | samplePenalty: 0.6 |
| 5 | `sequential state machine maintains prevSmoothed across days` | Unit | 3일 연속 데이터 | smoothed score가 EMA로 연속 |
| 6 | `--split=val only judges val range but state starts from day 1` | Integration | train/val split fixture | val 범위만 HIT 카운트 |
| 7 | `excludes (theme, date) pairs where future 7d data unavailable` | Unit | 마지막 7일 데이터 | 해당 쌍 제외 |
| 8 | `uses raw_value not normalized for direction comparison` | Unit | raw_value 상승 + normalized 하락 | raw 기준 HIT |
| 9 | `returns NaN for monotonicity violation in stage thresholds` | Unit | dormant > emerging params | NaN |
| 10 | `returns NaN for w_activity out of bounds` | Unit | w_activity = 0.02 | NaN |
| 11 | `exits with error when historical-data.json not found` | Unit | 파일 미존재 시 | Error message + exit(1) |
| 12 | `T fallback: relaxes constraints when primary fails` | Integration | Growth < 50 fixture | 1차 완화 (Growth >= 30) 적용 |

### 3.2 Test File Location
- `scripts/tli-optimizer/__tests__/evaluate.test.ts`

### 3.3 Mock/Setup Required
- fixture JSON (소규모: 3 themes × 30 days)
- `vi.mock('fs')` for fixture loading
- 기존 `calculateLifecycleScore`, `applyEMASmoothing`, `resolveStageWithHysteresis` 실제 함수 사용 (mock 없음)

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `scripts/tli-optimizer/evaluate.ts` | Create | GDDA Sequential State Machine + CLI 인터페이스 |
| `scripts/tli-optimizer/__tests__/fixtures/test-data.json` | Create | 소규모 테스트 fixture |

### 4.2 Implementation Steps (Green Phase)
1. CLI 인자 파싱 (`--params`, `--split`)
2. historical-data.json 로드 + 존재 확인 (E1)
3. TLIParams 파싱 + Optuna 제약 검증 (단조 증가, w_activity bounds) → NaN 반환
4. Train/Val split 경계(T) 결정
5. Sequential State Machine 구현:
   ```
   for each theme:
     state = { prevSmoothed: null, prevStage: null, prevCandidate: null, recentSmoothed: [] }
     for each date (asc):
       score = calculateLifecycleScore(metrics, config)
       if null → skip
       smoothed = applyEMASmoothing(score, state.prevSmoothed, state.recentSmoothed)
       stage = resolveStageWithHysteresis(...)
       if inEvalRange(date, split):
         if stage == Growth || Decline:
           compare future7dAvg vs current7dAvg (raw_value)
           record HIT/MISS
       update state
   ```
6. GDDA 계산 (balanced accuracy + stability penalty + sample penalty)
7. JSON stdout 출력

### 4.3 Refactor Phase
- 성능 최적화: 테마별 병렬 처리 가능 여부 검토 (state가 테마 독립이므로)

## 5. Edge Cases
- EC-1: historical-data.json 미존재 → 에러 메시지 + exit(1) (PRD E1)
- EC-2: 7일 후 데이터 없는 쌍 제외 (PRD E2, E8)
- EC-3: calculateLifecycleScore null 반환 → 해당 날짜 skip (state 불변)
- EC-4: 모든 테마가 Growth/Decline 아닌 경우 → gdda: 0, penalty 적용

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨 (10개)
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
- [ ] §4.6 pseudocode와 1:1 대응 확인
