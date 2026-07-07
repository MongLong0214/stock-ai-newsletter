# TLI Offline Evaluation

Window: 2026-01-07 to 2026-07-07
Label status: final 15307, censored 0 (0.0000), excluded 14938 (0.4773), pending 1052

| Model | raw n | weekly n | Brier | ECE | IC | Rising-P@10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| bAbl | 8941 | 1751 | 0.2448 | 0.2437 | -0.0571 | 0.2092 |
| m0 | 8941 | 1751 | 0.3960 | 0.4453 | -0.0362 | 0.2348 |
| m1 | 8941 | 1751 | 0.1775 | 0.0196 | 0.2173 | 0.4894 |

| Delta | CI method | mean Brier delta | lower | upper | clusters | observations |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| m1VsBAbl | cluster_bootstrap | -0.0547 | -0.0741 | -0.0353 | 164 | 1289 |
| m1VsM0 | cluster_bootstrap | -0.2282 | -0.2540 | -0.2014 | 169 | 1751 |
| m1VsBAblOverlappingRaw | cluster_bootstrap | -0.0679 | -0.0837 | -0.0514 | 169 | 7083 |
| m1VsM0OverlappingRaw | cluster_bootstrap | -0.2185 | -0.2383 | -0.1969 | 170 | 8941 |

Walk-forward folds: 3
M1 training failures: 0

