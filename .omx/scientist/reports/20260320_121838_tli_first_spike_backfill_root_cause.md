[OBJECTIVE] Confirm the upstream database/backfill root cause for the TLI comparison message bias, not just the UI symptom.

[DATA] Combined evidence sources:
1. Served API payloads from http://127.0.0.1:3103
2. Local source inspection of `scripts/tli/scoring/calculate-scores.ts`, `scripts/tli/themes/first-spike-date.ts`, `scripts/tli/themes/enrich-themes.ts`, and `lib/tli/comparison/composite.ts`
3. Local work-log and remediation docs (`docs/TLI-WORK-LOG.md`, `docs/tli-review-remediation-tickets-2026-03-12.md`)
4. Active themes analyzed: 263; comparison rows analyzed: 1578

[FINDING] The message bias is primarily an upstream `first_spike_date` backfill artifact, not an organic market signal. The scoring pipeline backfills `themes.first_spike_date` only when it is null, using `buildFirstSpikeDateBackfillRows(...)` inside `calculate-scores.ts`; that helper calls `resolveFirstSpikeDate(...)`, which infers from whatever `interest_metrics` are available. In this system, the search-interest collector operates on a rolling recent window, so null themes backfilled in the same operational batch can collapse onto the same inferred start date.
[STAT:effect_size] Themes with `firstSpikeDate = 2026-02-06` = 232 / 263 = 0.882
[STAT:ci] 95% CI: [0.838, 0.916]
[STAT:n] n = 263 active themes

[FINDING] The downstream comparison message is therefore almost mechanically triggered. For the `2026-02-06` cohort, 89.2% of themes have `currentDay = 41`, and 100% of their comparison rows satisfy the UI's beyond-cycle condition. Outside that cohort, the same condition drops to 38.7%.
[STAT:effect_size] same-spike cohort `currentDay = 41` rate = 0.892; beyond-cycle risk ratio = 2.58
[STAT:ci] 95% CI for same-spike `currentDay = 41`: [0.846, 0.926]; beyond-cycle same-spike rows [0.997, 1.000] vs other rows [0.320, 0.459]
[STAT:p_value] two-sided two-proportion z-test p = 5.394e-202
[STAT:n] same-spike themes = 232, same-spike rows = 1392, other rows = 186

[FINDING] The local work log independently supports this explanation. `docs/TLI-WORK-LOG.md` records a broad pipeline reset on 2026-02-06, and the remediation backlog explicitly flags `first_spike_date` backfill as an upstream problem to separate into its own ticket. This aligns with the observed mass concentration at `2026-02-06` and with the code path that only backfills nulls.
[STAT:effect_size] Comparison rows with `pastFinalStage = null` = 1578 / 1578 = 1.000
[STAT:ci] 95% CI: [0.998, 1.000]
[STAT:n] n = 1578

[LIMITATION] Direct DB queries to Supabase were not available from this environment due host resolution/network limits, so the final confirmation relies on triangulation: served payload statistics + local source code + local operational documents. The evidence is internally consistent and strongly supports the backfill-root-cause conclusion.

[LIMITATION] This confirms why the current system over-emits the message; it does not by itself determine whether `2026-02-06` was the first day of the bad backfill, only that the current stored state is overwhelmingly shaped by that batch/window.

Report saved to: /Users/isaac/WebstormProjects/stock-ai-newsletter/.omx/scientist/reports/20260320_121838_tli_first_spike_backfill_root_cause.md
Related figure: /Users/isaac/WebstormProjects/stock-ai-newsletter/.omx/scientist/figures/20260320_114127_tli_comparison_message_analysis.svg
