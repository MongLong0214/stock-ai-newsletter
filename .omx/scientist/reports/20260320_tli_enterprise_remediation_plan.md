[OBJECTIVE] Define an enterprise-grade remediation plan for the TLI comparison system so that `독자적 흐름 가능성` is shown only when the data truly supports that interpretation.

[DATA] Evidence baseline from served API analysis:
- 263 active themes
- 1,578 comparison rows
- 92.8% of comparison rows satisfy `currentDay >= pastTotalDays && estimatedDaysToPeak == 0`
- 88.2% of themes share `firstSpikeDate = 2026-02-06`
- 91.5% of comparison rows have `pastTotalDays = 40`
- 100% of comparison rows have `pastFinalStage = null`

[FINDING] Phase 1 should be a strict interpretation hotfix, not a scoring rewrite.
[STAT:effect_size] 92.8% of rows currently hit the UI branch that emits the message.
[STAT:ci] 95% CI: [0.914, 0.940]
[STAT:n] n = 1,578 comparison rows
Action:
- Allow `독자적 흐름 가능성` only when the past analog is a completed cycle.
- Require `pastFinalStage != null`, `pastDeclineDays != null`, and `completedCycleDays != null`.
- If those conditions are not met, downgrade the copy to an observational message such as `과거 비교 테마의 관측 구간을 넘어섰어요`.

[FINDING] Phase 2 should separate observed duration from completed cycle duration in the model.
[STAT:effect_size] `pastTotalDays = 40` appears in 91.5% of served rows.
[STAT:ci] 95% CI: [0.900, 0.928]
[STAT:n] n = 1,578 comparison rows
Action:
- Replace the overloaded `pastTotalDays` field with:
  - `observedWindowDays`
  - `completedCycleDays`
  - `cycleCompletionStatus`
- Only `completedCycleDays` may feed the beyond-cycle interpretation.
- `observedWindowDays` remains valid for timeline rendering, but not for semantic conclusions.

[FINDING] Phase 3 should rebuild `first_spike_date` from auditable source-of-truth history.
[STAT:effect_size] Themes with `firstSpikeDate = 2026-02-06` = 88.2%
[STAT:ci] 95% CI: [0.838, 0.916]
[STAT:n] n = 263 themes
Action:
- Create a backfill job that derives `first_spike_date` from:
  1. earliest meaningful `interest_metrics` date above threshold
  2. `theme_state_history_v2.effective_from` when available
  3. explicit provenance columns:
     - `first_spike_source`
     - `first_spike_backfilled_at`
     - `first_spike_backfill_version`
- Reject bulk backfills that assign the same date to an anomalously large share of themes.

[FINDING] Phase 4 should distinguish active analogs from completed analogs in candidate selection and serving.
[STAT:effect_size] `pastFinalStage = null` in 100% of served rows
[STAT:ci] 95% CI: [0.998, 1.000]
[STAT:n] n = 1,578 comparison rows
Action:
- Split analog serving into two lanes:
  - `completed analogs` for cycle-duration interpretation
  - `active analogs` for trend-shape similarity only
- Completed analogs may power ETA and beyond-cycle language.
- Active analogs may only power language such as `유사한 진행 패턴`.

[FINDING] Phase 5 should add enterprise guardrails so this class of issue is detected before serving.
[STAT:effect_size] same-spike cohort beyond-cycle rate = 100.0% vs 38.7% in other themes; risk ratio = 2.58
[STAT:ci] 95% CI: same-spike rows [0.997, 1.000], other rows [0.320, 0.459]
[STAT:p_value] p = 5.394e-202
[STAT:n] same-spike rows = 1,392, other rows = 186
Action:
- Add pre-promotion anomaly checks:
  - top-1 `first_spike_date` share <= 20%
  - top-1 `pastTotalDays` share <= 35%
  - `pastFinalStage = null` rate in served rows <= 10%
  - beyond-cycle message rate <= 25%
- Fail promotion when any guardrail breaches.
- Add QA snapshot assertions on comparison card copy distribution.

[LIMITATION] This plan is based on served payloads plus local code and work-log analysis. Direct production database querying was not available from this environment.

[LIMITATION] The exact originating job that first mass-assigned `2026-02-06` cannot be proven here without DB audit logs, but the evidence strongly supports a batch backfill/window artifact rather than genuine market behavior.

Related evidence:
- `/Users/isaac/WebstormProjects/stock-ai-newsletter/.omx/scientist/reports/20260320_121838_tli_first_spike_backfill_root_cause.md`
- `/Users/isaac/WebstormProjects/stock-ai-newsletter/.omx/scientist/figures/20260320_114127_tli_comparison_message_analysis.svg`
