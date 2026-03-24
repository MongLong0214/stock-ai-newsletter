# T6: 역사적 시나리오 백테스트 스위트

**PRD Ref**: PRD-crash-prediction-enterprise > US-5
**Priority**: P0 (Blocker)
**Size**: L (4-8h)
**Status**: Todo
**Depends On**: T1, T2, T3, T4 (T5와 병렬 실행 가능 — 백테스트는 프롬프트 경로 미사용)

---

## 1. Objective
31개 역사적/가상 시나리오(16 폭락 + 15 비폭락)의 완전한 MarketAssessmentSnapshot을 구성하고, 전체 evaluate→resolve 플로우를 검증하여 정확도 ≥ 93%를 확인한다.

## 2. Acceptance Criteria
- [ ] AC-1: 16개 폭락 시나리오(TP 기대) 각각 완전한 snapshot 생성 (US 3지수 + KOSPI + VIX + FX + events + nightSession)
- [ ] AC-2: 15개 비폭락 시나리오(TN 기대) 각각 완전한 snapshot 생성
- [ ] AC-3: 각 시나리오에서 `evaluateMarketAssessmentSnapshot` → `resolveMarketAssessmentFromSnapshot` 전체 플로우 실행
- [ ] AC-4: TP/TN/FP/FN 매트릭스 출력 (console.table 또는 assertion)
- [ ] AC-5: 전체 정확도 ≥ 93% (31개 중 2개 이하 오류)
- [ ] AC-6: 다중 이벤트 시나리오 2개 이상 포함 (TP-13, TP-16)
- [ ] AC-7: US holiday, partial failure 시나리오 포함 (TN-11, TN-12)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `TP-01: 2008 financial crisis` | Integration | S&P -3.45%, VIX 79 | CRASH_ALERT |
| 2 | `TP-02: 2008 Lehman` | Integration | S&P -8.81%, VIX 46 | CRASH_ALERT |
| 3 | `TP-03: 2020 COVID main` | Integration | S&P -9.51%, VIX 75 | CRASH_ALERT |
| 4 | `TP-04: 2020 COVID circuit` | Integration | S&P -11.98%, VIX 82 | CRASH_ALERT |
| 5 | `TP-05: 2020 COVID early` | Integration | S&P -4.42%, VIX 39 | CRASH_ALERT |
| 6 | `TP-06: 2022 rate shock` | Integration | S&P -3.88%, VIX 34 | CRASH_ALERT |
| 7 | `TP-07: 2018 VIX shock` | Integration | VIX +115%, S&P -4.1% | CRASH_ALERT |
| 8 | `TP-08: 2024 yen carry` | Integration | Nikkei -12.4%, KOSPI -8.77% | CRASH_ALERT |
| 9 | `TP-09: 2025 tariff` | Integration | S&P -5.97%, KOSPI -5.57% | CRASH_ALERT |
| 10 | `TP-10: 2018 trade war` | Integration | S&P -3.29%, VIX 22→28 | CRASH_ALERT |
| 11 | `TP-11: 2015 China` | Integration | S&P -3.94%, KOSPI -2.47% | CRASH_ALERT |
| 12 | `TP-12: 2011 downgrade` | Integration | S&P -6.66% | CRASH_ALERT |
| 13 | `TP-13: 2020 oil+pandemic multi-event` | Integration | S&P -7.60%, VIX 54, 2 events | CRASH_ALERT |
| 14 | `TP-14: 2022 CPI shock` | Integration | S&P -4.32%, VIX 27 | CRASH_ALERT |
| 15 | `TP-15: Korea standalone crisis` | Integration | US flat, KOSPI -4%, geopolitics | CRASH_ALERT |
| 16 | `TP-16: tariff+geopolitics multi-event` | Integration | S&P -3.5%, 2 events | CRASH_ALERT |
| 17 | `TN-01: 2026-03-24 night recovery` | Integration | US +1%, stale_recovery | NORMAL |
| 18 | `TN-02: normal day` | Integration | US -0.5%, VIX 18 | NORMAL |
| 19 | `TN-03: mild correction` | Integration | US -1.5%, VIX 22 | NORMAL |
| 20 | `TN-04: VIX spike only` | Integration | VIX 28, US flat | NORMAL |
| 21 | `TN-05: Korea mild decline` | Integration | US +0.5%, KOSPI -1.2% | NORMAL |
| 22 | `TN-06: FX only` | Integration | USD/KRW +20, rest stable | NORMAL |
| 23 | `TN-07: options expiry vol` | Integration | VIX 25, US -0.8% | NORMAL |
| 24 | `TN-08: night session flat` | Integration | KOSPI night -0.3% | NORMAL |
| 25 | `TN-09: Nikkei isolated` | Integration | Nikkei -3%, rest flat | NORMAL |
| 26 | `TN-10: event no impact` | Integration | 관세 뉴스, US +0.2% | NORMAL |
| 27 | `TN-11: US holiday` | Integration | US 0%, KOSPI -1.5% | NORMAL |
| 28 | `TN-12: partial API failure` | Integration | VIX single_source | NORMAL |
| 29 | `TN-13: extreme VIX no new change` | Integration | VIX 45, +2pt | NORMAL |
| 30 | `TN-14: massive recovery confirmed` | Integration | 전일 -10%, 야간 +8% | NORMAL |
| 31 | `TN-15: near miss boundary` | Integration | score ~49 | NORMAL |

### 3.2 Test File Location
- `lib/market-data/__tests__/kis-market-assessment-backtest.test.ts` (신규 파일)

### 3.3 Mock/Setup Required
- `createBacktestSnapshot(overrides)` 헬퍼 함수: 기본 정상 snapshot + 시나리오별 override
- `resolveMarketAssessmentFromSnapshot` import (gemini-pipeline.ts에서)

**createBacktestSnapshot 기본값 스펙:**
```typescript
{
  sp500: { price: 5500, change: 0, changePct: 0, validation: 'direct' },
  dowJones: { price: 42000, change: 0, changePct: 0, validation: 'direct' },
  nasdaqComposite: { price: 17000, change: 0, changePct: 0, validation: 'direct' },
  kospi200MiniFutures: { price: 350, change: 0, changePct: 0, validation: 'direct' },
  vix: { price: 18, change: 0, changePct: 0, validation: 'cross_checked' },
  usdKrw: { price: 1350, change: 0, changePct: 0, validation: 'cross_checked' },
  usdJpy: null,
  nightSession: { kospiMiniFutures: null, isPreMarketHours: true },
  supplementary: { kospi200Futures: null, nikkeiFutures: null, foreignerNetSelling: null },
  events: { all 5 types: detected: false }
}
```

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `lib/market-data/__tests__/kis-market-assessment-backtest.test.ts` | Create | 31개 시나리오 백테스트 |

### 4.2 Implementation Steps (Green Phase)
1. `createBacktestSnapshot(overrides)` 헬퍼 구현
2. 16개 TP 시나리오 snapshot 데이터 작성
3. 15개 TN 시나리오 snapshot 데이터 작성
4. 각 시나리오: `evaluate(snapshot)` → `resolve(snapshot, evidence)` → verdict assert
5. 전체 TP/TN/FP/FN 집계 + accuracy assert ≥ 93%

### 4.3 Refactor Phase
- 시나리오 데이터를 별도 fixtures 파일로 분리 검토

## 5. Edge Cases
- EC-1: 경계선 시나리오 (crashScore 52-58) 추가 검토
- EC-2: 가중치 미세 조정이 필요하면 T3 가중치 상수 수정 후 재실행

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨 (evaluate/resolve 미구현 상태)
- [ ] Green: T1-T5 구현 완료 후 테스트 실행 → PASSED 확인됨
- [ ] 31개 시나리오 전부 기대값과 일치 (또는 2개 이하 오차)
- [ ] accuracy ≥ 93% assertion 통과
