# T2: 방향 정합성 매트릭스 (Direction Coherence)

**PRD Ref**: PRD-crash-prediction-enterprise > US-2, US-6
**Priority**: P1 (High)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: None

---

## 1. Objective
US시장/KOSPI/야간선물/이벤트/보조지표의 방향 조합을 분석하여 5가지 coherence 상태를 분류하는 Decision Tree를 구현한다. 기존 `kospiDataStale` boolean을 확장 대체한다.

## 2. Acceptance Criteria
- [ ] AC-1: `classifyDirectionCoherence(snapshot)` 함수가 `DirectionCoherence` 타입 반환: `'coherent_normal' | 'coherent_crash' | 'stale_recovery' | 'korea_specific' | 'mixed'`
- [ ] AC-2: Decision Tree §1 — 야간 데이터 존재 시 야간 기준 판정
- [ ] AC-3: Decision Tree §2 — 프리마켓 + 야간 없음: stale 후보 판정 → Nikkei/외국인 예외규칙 통합
- [ ] AC-4: Decision Tree §2 — US holiday 처리: US 3지수 changePct 모두 0 → 'mixed'
- [ ] AC-5: stale_recovery 조건에 5종 이벤트(tariffs/geopolitics/centralBank/financialInstitution/pandemic) 모두 detected=false 체크
- [ ] AC-6: 기존 `kospiDataStale` boolean과 `stalenessNote`는 coherence 결과로부터 파생 유지 (하위 호환)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `night session up → coherent_normal` | Unit | 야간 +3%, US +1% | coherent_normal |
| 2 | `night session crash + US crash → coherent_crash` | Unit | 야간 -3%, US -3% | coherent_crash |
| 3 | `night session down + event → korea_specific` | Unit | 야간 -2%, US flat, 관세 이벤트 | korea_specific |
| 4 | `no night + US up + KOSPI down + calm → stale_recovery` | Unit | US +1%, KOSPI주간 -6%, VIX calm, no event | stale_recovery |
| 5 | `no night + US down + KOSPI down → coherent_crash` | Unit | US -3%, KOSPI -3% | coherent_crash |
| 6 | `no night + US up + KOSPI down + event → korea_specific` | Unit | US +0.5%, KOSPI -3%, 관세 | korea_specific |
| 7 | `no night + stale candidate + Nikkei down → mixed` | Unit | stale 후보 BUT Nikkei -2% confirmed | mixed |
| 8 | `no night + stale candidate + foreigner 2T → korea_specific` | Unit | stale 후보 BUT 외국인 2T 순매도 | korea_specific |
| 9 | `US holiday (all 0%) + KOSPI down → mixed` | Unit | US 3지수 0%, KOSPI -2% | mixed |
| 10 | `daytime hours → coherent_normal` | Unit | isPreMarketHours=false | coherent_normal |
| 11 | `preserves kospiDataStale backward compat` | Unit | stale_recovery → kospiDataStale=true | true |
| 12 | `night session moderate down + no event → mixed` | Unit | 야간 -1%, US flat, no event | mixed |
| 13 | `KOSPI -1.5% boundary → stale candidate` | Unit | 경계값 -1.5% 정확히 | stale 후보 진입 |

### 3.2 Test File Location
- `lib/market-data/__tests__/kis-market-assessment.test.ts`

### 3.3 Mock/Setup Required
- `MarketAssessmentSnapshot` 수동 생성 (기존 테스트 패턴 따름)

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `lib/market-data/kis-market-assessment.ts` | Modify | `DirectionCoherence` 타입 export + `classifyDirectionCoherence()` 함수 추가. 기존 staleness 로직을 이 함수로 통합 |

### 4.2 Implementation Steps (Green Phase)
1. `DirectionCoherence` 타입 정의 + export
2. `classifyDirectionCoherence(snapshot): { coherence, kospiDataStale, stalenessNote }` 구현
3. Decision Tree §1 (야간 데이터) → §2 (프리마켓 no night) → §3 (주간) 순서
4. §2 내부에 Nikkei/외국인/US holiday 예외규칙 통합
5. `evaluateMarketAssessmentSnapshot`에서 기존 staleness 로직을 `classifyDirectionCoherence` 호출로 교체

### 4.3 Refactor Phase
- 기존 `kospiDataStale` 관련 인라인 로직 제거, coherence 함수로 일원화

## 5. Edge Cases
- EC-1 (E1): 전일 -6% 야간 +5% → stale_recovery
- EC-2 (E12): US holiday + KOSPI -3% → mixed
- EC-3 (E13): 다중 이벤트 → korea_specific 또는 coherent_crash

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
