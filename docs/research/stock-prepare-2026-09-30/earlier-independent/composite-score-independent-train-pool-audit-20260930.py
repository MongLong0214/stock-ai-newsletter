import collections, hashlib, json, pathlib, statistics

P = pathlib.Path('/tmp/composite-score-research-20260930/wide-training.ndjson')
M = pathlib.Path('/tmp/composite-score-research-20260930/wide-training-manifest.json')
manifest = json.loads(M.read_text())
assert hashlib.file_digest(P.open('rb'), 'sha256').hexdigest() == manifest['output']['sha256']
dates = set(manifest['output']['dates'])
groups = collections.defaultdict(list)
for line in P.open():
    p = json.loads(line)
    assert p['date'] in dates
    f = p['flags']
    if not f['preCommonPool']: continue
    predicates = {
        'preCommonPool': True,
        'commonGate75': f['commonGate75'],
        'priorTargetEligible': f['priorTargetEligible'],
        'excludedByAnyCommonGate': not f['commonGate75'],
        'commonGateButExcludedByPreferredOrSignal10': f['commonGate75'] and not f['priorTargetEligible'],
        'signal10ExclusionWithCommonGateAndNonPreferred': f['commonGate75'] and f['notPreferredShare'] and not f['signalDayReturnBelow10pct'],
        'preferredExclusionWithCommonGate': f['commonGate75'] and not f['notPreferredShare'],
        'rsi75ExclusionWithOtherCommonChecksPassing': f['commonGateNoRsiCeiling'] and not f['rsiAtMost75'],
        'rsi75ExclusionWithOtherTargetChecksPassing': f['commonGateNoRsiCeiling'] and not f['rsiAtMost75'] and f['notPreferredShare'] and f['signalDayReturnBelow10pct'],
        'turnover500mExclusionWithOtherCommonChecksPassing': f['commonGateNoTurnoverFloor'] and not f['turnoverAtLeast500m'],
        'rsiOrTurnoverExclusionWithOtherCommonChecksPassing': f['commonGateNoTurnoverFloorOrRsiCeiling'] and not f['commonGate75'],
    }
    for k, yes in predicates.items():
        if yes: groups[k].append(p)

def summary(pp):
    valid = [p for p in pp if p['label']['status'] in ['hit', 'miss']]
    bydate = collections.defaultdict(list)
    for p in valid: bydate[p['date']].append(p)
    returns = [p['label']['return5d'] - .003 for p in valid]
    date_touch = [statistics.mean(p['label']['touched'] for p in v) for v in bydate.values()]
    date_net = [statistics.mean(p['label']['return5d']-.003 for p in v) for v in bydate.values()]
    n = len(valid)
    return {'rows':len(pp),'dateCount':len({p['date'] for p in pp}),'statusCounts':dict(collections.Counter(p['label']['status'] for p in pp)),'validD5':n,'touchCount':sum(p['label']['touched'] for p in valid),'touchRateValid':sum(p['label']['touched'] for p in valid)/n if n else None,'signalDateBalancedTouchRate':statistics.mean(date_touch) if date_touch else None,'D1bullishRateValid':statistics.mean(p['label']['entryBullish'] for p in valid) if n else None,'touchAndPositiveD5NetRateCount':sum(p['label']['touched'] and r>0 for p,r in zip(valid,returns)),'touchAndPositiveD5NetRateValid':sum(p['label']['touched'] and r>0 for p,r in zip(valid,returns))/n if n else None,'meanD5Net30bpsValid':statistics.mean(returns) if n else None,'signalDateBalancedMeanD5Net30bps':statistics.mean(date_net) if date_net else None,'loss5CountValid':sum(r<=-.05 for r in returns),'loss10CountValid':sum(r<=-.10 for r in returns),'loss5RateValid':sum(r<=-.05 for r in returns)/n if n else None,'loss10RateValid':sum(r<=-.10 for r in returns)/n if n else None,'currentOverallAtLeast70Count':sum(p['signals']['overall_score']>=70 for p in pp)}

out = pathlib.Path('/tmp/composite-score-independent-train-pool-audit-20260930.json')
report = {'scope':'Training-only descriptive current-master broader pool. No policy selection, coefficient/threshold tuning, post-TRAIN outcomes, or production/UI/copy changes. All groups first require flags.preCommonPool. Invalid/untradeable outcome counts retained and metrics explicitly conditional on valid five-session source labels. Gate exclusions overlap and these are not causal effects. Full KRX historical universe and executable outcomes remain unverified.','signalDates':{'from':min(dates),'through':max(dates),'days':len(dates)},'results':{k:summary(v) for k,v in groups.items()},'inputHashes':{str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [P,M,pathlib.Path(__file__)]}}
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'report':str(out),'results':report['results']},ensure_ascii=False))
