import collections, datetime, hashlib, json, math, pathlib, statistics

B = pathlib.Path('/tmp/composite-score-research-20260930')
LEDGER = B / 'horizon-ledger.json'
REPORT = B / 'horizon-summary.json'
PRIMARY = pathlib.Path('/tmp/upside-scored.ndjson')
FRESH = pathlib.Path('/tmp/stock-research-fresh-mature-20260930')
META = pathlib.Path('/private/tmp/stock-target-rebuilt-20260929/metadata.json')
SCORES = B / 'current-signals.ndjson'
meta = json.loads(META.read_text())
fm = json.loads((FRESH / 'features/metadata.json').read_text())
recorded = json.loads(LEDGER.read_text())
published = json.loads(REPORT.read_text())
calendar = fm['tradingDays']
ci = {d: i for i, d in enumerate(calendar)}
dates = meta['evaluationDates'] + fm['evaluationDates']
masters = {m['symbol']: m for m in meta['masters']}
scores = {}
for line in SCORES.open():
    p = json.loads(line)
    key = (p['date'], p['symbol'])
    assert key not in scores
    scores[key] = p['signals']
runtime = {p['date']: set(p['runtimeEligibleSymbols']) for p in map(json.loads, (B / 'horizon-runtime-eligibility.ndjson').open())}
errors = collections.defaultdict(list)
counts = collections.Counter()

def error(kind, value):
    counts[kind] += 1
    if len(errors[kind]) < 15:
        errors[kind].append(value)

def flag(v):
    if isinstance(v, bool): return v
    if isinstance(v, (int, float)): return v != 0
    return isinstance(v, str) and v.strip().upper() in ['Y', 'YES', 'TRUE', 'T', '1']

def eligible(f):
    m = masters.get(f['symbol'])
    if not m or not m['is_active']: return False
    vals = [f[k] for k in ['open', 'high', 'low', 'close', 'volume', 'averageTurnover20', 'rsi14']]
    if any(v is None or not math.isfinite(v) for v in vals): return False
    o, h, l, c, v, turnover, rsi = vals
    if o <= 0 or l <= 0 or v <= 0 or h < l or not l <= o <= h or not l <= c <= h or not 0 <= rsi <= 100: return False
    s = m.get('status_flags') or {}
    if any(flag(s.get(k)) for k in ['managed_stock', 'trading_suspended', 'liquidation_trading', 'investment_caution', 'market_warning_risk_notice']): return False
    if str(s.get('market_warning_code', '')).strip() in ['02', '03'] or str(s.get('short_term_overheat_code', '')).strip() in ['2', '3']: return False
    gap = f['gapFromPreviousClosePercent']
    atr = f['atrPercent14']
    return turnover >= 500_000_000 and c >= 1000 and rsi <= 75 and f['symbol'].split(':')[-1][-1] == '0' and gap is not None and math.isfinite(gap) and c / o - 1 < .10 and (1 + gap / 100) * (c / o) - 1 < .10 and atr is not None and math.isfinite(atr)

rows = {}
for path in [PRIMARY, FRESH / 'scored.ndjson']:
    for line in path.open():
        d, pp = json.loads(line)
        assert d not in rows
        rows[d] = {}
        own = set()
        for p in pp:
            s = p['symbol']
            assert s not in rows[d]
            rows[d][s] = {'feature': p['feature'], 'signals': scores[(d, s)], 'sourceLabel': p.get('label')}
            if eligible(p['feature']): own.add(s)
        if own != runtime[d]: error('eligibility', {'date': d, 'onlyIndependent': sorted(own - runtime[d]), 'onlyTS': sorted(runtime[d] - own)})
        counts['sourcePoints'] += len(pp)
assert list(rows) == dates and len(dates) == 181

selected = []
per_policy = {}
for policy in recorded['policies']:
    name = policy['name']
    days = policy['days']
    prior = []
    per_policy[name] = []
    assert len(days) == len(dates)
    for d, saved in zip(dates, days):
        assert saved['signalDate'] == d
        excluded = set().union(*prior[-20:]) if prior else set()
        candidates = [s for s, p in rows[d].items() if eligible(p['feature']) and s not in excluded]
        if name == 'currentOverallDescCooldown20':
            ordered = sorted(candidates, key=lambda s: (-rows[d][s]['signals']['overall_score'], -rows[d][s]['feature']['averageTurnover20'], s))
        elif name == 'baselineV2Cooldown20':
            ordered = sorted(candidates, key=lambda s: (rows[d][s]['feature']['atrPercent14'], s))
        else: raise AssertionError(name)
        chosen = ordered[:3] if len(ordered) >= 3 else []
        prior.append(set(chosen))
        saved_symbols = [p['symbol'] for p in saved['picks']]
        if chosen != saved_symbols: error('selection', {'policy': name, 'date': d, 'own': chosen, 'recorded': saved_symbols})
        cutoff = rows[d][chosen[-1]]['signals']['overall_score'] if chosen and name == 'currentOverallDescCooldown20' else None
        tied = sum(rows[d][s]['signals']['overall_score'] == cutoff for s in ordered) if cutoff is not None else None
        expected = {'recommendationDateExpected': calendar[ci[d]+1], 'expectedD5date': calendar[ci[d]+5], 'cooldown': 20, 'commonEligibleCount': len(runtime[d]), 'afterCooldownCount': len(candidates), 'pickedCount': len(chosen), 'cutoffScore': cutoff, 'candidatesTiedAtCutoff': tied}
        for k, v in expected.items():
            if saved[k] != v: error('dayMetadata', [name, d, k, v, saved[k]])
        for rank, p in enumerate(saved['picks'], 1):
            original = rows[d][p['symbol']]
            if p['feature'] != original['feature'] or p['signals'] != original['signals'] or p['sourceLabel'] != original['sourceLabel']: error('sourceBinding', [name, d, p['symbol']])
            if p['selectionRank'] != rank or p['currentMasterName'] != masters[p['symbol']]['name']: error('rankOrName', [name, d, p['symbol']])
            q = {'policy': name, 'date': d, 'symbol': p['symbol'], 'saved': p}
            selected.append(q)
            per_policy[name].append(q)
        counts['policyDates'] += 1

need_symbols = {p['symbol'] for p in selected}
raw = {}
for line in (FRESH / 'input/prices.ndjson').open():
    symbol, bars = json.loads(line)
    if symbol not in need_symbols: continue
    by_date = {}
    for r in bars:
        if r['source'] == 'kis':
            assert r['trade_date'] not in by_date
            by_date[r['trade_date']] = r
    raw[symbol] = by_date
for q in selected:
    d, s, p = q['date'], q['symbol'], q['saved']
    target_days = calendar[ci[d]+1:ci[d]+6]
    bars = [raw.get(s, {}).get(day) for day in target_days]
    complete = len(bars) == 5 and all(bars)
    valid = complete and all(all(isinstance(r[k], (int, float)) and math.isfinite(r[k]) and r[k] > 0 for k in ['open', 'high', 'low', 'close']) and r['low'] <= min(r['open'], r['close']) <= max(r['open'], r['close']) <= r['high'] for r in bars)
    zero = any(r and r['volume'] <= 0 for r in bars)
    bull = bars[0]['close'] > bars[0]['open'] if bars and bars[0] and bars[0]['open'] > 0 else None
    own = {'rawMarkValid': bool(valid), 'missingBarFlag': not complete, 'zeroVolumeFlag': bool(zero), 'entryBullish': bull}
    if valid:
        entry = bars[0]['open']
        gross = bars[-1]['close'] / entry - 1
        net = gross - .003
        touch = max(r['high'] for r in bars) >= entry * 110 / 100
        own.update({'entry': entry, 'gross5d': gross, 'net5d': net, 'touch': touch, 'mae': min(0, min(r['low'] for r in bars) / entry - 1), 'maxGainPercent': (max(r['high'] for r in bars) / entry - 1) * 100, 'touchAndPositiveNet': touch and net > 0, 'bullishAndTouch': bull and touch})
    for k, v in own.items():
        recorded_value = p.get(k)
        match = abs(v-recorded_value) <= 1e-12 if isinstance(v, float) and isinstance(recorded_value, (float, int)) else v == recorded_value
        if not match: error('rawOutcome', [q['policy'], d, s, k, v, recorded_value])
    for i, (day, r, saved_bar) in enumerate(zip(target_days, bars, p['dailyBars']), 1):
        expected_bar = {'session': i, 'date': day, 'source': 'kis', **{k:r[k] for k in ['open','high','low','close','volume']}} if r else {'session':i,'date':day,'missing':True}
        if expected_bar != saved_bar: error('rawBars', [q['policy'], d, s, day])
    q.update(own)
    counts['selectedInstances'] += 1
    counts['zeroVolumeInstances'] += zero
    counts['missingBarInstances'] += not complete

def aggregate(pp):
    vv = [p for p in pp if p['rawMarkValid']]
    rr = [p['net5d'] for p in vv]
    bull = [p['entryBullish'] for p in pp if p['entryBullish'] is not None]
    n = len(vv)
    scores = [p['saved']['signals']['overall_score'] for p in pp]
    groups = collections.defaultdict(list)
    for p in pp: groups[p['date']].append(p)
    r = {'points':len(pp),'validD5MarkLabels':n,'missingD5Labels':len(pp)-n,'zeroVolumePoints':sum(p['zeroVolumeFlag'] for p in pp),'touchCount':sum(p['touch'] for p in vv),'touchRate':sum(p['touch'] for p in vv)/n if n else None,'D1bullishCount':sum(bull),'D1bullishRate':sum(bull)/len(bull) if bull else None,'touchAndPositiveNetCount':sum(p['touchAndPositiveNet'] for p in vv),'touchAndPositiveNetRate':sum(p['touchAndPositiveNet'] for p in vv)/n if n else None,'bullishAndTouchRate':sum(p['bullishAndTouch'] for p in vv)/n if n else None,'meanNet5d':statistics.mean(rr) if rr else None,'medianNet5d':statistics.median(rr) if rr else None,'positiveNetRate':sum(r>0 for r in rr)/n if n else None,'loss5Count':sum(r<=-.05 for r in rr),'loss5Rate':sum(r<=-.05 for r in rr)/n if n else None,'loss10Count':sum(r<=-.1 for r in rr),'loss10Rate':sum(r<=-.1 for r in rr)/n if n else None,'meanMAE':statistics.mean(p['mae'] for p in vv) if vv else None,'worstNet5d':min(rr) if rr else None,'minOverallScore':min(scores) if scores else None,'meanOverallScore':statistics.mean(scores) if scores else None,'maxOverallScore':max(scores) if scores else None,'all3TouchDays':sum(len(g)==3 and all(p['touch'] for p in g) for g in groups.values()),'all3BullishDays':sum(len(g)==3 and all(p['entryBullish'] for p in g) for g in groups.values()),'all3PositiveNetDays':sum(len(g)==3 and all(p['rawMarkValid'] and p['net5d']>0 for p in g) for g in groups.values()),'scoreAtLeast70Picks':sum(s>=70 for s in scores)}
    return r

splits = {'train': dates[:80], 'validation':dates[85:115], 'test':dates[120:180], 'partialFreshSpotcheck':dates[180:]}
results = {}
for split, ds in splits.items():
    results[split] = {}
    for name, pp in per_policy.items():
        selected_split = [p for p in pp if p['date'] in ds]
        own = aggregate(selected_split)
        saved = next(p['summary'] for p in published['results'][split] if p['name']==name)
        for k, v in own.items():
            sv = saved[k]
            match = abs(v-sv) <= 1e-12 if isinstance(v, float) and isinstance(sv, (float,int)) else v==sv
            if not match: error('aggregate', [split, name, k, v, sv])
        own['positiveVolumeOnly'] = aggregate([p for p in selected_split if not p['zeroVolumeFlag']])
        for k in ['points','validD5MarkLabels','touchRate','meanNet5d','loss5Rate','loss10Rate','D1bullishRate']:
            v, sv = own['positiveVolumeOnly'][k], saved['positiveVolumeOnly'][k]
            match = abs(v-sv) <= 1e-12 if isinstance(v,float) and isinstance(sv,(float,int)) else v==sv
            if not match: error('positiveVolumeAggregate',[split,name,k,v,sv])
        results[split][name] = own

source_hashes = {}
for p, expected in recorded['sourceHashes'].items():
    if pathlib.Path(p).exists():
        actual = hashlib.file_digest(open(p,'rb'),'sha256').hexdigest()
        source_hashes[p] = actual
        if actual != expected: error('sourceHash', [p, expected, actual])
out = pathlib.Path('/tmp/composite-score-independent-ledger-audit-20260930.json')
report = {'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Research audit only, no production/UI/copy changes; no PR review attempt. Independently replayed runtime pool formula, integer-score/turnover/symbol ranking, each-policy continuous20-day cooldown from explicit emptyinitial state and raw5-session price outcomes. Source DB OHLC observations are not certified unadjusted/executable returns.','sourceCommit':recorded['scoreSourceCommit'],'scoreVersion':recorded['scoreVersion'],'counts':dict(counts),'differenceCounts':{k:v for k,v in counts.items() if k not in ['sourcePoints','policyDates','selectedInstances','zeroVolumeInstances','missingBarInstances']},'differenceExamples':dict(errors),'results':results,'sourceHashes':source_hashes,'judgment':'Verified static overall ranking raises touch frequency but sharply raises five-day loss and adverse excursion. A higher displayed score does not meet the no-loss/daily-three-surge goal. Previously reused historical folds are diagnostic, not pristine prospective validation.','scriptSha256':hashlib.file_digest(open(__file__,'rb'),'sha256').hexdigest()}
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'report':str(out),'counts':dict(counts),'differences':report['differenceCounts'],'test':results['test']},ensure_ascii=False))
if errors: raise SystemExit(1)
