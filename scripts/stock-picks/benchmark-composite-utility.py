# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
"""Replay the fixed legacy/two-head comparison on local TS-eligible exports.

Already inspected historical windows: exploratory evidence, not a sealed holdout.
Unknown future labels remain in selection and are counted separately.
"""
import argparse, importlib.util, json, math, os, pathlib
from statistics import fmean, median

SEGMENTS = [('validation', '2025-12-23', '2026-03-31'),
            ('historical_test', '2026-04-01', '2026-06-30'),
            ('historical_test', '2026-07-01', '2026-09-18'),
            ('recent_test', '2026-09-21', '2026-09-30')]


def summarize(rows):
    picks = [p for d in rows for p in d['picks']]
    good = [p for p in picks if p['known']]
    unknown_reasons = {reason: 0 for reason in ['immature', 'suspendedOrUntradeable', 'dataError', 'unclassified']}
    for p in picks:
        if not p['known']:
            reason = p.get('labelNullReason')
            unknown_reasons[reason if reason in unknown_reasons else 'unclassified'] += 1
    suspended = unknown_reasons['suspendedOrUntradeable']
    worst = min((p['net'] for p in good), default=None)
    # Impute each suspended/untradeable pick at min(segment worst observed net,
    # -30bps), ensuring an assumed loss even in positive-only segments. Without observations,
    # assume total capital loss plus the same 30bps cost (-1.003). Immature and
    # other data errors remain excluded from these two conservative denominators.
    assumed_net = min(worst, -.003) if worst is not None else -1.003
    conservative_count = len(good) + suspended
    return dict(dates=len(rows), slots=3*len(rows), picks=len(picks), known=len(good),
                missing=len(picks)-len(good), touchRate=sum(p['touch'] for p in good)/(3*len(rows)) if rows else None,
                bullishRate=sum(p['bullish'] for p in good)/len(good) if good else None,
                lossRate=sum(p['net'] < 0 for p in good)/len(good) if good else None,
                meanNet=fmean(p['net'] for p in good) if good else None,
                medianNet=median(p['net'] for p in good) if good else None,
                severeLossRate=sum(p['net'] <= -.1 for p in good)/len(good) if good else None,
                meanMae=fmean(p['mae'] for p in good) if good else None, worstNet=worst,
                unknownReasons=unknown_reasons,
                lossRateConservative=(sum(p['net'] < 0 for p in good)+suspended)/conservative_count
                    if conservative_count else None,
                meanNetConservative=(sum(p['net'] for p in good)+suspended*assumed_net)/conservative_count
                    if conservative_count else None,
                suspendedOrUntradeableNetAssumption=assumed_net)


def main():
    # Keep summary regressions runnable with stdlib Python; fitting alone needs ML packages.
    os.environ.setdefault('OMP_NUM_THREADS', '1')
    os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
    import numpy as np
    from sklearn.ensemble import HistGradientBoostingRegressor
    from threadpoolctl import threadpool_limits
    spec = importlib.util.spec_from_file_location('trainer', pathlib.Path(__file__).with_name('train-composite-utility.py'))
    trainer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(trainer)
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['features', 'calendar', 'output']:
        parser.add_argument('--'+name, required=True)
    args = parser.parse_args()
    calendar = json.loads(pathlib.Path(args.calendar).read_text())['tradingDays']
    assert calendar == sorted(set(calendar))
    di = {d: i for i, d in enumerate(calendar)}
    records = [json.loads(line) for line in pathlib.Path(args.features).open()]
    records.sort(key=lambda r: (r['date'], r['symbol']))
    keys = [(r['date'], r['symbol']) for r in records]
    assert len(set(keys)) == len(keys) and all(r['runtimeEligible'] is True for r in records)
    X = np.array([r['originalInputs18']+r['extraInputs32'] for r in records], dtype=float)
    assert X.shape == (len(records), 50) and not np.isinf(X).any()
    idx = np.array([di[d] for d, _ in keys]); history = np.array([r['historySessions'] for r in records])
    turnover = np.array([r['turnover'] for r in records]); assert np.isfinite(turnover).all()
    known = np.array([r['label'] is not None for r in records])
    label_null_reasons = [None if known[k] else r.get('labelNullReason') or
                          ('immature' if idx[k]+5 >= len(calendar) else 'unclassified')
                          for k, r in enumerate(records)]
    touch = np.array([bool(r['label']['touched']) if r['label'] else False for r in records])
    bull = np.array([bool(r['label']['entryBullish']) if r['label'] else False for r in records])
    net = np.array([r['label']['return5d']-.003 if r['label'] else np.nan for r in records])
    mae = np.array([r['label']['maxDrawdown'] if r['label'] else np.nan for r in records])
    assert np.all(idx[known]+5 < len(calendar)) and np.isfinite(net[known]).all() and np.isfinite(mae[known]).all()
    legacy = (.8*touch+.2*bull+.65*(net >= 0))/1.65
    policies = ['legacy', 'touchNonLoss2']
    last = {p: {} for p in policies}; daily = {p: [] for p in policies}; fits = []
    for segment, start, end in SEGMENTS:
        first = di[start]; fit = known & (idx+5 < first)
        _, counts = np.unique(idx[fit], return_counts=True)
        weights = np.concatenate([np.full(c, int(fit.sum())/(len(counts)*c)) for c in counts])
        test = np.flatnonzero((idx >= first) & (idx <= di[end]) & (history == 320))
        assert len(test) and fit.any()
        fits.append(dict(testStart=start, trainingRows=int(fit.sum()), trainingPanels=len(counts),
                         lastSignalDate=calendar[int(idx[fit].max())], labelsThrough=calendar[int(idx[fit].max())+5]))
        train_pred = {}; test_pred = {}
        for name, y in [('legacy', legacy), ('touch', touch.astype(float)), ('nonLoss', (net >= 0).astype(float))]:
            print('FIT', start, name, int(fit.sum()), flush=True)
            with threadpool_limits(limits=1):
                model = HistGradientBoostingRegressor(**trainer.PARAMS).fit(X[fit], y[fit], sample_weight=weights)
                train_pred[name] = np.clip(model.predict(X[fit]), 0, 1)
                test_pred[name] = np.clip(model.predict(X[test]), 0, 1)
        train_pred['touchNonLoss2'] = train_pred['touch']*train_pred['nonLoss']**2
        test_pred['touchNonLoss2'] = test_pred['touch']*test_pred['nonLoss']**2
        scores = {}
        for p in policies:
            mean = np.average(train_pred[p], weights=weights)
            sd = np.sqrt(np.average((train_pred[p]-mean)**2, weights=weights)); assert sd > 0
            delta = test_pred[p]-mean
            scores[p] = np.floor(50+50*delta/np.hypot(delta, math.sqrt(5.25)*sd)+.5).astype(int)
        for j in sorted(set(idx[test])):
            local = np.flatnonzero(idx[test] == j); rows = test[local]
            for p in policies:
                allowed = np.array([j-last[p].get(keys[k][1], -1000) > 20 for k in rows])
                rr = rows[allowed]; values = scores[p][local][allowed]
                order = np.lexsort((np.array([keys[k][1] for k in rr]), -turnover[rr], -values))[:3]
                picks = rr[order]; assert len(picks) == 3, 'Do not silently relax the three-pick contract'
                for k in picks: last[p][keys[k][1]] = int(j)
                daily[p].append(dict(segment='warmup' if segment == 'validation' and j-first < 20 else segment,
                    date=calendar[j], picks=[dict(symbol=keys[k][1], score=int(values[order[n]]), known=bool(known[k]),
                        labelNullReason=label_null_reasons[k],
                        touch=bool(touch[k]) if known[k] else None, bullish=bool(bull[k]) if known[k] else None,
                        net=float(net[k]) if known[k] else None, mae=float(mae[k]) if known[k] else None)
                        for n, k in enumerate(picks)]))
    summary = {p: {s: summarize([d for d in daily[p] if d['segment'] == s])
               for s in ['validation', 'historical_test', 'recent_test']} for p in policies}
    report = dict(scope='exploratory previously inspected historical data', costBps=30, cooldownSessions=20,
                  featureSha256=trainer.sha(args.features), calendarSha256=trainer.sha(args.calendar),
                  trainingParams=trainer.PARAMS, fits=fits, summary=summary, daily=daily,
                  caveats=['Current master/status and adjusted-price vintage bias',
                           'Selection only; excludes market-alert decisions, LLM text and real fills',
                           'Overlapping five-day outcomes are not funded portfolio returns'])
    path = pathlib.Path(args.output); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, allow_nan=False)+'\n')
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()
