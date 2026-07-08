# TLI Replay Audit

Train end: 2026-05-29
Replay window: 2026-06-08 to 2026-06-26
Rows: scored 1498, excluded 1293, trading days 14

| Model | raw n | scored n | coverage | Brier | ECE | IC | Rising-P@10 | weekly scored n | weekly Brier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M1 | 1498 | 1276 | 0.8518 | 0.1795 | 0.0984 | 0.2145 | 0.3643 | 280 | 0.1582 |
| B-abl | 1498 | 1498 | 1.0000 | 0.2109 | 0.2109 | n/a | 0.1786 | 319 | 0.2006 |

| Criterion | Pass |
| --- | --- |
| M1 Brier < B-abl Brier | yes |
| M1 Brier <= 0.21 | yes |
| M1 ECE <= 0.08 | no |
| M1 IC > 0 | yes |

| Brier delta CI | Method | Mean delta | Lower | Upper | Clusters | Observations |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| M1 vs B-abl | cluster_bootstrap | -0.0489 | -0.0793 | -0.0194 | 126 | 280 |

| Verdict | fail |

