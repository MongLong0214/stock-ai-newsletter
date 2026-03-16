# TLI Theme Cycle Analog Retrieval — 운영 Runbook

운영팀이 cutover를 반복 가능하게 수행하기 위한 절차서.
모든 gate 기준은 `lib/tli/forecast/types.ts`의 `GATE_THRESHOLDS`에서 직접 인용.

---

## 1. Phase 0 Bridge 실행

### 목적

Bridge는 레거시 파이프라인과 신규 analog retrieval 파이프라인의 parity를 주 단위로 검증한다.
4회 연속 pass가 쌓여야 cutover 자격이 부여된다.

### 실행 절차

1. **주간 bridge run 실행**

   ```bash
   npx ts-node scripts/tli/run-phase0-bridge.ts
   ```

2. **bridge_run_audits_v1 artifact 확인**

   각 bridge row(`episode_registry`, `query_snapshot_label`, `analog_candidates_evidence`, `forecast_control`)에 대해:
   - `verdict`: `pass` / `fail` / `pending` / `pending_not_materialized`
   - `cutover_eligible`: `true` 여부 확인

3. **parity 지표 기준**

   | 지표 | 기준 |
   |------|------|
   | episode registry coverage diff | <= 2% (`bridge.coverageDiffThreshold`) |
   | episode registry coverage gap | <= 5% (`bridge.coverageGapThreshold`) |
   | query snapshot reconstruction success | >= 99% (`bridge.reconstructionSuccessThreshold`) |
   | missing point-in-time snapshot | <= 1% (`bridge.missingSnapshotThreshold`) |
   | dual-write success rate | >= 99% (`bridge.dualWriteThreshold`) |

4. **weekly verdict 확인**

   Supabase `bridge_run_audits_v1` 테이블에서 최근 4주 레코드 조회:

   ```sql
   SELECT run_date, bridge_row, verdict, cutover_eligible
   FROM bridge_run_audits_v1
   ORDER BY run_date DESC
   LIMIT 16;
   ```

5. **4회 연속 pass 카운트 확인**

   `cutover_eligible = true`인 주가 4주 연속인지 확인.
   - **필요 연속 pass 수**: `GATE_THRESHOLDS.bridge.consecutivePassesForCutover = 4`
   - pass가 끊기면 카운트 초기화. 재시작 필요.

### fail 시 조치

- `verdict = fail` 또는 `cutover_eligible = false`인 경우: 원인 row 확인 후 파이프라인 수정
- 연속 2주 실패: `GATE_THRESHOLDS.bridge.consecutiveFailuresForRollback = 2` — rollback trigger 고려

---

## 2. Rollback Drill

### 목적

실제 cutover 전에 rollback 절차의 정상 동작을 검증한다.
drill 성공 2회가 누적되어야 cutover 진행 가능.

### drill 실행 절차

1. **drill 실행**

   ```typescript
   import { runRollbackDrill } from './scripts/tli/forecast-control'

   const result = runRollbackDrill(currentControlRow)
   ```

2. **drill 성공 조건**

   - `control.rollback_target_version`이 null이 아닌 유효한 버전 문자열이어야 함
   - null이면 drill은 `success: false`, reason: `no_rollback_target`으로 실패

3. **drill 카운트 증가 규칙**

   - 성공 시: `rollback_drill_count + 1`, `rollback_drill_last_success` 갱신
   - **실패 시: count 미증가** (실패 drill은 카운트에 반영되지 않음)

4. **evidence artifact 저장**

   drill 결과의 `evidence` 필드를 `forecast_control_v1` 테이블에 기록:

   ```json
   {
     "timestamp": "<ISO 8601>",
     "from_version": "<production_version>",
     "rollback_target": "<rollback_target_version>",
     "drill_number": 1
   }
   ```

   artifact 위치: Supabase `forecast_control_v1` 테이블의 `rollback_drill_last_success` 컬럼 + 별도 drill evidence 로그

5. **필요 성공 횟수 확인**

   - **cutover 전 필요 drill 성공 수**: `GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover = 2`
   - `forecast_control_v1.rollback_drill_count >= 2` 확인

---

## 3. Retrieval Gate 리포트

### 목적

신규 analog retrieval이 기존 대비 예측 품질을 개선했는지 delta 기준으로 검증.

### 통과 기준

| 지표 | 방향 | 기준값 |
|------|------|--------|
| FuturePathCorr@5 delta | 개선 (lower bound) | >= +0.02 (`retrieval.futurePathCorrLowerBound`) |
| PeakHit@5 delta | 개선 (lower bound) | >= +0.03 (`retrieval.peakHitLowerBound`) |
| PeakGap@5 median improvement | 개선 | >= 5% (`retrieval.peakGapImprovementPct`) |
| priority slice regression | 허용 하한 | >= -0.01: pass, < -0.01: fail (`retrieval.sliceRegressionLimit`) |

### 실패 시 조치

- **Priority slice regression < -0.01**: 해당 slice 식별 후 retrieval 파라미터 재조정. Stage 3 학습 차단.
- **Stage 2 gate fail → Stage 3 학습 차단**: Stage 2를 통과하지 못하면 Stage 3 파인튜닝 진행 불가.

---

## 4. Forecast Ship Gate

### 목적

신규 forecasting 모델이 운영 환경에서 충분한 검증을 거쳤는지 확인.

### 통과 기준

| 항목 | 기준값 |
|------|--------|
| Prospective shadow 기간 | >= 6주 (`forecastShip.minProspectiveShadowWeeks`) |
| 총 live queries | >= 400건 (`forecastShip.minLiveQueries`) |
| priority slice별 live queries | >= 50건 (`forecastShip.minSliceLiveQueries`) |
| IBS relative improvement | >= 5% (`forecastShip.ibsRelativeImprovement = 0.05`) |
| Brier@5/10/20 중 개선 horizon 수 | 2개 이상 (`forecastShip.brierMinImprovingHorizons`) |
| 각 개선 Brier의 relative improvement | >= 3% (`forecastShip.brierImprovementThreshold = 0.03`) |
| global ECE | <= 0.05 (`forecastShip.globalEceCeiling`) |
| worst priority slice ECE | <= 0.08 (`forecastShip.worstSliceEceCeiling`) |

### Confidence Gating (Abstention)

개별 예측 신뢰도 게이팅. 아래 조건 중 하나라도 미충족 시 예측 abstain:

| 항목 | 기준값 |
|------|--------|
| analog_support (지지 analog 수) | >= 5 (`ABSTENTION_THRESHOLDS.minAnalogSupport`) |
| candidate concentration Gini | <= 0.60 (`ABSTENTION_THRESHOLDS.maxCandidateConcentrationGini`) |
| top-1 analog weight | <= 0.35 (`ABSTENTION_THRESHOLDS.maxTop1AnalogWeight`) |

---

## 5. Cutover 절차

### 사전 조건 체크리스트

| 조건 | 확인 방법 |
|------|----------|
| Bridge 4회 연속 pass | `bridge_run_audits_v1` 최근 4주 verdict 확인 |
| Rollback drill 2회 성공 | `forecast_control_v1.rollback_drill_count >= 2` |
| fail_closed_verified = true | `forecast_control_v1.fail_closed_verified` 확인 |
| rollback_target_version 설정 | `forecast_control_v1.rollback_target_version` null 아님 확인 |
| serving_status가 shadow 또는 canary | `forecast_control_v1.serving_status` 확인 |

### Certification Pack 검증

```typescript
import { validateCertificationPack } from './scripts/tli/certification-pack'

const result = validateCertificationPack({
  bridgeCertification: { allPassed: true, consecutivePasses: 4 },
  retrievalGate: { passed: true },
  forecastShipGate: { cutoverRecommended: true, failedCriteria: [] },
  rollbackDrills: { count: 2, allSucceeded: true },
  labelAudit: { ... }
})

// result.valid === true 여야 cutover 진행 가능
```

### Ship Memo 생성

```typescript
import { buildShipMemo } from './scripts/tli/certification-pack'

const memo = buildShipMemo(certificationPackInput)
// memo.recommendation === 'approve' 확인
```

### Serving Status 전이 절차

유효한 전이 경로:

```
shadow → canary → production
shadow → production  (direct cutover, 허용)
canary → production
production → rolled_back
rolled_back → shadow  (재시도)
```

**전이 규칙**: `validateServingStatusTransition(from, to)` 통과 필요.
무효 전이 예시: `production → shadow` 불가, `disabled → *` 불가 (terminal).

### Cutover 실행

1. `forecast_control_v1` 레코드의 `serving_status` 업데이트: `shadow` → `production`
2. `cutover_ready = true` 확인
3. `ship_verdict_artifact_id` 기록

### Serving 허용 조건 (fail-closed invariant)

모든 조건 충족 시에만 serving 활성:
- `serving_status = 'production'`
- `cutover_ready = true`
- `fail_closed_verified = true`
- `rollback_target_version` null이 아님

---

## 6. Rollback 절차

### Rollback Trigger

- **자동**: 2회 연속 실패 (`GATE_THRESHOLDS.bridge.consecutiveFailuresForRollback = 2`)
- **수동**: 운영팀 판단 또는 P0 인시던트

### Rollback 실행 절차

1. **serving_status 전이**: `production → rolled_back`
2. **rollback_target_version 확인**

   ```typescript
   import { loadRollbackTarget } from './scripts/tli/forecast-serving'

   const target = loadRollbackTarget(controlPlaneState)
   if (!target.available) {
     // CRITICAL: rollback target 없음 → serving 차단 (fail-closed)
     // isServingAllowed() = false
   }
   ```

3. **재시도 절차**: `rolled_back → shadow` 전이 후 브리지 재검증

### Fail-Closed 정책

`rollback_target_version`이 null인 상태에서 rollback이 필요한 경우:
- `isServingAllowed()` 반환값 `false`
- serving 완전 차단 (fail-open 금지)
- 운영팀이 수동으로 `rollback_target_version` 설정 후 재시도

### Fail-Open 감지 (detectFailOpen)

다음 조건 중 하나라도 해당하면 fail-open으로 판정, 즉시 차단:

| 조건 | 이유 |
|------|------|
| production 상태인데 `fail_closed_verified = false` | `serving_without_fail_closed` |
| `cutover_ready = true`인데 drill 횟수 부족 | `cutover_ready_without_drills` |
| `cutover_ready = true`인데 fail_closed 미검증 | `cutover_ready_without_fail_closed` |
| production/canary인데 rollback_target 없음 | `serving_without_rollback_target` |
