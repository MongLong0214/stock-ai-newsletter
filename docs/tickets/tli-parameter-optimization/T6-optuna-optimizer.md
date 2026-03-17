# T6: Python Optuna Optimizer

**PRD Ref**: PRD-tli-parameter-optimization > US-1
**Priority**: P0 (Blocker)
**Size**: L (4-8h)
**Status**: Todo
**Depends On**: T5

---

## 1. Objective

Python Optuna 기반 2단계 계층적 최적화 스크립트. evaluate.ts를 subprocess로 호출하여 GDDA를 최적화하고, 최적 파라미터를 JSON + TypeScript 스니펫으로 출력.

## 2. Acceptance Criteria

- [ ] AC-1: `python scripts/tli-optimizer/optimize.py` 실행 시 2단계 최적화 수행 (Stage 1: 80t, Stage 2: 120t)
- [ ] AC-2: subprocess.run list-based 호출 (shell=False). 30초 timeout per trial
- [ ] AC-3: 완료 후 `optimized-params.json` 생성 + TypeScript 코드 스니펫 stdout 출력
- [ ] AC-4: Train GDDA + Val GDDA 보고. |Train - Val| > 10%p 시 `[WARNING] Overfitting detected` 출력
- [ ] AC-5: 가중치는 3+1 계산 (w_activity = 1.0 - sum). bounds 위반 시 NaN (trial reject)
- [ ] AC-6: Stage thresholds 단조 증가 제약 (dormant < emerging < growth < peak)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `optimize.py runs 1 trial without error` | Integration | 최소 1 trial 실행 | exit code 0 |
| 2 | `subprocess uses list-based command` | Unit | subprocess.run 호출 검증 | shell=False |
| 3 | `weight constraint: w_activity computed correctly` | Unit | 3개 가중치 → 4번째 계산 | sum = 1.0 |
| 4 | `stage threshold monotonicity enforced` | Unit | 역전 입력 → NaN 반환 | trial pruned |
| 5 | `overfitting warning when train-val gap > 10%p` | Unit | train=0.8, val=0.6 | WARNING 출력 |
| 6 | `outputs optimized-params.json` | Integration | 최적화 완료 후 | 파일 존재 + valid JSON |
| 7 | `outputs TypeScript snippet to stdout` | Integration | 최적화 완료 후 | TS 코드 포함 |
| 8 | `subprocess.run never uses shell=True` | Unit | 모든 subprocess.run 호출 검증 | shell kwarg absent or False |
| 9 | `handles subprocess timeout with trial pruning` | Unit | 30초 초과 시뮬레이션 | trial pruned + logged |
| 10 | `handles evaluate.ts crash with stderr capture` | Unit | non-zero exit code | trial failed + stderr captured |

### 3.2 Test File Location
- `scripts/tli-optimizer/test_optimize.py` (pytest)

### 3.3 Mock/Setup Required
- evaluate.ts mock (고정 GDDA 반환하는 stub script)
- `subprocess.run` 패치 (pytest mock)
- 소규모 trial 수 (n_trials=2) for integration test

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `scripts/tli-optimizer/optimize.py` | Create | Optuna 2단계 최적화 메인 스크립트 |
| `scripts/tli-optimizer/param_space.py` | Create | 탐색 공간 정의 + 제약 조건 |

### 4.2 Implementation Steps (Green Phase)
1. param_space.py: Stage 1 (core 10개) + Stage 2 (fine-tune 23개) 파라미터 정의
2. optimize.py: Stage 1 study 생성 (TPE sampler, 80 trials)
   - objective: subprocess → evaluate.ts --split=train → GDDA 파싱
   - 3+1 가중치 계산 + bounds 검증
   - 단조 증가 검증
3. Stage 1 완료 → 상위 10% trial median으로 core params 고정
4. Stage 2 study 생성 (120 trials, core 고정)
5. 최적 trial → evaluate.ts --split=val 실행 → Val GDDA
6. 과적합 판정 (|Train-Val| > 10%p)
7. optimized-params.json 저장 + TS 스니펫 stdout

### 4.3 Refactor Phase
- Optuna visualization (contour plot) 생성 옵션 추가

## 5. Edge Cases
- EC-1: evaluate.ts timeout (30초) → trial pruning + 로깅 (PRD E5)
- EC-2: evaluate.ts crash → stderr 캡처 + trial failed + continue
- EC-3: Val GDDA < baseline → `[ERROR] Optimization failed` 경고
- EC-4: 모든 trial NaN → "No valid trial found" 에러

## 6. Review Checklist
- [ ] Red: pytest 실행 → FAILED 확인됨
- [ ] Green: pytest 실행 → PASSED 확인됨
- [ ] AC 전부 충족
- [ ] shell=True 사용하지 않음
- [ ] 30초 timeout 적용됨
- [ ] 2단계 계층적 최적화 구현됨
