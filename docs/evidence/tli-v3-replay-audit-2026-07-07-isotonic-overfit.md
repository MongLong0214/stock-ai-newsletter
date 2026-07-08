# TLI Replay Audit

Train end: 2026-05-29
Replay window: 2026-06-08 to 2026-06-26
Rows: scored 1490, excluded 1301, trading days 14

| Model | raw n | scored n | coverage | Brier | ECE | IC | Rising-P@10 | weekly scored n | weekly Brier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M1 | 1490 | 1316 | 0.8832 | 0.1760 | 0.1041 | 0.1526 | 0.3000 | 285 | 0.1628 |
| B-abl | 1490 | 1490 | 1.0000 | 0.2128 | 0.2128 | n/a | 0.1786 | 319 | 0.2006 |

| Criterion | Pass |
| --- | --- |
| M1 Brier < B-abl Brier | yes |
| M1 Brier <= 0.21 | yes |
| M1 ECE <= 0.08 | no |
| M1 IC > 0 | yes |

| Brier delta CI | Method | Mean delta | Lower | Upper | Clusters | Observations |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| M1 vs B-abl | cluster_bootstrap | -0.0407 | -0.0755 | -0.0079 | 126 | 285 |

| Verdict | fail |

