[OBJECTIVE] Determine why TLI comparison cards frequently render the message "주기를 넘었어요 · 독자적 흐름 가능성" and quantify the underlying data conditions.

[DATA] Source: http://127.0.0.1:3103/api/tli/themes and /api/tli/themes/{id}. Analyzed 263 active themes and 1578 served comparison rows. Theme detail fetch failures: 0.

[FINDING] The message is primarily triggered by the explicit UI condition `currentDay >= pastTotalDays and estimatedDaysToPeak == 0`, and this condition holds for most served comparisons.
[STAT:effect_size] Proportion = 0.928
[STAT:ci] 95% CI: [0.914, 0.940]
[STAT:n] n = 1578 comparison rows, 1464 rows triggered the condition

[FINDING] A single persisted `firstSpikeDate` dominates the dataset. Themes with `firstSpikeDate = 2026-02-06` account for most active themes, which concentrates `currentDay` near 41 days and drives the "beyond cycle" branch.
[STAT:effect_size] Share of themes with `firstSpikeDate = 2026-02-06` = 0.882; among their comparison rows, beyond-cycle rate = 1.000 vs 0.387 in other themes; risk ratio = 2.58
[STAT:ci] 95% CI for theme share: [0.838, 0.916]; same-spike beyond-cycle 95% CI: [0.997, 1.000]; other-themes 95% CI: [0.320, 0.459]
[STAT:p_value] two-sided two-proportion z-test p = 5.394e-202
[STAT:n] n = 263 themes; same-spike rows = 1392, other rows = 186

[FINDING] The past-cycle denominator is abnormally concentrated. `pastTotalDays = 40` appears in nearly all served comparisons, so a current theme age of 41 days is enough to trigger the "독자적 흐름" message repeatedly.
[STAT:effect_size] Proportion with `pastTotalDays = 40` = 0.915; themes with `currentDay = 41` among non-null current ages = 0.900
[STAT:ci] 95% CI for `pastTotalDays = 40`: [0.900, 0.928]; 95% CI for `currentDay = 41`: [0.854, 0.932]
[STAT:n] n = 1578 comparison rows; 1444 rows had `pastTotalDays = 40`; n = 230 themes with non-null current age, 207 had `currentDay = 41`

[FINDING] The serving payload cannot distinguish completed past cycles from still-active analogs because all served comparisons are missing `pastFinalStage` metadata.
[STAT:effect_size] Proportion with `pastFinalStage = null` = 1.000
[STAT:ci] 95% CI: [0.998, 1.000]
[STAT:n] n = 1578 comparison rows, 1578 rows had `pastFinalStage = null`

[LIMITATION] This analysis uses served API payloads, not direct database access. The code-path interpretation is supported by local source inspection, but the exact origin of the `2026-02-06` spike-date concentration likely traces to historical backfill or migration state outside the served payload itself.

[LIMITATION] `matplotlib` is unavailable in this environment, so a lightweight SVG figure was generated via Python stdlib instead of a matplotlib/Agg chart.

Report saved to: .omx/scientist/reports/20260320_114031_tli_comparison_message_analysis.md
Figure saved to: .omx/scientist/figures/20260320_114031_tli_comparison_message_analysis.svg
