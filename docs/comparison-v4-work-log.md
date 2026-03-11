# Comparison v4 Work Log

- Date: 2026-03-11
- Context: `docs/comparison-v4-prd.md` / `docs/comparison-v4-tickets.md`
- Status: In progress
- Last verified state: `npx vitest run` green (493 tests, 52 files), `npx tsc --noEmit` green

## 1. Summary

현재 `comparison-v4` 작업은 foundation/helper 단계는 상당 부분 구현됐고, 일부 실제 운영 경로도 추가됐다.

완료/진행된 큰 축:

1. spec/stats foundation
2. v2 internal schema/types
3. shadow comparison/snapshot write foundation
4. fixed-horizon evaluator foundation
5. replay/backtest/report foundation
6. v4 serving reader + legacy fallback foundation
7. manifest / cutover / promotion / release helper foundation
8. admin promote route foundation
9. observability/runbook 문서 foundation

아직 미완/보강 필요:

1. 실제 `published` 승격 orchestration을 운영 절차에 녹이는 것
2. ~~실제 row-level backfill/parity 실행 경로 강화~~ → CMPV4-010 완료
3. ~~`theme_comparison_eval_v2` 실저장 경로~~ → CMPV4-007 완료
4. ~~`theme_state_history_v2` backfill + ongoing sync 실제 구현~~ → CMPV4-003 완료
5. e2e / integration parity를 helper 수준이 아니라 더 실제적인 경로로 확장

## 2. What Was Implemented

### 2.1 Spec / Stats

- `lib/tli/comparison/spec.ts`
- `lib/tli/stats/comparison-stats.ts`
- `lib/tli/comparison/index.ts`

구현 내용:

- primary horizon, candidate pool, tie-break, threshold regime, relevance/gain, run-level censoring 상수화
- rolling-origin fold helper
- calendar-day embargo helper
- cluster bootstrap delta helper
- power-analysis markdown helper

### 2.2 v2 Schema / Types

- `supabase/migrations/016_comparison_v4_foundation.sql`
- `supabase/migrations/017_comparison_v4_control.sql`
- `lib/tli/types/db.ts`

구현 내용:

- `theme_comparison_runs_v2`
- `theme_comparison_candidates_v2`
- `theme_comparison_eval_v2`
- `prediction_snapshots_v2`
- `theme_state_history_v2`
- `comparison_backfill_manifest_v2`
- `comparison_v4_control`
- v2 관련 TS type 추가

### 2.3 Shadow / Evaluator / Replay

- `scripts/tli/comparison-v4-records.ts`
- `scripts/tli/comparison-v4-shadow.ts`
- `scripts/tli/comparison-v4-evaluator.ts`
- `scripts/tli/comparison-v4-replay.ts`
- `scripts/tli/comparison-v4-backtest.ts`

구현 내용:

- v2 run/candidate/snapshot row builder
- shadow config/env helper
- shadow run/candidate upsert
- shadow snapshot upsert
- no-match run 처리
- rerun stale snapshot cleanup
- candidate pool 판정 helper
- fixed-horizon evaluator helper
- point-in-time stage alignment helper
- replay/backtest/report helper

### 2.4 Existing TLI Script Refactors

- `scripts/tli/calculate-comparisons.ts`
- `scripts/tli/snapshot-predictions.ts`
- `scripts/tli/evaluate-comparisons.ts`
- `scripts/tli/backtest-comparisons.ts`
- `scripts/tli/enrich-themes.ts`

구현 내용:

- `calculate-comparisons.ts`
  - shadow run write 연결
  - no-match run도 shadow row 생성
  - shadow match payload 보강
- `snapshot-predictions.ts`
  - shadow run lookup
  - shadow candidate 기반 prediction input 사용
  - stale snapshot 정리
- `evaluate-comparisons.ts`
  - fixed-horizon evaluator helper 사용
  - run-level censoring 반영
  - latest-stage 비교 제거
  - `resolveFirstSpikeDate` 재사용
- `backtest-comparisons.ts`
  - v4 replay/backtest helper 사용
  - `theme_state_history_v2` 기반 archetype candidate 선택
  - fold-aware held-out threshold summary
- `enrich-themes.ts`
  - `resolveFirstSpikeDate` export

### 2.5 Serving / Contract / Ops

- `app/api/tli/themes/[id]/comparison-v4-reader.ts`
- `app/api/tli/themes/[id]/fetch-theme-data-v4.ts`
- `app/api/tli/themes/[id]/fetch-theme-data.ts`
- `app/api/admin/tli/comparison-v4/promote/route.ts`
- `app/api/openapi.json/route.test.ts`
- `docs/comparison-v4-runbook.md`
- `docs/comparison-v4-observability.md`

구현 내용:

- server-side privileged reader 경로
- v4 reader 실패/empty 시 legacy fallback
- production version pointer helper 사용
- admin promote API foundation
- observability/runbook 문서 추가

### 2.6 Promotion / Cutover / Backfill Helpers

- `scripts/tli/comparison-v4-manifest.ts`
- `scripts/tli/comparison-v4-cutover.ts`
- `scripts/tli/comparison-v4-control.ts`
- `scripts/tli/comparison-v4-promotion.ts`
- `scripts/tli/comparison-v4-release.ts`
- `scripts/tli/comparison-v4-backfill.ts`
- `scripts/tli/comparison-v4-validation.ts`
- `scripts/tli/comparison-v4-execution.ts`
- `scripts/tli/comparison-v4-orchestration.ts`
- `scripts/tli/promote-comparison-v4.ts`
- `scripts/tli/backfill-comparison-v4.ts`

구현 내용:

- manifest row builder
- cutover summary helper
- control row builder / production version resolver
- promotion eligibility / patch helper
- release plan helper
- backfill execution plan helper
- validation helper
- orchestration helper
- CLI promote/backfill foundation scripts

## 3. Tests Added

추가된 comparison-v4 테스트:

- `lib/tli/__tests__/comparison-spec.test.ts`
- `lib/tli/__tests__/comparison-stats.test.ts`
- `scripts/tli/__tests__/comparison-v4-schema.test.ts`
- `scripts/tli/__tests__/comparison-v4-records.test.ts`
- `scripts/tli/__tests__/comparison-v4-shadow.test.ts`
- `scripts/tli/__tests__/comparison-v4-evaluator.test.ts`
- `scripts/tli/__tests__/comparison-v4-replay.test.ts`
- `scripts/tli/__tests__/comparison-v4-backtest.test.ts`
- `scripts/tli/__tests__/comparison-v4-manifest.test.ts`
- `scripts/tli/__tests__/comparison-v4-ops.test.ts`
- `scripts/tli/__tests__/comparison-v4-validation.test.ts`
- `scripts/tli/__tests__/comparison-v4-cutover.test.ts`
- `scripts/tli/__tests__/comparison-v4-control.test.ts`
- `scripts/tli/__tests__/comparison-v4-backfill-execution.test.ts`
- `scripts/tli/__tests__/comparison-v4-promotion.test.ts`
- `scripts/tli/__tests__/comparison-v4-release.test.ts`
- `scripts/tli/__tests__/comparison-v4-execution.test.ts`
- `scripts/tli/__tests__/comparison-v4-orchestration.test.ts`
- `app/api/tli/themes/[id]/comparison-v4-reader.test.ts`
- `app/api/tli/themes/[id]/fetch-theme-data-v4.test.ts`
- `app/api/admin/tli/comparison-v4/promote/route.test.ts`
- `app/api/openapi.json/route.test.ts`
- `app/api/tli/themes/[id]/build-comparisons.test.ts`
- `scripts/tli/__tests__/theme-state-history.test.ts`
- `scripts/tli/__tests__/comparison-v4-eval-writer.test.ts`
- `scripts/tli/__tests__/comparison-v4-ops-enhanced.test.ts`
- `scripts/tli/__tests__/comparison-v4-validation-enhanced.test.ts`
- `scripts/tli/__tests__/comparison-v4-replay-enhanced.test.ts`
- `scripts/tli/__tests__/comparison-v4-baselines.test.ts`
- `scripts/tli/__tests__/comparison-v4-core-imports.test.ts`
- `scripts/tli/__tests__/comparison-v4-experiments.test.ts`

## 4. Verification State

마지막 확인 기준:

- `npx vitest run`
  - Result: pass
  - Coverage of current comparison-v4 changes: all green
- `npx tsc --noEmit --pretty false`
  - Result: pass

마지막 전체 수치:

- Test files: `52`
- Tests: `493`

## 5. Files Changed So Far

주요 변경 파일:

- `app/api/admin/tli/comparison-v4/promote/route.ts`
- `app/api/tli/themes/[id]/comparison-v4-reader.ts`
- `app/api/tli/themes/[id]/fetch-theme-data-v4.ts`
- `app/api/tli/themes/[id]/fetch-theme-data.ts`
- `app/api/openapi.json/route.test.ts`
- `docs/comparison-v4-observability.md`
- `docs/comparison-v4-runbook.md`
- `docs/comparison-v4-tickets.md`
- `lib/tli/comparison/index.ts`
- `lib/tli/comparison/spec.ts`
- `lib/tli/stats/comparison-stats.ts`
- `lib/tli/types/db.ts`
- `scripts/tli/backfill-comparison-v4.ts`
- `scripts/tli/backtest-comparisons.ts`
- `scripts/tli/calculate-comparisons.ts`
- `scripts/tli/comparison-v4-backfill.ts`
- `scripts/tli/comparison-v4-backtest.ts`
- `scripts/tli/comparison-v4-control.ts`
- `scripts/tli/comparison-v4-cutover.ts`
- `scripts/tli/comparison-v4-evaluator.ts`
- `scripts/tli/comparison-v4-execution.ts`
- `scripts/tli/comparison-v4-manifest.ts`
- `scripts/tli/comparison-v4-ops.ts`
- `scripts/tli/comparison-v4-orchestration.ts`
- `scripts/tli/comparison-v4-promotion.ts`
- `scripts/tli/comparison-v4-records.ts`
- `scripts/tli/comparison-v4-release.ts`
- `scripts/tli/comparison-v4-replay.ts`
- `scripts/tli/comparison-v4-shadow.ts`
- `scripts/tli/comparison-v4-validation.ts`
- `scripts/tli/enrich-themes.ts`
- `scripts/tli/evaluate-comparisons.ts`
- `scripts/tli/promote-comparison-v4.ts`
- `scripts/tli/snapshot-predictions.ts`
- `supabase/migrations/016_comparison_v4_foundation.sql`
- `supabase/migrations/017_comparison_v4_control.sql`
- `vitest.config.ts`

참고:

- `.omx/*` 상태 파일/로그는 작업 과정 부산물이라 기능 변경 범위로 보지 않았다.

## 6. Ticket Status

### 완료 또는 완료에 가까운 것

- `CMPV4-001`
- `CMPV4-002` foundation
- `CMPV4-004`
- `CMPV4-005` foundation
- `CMPV4-005A` foundation
- `CMPV4-006`
- `CMPV4-007` foundation
- `CMPV4-008` foundation
- `CMPV4-009` foundation
- `CMPV4-010` foundation
- `CMPV4-011` foundation
- `CMPV4-013` foundation
- `CMPV4-014` foundation

### 새로 완료된 것 (2026-03-11)

- `CMPV4-003` ✅
  - `theme_state_history_v2` backfill + ongoing sync 구현
  - 6개 pure functions, 16 tests, backfill script, migration(unique constraint)
  - `autoActivate`/`autoDeactivate`/`discoverNewThemes`에 state change recording 통합
  - 승격 시 backfill 완료 검증 guard 추가
- `CMPV4-007` ✅
  - `theme_comparison_eval_v2` eval row builder + aggregation + sensitivity analysis
  - `evaluate-comparisons.ts`에 v2 eval write 경로 통합
  - 6 tests
- `CMPV4-010` ✅
  - row-level remap (`remapLegacyRowToV2Candidate`)
  - null/default mapping report (`buildNullMappingReport`)
  - backfill script 완전 재작성 (실제 remap + manifest + parity)
  - manifest parity를 promotion guard에 추가
- `CMPV4-011` ✅
  - serving view migration (`v_comparison_v4_serving`, `v_prediction_v4_serving`)
  - anon/authenticated GRANT SELECT
  - feature flag routing (`TLI_COMPARISON_V4_SERVING_VIEW`)
  - view mode reader path 추가
- `CMPV4-012` ✅
  - `build-comparisons.ts` v2 candidate builder
  - API 타입 `comparisonSource` 추가
  - OpenAPI schema + contract test 추가
- `CMPV4-013` ✅
  - 평가 가능한 numeric alert thresholds (`COMPARISON_V4_ALERT_THRESHOLDS`)
  - `evaluateAlertThreshold()` 함수
  - notification channel 설정 (`COMPARISON_V4_NOTIFICATION_CHANNEL`)
  - retention policy PRD §12 기준 (`COMPARISON_V4_RETENTION_POLICY`)
  - `isObservabilityReady()` 승격 전제조건 검증
  - `buildDrillEvidence()` drill 증거 기록
  - observability/runbook 문서 전면 보강
  - 15 tests
- `CMPV4-014` ✅
  - `evaluateReplayIdempotency()` (float epsilon, rank/ID 비교)
  - `evaluateContractParityV2()` (field-level mismatch report)
  - AC-17 전체 커버: replay idempotency, rollback drill, retention cleanup, partial publish, contract parity
  - 14 tests
- `CMPV4-008` ✅
  - checkpoint/restart: `buildReplayCheckpoint`, `resumeReplayFromCheckpoint`
  - future data leakage guard: `isReplayDateSafe` (same-day = leak)
  - backfill/shadow queue separation: `separateReplayQueues`
  - 13 tests
- `CMPV4-009` ✅
  - 6 PRD baseline definitions (`BASELINE_DEFINITIONS`)
  - `evaluateBaselinePassFail` (minimum beat baseline + failed baselines)
  - `requirePowerAnalysisDocument` existence guard
  - `buildRolloutReportWithVariance` (fold mean + stddev)
  - 11 tests

- `CMPV4-015` ✅
  - skip rate / skip reasons audit (`auditSkipReasons`)
  - resample cache length guard (`validateResampleCacheConsistency`)
  - threshold stability by regime (`evaluateThresholdStabilityByRegime`, IQR 기반)
  - daily drift monitoring (`buildDailyDriftReport`, alert threshold)
  - 17 tests
- `CMPV4-016` ✅
  - curve scale unification (`unifyCurveScale`, min-max normalization)
  - sigmoid weight smoothing (`applySigmoidWeightSmoothing`)
  - sector affinity matrix (`buildSectorAffinityMatrix`)
  - experiment version isolation (`createExperimentVersion`)
  - 12 tests
- `CMPV4-017` ✅
  - inactive-theme news snapshot normalization (`normalizeInactiveThemeNewsSnapshot`)
  - VIF diagnostic + conditional feature merge (`computeVIFDiagnostic`)
  - N<15 Mutual Rank explicit fallback (`mutualRankExplicitFallback`, `MUTUAL_RANK_MIN_THEMES`)
  - 12 tests

### 아직 미완료인 것

- 모든 CMPV4 티켓 완료

## 7. Known Gaps / Risks

1. `published` 승격은 helper와 admin route foundation은 있지만, 운영자가 실제 어떤 run을 언제 promote할지 절차를 더 정리해야 한다.
2. `comparison_v4_control`은 추가됐지만 실제 운영 스케줄/승격 정책은 아직 수동에 가깝다.
3. `theme_state_history_v2`가 비어 있으면 backtest/replay 신뢰도가 제한된다.
4. `theme_comparison_eval_v2`는 아직 채워지지 않는다.
5. `serving reader`는 privileged reader + legacy fallback까지는 있지만, `anon-readable serving view/materialized reader`는 아직 없다.
6. observability 문서는 생겼지만 실제 대시보드/알림 시스템 연결은 아직 안 했다.

## 8. Immediate Next Step

내일 바로 시작할 작업 순서:

1. `CMPV4-003`
   - `theme_state_history_v2` 실제 backfill script
   - ongoing sync/update path 추가
2. `CMPV4-007`
   - `theme_comparison_eval_v2` 실저장 경로 구현
3. `CMPV4-010`
   - backfill script를 row-level remap/parity까지 확장
4. `CMPV4-011`
   - serving view/materialized reader 구현
5. `CMPV4-012`
   - `build-comparisons.ts`, API 타입, OpenAPI, route parity 확장
6. `CMPV4-013/014`
   - 실제 monitoring/alert wiring 또는 최소 mock integration

## 9. Suggested First Command Tomorrow

권장 시작 순서:

1. `npx vitest run`
2. `npx tsc --noEmit --pretty false`
3. `sed -n '1,260p' docs/comparison-v4-tickets.md`
4. `sed -n '1,260p' docs/comparison-v4-prd.md`
5. `sed -n '1,240p' scripts/tli/comparison-v4-shadow.ts`
6. `sed -n '1,260p' scripts/tli/backfill-comparison-v4.ts`

## 10. Notes

- 현재 상태는 “foundation/helper/partial integration” 단계다.
- 테스트/타입은 깨끗하지만, 운영 완성도는 아직 남아 있다.
- 다음 목표는 helper를 실제 운영 경로로 바꾸는 것이다.
