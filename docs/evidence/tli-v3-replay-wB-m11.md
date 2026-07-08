# TLI Replay Audit

Train end: 2026-05-15
Replay window: 2026-05-25 to 2026-06-05
Rows: scored 860, excluded 737, trading days 8

| Model | raw n | scored n | coverage | Brier | ECE | IC | Rising-P@10 | weekly scored n | weekly Brier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M1 | 860 | 783 | 0.9105 | 0.1635 | 0.0493 | 0.0605 | 0.2875 | 204 | 0.1623 |
| B-abl | 860 | 860 | 1.0000 | 0.2128 | 0.2128 | n/a | 0.1250 | 220 | 0.2182 |

| Criterion | Pass |
| --- | --- |
| M1 Brier < B-abl Brier | yes |
| M1 Brier <= 0.21 | yes |
| M1 ECE <= 0.08 | yes |
| M1 IC > 0 | yes |

| Brier delta CI | Method | Mean delta | Lower | Upper | Clusters | Observations |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| M1 vs B-abl | cluster_bootstrap | -0.0485 | -0.0878 | -0.0142 | 117 | 204 |

| Verdict | pass |

