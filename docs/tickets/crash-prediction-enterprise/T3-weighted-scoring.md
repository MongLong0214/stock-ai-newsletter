# T3: 가중 시그널 스코어링

**PRD Ref**: PRD-crash-prediction-enterprise > US-1
**Priority**: P0 (Blocker)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: T1, T2

---

## 1. Objective
개별 시그널의 normalizedDrop을 계산하고, 가중치/multiplier/coherenceAdjust를 적용하여 crashScore(0-100)를 산출하는 핵심 스코어링 엔진을 구현한다.

## 2. Acceptance Criteria
- [ ] AC-1: `calculateCrashScore(snapshot, coherence, vixRegime)` 함수가 `{ crashScore, signalDetails[] }` 반환
- [ ] AC-2: 초기 가중치: US=0.30, KOSPI=0.25, VIX=0.20, FX=0.10, Event=0.15
- [ ] AC-3: 각 normalizedDrop은 개별 clamp(0, 100) 적용
- [ ] AC-4: VIX signal만 regimeMultiplier 적용, 나머지 multiplier=1.0
- [ ] AC-5: coherenceAdjust 적용: coherent_normal=1.0, coherent_crash=1.0, korea_specific(KOSPI=0.8, Event=1.5), mixed(KOSPI=0.5), stale_recovery(KOSPI=0.0)
- [ ] AC-6: single_source(교차검증 미달) 시그널은 weight × 0.6 감쇠
- [ ] AC-7: crashScore ≥ 55 → CRASH_ALERT 후보
- [ ] AC-8: 기존 tier1/2/3 시그널 분류는 유지 (signalDetails와 병행)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `corona crash: S&P -9.51%, VIX 75 → score 100` | Unit | 극단 폭락 | crashScore=100 (clamp) |
| 2 | `night recovery: US +1%, stale_recovery → score 0` | Unit | 야간반등 | crashScore=0 |
| 3 | `near miss: US -2.4%, KOSPI -2.3%, VIX 23 → score ~49` | Unit | 경계선 | crashScore < 55 |
| 4 | `single_source VIX applies 0.6 penalty` | Unit | VIX single_source | VIX contribution × 0.6 |
| 5 | `korea_specific boosts event weight 1.5×` | Unit | 이벤트 + 한국단독 | event contribution × 1.5 |
| 6 | `VIX extreme regime: multiplier 0.4` | Unit | VIX 45, extreme | VIX contribution × 0.4 |
| 7 | `VIX decline: normalizedDrop = 0` | Unit | VIX change < 0 | VIX contribution = 0 |
| 8 | `all signals normal → score near 0` | Unit | 모든 양호 | crashScore ≈ 0 |
| 9 | `normalizedDrop clamped to 100` | Unit | S&P -15% → 500pt → clamp 100 | clampedDrop = 100 |
| 10 | `FX normalizedDrop: +20원 → 100` | Unit | USD/KRW +20원 | normalizedDrop = 100 |
| 11 | `FX normalizedDrop: +10원 → 50` | Unit | USD/KRW +10원 | normalizedDrop = 50 |
| 12 | `Event normalizedDrop: 2 detected → 66.7` | Unit | 2개 이벤트 감지 | normalizedDrop ≈ 66.7 |
| 13 | `VIX decline (change<0) → normalizedDrop 0` | Unit | VIX change=-3 | normalizedDrop = 0 |

### 3.2 Test File Location
- `lib/market-data/__tests__/kis-market-assessment.test.ts`

### 3.3 Mock/Setup Required
- `MarketAssessmentSnapshot` 수동 생성
- T1 `getVixRegime`, T2 `classifyDirectionCoherence` 결과를 파라미터로 전달

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `lib/market-data/kis-market-assessment.ts` | Modify | `SIGNAL_WEIGHTS` 상수 + `calculateNormalizedDrop()` + `calculateCrashScore()` 함수 추가 |

### 4.2 Implementation Steps (Green Phase)
1. `SIGNAL_WEIGHTS` 상수 정의: `{ us: 0.30, kospi: 0.25, vix: 0.20, fx: 0.10, event: 0.15 }`
2. 시그널별 `calculateNormalizedDrop(signal, type)` 구현 (PRD AC-1.2 공식)
3. `SignalScoreDetail[]` 배열 생성: 각 시그널의 normalizedDrop, weight, multiplier, coherenceAdjust, contribution
4. `crashScore = clamp(Σ contributions, 0, 100)` 계산
5. `evaluateMarketAssessmentSnapshot`에서 `calculateCrashScore` 호출, `evidence.crashScore` + `evidence.signalDetails` 설정

### 4.3 Refactor Phase
- normalizedDrop 산정식을 시그널 타입별 strategy 패턴으로 분리 검토

## 5. Edge Cases
- EC-1 (E9): SerpAPI vs Naver VIX 불일치 → single_source 감쇠
- EC-2 (E7): VIX 이미 45 + 추가 +2pt → extreme regime × 0.4
- EC-3 (E8): 외국인 2조 + KOSPI -1% → 약한 하락 + 외국인 Tier2만

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
