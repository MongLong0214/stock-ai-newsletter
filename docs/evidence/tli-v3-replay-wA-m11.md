# TLI Replay Audit

Train end: 2026-05-01
Replay window: 2026-05-11 to 2026-05-22
Rows: scored 1076, excluded 933, trading days 10

| Model | raw n | scored n | coverage | Brier | ECE | IC | Rising-P@10 | weekly scored n | weekly Brier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M1 | 1076 | 976 | 0.9071 | 0.1792 | 0.0595 | 0.1904 | 0.4900 | 200 | 0.1930 |
| B-abl | 1076 | 1076 | 1.0000 | 0.2444 | 0.2444 | n/a | 0.1900 | 224 | 0.2679 |

| Criterion | Pass |
| --- | --- |
| M1 Brier < B-abl Brier | yes |
| M1 Brier <= 0.21 | yes |
| M1 ECE <= 0.08 | yes |
| M1 IC > 0 | yes |

| Brier delta CI | Method | Mean delta | Lower | Upper | Clusters | Observations |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| M1 vs B-abl | cluster_bootstrap | -0.0770 | -0.1210 | -0.0373 | 112 | 200 |

| Verdict | pass |

