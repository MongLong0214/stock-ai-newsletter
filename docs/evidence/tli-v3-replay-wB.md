# TLI Replay Audit

Train end: 2026-05-15
Replay window: 2026-05-25 to 2026-06-05
Rows: scored 860, excluded 737, trading days 8

| Model | raw n | scored n | coverage | Brier | ECE | IC | Rising-P@10 | weekly scored n | weekly Brier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M1 | 860 | 783 | 0.9105 | 0.1694 | 0.0662 | -0.0076 | 0.1375 | 204 | 0.1692 |
| B-abl | 860 | 860 | 1.0000 | 0.2128 | 0.2128 | n/a | 0.1250 | 220 | 0.2182 |

| Criterion | Pass |
| --- | --- |
| M1 Brier < B-abl Brier | yes |
| M1 Brier <= 0.21 | yes |
| M1 ECE <= 0.08 | yes |
| M1 IC > 0 | no |

| Brier delta CI | Method | Mean delta | Lower | Upper | Clusters | Observations |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| M1 vs B-abl | cluster_bootstrap | -0.0416 | -0.0813 | -0.0056 | 117 | 204 |

| Verdict | fail |

