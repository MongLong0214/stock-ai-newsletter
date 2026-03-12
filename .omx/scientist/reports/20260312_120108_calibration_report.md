[OBJECTIVE] Evaluate whether the current TLI comparison similarity score is scientifically usable as a calibrated relevance signal for level-4 serving.

[DATA] Legacy verified comparison surface from `theme_comparisons`
- Verified rows: 2600
- Unique runs: 1096
- Positive rows: 124
- Positive rate: 0.0477
- Observable evaluation dates: 10
- Figures:
  - .omx/scientist/figures/20260312_120108_calibration_reliability.svg
  - .omx/scientist/figures/20260312_120108_daily_relevance_drift.svg

[FINDING] The current `similarity_score` is not a usable calibrated probability signal on the verified comparison surface.
[STAT:effect_size] AUROC = 0.429
[STAT:ci] 95% bootstrap CI for AUROC: [0.377, 0.482]
[STAT:p_value] Difference in mean similarity between relevant vs non-relevant rows: p = 0.0480
[STAT:n] n = 2600 rows (124 positives)

[FINDING] The score is materially overconfident: average confidence remains far above empirical hit rate across most deciles.
[STAT:effect_size] Raw Brier score = 0.2666; Raw ECE = 0.4344
[STAT:ci] Decile hit-rate range: [0.0154, 0.0885]
[STAT:n] 10 equal-frequency deciles of 260 rows each

[FINDING] Isotonic calibration can reduce probabilistic error, but only by collapsing the signal toward the base rate rather than preserving useful discrimination.
[STAT:effect_size] Calibrated Brier score = 0.0453; calibrated ECE = 0.0000
[STAT:ci] Bootstrap 95% CI for Brier improvement: [0.0375, 0.0717]
[STAT:n] n = 4000 bootstrap replicates

[FINDING] Relevance rate shifts sharply even within the observed 7-day evaluation window, so drift monitoring is necessary before level-4 promotion.
[STAT:effect_size] Early-window relevance rate = 0.0767; late-window relevance rate = 0.0222; delta = 0.0546
[STAT:ci] 95% bootstrap CI for early-late relevance-rate delta: [0.0375, 0.0717]
[STAT:p_value] p = 0.0002
[STAT:n] early n = 1186, late n = 1398

[LIMITATION] The accessible calibration surface is legacy `theme_comparisons`, not `*_v2` tables. This is sufficient for diagnosis, but not a final release certification for the v4 serving path.

[LIMITATION] The verified sample is concentrated in a single month and only 10 evaluation dates, so drift conclusions are evidence of instability, not a full seasonal estimate.

[LIMITATION] `matplotlib` is unavailable in this environment, so figures were emitted as SVG via stdlib fallback rather than Agg-backed matplotlib.
