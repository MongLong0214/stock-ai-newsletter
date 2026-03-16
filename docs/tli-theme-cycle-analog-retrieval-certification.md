# TLI Theme Cycle Analog Retrieval — Enterprise Certification

TCAR-020: Enterprise certification pack 구조, gate 기준, ship approval memo 포맷, evidence artifact 목록, 재생성 절차.
모든 수치는 `lib/tli/forecast/types.ts`의 `GATE_THRESHOLDS` / `ABSTENTION_THRESHOLDS`에서 직접 인용.

---

## 1. Certification Pack 구조

Certification pack은 `validateCertificationPack(input: CertificationPackInput)`에 전달되는 5개 섹션으로 구성.

### CertificationPackInput 필드

```typescript
interface CertificationPackInput {
  bridgeCertification: {
    allPassed: boolean          // 모든 bridge row가 pass여야 함
    consecutivePasses: number   // >= 4 (GATE_THRESHOLDS.bridge.consecutivePassesForCutover)
  }
  retrievalGate: {
    passed: boolean             // retrieval gate 전체 통과 여부
  }
  forecastShipGate: {
    cutoverRecommended: boolean // forecast ship gate 전체 통과 여부
    failedCriteria: string[]    // 실패한 기준 목록 (빈 배열이어야 approve)
  }
  rollbackDrills: {
    count: number               // >= 2 (GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover)
    allSucceeded: boolean       // 모든 drill이 성공이어야 함
  }
  labelAudit: {
    overlappingEpisodes: number         // = 0
    inferredBoundaryRatio: number       // <= 0.15
    inferredBoundarySliceRatio: number  // <= 0.10
    rightCensoredAsNegatives: number    // = 0
    futureInformedBoundaryChanges: number // = 0
  }
}
```

### 검증 결과

```typescript
interface CertificationPackResult {
  valid: boolean          // true = 모든 gate 통과 → cutover 권장
  missingItems: string[]  // 미통과 항목 목록
}
```

`missingItems` 가능 값:
- `bridge_certification`
- `retrieval_gate`
- `forecast_ship_gate`
- `rollback_drills`
- `label_audit`

---

## 2. Gate 통과 기준 (GATE_THRESHOLDS 직접 인용)

### retrieval.*

| 상수 | 값 | 의미 |
|------|-----|------|
| `retrieval.futurePathCorrLowerBound` | `0.02` | delta FuturePathCorr@5 >= +0.02 |
| `retrieval.peakHitLowerBound` | `0.03` | delta PeakHit@5 >= +0.03 |
| `retrieval.peakGapImprovementPct` | `5` | PeakGap@5 중앙값 개선 >= 5% |
| `retrieval.sliceRegressionLimit` | `-0.01` | priority slice regression >= -0.01: pass, < -0.01: fail |

### forecastShip.*

| 상수 | 값 | 의미 |
|------|-----|------|
| `forecastShip.minProspectiveShadowWeeks` | `6` | prospective shadow >= 6주 |
| `forecastShip.minLiveQueries` | `400` | 총 live queries >= 400건 |
| `forecastShip.minSliceLiveQueries` | `50` | priority slice별 live queries >= 50건 |
| `forecastShip.ibsRelativeImprovement` | `0.05` | IBS relative improvement >= 5% |
| `forecastShip.brierImprovementThreshold` | `0.03` | 개선 Brier의 relative improvement >= 3% |
| `forecastShip.brierMinImprovingHorizons` | `2` | Brier@5/10/20 중 개선 horizon >= 2개 |
| `forecastShip.globalEceCeiling` | `0.05` | global ECE <= 0.05 |
| `forecastShip.worstSliceEceCeiling` | `0.08` | worst priority slice ECE <= 0.08 |

### data.*

| 상수 | 값 | 의미 |
|------|-----|------|
| `data.coverageGapCeiling` | `0.05` | unknown/coverage_gap <= 5% |
| `data.leakageAuditFailuresCeiling` | `0` | point-in-time leakage audit failures = 0 |
| `data.missingSnapshotCeiling` | `0.01` | missing point-in-time snapshot <= 1% |

### bridge.*

| 상수 | 값 | 의미 |
|------|-----|------|
| `bridge.consecutivePassesForCutover` | `4` | cutover 전 연속 pass 필요 수 |
| `bridge.consecutiveFailuresForRollback` | `2` | rollback trigger 연속 실패 수 |
| `bridge.rollbackDrillsBeforeCutover` | `2` | cutover 전 drill 성공 필요 수 |
| `bridge.coverageDiffThreshold` | `0.02` | episode registry coverage diff <= 2% |
| `bridge.coverageGapThreshold` | `0.05` | episode registry coverage gap <= 5% |
| `bridge.reconstructionSuccessThreshold` | `0.99` | query snapshot reconstruction >= 99% |
| `bridge.missingSnapshotThreshold` | `0.01` | missing point-in-time snapshot <= 1% |
| `bridge.dualWriteThreshold` | `0.99` | dual-write success rate >= 99% |

### labelAudit.*

| 상수 | 값 | 의미 |
|------|-----|------|
| `labelAudit.overlappingEpisodesCeiling` | `0` | overlapping episodes = 0 |
| `labelAudit.inferredBoundaryOverallCeiling` | `0.15` | inferred-boundary rows <= 15% (전체) |
| `labelAudit.inferredBoundarySliceCeiling` | `0.10` | inferred-boundary rows <= 10% (priority slice) |
| `labelAudit.rightCensoredAsNegativesCeiling` | `0` | right-censored rows used as completed negatives = 0 |
| `labelAudit.futureInformedBoundaryChangesCeiling` | `0` | future-informed boundary changes in replay = 0 |

### ABSTENTION_THRESHOLDS.*

개별 예측 신뢰도 게이팅. 아래 조건 중 하나라도 미충족 시 abstain:

| 상수 | 값 | 의미 |
|------|-----|------|
| `ABSTENTION_THRESHOLDS.minAnalogSupport` | `5` | analog_support >= 5 |
| `ABSTENTION_THRESHOLDS.maxCandidateConcentrationGini` | `0.60` | Gini <= 0.60 |
| `ABSTENTION_THRESHOLDS.maxTop1AnalogWeight` | `0.35` | top-1 analog weight <= 0.35 |

---

## 3. Ship Approval Memo 포맷

`buildShipMemo(input: CertificationPackInput): ShipMemo`가 반환하는 구조.

```typescript
interface ShipMemo {
  recommendation: 'approve' | 'reject'   // validateCertificationPack.valid 기반
  gateResults: {
    bridge: boolean        // allPassed && consecutivePasses >= 4
    retrieval: boolean     // retrievalGate.passed
    forecastShip: boolean  // forecastShipGate.cutoverRecommended
    rollback: boolean      // count >= 2 && allSucceeded
    labelAudit: boolean    // 5개 label audit 기준 모두 충족
  }
  thresholds: {
    globalEceCeiling: number          // 0.05  (forecastShip.globalEceCeiling)
    worstSliceEceCeiling: number      // 0.08  (forecastShip.worstSliceEceCeiling)
    ibsRelativeImprovement: number    // 0.05  (forecastShip.ibsRelativeImprovement)
    futurePathCorrLowerBound: number  // 0.02  (retrieval.futurePathCorrLowerBound)
  }
  generatedAt: string  // ISO 8601 timestamp
}
```

### 예시 approve memo

```json
{
  "recommendation": "approve",
  "gateResults": {
    "bridge": true,
    "retrieval": true,
    "forecastShip": true,
    "rollback": true,
    "labelAudit": true
  },
  "thresholds": {
    "globalEceCeiling": 0.05,
    "worstSliceEceCeiling": 0.08,
    "ibsRelativeImprovement": 0.05,
    "futurePathCorrLowerBound": 0.02
  },
  "generatedAt": "2026-03-13T00:00:00.000Z"
}
```

`recommendation: 'reject'` 시 `gateResults`에서 `false`인 항목을 확인하고 해당 gate 재검증 후 pack 재생성.

---

## 4. Evidence Artifact 목록

cutover 전 다음 artifact가 모두 존재해야 한다.

| Artifact | 테이블/위치 | 확인 방법 |
|----------|------------|----------|
| `bridge_run_audits_v1` | Supabase `bridge_run_audits_v1` | 최근 4주 `verdict = pass`, `cutover_eligible = true` |
| `episode_registry_v1` | Supabase `episode_registry_v1` | coverage diff <= 2%, gap <= 5% |
| `query_snapshot_v1` | Supabase `query_snapshot_v1` | reconstruction success >= 99% |
| `label_table_v1` | Supabase `label_table_v1` | label audit 5개 기준 충족 |
| `analog_candidates_v1` | Supabase `analog_candidates_v1` | retrieval gate input |
| `analog_evidence_v1` | Supabase `analog_evidence_v1` | retrieval gate 결과 |
| `forecast_control_v1` | Supabase `forecast_control_v1` | rollback_drill_count >= 2, fail_closed_verified = true |
| ship verdict artifact | `forecast_control_v1.ship_verdict_artifact_id` | buildShipMemo 결과 저장 후 ID 기록 |
| rollback drill evidence | `forecast_control_v1.rollback_drill_last_success` | 마지막 성공 drill의 timestamp |

---

## 5. 재생성 절차

### 전체 certification pack 재생성

```typescript
import { validateCertificationPack, buildShipMemo } from './scripts/tli/certification-pack'

// Step 1: 각 gate input 수집
const input: CertificationPackInput = {
  bridgeCertification: {
    allPassed: await checkBridgeAudits(),        // bridge_run_audits_v1 최근 4주 조회
    consecutivePasses: await countConsecutivePasses(),
  },
  retrievalGate: {
    passed: await checkRetrievalGate(),           // analog_candidates_v1 + analog_evidence_v1 기반
  },
  forecastShipGate: {
    cutoverRecommended: await checkForecastShipGate(), // forecast_control_v1 기반
    failedCriteria: await getFailedCriteria(),
  },
  rollbackDrills: {
    count: controlRow.rollback_drill_count,
    allSucceeded: controlRow.rollback_drill_last_success !== null,
  },
  labelAudit: {
    overlappingEpisodes: await countOverlappingEpisodes(),     // episode_registry_v1
    inferredBoundaryRatio: await calcInferredBoundaryRatio(),  // label_table_v1
    inferredBoundarySliceRatio: await calcSliceRatio(),
    rightCensoredAsNegatives: await countRightCensored(),
    futureInformedBoundaryChanges: await countFutureInformed(),
  },
}

// Step 2: pack 검증
const packResult = validateCertificationPack(input)

// Step 3: ship memo 생성
const memo = buildShipMemo(input)

// Step 4: memo 저장 및 ship_verdict_artifact_id 기록
await saveShipMemo(memo)
await updateForecastControl({ ship_verdict_artifact_id: memoId })
```

### 각 gate input 수집 경로

| Gate | 수집 경로 |
|------|---------|
| Bridge | Supabase `bridge_run_audits_v1` — `run_date DESC LIMIT 4` |
| Retrieval | Supabase `analog_evidence_v1` — delta 지표 계산 |
| Forecast Ship | Supabase `forecast_control_v1` — shadow 기간, live query 수 집계 |
| Rollback Drills | `forecast_control_v1.rollback_drill_count` + `rollback_drill_last_success` |
| Label Audit | Supabase `label_table_v1` + `episode_registry_v1` — 비율 계산 |

### 개별 gate 재검증

```typescript
import { buildRunbookChecklist } from './scripts/tli/certification-pack'

// runbook 섹션 + threshold 참조값 확인
const checklist = buildRunbookChecklist()
// checklist.thresholdReferences = {
//   consecutivePassesForCutover: 4,
//   rollbackDrillsBeforeCutover: 2,
//   consecutiveFailuresForRollback: 2,
// }
```
