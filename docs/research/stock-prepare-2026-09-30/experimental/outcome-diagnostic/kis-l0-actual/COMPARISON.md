# Fixed KIS selection: price outcome and hypothetical exit diagnostic

All rates below use the strict complete five-positive-OHLCV cohort. Unknown slots are retained separately.
Costs are fixed total round-trip 30 bps. Target exits are hypothetical price proxies, not observed orders.

| Study | Split | Policy | Known/slots | +10% touch | D5 any loss | D5 L5 | Full5 MAE mean | D5 mean | Target-only mean / loss | Target-stop mean lower..upper | Target-stop loss lower..upper | Ambiguous | Earlier stop then later target |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| L0 | activeInner80 | winnerA | 238/240 | 47.48% | 50.42% | 36.13% | -8.16% | 0.86% | 1.12% / 42.86% | -0.14%..0.11% | 63.87%..62.18% | 4 | 31 |
| L0 | activeInner80 | winnerB | 239/240 | 40.17% | 53.14% | 32.64% | -7.71% | 0.63% | 0.62% / 46.86% | -0.52%..-0.14% | 65.27%..62.76% | 6 | 22 |
| L0 | activeInner80 | currentOverall | 239/240 | 27.62% | 56.07% | 28.03% | -6.26% | 0.41% | 0.12% / 51.88% | -0.47%..-0.41% | 64.44%..64.02% | 1 | 15 |
| L0 | activeInner80 | ATRbaseline | 240/240 | 1.67% | 53.75% | 3.75% | -2.04% | -0.22% | -0.15% / 53.75% | -0.17%..-0.17% | 53.75%..53.75% | 0 | 0 |
| L0 | testReused60 | winnerA | 178/180 | 47.75% | 57.87% | 41.57% | -11.25% | 0.67% | -0.24% / 45.51% | -0.24%..0.35% | 64.04%..60.11% | 7 | 22 |
| L0 | allOriginal180 | winnerA | 537/540 | 48.60% | 58.10% | 42.64% | -11.91% | -0.74% | -0.71% / 44.88% | -0.87%..-0.40% | 69.09%..65.92% | 17 | 94 |
| L0 | fresh1 | winnerA | 3/3 | 66.67% | 33.33% | 33.33% | -6.29% | 4.23% | 2.11% / 33.33% | 4.70%..4.70% | 33.33%..33.33% | 0 | 0 |
| L0 | recent55IncludingFresh | winnerA | 163/165 | 47.24% | 55.83% | 40.49% | -10.55% | 1.96% | -0.40% / 46.01% | -0.08%..0.29% | 63.19%..60.74% | 4 | 20 |
| L0 | testReused60 | winnerB | 180/180 | 47.22% | 55.56% | 36.67% | -9.55% | 1.12% | 1.08% / 43.33% | -0.49%..-0.07% | 67.22%..64.44% | 5 | 26 |
| L0 | allOriginal180 | winnerB | 535/540 | 47.85% | 57.01% | 39.81% | -10.19% | 0.75% | 0.44% / 44.67% | -0.55%..-0.30% | 67.66%..65.98% | 9 | 84 |
| L0 | fresh1 | winnerB | 3/3 | 0.00% | 100.00% | 66.67% | -12.94% | -9.96% | -9.96% / 100.00% | -5.30%..-5.30% | 100.00%..100.00% | 0 | 0 |
| L0 | recent55IncludingFresh | winnerB | 165/165 | 48.48% | 53.94% | 36.36% | -9.46% | 1.50% | 1.30% / 41.21% | -0.23%..0.23% | 65.45%..62.42% | 5 | 23 |
| L0 | testReused60 | currentOverall | 177/180 | 28.25% | 62.15% | 36.16% | -9.38% | -1.48% | -1.32% / 55.93% | -1.03%..-0.78% | 70.06%..68.36% | 3 | 11 |
| L0 | allOriginal180 | currentOverall | 537/540 | 35.57% | 56.42% | 37.06% | -9.46% | -0.45% | -0.87% / 49.91% | -0.61%..-0.47% | 65.74%..64.80% | 5 | 51 |
| L0 | fresh1 | currentOverall | 3/3 | 33.33% | 66.67% | 0.00% | -4.12% | 0.14% | 2.14% / 66.67% | -2.86%..-2.86% | 100.00%..100.00% | 0 | 1 |
| L0 | recent55IncludingFresh | currentOverall | 162/165 | 27.16% | 59.88% | 33.33% | -8.18% | -0.39% | -0.78% / 55.56% | -0.81%..-0.72% | 68.52%..67.90% | 1 | 9 |
| L0 | testReused60 | ATRbaseline | 180/180 | 5.00% | 55.56% | 7.22% | -3.24% | 0.06% | 0.16% / 54.44% | -0.08%..-0.00% | 55.56%..55.00% | 1 | 0 |
| L0 | allOriginal180 | ATRbaseline | 539/540 | 5.94% | 58.81% | 15.03% | -3.70% | -0.46% | -0.61% / 58.07% | -0.62%..-0.59% | 59.55%..59.37% | 1 | 1 |
| L0 | fresh1 | ATRbaseline | 3/3 | 0.00% | 66.67% | 33.33% | -3.35% | -2.08% | -2.08% / 66.67% | -1.96%..-1.96% | 66.67%..66.67% | 0 | 0 |
| L0 | recent55IncludingFresh | ATRbaseline | 165/165 | 3.64% | 59.39% | 8.48% | -3.29% | -0.41% | -0.32% / 58.18% | -0.53%..-0.44% | 59.39%..58.79% | 1 | 0 |
| L0 | testReused60 | boundedEventComposite | 180/180 | 39.44% | 53.33% | 27.22% | -8.20% | 0.49% | 1.24% / 41.67% | 0.07%..0.73% | 58.89%..54.44% | 8 | 12 |
| L0 | allOriginal180 | boundedEventComposite | 535/540 | 41.50% | 59.44% | 38.50% | -10.18% | -1.32% | -0.30% / 46.36% | -0.73%..-0.20% | 66.73%..63.18% | 19 | 66 |
| L0 | fresh1 | boundedEventComposite | 3/3 | 66.67% | 66.67% | 33.33% | -6.61% | 0.28% | 3.42% / 33.33% | 4.70%..4.70% | 33.33%..33.33% | 0 | 0 |
| L0 | recent55IncludingFresh | boundedEventComposite | 165/165 | 37.58% | 50.91% | 22.42% | -6.84% | 1.67% | 1.62% / 41.82% | 0.37%..0.74% | 56.36%..53.94% | 4 | 9 |
| L5 | activeInner80 | winnerA | 238/240 | 43.28% | 57.14% | 38.24% | -8.25% | 0.31% | 0.39% / 48.74% | -0.27%..0.10% | 64.71%..62.18% | 6 | 24 |
| L5 | activeInner80 | winnerB | 239/240 | 39.33% | 60.25% | 36.40% | -8.08% | -0.32% | 0.64% / 49.37% | -0.63%..-0.26% | 67.36%..64.85% | 6 | 25 |
| L5 | activeInner80 | currentOverall | 239/240 | 27.62% | 56.07% | 28.03% | -6.26% | 0.41% | 0.12% / 51.88% | -0.47%..-0.41% | 64.44%..64.02% | 1 | 15 |
| L5 | activeInner80 | ATRbaseline | 240/240 | 1.67% | 53.75% | 3.75% | -2.04% | -0.22% | -0.15% / 53.75% | -0.17%..-0.17% | 53.75%..53.75% | 0 | 0 |
| L5 | testReused60 | winnerA | 179/180 | 46.93% | 55.31% | 36.31% | -10.80% | -1.29% | 0.17% / 40.22% | -0.78%..-0.11% | 67.04%..62.57% | 8 | 29 |
| L5 | allOriginal180 | winnerA | 532/540 | 47.37% | 58.65% | 42.11% | -11.81% | -1.17% | -0.71% / 45.49% | -1.28%..-0.66% | 71.99%..67.86% | 22 | 98 |
| L5 | fresh1 | winnerA | 3/3 | 33.33% | 66.67% | 66.67% | -8.33% | -1.92% | -3.16% / 66.67% | -0.30%..-0.30% | 66.67%..66.67% | 0 | 0 |
| L5 | recent55IncludingFresh | winnerA | 164/165 | 48.17% | 53.05% | 32.32% | -9.81% | 0.03% | 0.95% / 38.41% | -0.42%..0.13% | 64.63%..60.98% | 6 | 26 |
| L5 | testReused60 | winnerB | 179/180 | 55.31% | 51.40% | 38.55% | -11.61% | 1.24% | 0.49% / 38.55% | -0.23%..0.53% | 65.36%..60.34% | 9 | 31 |
| L5 | allOriginal180 | winnerB | 534/540 | 46.07% | 57.49% | 43.82% | -11.87% | -0.80% | -1.08% / 46.44% | -1.27%..-0.65% | 72.28%..68.16% | 22 | 86 |
| L5 | fresh1 | winnerB | 3/3 | 66.67% | 33.33% | 0.00% | -7.90% | 8.89% | 5.48% / 33.33% | -5.30%..-5.30% | 100.00%..100.00% | 0 | 2 |
| L5 | recent55IncludingFresh | winnerB | 164/165 | 54.88% | 50.00% | 36.59% | -10.96% | 2.07% | 0.78% / 39.02% | -0.04%..0.60% | 64.02%..59.76% | 7 | 27 |
| L5 | testReused60 | currentOverall | 177/180 | 28.25% | 62.15% | 36.16% | -9.38% | -1.48% | -1.32% / 55.93% | -1.03%..-0.78% | 70.06%..68.36% | 3 | 11 |
| L5 | allOriginal180 | currentOverall | 537/540 | 35.57% | 56.42% | 37.06% | -9.46% | -0.45% | -0.87% / 49.91% | -0.61%..-0.47% | 65.74%..64.80% | 5 | 51 |
| L5 | fresh1 | currentOverall | 3/3 | 33.33% | 66.67% | 0.00% | -4.12% | 0.14% | 2.14% / 66.67% | -2.86%..-2.86% | 100.00%..100.00% | 0 | 1 |
| L5 | recent55IncludingFresh | currentOverall | 162/165 | 27.16% | 59.88% | 33.33% | -8.18% | -0.39% | -0.78% / 55.56% | -0.81%..-0.72% | 68.52%..67.90% | 1 | 9 |
| L5 | testReused60 | ATRbaseline | 180/180 | 5.00% | 55.56% | 7.22% | -3.24% | 0.06% | 0.16% / 54.44% | -0.08%..-0.00% | 55.56%..55.00% | 1 | 0 |
| L5 | allOriginal180 | ATRbaseline | 539/540 | 5.94% | 58.81% | 15.03% | -3.70% | -0.46% | -0.61% / 58.07% | -0.62%..-0.59% | 59.55%..59.37% | 1 | 1 |
| L5 | fresh1 | ATRbaseline | 3/3 | 0.00% | 66.67% | 33.33% | -3.35% | -2.08% | -2.08% / 66.67% | -1.96%..-1.96% | 66.67%..66.67% | 0 | 0 |
| L5 | recent55IncludingFresh | ATRbaseline | 165/165 | 3.64% | 59.39% | 8.48% | -3.29% | -0.41% | -0.32% / 58.18% | -0.53%..-0.44% | 59.39%..58.79% | 1 | 0 |
| L5 | testReused60 | boundedEventComposite | 180/180 | 39.44% | 53.33% | 27.22% | -8.20% | 0.49% | 1.24% / 41.67% | 0.07%..0.73% | 58.89%..54.44% | 8 | 12 |
| L5 | allOriginal180 | boundedEventComposite | 535/540 | 41.50% | 59.44% | 38.50% | -10.18% | -1.32% | -0.30% / 46.36% | -0.73%..-0.20% | 66.73%..63.18% | 19 | 66 |
| L5 | fresh1 | boundedEventComposite | 3/3 | 66.67% | 66.67% | 33.33% | -6.61% | 0.28% | 3.42% / 33.33% | 4.70%..4.70% | 33.33%..33.33% | 0 | 0 |
| L5 | recent55IncludingFresh | boundedEventComposite | 165/165 | 37.58% | 50.91% | 22.42% | -6.84% | 1.67% | 1.62% / 41.82% | 0.37%..0.74% | 56.36%..53.94% | 4 | 9 |

**notLiveHistory**: Already-selected research ledgers; no actual published recommendation history or real orders.

**units**: Returns and rates are fractions in JSON; markdown multiplies fractions by 100.

**entryAndHorizon**: Actual next calendar session D1 open after signalDate; exact next five sessions including D1, close of D5.

**rawTouch**: Any observed high D1..D5 >= entry open * 1.10. Raw marks require five valid OHLC bars; positive volume is a separate stricter cohort.

**D1Bullish**: D1 close > D1 open; previous-close return is a different quantity.

**D5AnyNegativeL0**: D5 close / D1 open - 1 - total round-trip cost < 0.

**D5L5**: D5 close / D1 open - 1 - total round-trip cost <= -0.05, inclusive.

**MAE**: Minimum of all five observed lows / entry open - 1; includes candles after any hypothetical exit, not pre-exit drawdown.

**targetOnly**: Hypothetical capped +10% target exit at first target-reaching session, otherwise D5 close. Requires all five positive valid OHLCV bars. This favorable proxy assumes a target can fill; actual fills unknown.

**targetStop**: Hypothetical first passage +10% target / -5% stop, otherwise D5 close. Session open precedes daily high/low. Opening target gaps are capped at +10%; opening stop gaps exit proxy at actual open and can lose more than 5%.

**ambiguity**: If open lies between barriers and same daily bar touches both, conservative assumes stop first; optimistic assumes target first. Both bounds preserved; no fabricated intraday ordering.

**targetBeforeStop**: Conservative/optimistic count of target-stop proxy ending at target / strict known cohort. Same-bar ambiguity contributes only to optimistic target count.

**targetOnlyAfterEarlierStop**: Target-only proxy reaches target on a strictly later calendar date than first conservative stop/stop_gap. Same-day ambiguous cases are reported separately, not counted as proven prior stop.

**costs**: 30, 60, 100 bps fixed TOTAL round-trip costs, gross return minus bps/10000 exactly once. Hypothetical price proxies, not realized profits, fill simulation, or orders.

**unknown**: Incomplete/invalid OHLC, nonpositive or invalid volume, or invalid entry => proxy unknown, never zero or false. Valid zero-volume OHLC can retain raw observational marks.

**splitReuse**: Original 180 split: diagnostic TRAIN80, 5 purge, reused validation30, 5 purge, reused test60. These are not pristine unseen tests and do not choose any new model. Inner80 are last active dates of original causal235-day lifecycle. Fresh1 is one 2026-09-18 signal, not statistical validation.

**otherLimits**: Current master survivorship, adjusted/vintage price issues, repeated tickers and overlapping five-day horizons remain. No confidence or causal outperformance claim; no independent duplicate-baseline pooling across L0/L5.

**scope**: No feature fit, model fit, tuning, variant creation, selector execution, product source, UI, copy, delivery, DB, frozen-label or archive changes. New NAVER 2023-24 actual labels were not read.

{"selectedObservations": 11070, "dayAssertions": 3690, "selectedBarRecords": 55350, "barSourceCounts": {"kis": 55347, "missing": 3}, "nextFiveCalendarDifferences": 0, "entryOpenDifferences": 0, "D5DateDifferences": 0}

{"filesHashedBeforeAfter": 3283, "bytesHashedEachPass": 994113799, "changedFiles": [], "declaredSourceHashDifferences": 0, "ledgerLoadHashDifferences": 0}
