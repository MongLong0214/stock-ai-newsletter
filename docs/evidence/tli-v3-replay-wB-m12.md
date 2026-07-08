# TLI Replay Audit

Train end: 2026-05-15
Replay window: 2026-05-25 to 2026-06-05
Rows: scored 879, excluded 718, trading days 8

| Model | raw n | scored n | coverage | Brier | ECE | IC | Rising-P@10 | weekly scored n | weekly Brier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M1 | 879 | 799 | 0.9090 | 0.1649 | 0.0594 | 0.0638 | 0.3000 | 204 | 0.1637 |
| B-abl | 879 | 879 | 1.0000 | 0.2127 | 0.2127 | n/a | 0.1500 | 220 | 0.2182 |

| Criterion | Pass |
| --- | --- |
| M1 Brier < B-abl Brier | yes |
| M1 Brier <= 0.21 | yes |
| M1 ECE <= 0.08 | yes |
| M1 IC > 0 | yes |

| Brier delta CI | Method | Mean delta | Lower | Upper | Clusters | Observations |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| M1 vs B-abl | cluster_bootstrap | -0.0470 | -0.0885 | -0.0104 | 117 | 204 |

| Verdict | pass |

