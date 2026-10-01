import json, math, statistics, hashlib, datetime
from pathlib import Path
from collections import defaultdict

ROOT = Path('/tmp/composite-score-research-20260930')
OUT = ROOT / 'regime-train-study'
OUT.mkdir(exist_ok=True)

def readj(path):
    return json.loads(Path(path).read_text())

def policies(path):
    return {x['name']: x['days'] for x in readj(path)['policies']}

inner_raw = policies(ROOT/'raw-composite-study/inner-ledger.json')
inner_balanced = policies(ROOT/'balanced-event-study/inner-ledger.json')
outer_raw = policies(ROOT/'raw-composite-study/outer-ledger.json')
outer_balanced = policies(ROOT/'balanced-event-study/outer-ledger.json')
earlier_dates = [d['signalDate'] for d in inner_raw['currentOverall']]
original_dates = [d['signalDate'] for d in outer_raw['currentOverall'][:80]]
assert len(earlier_dates) == 235 and len(original_dates) == 80
assert original_dates[-1] == '2026-04-22'
scopes = {
    'earlier235WithWarmSeed': {'dates':earlier_dates, 'policies':{
        'currentOverall':inner_raw['currentOverall'], 'ATRbaseline':inner_raw['ATRbaseline'],
        'rawUtility':inner_raw['rawComposite'], 'balancedEvent0.65':inner_balanced['lambda0.65']}},
    'earlierSeed155': {'dates':earlier_dates[:155]},
    'earlierActiveInner80': {'dates':earlier_dates[155:]},
    'originalTrain80Reused': {'dates':original_dates, 'policies':{
        'currentOverall':outer_raw['currentOverall'][:80], 'ATRbaseline':outer_raw['ATRbaseline'][:80],
        'rawUtility':outer_raw['rawComposite'][:80], 'balancedEvent0.65':outer_balanced['balancedEventComposite'][:80]}}
}
for n in ['earlierSeed155','earlierActiveInner80']:
    ds=set(scopes[n]['dates']); scopes[n]['policies']={k:[d for d in v if d['signalDate'] in ds] for k,v in scopes['earlier235WithWarmSeed']['policies'].items()}

eligible = {}
for path in [ROOT/'earlier-training/earlier-runtime-eligibility.ndjson', ROOT/'horizon-runtime-eligibility.ndjson']:
    with path.open() as f:
        for line in f:
            x=json.loads(line)
            if x['date'] in earlier_dates or x['date'] in original_dates:
                eligible[x['date']]=set(x['runtimeEligibleSymbols'])
assert len(eligible)==315
market = {}; atr=defaultdict(list); vol=defaultdict(list); uniform_differences=[]
fields=['benchmarkReturn20Percent','benchmarkSma20DistancePercent','breadthAboveSma20']
for path in [ROOT/'earlier-training/earlier-context.ndjson',ROOT/'technical-context.ndjson']:
    with path.open() as f:
        for line in f:
            x=json.loads(line); date=x['date']
            if date not in eligible: continue
            c=x['context']; vals={k:c.get(k) for k in fields}
            if date in market and vals!=market[date]: uniform_differences.append([date,x['symbol']])
            market[date]=vals
            if x['symbol'] in eligible[date]:
                v=c.get('realizedVolatility20Percent')
                if isinstance(v,(float,int)) and math.isfinite(v):vol[date].append(v)
print('context loaded',len(market),'uniformDifferences',len(uniform_differences),flush=True)
assert not uniform_differences
with (ROOT/'earlier-training/earlier-wide.ndjson').open() as f:
    for line in f:
        x=json.loads(line); date=x['date']
        if x['symbol'] in eligible[date]:
            v=x['feature'].get('atrPercent14')
            if isinstance(v,(float,int)) and math.isfinite(v):atr[date].append(v)
with Path('/tmp/upside-scored.ndjson').open() as f:
    for i,line in enumerate(f):
        if i>=80:break
        date, points=json.loads(line)
        assert date==original_dates[i]
        for x in points:
            if x['symbol'] in eligible[date]:
                v=x['feature'].get('atrPercent14')
                if isinstance(v,(float,int)) and math.isfinite(v):atr[date].append(v)
print('observed universe risk loaded',len(atr),flush=True)

def mean(v):return statistics.fmean(v) if v else None
def med(v):return statistics.median(v) if v else None
def groupkeys(m):
    if any(m[k] is None for k in fields):return ['all','missingMarket']
    r=m[fields[0]]<0;s=m[fields[1]]<0;b=m[fields[2]]<.5
    return ['all','return20Negative' if r else 'return20Nonnegative','sma20Below' if s else 'sma20AtOrAbove',
            'breadthBelowHalf' if b else 'breadthAtOrAboveHalf', 'anyWeak' if r or s or b else 'allThreeHealthy',
            f'joint_returnNeg{int(r)}_smaBelow{int(s)}_breadthBelow{int(b)}']

def summarize(days):
    picks=[p for d in days for p in d['picks']]
    pp=[p for p in picks if p['outcome']['strictLabelValid']]
    outcomes=[p['outcome'] for p in pp]
    daily=[]
    for d in days:
        oo=[p['outcome'] for p in d['picks'] if p['outcome']['strictLabelValid']]
        if oo:daily.append({k:mean([float(o[k]) for o in oo]) for k in ['touch','entryBullish','net5d','targetNetProxy','utility','mae']}|{'loss5':mean([o['net5d']<=-.05 for o in oo]),'loss10':mean([o['net5d']<=-.10 for o in oo])})
    scores=[p['signals']['overall_score'] for p in picks]
    return {'days':len(days),'full3Days':sum(len(d['picks'])==3 for d in days),'selectedSlots':len(picks),
        'strictLabels':len(pp),'unknownStrictLabels':len(picks)-len(pp),'modelActiveDays':sum(d['modelActive'] for d in days),
        'strict':{'touchCount':sum(o['touch'] for o in outcomes),'touchRate':mean([o['touch'] for o in outcomes]),
          'bullRate':mean([o['entryBullish'] for o in outcomes]),'loss5Count':sum(o['net5d']<=-.05 for o in outcomes),
          'loss5Rate':mean([o['net5d']<=-.05 for o in outcomes]),'loss10Rate':mean([o['net5d']<=-.10 for o in outcomes]),
          'meanD5Net':mean([o['net5d'] for o in outcomes]),'medianD5Net':med([o['net5d'] for o in outcomes]),
          'meanMAE':mean([o['mae'] for o in outcomes]),'worstD5Net':min([o['net5d'] for o in outcomes],default=None),
          'meanTargetNetProxy':mean([o['targetNetProxy'] for o in outcomes]),'meanUtility':mean([o['utility'] for o in outcomes])},
        'equalDate':{k:mean([d[k] for d in daily]) for k in ['touch','entryBullish','loss5','loss10','net5d','targetNetProxy','utility','mae']},
        'scores':{'min':min(scores,default=None),'max':max(scores,default=None),'mean':mean(scores),'atLeast70Picks':sum(s>=70 for s in scores)},
        'marketMeans':{k:mean([market[d['signalDate']][k] for d in days]) for k in fields},
        'eligibleMedianATRmean':mean([med(atr[d['signalDate']]) for d in days]),
        'eligibleMedianRealizedVolatility20Mean':mean([med(vol[d['signalDate']]) for d in days])}

results={}; daily_ledgers={}
for scope,info in scopes.items():
    groups=defaultdict(set)
    for d in info['dates']:
        for k in groupkeys(market[d]):groups[k].add(d)
    results[scope]={};daily_ledgers[scope]=[]
    for group,dates in groups.items():
        results[scope][group]={pol:summarize([d for d in days if d['signalDate'] in dates]) for pol,days in info['policies'].items()}
    maps={pol:{d['signalDate']:d for d in days} for pol,days in info['policies'].items()}
    for date in info['dates']:
        day={'date':date,'market':market[date],'groups':groupkeys(market[date]),
           'eligibleUniverseCount':len(eligible[date]),'eligibleATRCount':len(atr[date]),'eligibleATRMedian':med(atr[date]),
           'eligibleRealizedVolatility20Count':len(vol[date]),'eligibleRealizedVolatility20Median':med(vol[date]),'policies':{}}
        for pol,dm in maps.items():
            d=dm[date]; ps=d['picks'];oo=[p['outcome'] for p in ps if p['outcome']['strictLabelValid']]
            day['policies'][pol]={'selectionMode':d['selectionMode'],'modelActive':d['modelActive'],
              'picked':len(ps),'strictLabels':len(oo),'unknownLabels':len(ps)-len(oo),
              'touch':sum(o['touch'] for o in oo),'bull':sum(o['entryBullish'] for o in oo),
              'loss5':sum(o['net5d']<=-.05 for o in oo),'loss10':sum(o['net5d']<=-.10 for o in oo),
              'meanD5Net':mean([o['net5d'] for o in oo]),'meanTargetNetProxy':mean([o['targetNetProxy'] for o in oo]),
              'picks':[{'symbol':p['symbol'],'name':p['currentMasterName'],'integerScore':p['signals']['overall_score'],
                'strictValid':p['outcome']['strictLabelValid'],'zeroVolume':p['outcome']['zeroVolumeFlag'],
                'touch':p['outcome'].get('touch'),'D1bull':p['outcome'].get('entryBullish'),'D5net':p['outcome'].get('net5d')} for p in ps]}
        daily_ledgers[scope].append(day)

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
source_paths=[OUT/'regime-plan.txt',Path(__file__),ROOT/'raw-composite-study/inner-ledger.json',ROOT/'raw-composite-study/outer-ledger.json',ROOT/'balanced-event-study/inner-ledger.json',ROOT/'balanced-event-study/outer-ledger.json']
report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'plan':(OUT/'regime-plan.txt').read_text(),
  'sourceHashes':{str(p):sha(p) for p in source_paths},'uniformMarketInputDifferences':uniform_differences,
  'noClassifierFits':True,'noSelectionReplayOrNewVariant':True,'usesExternalValTestOutcomes':False,
  'earlierActiveModelStart':'2025-08-19','results':results,
  'caveats':['Earlier first155 rawUtility/event rows are current-overall warm seed, not active model predictions.',
    'Original TRAIN80 was already examined in earlier studies; this is descriptive, not pristine OOS.',
    'Market outcomes and policy outcomes overlap in five-session windows; dates are not independent trials.',
    'Universe uses current master/status snapshot and earlier warmup80..314 versus production320.',
    'Raw OHLC +10 exit is only a target-exit proxy; no fill or stop ordering is assumed.',
    'Fixed natural boundaries describe existing policies; no switch policy performance has been run.']}
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
(OUT/'daily-regimes-and-losses.json').write_text(json.dumps({'actualPublishedHistory':False,'TRAINonly':True,'scopes':daily_ledgers},ensure_ascii=False,indent=2,allow_nan=False)+'\n')
print('DONE',flush=True)
