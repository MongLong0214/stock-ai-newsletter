# TLI Offline Evaluation

Window: 2026-01-12 to 2026-06-30
Label status: final 15322, censored 0 (0.0000), excluded 14397 (0.4844), pending 0

| Model | raw n | weekly n | Brier | ECE | IC | Rising-P@10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| bAbl | 8527 | 1956 | 0.2526 | 0.2526 | -0.0625 | 0.2136 |
| m0 | 8527 | 1956 | 0.3946 | 0.4410 | -0.0310 | 0.2258 |
| m1 | 8527 | 1956 | 0.1963 | 0.0698 | 0.0516 | 0.3744 |

| Delta | CI method | mean Brier delta | lower | upper | clusters | observations |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| m1VsBAbl | cluster_bootstrap | -0.0517 | -0.0738 | -0.0279 | 130 | 755 |
| m1VsM0 | cluster_bootstrap | -0.2070 | -0.2386 | -0.1755 | 146 | 1294 |
| m1VsBAblOverlappingRaw | cluster_bootstrap | -0.0662 | -0.0877 | -0.0454 | 146 | 2987 |
| m1VsM0OverlappingRaw | cluster_bootstrap | -0.1967 | -0.2250 | -0.1690 | 148 | 4995 |

Walk-forward folds: 3
M1 training failures: 0

