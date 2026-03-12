[OBJECTIVE] Determine whether simple reweighting of available comparison pillars can materially improve ranking quality within the currently served top-3 candidate set.

[DATA] Same verified comparison surface, grouped into 1096 unique runs. Weight tuning was performed as a within-served-top3 reranking experiment, not a full candidate-pool regeneration.
- Verified rows: 2600
- Unique runs: 1096
- Figure:
  - .omx/scientist/figures/20260312_120108_weight_tuning_metrics.svg

[FINDING] The current ranking quality on verified runs is weak.
[STAT:effect_size] P@1 = 0.0392; MRR = 0.0636; NDCG = 0.0717
[STAT:n] n = 1096 runs

[FINDING] The best simple reweighting found in grid search was `inverse_fc` with weights feature=0.1, curve=0.5, keyword=0.4, but the improvement is statistically borderline rather than decisive.
[STAT:effect_size] Best reweight metrics: P@1 = 0.0511; MRR = 0.0709; NDCG = 0.0773
[STAT:ci] Mean MRR delta vs baseline 95% CI: [-0.0006, 0.0154]
[STAT:p_value] MRR paired sign-flip p = 0.0678
[STAT:n] n = 1096 paired runs

[FINDING] NDCG improvement from the best simple reweight is also small and does not clearly clear a non-inferiority-style confidence bound on this sample.
[STAT:effect_size] Mean NDCG delta = 0.0056
[STAT:ci] 95% bootstrap CI for NDCG delta: [-0.0002, 0.0115]
[STAT:p_value] p = 0.0510
[STAT:n] n = 1096 paired runs

[FINDING] The evidence supports calibration and uncertainty-aware serving first, not aggressive weight replacement as a standalone fix.
[STAT:effect_size] Best simple reweight raised P@1 by 0.0119
[STAT:ci] 95% bootstrap CI for P@1 delta: [-0.0018, 0.0255]
[STAT:p_value] p = 0.1074
[STAT:n] n = 1096 paired runs

[LIMITATION] This tuning study only reranks the already-served candidate triples. It cannot measure recall gain because the broader candidate pool is not exposed in the accessible legacy table.

[LIMITATION] Weight-search results are therefore operationally useful as a local ranking sensitivity study, but insufficient as the sole justification for production weight promotion.

[LIMITATION] A level-4 promotion still requires `*_v2` calibration/eval tables or equivalent full candidate-pool replay data.
