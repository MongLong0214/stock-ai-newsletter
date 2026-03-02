# TLI Scientific Rigor Research

Research artifacts for the TLI (Theme Lifecycle Intelligence) scientific rigor upgrade.

## Directory Structure

```
_research/
├── visualizations/     # Scientist-generated analysis PNGs
├── reports/            # Monthly calibration reports (auto-generated)
├── methods/            # Algorithm methodology documentation (8 papers)
└── data/               # Calibration history JSON exports
```

## Algorithm Methodology

| # | Method | Paper Reference | File |
|---|--------|----------------|------|
| 1 | Shannon Entropy Weights | Cinelli 2020 | `methods/01-entropy-weights.md` |
| 2 | Robust Z-score (MAD) | Greco 2023 | `methods/02-robust-normalization.md` |
| 3 | KDE Valley Detection | Silverman 1986 | `methods/03-adaptive-stages.md` |
| 4 | DTW + Pearson Ensemble | Ali 2019, Rani 2012 | `methods/04-dtw-similarity.md` |
| 5 | Bootstrap CI | Efron & Tibshirani 1993 | `methods/05-bootstrap-prediction.md` |
| 6 | Multi-Signal Sentiment | Gu 2024 | `methods/06-sentiment-proxy.md` |
| 7 | ECE Calibration | Platt 1999 | `methods/07-confidence-calibration.md` |
| 8 | ROC + Youden's J | Youden 1950 | `methods/08-noise-roc.md` |

## Calibration Schedule

Monthly (1st of month) via `collect-and-score.ts` Phase 3.5:
1. Noise threshold (ROC)
2. Confidence thresholds (ECE)
3. Score weights (Entropy)
4. Stage thresholds (KDE)
