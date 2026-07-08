# TLI M1 Calibration Diagnostic

Window: 2026-01-12 to 2026-06-30

Generated at: 2026-07-07T08:24:12.301Z

Rows: 11820 scored M1 predictions, 11820 non-abstain feature rows

## Verdicts

- Sample-limit verdict: sample_limited

- Reliability verdict: irregular

- Feature-liveness verdict: dead_features_present (2 dead features)

## ECE vs Sample Size
| n | iterations | mean ECE | p2.5 ECE | p97.5 ECE |
| ---: | ---: | ---: | ---: | ---: |
| 250 | 200 | 0.068908 | 0.030431 | 0.119554 |
| 500 | 200 | 0.061060 | 0.032172 | 0.092261 |
| 1000 | 200 | 0.052785 | 0.033433 | 0.075893 |
| 2000 | 200 | 0.050721 | 0.036976 | 0.065178 |
| 4000 | 200 | 0.048531 | 0.039501 | 0.059693 |
| full | 200 | 0.047640 | 0.047640 | 0.047640 |

## Reliability Curve
Monotonic observed rate: no
Largest absolute gap: [0.6,0.7) (0.224471)
| bin | count | mean predicted | observed positive rate | gap predicted-observed |
| --- | ---: | ---: | ---: | ---: |
| [0.0,0.1) | 673 | 0.065744 | 0.160475 | -0.094732 |
| [0.1,0.2) | 2744 | 0.164351 | 0.211735 | -0.047384 |
| [0.2,0.3) | 4721 | 0.245487 | 0.262868 | -0.017381 |
| [0.3,0.4) | 1966 | 0.342457 | 0.332655 | 0.009802 |
| [0.4,0.5) | 830 | 0.444348 | 0.327711 | 0.116638 |
| [0.5,0.6) | 415 | 0.549257 | 0.419277 | 0.129979 |
| [0.6,0.7) | 269 | 0.651981 | 0.427509 | 0.224471 |
| [0.7,0.8) | 121 | 0.750011 | 0.553719 | 0.196292 |
| [0.8,0.9) | 66 | 0.843336 | 0.696970 | 0.146366 |
| [0.9,1.0] | 15 | 0.923422 | 0.733333 | 0.190088 |

## Feature Liveness
| feature | missing flag rate | variance | zero value rate | min | max | dead | reasons |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| interest_level_pct | 1.000000 | n/a | 1.000000 | n/a | n/a | yes | missing_rate_gt_0.5, variance_lt_1e-6 |
| episode_progress | 1.000000 | n/a | 1.000000 | n/a | n/a | yes | missing_rate_gt_0.5, variance_lt_1e-6 |
| basket_return_5d | 0.138917 | 0.011138 | 0.138917 | -0.510828 | 1.285716 | no | n/a |
| news_momentum | 0.059560 | 1.288105 | 0.074281 | -0.931937 | 17.500000 | no | n/a |
| basket_volume_ratio | 0.000423 | 0.265624 | 0.002284 | 0.000000 | 4.000000 | no | n/a |
| interest_slope_7d | 0.000000 | 0.022723 | 0.036633 | -0.750000 | 0.750000 | no | n/a |
| interest_accel | 0.000000 | 0.078362 | 0.026142 | -1.504630 | 1.759615 | no | n/a |
| dvi_7d | 0.000000 | 0.057246 | 0.047547 | 0.000000 | 1.000000 | no | n/a |
| news_volume_7d | 0.000000 | 0.015263 | 0.000000 | 0.497594 | 1.000000 | no | n/a |
| market_regime | 0.000000 | 0.842830 | 0.000000 | -1.000000 | 1.000000 | no | n/a |


