# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
"""Reproduce the fixed KIS composite. Inputs must be observed TS-eligible exports.

uv run --script scripts/stock-picks/train-composite-utility.py \
  --features ELIGIBLE_FEATURES.ndjson --feature-spec featurespec.json \
  --calendar metadata.json --prices prices.ndjson --as-of YYYY-MM-DD \
  --output scripts/stock-picks/models/composite-utility-v1.json --audit-dir RESULTS

No search, vendor mixing, selection, UI changes, or performance claims.
"""
import argparse, hashlib, json, math, os, pathlib
os.environ.setdefault('OMP_NUM_THREADS', '1')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
import numpy as np
import joblib
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
from threadpoolctl import threadpool_limits

PARAMS = dict(loss='squared_error', max_iter=100, max_leaf_nodes=7, max_depth=3,
              min_samples_leaf=100, l2_regularization=1, learning_rate=.05,
              max_bins=255, random_state=42, early_stopping=False)
CONFIG = dict(family='A', complexity='small', riskDefinition='L0=netD5<0',
              **{'lambda': .65, 'inputCount': 50, 'id': 'L0-A-small-lambda0.65-inputs50'})

def sha(path):
    with pathlib.Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def finite(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)

def utility(touch, bullish, loss0):
    return (.8 * touch + .2 * bullish + .65 * (1 - loss0)) / (1 + .65)

def portable_predict(model, values):
    value = model['baselinePrediction']
    for tree in model['trees']:
        index = 0
        while not tree[index]['isLeaf']:
            node = tree[index]; v = values[node['featureIdx']]
            threshold = node['numThreshold']
            threshold = math.inf if threshold == 'Infinity' else -math.inf if threshold == '-Infinity' else threshold
            left = node['missingGoLeft'] if v is None or math.isnan(v) else v <= threshold
            index = node['left'] if left else node['right']
        value += tree[index]['value']
    return value

def rounded_score(v):
    return math.floor(100 * min(1, max(0, v)) + .5)

def serialize(model):
    trees = []
    for iteration in model._predictors:
        assert len(iteration) == 1
        nodes = []
        for n in iteration[0].nodes:
            assert not n['is_categorical']
            threshold = float(n['num_threshold'])
            encoded = None if n['is_leaf'] else threshold if math.isfinite(threshold) else 'Infinity' if threshold > 0 else '-Infinity'
            nodes.append(dict(isLeaf=bool(n['is_leaf']), value=float(n['value']),
                              featureIdx=int(n['feature_idx']), numThreshold=encoded,
                              missingGoLeft=bool(n['missing_go_to_left']),
                              left=int(n['left']), right=int(n['right'])))
        trees.append(nodes)
    assert len(trees) == 100
    return dict(baselinePrediction=float(model._baseline_prediction[0, 0]), trees=trees)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['features', 'feature-spec', 'calendar', 'prices', 'as-of', 'output', 'audit-dir']:
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args(); paths = {k: pathlib.Path(getattr(args, k)) for k in ['features', 'feature_spec', 'calendar', 'prices']}
    spec = json.loads(paths['feature_spec'].read_text()); feature_names = spec['featureNames']
    assert len(feature_names) == 50 and len(set(feature_names)) == 50
    calendar = json.loads(paths['calendar'].read_text())['tradingDays']
    assert calendar == sorted(set(calendar)) and args.as_of in calendar
    date_index = {d: i for i, d in enumerate(calendar)}
    n = sum(1 for _ in paths['features'].open()); xx = np.full((n, 50), np.nan)
    keys = []; seen = set(); withheld = {}; eligible_counts = {}
    for line in paths['features'].open():
        r = json.loads(line); d = r['date']; symbol = r['symbol']
        assert r['runtimeEligible'] is True and d in date_index
        key = (d, symbol); assert key not in seen; seen.add(key)
        i = date_index[d]
        if i + 5 >= len(calendar) or calendar[i + 5] > args.as_of:
            withheld[d] = withheld.get(d, 0) + 1; continue
        v = r['originalInputs18'] + r['extraInputs32']; assert len(v) == 50
        xx[len(keys)] = [x if finite(x) else np.nan for x in v]
        keys.append(key); eligible_counts[d] = eligible_counts.get(d, 0) + 1
    xx = xx[:len(keys)]; assert len(keys) > 0
    order = sorted(range(len(keys)), key=keys.__getitem__); xx = xx[order]; keys = [keys[i] for i in order]
    symbols = sorted({s for _, s in keys}); symbol_index = {s: i for i, s in enumerate(symbols)}
    raw = np.full((len(symbols), len(calendar), 5), np.nan)
    rows_seen = set(); source_counts = {}
    for line in paths['prices'].open():
        symbol, bars = json.loads(line)
        if symbol not in symbol_index: continue
        for bar in bars:
            source = bar['source']; source_counts[source] = source_counts.get(source, 0) + 1
            assert source == 'kis', 'KIS-only training; reject vendor mixing'
            d = bar['trade_date']
            if d not in date_index: continue
            key = (symbol, d); assert key not in rows_seen, 'Duplicate raw symbol/date'
            rows_seen.add(key)
            raw[symbol_index[symbol], date_index[d]] = [bar[k] if finite(bar.get(k)) else np.nan for k in ['open', 'high', 'low', 'close', 'volume']]
    events = np.zeros((len(keys), 3), dtype=np.uint8); strict = np.zeros(len(keys), dtype=bool)
    per_date = []; offset = 0; float_touch_differences = 0; strict_float_touch_differences = 0
    for d in sorted(eligible_counts):
        count = eligible_counts[d]; kk = keys[offset:offset + count]; assert all(k[0] == d for k in kk)
        rr = raw[[symbol_index[s] for _, s in kk], date_index[d] + 1:date_index[d] + 6]
        price = rr[:, :, :4]
        valid = np.isfinite(rr).all(axis=(1, 2)) & (rr > 0).all(axis=(1, 2))
        valid &= (price[:, :, 1] >= price.max(axis=2)).all(axis=1) & (price[:, :, 2] <= price.min(axis=2)).all(axis=1)
        entry = rr[:, 0, 0]
        net = np.divide(rr[:, -1, 3], entry, out=np.full(count, np.nan), where=np.isfinite(entry) & (entry > 0)) - 1 - .003
        float_touch = (rr[:, :, 1] >= entry[:, None] * 110 / 100).any(axis=1)
        touch = (np.floor(rr[:, :, 1] + .5) * 100 >= np.floor(entry[:, None] + .5) * 110).any(axis=1)
        float_touch_differences += int((touch != float_touch).sum())
        strict_float_touch_differences += int(((touch != float_touch) & valid).sum())
        bull = rr[:, 0, 3] > entry
        events[offset:offset + count] = np.column_stack([touch, bull, net < 0])
        strict[offset:offset + count] = valid
        strict_count = int(valid.sum()); assert strict_count > 0, 'Do not silently compress an empty signal panel'
        per_date.append(dict(signalDate=d, labelMaturityDate=calendar[date_index[d] + 5], eligible=count,
                             strictTrainingRows=strict_count, futureUnknownRows=count - strict_count))
        offset += count
    assert offset == len(keys)
    fit_x = np.ascontiguousarray(xx[strict], dtype=np.float64); fit_events = events[strict]
    counts = np.array([p['strictTrainingRows'] for p in per_date], dtype=np.int32)
    weights = np.concatenate([np.full(int(c), len(fit_x) / (len(counts) * int(c)), dtype=np.float64) for c in counts])
    lookup = np.array([utility((i >> 2) & 1, i & 1, (i >> 1) & 1) for i in range(8)])
    bits = fit_events[:, 0] * 4 + fit_events[:, 2] * 2 + fit_events[:, 1]; y = lookup[bits]
    assert abs(weights.mean() - 1) < 1e-12 and len(y) == int(counts.sum())
    hashes = {str(p): sha(p) for p in paths.values()}; hashes[str(pathlib.Path(__file__))] = sha(__file__)
    input_sha = hashlib.sha256(fit_x.tobytes() + fit_events.tobytes() + counts.tobytes() + weights.tobytes() + y.tobytes()).hexdigest()
    print('FIXED_FIT_START', len(counts), len(fit_x), per_date[-1], flush=True)
    with threadpool_limits(limits=1):
        model = HistGradientBoostingRegressor(**PARAMS).fit(fit_x, y, sample_weight=weights)
    assert model.n_iter_ == 100
    result = dict(schemaVersion=1, modelVersion='composite-utility-v1',
                  trainedLabelsThrough=per_date[-1]['labelMaturityDate'],
                  trainingLastSignalDate=per_date[-1]['signalDate'], trainingAsOf=args.as_of,
                  observedInputVersion='observed-50-v1-2026-09-30', featureNames=feature_names,
                  config=CONFIG, parameters=PARAMS, **serialize(model),
                  leafValuesAlreadyIncludeLearningRate=True,
                  scoreMap=dict(scale=100, clamp=[0, 1], rounding='floor(100*clip(prediction,0,1)+0.5)'),
                  targetDefinition=dict(eventOrder=['touch10', 'D1bullish', 'D5netNegative'],
                    formula='(.8*T10 + .2*D1bullish + .65*(1-L0))/(1+.65)',
                    entry='next actual trading session open', horizon=5, roundTripCostBps=30,
                    loss0='D5close/entry-1-.003 < 0', touch10='Math.round(max(D1..D5 high))*100 >= Math.round(entry)*110'),
                  metadata=dict(source='kis', observedInputVersion='observed-50-v1-2026-09-30', trainingAsOf=args.as_of, trainingFirstSignalDate=per_date[0]['signalDate'],
                    trainingLastSignalDate=per_date[-1]['signalDate'], latestLabelMaturity=per_date[-1]['labelMaturityDate'],
                    signalPanels=len(counts), trainingRows=len(y), sampleWeightMean=float(weights.mean()),
                    nativeMissingInputValues=int(np.isnan(fit_x).sum()), inputSha256=input_sha,
                    inputHashes=hashes, numpyVersion=np.__version__, sklearnVersion=sklearn.__version__,
                    trainingRowOrder='signalDate ASCII, symbol ASCII', immatureSignalPanelsExcluded=withheld,
                    nativeMissingRouting=True, perDateTraining=per_date,
                    selectionContract='published integer DESC, turnover20 DESC, ASCII symbol; own cooldown20',
                    performanceClaim='Fresh refit only; no new out-of-sample performance claim. Prior research did not attain40/30.',
                    currentMasterAndAdjustedVintageBias=True))
    audit_dir = pathlib.Path(args.audit_dir); audit_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, audit_dir / 'model.joblib'); np.savez(audit_dir / 'fit-inputs.npz', X=fit_x, events=fit_events, groups=counts, weights=weights, y=y)
    sample_indices = np.linspace(0, len(fit_x) - 1, min(2048, len(fit_x)), dtype=int)
    cases = [v.copy() for v in fit_x[sample_indices]]
    cases.append(np.full(50, np.nan)); cases.append(np.zeros(50))
    for j in range(50):
        v = fit_x[sample_indices[j % len(sample_indices)]].copy(); v[j] = np.nan; cases.append(v)
    boundary_count = 0
    for tree in result['trees']:
        for node in tree:
            if not node['isLeaf'] and isinstance(node['numThreshold'], (int, float)):
                for value in [np.nextafter(node['numThreshold'], -np.inf), node['numThreshold'], np.nextafter(node['numThreshold'], np.inf)]:
                    v = fit_x[sample_indices[boundary_count % len(sample_indices)]].copy(); v[node['featureIdx']] = value; cases.append(v)
                boundary_count += 1
    cases = np.array(cases); native = model.predict(cases); portable = np.array([portable_predict(result, v) for v in cases])
    error = np.abs(native - portable); score_difference = int(sum(rounded_score(a) != rounded_score(b) for a, b in zip(native, portable)))
    assert score_difference == 0 and np.array_equal(native, portable), 'Native/standalone prediction mismatch'
    fixtures = []
    for i in list(range(12)) + [2048, 2049, 2050, 2051, 2052, len(cases) - 1]:
        fixtures.append(dict(id='case-' + str(i), inputs=[float(v) if np.isfinite(v) else None for v in cases[i]],
                             prediction=float(native[i]), overallScore=rounded_score(float(native[i]))))
    audit = dict(cases=len(cases), observedCases=len(sample_indices), missingFeatureCases=51,
                 thresholdNodesChecked=boundary_count, thresholdEqualityAndAdjacentCases=3 * boundary_count,
                 maxAbsolutePredictionError=float(error.max()), predictionDifferences=int((error != 0).sum()),
                 roundedScoreDifferences=score_difference, fitInputSha256=input_sha,
                 modelJoblibSha256=sha(audit_dir / 'model.joblib'), structuredNodesSha256=hashlib.sha256(b''.join(p[0].nodes.tobytes() for p in model._predictors)).hexdigest(),
                 sourceHashes=hashes, perDateTraining=per_date, nativeMissingValues=int(np.isnan(fit_x).sum()),
                 trainingRows=len(y), trainingPanels=len(counts), noFreshPerformanceClaims=True,
                 floatVersusExactRoundedTouchDifferences=float_touch_differences,
                 strictFitFloatVersusExactRoundedTouchDifferences=strict_float_touch_differences)
    output = pathlib.Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    audit['portableArtifactSha256'] = sha(output)
    (audit_dir / 'audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2))
    (audit_dir / 'fixtures.json').write_text(json.dumps(dict(schemaVersion=1, featureNames=feature_names, cases=fixtures), ensure_ascii=False, indent=2))
    (audit_dir / 'observed-keys.json').write_text(json.dumps([keys[i] for i in np.flatnonzero(strict)[sample_indices]], ensure_ascii=False))
    print('FIXED_FIT_EXPORT_DONE', output, audit['portableArtifactSha256'], 'PARITY', len(cases), score_difference, flush=True)

if __name__ == '__main__':
    main()
