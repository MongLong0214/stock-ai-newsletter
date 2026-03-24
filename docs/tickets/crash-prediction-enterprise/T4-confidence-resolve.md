# T4: 동적 Confidence + Resolve 함수 마이그레이션

**PRD Ref**: PRD-crash-prediction-enterprise > US-3
**Priority**: P0 (Blocker)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: T3

---

## 1. Objective
crashScore 기반 연속 confidence 함수를 구현하고, `resolveMarketAssessmentFromSnapshot`을 tier-count 기반에서 crashScore 기반으로 전환한다.

**책임 경계**: confidence는 `evaluateMarketAssessmentSnapshot`에서 계산하여 `MarketAssessmentEvidence.confidence`에 저장. `resolveMarketAssessmentFromSnapshot`은 evidence.confidence를 **소비만** 한다 (재계산 안 함).

## 2. Acceptance Criteria
- [ ] AC-1: CRASH confidence = `clamp(crashScore × 0.85 + 15 + validationBonus + coherenceBonus + nightBonus, 50, 99)`
- [ ] AC-2: NORMAL confidence = `clamp(95 - crashScore × 0.5, 60, 95)`
- [ ] AC-3: validationBonus = crossValidationRatio × 8, coherenceBonus: coherent_crash=+5, korea_specific=+3, mixed=0, stale_recovery=-20, nightBonus: 야간확보=+5 else 0
- [ ] AC-4: crashScore ≥ 55 AND confidence ≥ 70 → CRASH_ALERT. crashScore ≥ 55 BUT confidence < 70 → NORMAL 다운그레이드
- [ ] AC-5: `resolveMarketAssessmentFromSnapshot`의 numericContext에 crashScore, coherence, regime 포함
- [ ] AC-6: summary에 staleness note 포함 (stale_recovery 시)
- [ ] AC-7: crossValidationRatio = (cross_checked 지표 수) / (전체 보조 지표 수)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `CRASH: score 80, all validated → confidence ~88` | Unit | 높은 스코어 | CRASH_ALERT, confidence 85+ |
| 2 | `NORMAL: score 0 → confidence 95` | Unit | 정상 | NORMAL, confidence 95 |
| 3 | `near-miss: score 49 → NORMAL confidence ~70` | Unit | 경계선 아래 | NORMAL, confidence ~70 |
| 4 | `downgrade: score 55 but low validation → confidence < 70` | Unit | 검증 부족 | NORMAL (다운그레이드) |
| 5 | `stale_recovery coherenceBonus -20 suppresses` | Unit | stale + score 60 | confidence 저하 |
| 6 | `resolve outputs crashScore in summary` | Integration | 전체 플로우 | summary에 [SCORE:XX] 포함 |
| 7 | `crossValidationRatio calculation` | Unit | VIX+FX cross, rest direct | ratio = 2/3 |
| 8 | `confidence 75 → label warning` | Unit | confidence 75 | label = 'warning' |
| 9 | `confidence 85 → label strong` | Unit | confidence 85 | label = 'strong' |
| 10 | `confidence 92 → label critical` | Unit | confidence 92 | label = 'critical' |
| 11 | `nightBonus +5 when night data available` | Unit | hasNightData=true | +5pt 적용 |

### 3.2 Test File Location
- `lib/market-data/__tests__/kis-market-assessment.test.ts` (confidence 단위)
- `lib/llm/korea/gemini-pipeline.market-assessment.test.ts` (resolve 통합)

### 3.3 Mock/Setup Required
- `MarketAssessmentEvidence` with crashScore/coherence
- `gemini-pipeline.market-assessment.test.ts` mock 업데이트

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `lib/market-data/kis-market-assessment.ts` | Modify | `calculateConfidence()` + `calculateCrossValidationRatio()` 함수 추가. `evaluateMarketAssessmentSnapshot`에서 confidence 산정 |
| `lib/llm/korea/gemini-pipeline.ts` | Modify | `resolveMarketAssessmentFromSnapshot` crashScore 기반으로 전면 교체 |

### 4.2 Implementation Steps (Green Phase)
1. `calculateCrossValidationRatio(snapshot)` 구현
2. `calculateConfidence(crashScore, crossValidationRatio, coherence, hasNightData, isCrash)` 구현
3. `evaluateMarketAssessmentSnapshot`에서 confidence + crossValidationRatio 설정
4. `resolveMarketAssessmentFromSnapshot` 교체: `crashScore ≥ 55 && confidence ≥ 70 → CRASH_ALERT`
5. numericContext/summary에 crashScore, coherence, regime 포함

### 4.3 Refactor Phase
- 기존 tier-count 기반 confidence 하드코딩(76/84/90/93) 제거

## 5. Edge Cases
- EC-1 (E11): SerpAPI 장애 → crossValidationRatio 감소 → confidence 하락
- EC-2: crashScore 55 + coherenceBonus -20 (stale) → confidence < 70 → NORMAL

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
