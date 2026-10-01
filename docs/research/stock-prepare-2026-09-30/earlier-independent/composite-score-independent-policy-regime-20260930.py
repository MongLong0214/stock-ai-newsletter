import collections, hashlib, json, math, pathlib, statistics
B=pathlib.Path('/tmp/composite-score-research-20260930'); O=B/'regime-train-study'
def read(p): return json.loads(pathlib.Path(p).read_text())
report=read(O/'report.json'); daily=read(O/'daily-regimes-and-losses.json')['scopes']
ownflags=read('/tmp/composite-score-independent-train-regime-20260930.json')['dateFlags']
inputs=read('/tmp/composite-score-independent-event-input-audit-20260930.json')
original=inputs['signalDates'][235:315]
dates=set(ownflags)|set(original); macro={}; volatility=collections.defaultdict(list); eligible={}; dif=collections.Counter(); examples={}
def error(k,v):
 dif[k]+=1
 if len(examples.setdefault(k,[]))<8: examples[k].append(v)
for path in [B/'earlier-training/earlier-runtime-eligibility.ndjson',B/'horizon-runtime-eligibility.ndjson']:
 for line in path.open():
  x=json.loads(line)
  if x['date'] in dates:eligible[x['date']]=set(x['runtimeEligibleSymbols'])
for path in [B/'earlier-training/earlier-context.ndjson',B/'technical-context.ndjson']:
 for line in path.open():
  x=json.loads(line); d=x['date']
  if d not in dates:continue
  c=x['context']; m={k:c[k] for k in ['benchmarkReturn20Percent','benchmarkSma20DistancePercent','breadthAboveSma20']}
  if not all(isinstance(v,(int,float)) and math.isfinite(v) for v in m.values()):error('nonfiniteMacro',[d,x['symbol']])
  if d in macro and macro[d]!=m:error('nonuniformMacro',[d,x['symbol']])
  macro[d]=m
  if x['symbol'] in eligible[d] and isinstance(c.get('realizedVolatility20Percent'),(int,float)) and math.isfinite(c['realizedVolatility20Percent']):volatility[d].append(c['realizedVolatility20Percent'])
assert len(macro)==len(dates)==315
for d,f in ownflags.items():
 m=macro[d]
 if m['benchmarkReturn20Percent']!=f['kospiReturn20Percent'] or m['benchmarkSma20DistancePercent']!=f['kospiSma20DistancePercent'] or abs(m['breadthAboveSma20']-f['breadthAboveSma20Ratio'])>1e-15:error('independentMacroBinding',d)
def group(m):
 r,s,b=m['benchmarkReturn20Percent']<0,m['benchmarkSma20DistancePercent']<0,m['breadthAboveSma20']<.5
 return ['all','return20Negative' if r else 'return20Nonnegative','sma20Below' if s else 'sma20AtOrAbove','breadthBelowHalf' if b else 'breadthAtOrAboveHalf','anyWeak' if r or s or b else 'allThreeHealthy',f'joint_returnNeg{int(r)}_smaBelow{int(s)}_breadthBelow{int(b)}']
def policies(path):return {x['name']:x['days'] for x in read(path)['policies']}
ir=policies(B/'raw-composite-study/inner-ledger.json'); ib=policies(B/'balanced-event-study/inner-ledger.json'); o=policies(B/'raw-composite-study/outer-ledger.json'); ob=policies(B/'balanced-event-study/outer-ledger.json')
base={'currentOverall':ir['currentOverall'],'ATRbaseline':ir['ATRbaseline'],'rawUtility':ir['rawComposite'],'balancedEvent0.65':ib['lambda0.65']}
scopes={'earlier235WithWarmSeed':base,'earlierSeed155':{k:v[:155] for k,v in base.items()},'earlierActiveInner80':{k:v[155:] for k,v in base.items()},'originalTrain80Reused':{'currentOverall':o['currentOverall'][:80],'ATRbaseline':o['ATRbaseline'][:80],'rawUtility':o['rawComposite'][:80],'balancedEvent0.65':ob['balancedEventComposite'][:80]}}
checks=collections.Counter(); validated={}
def mean(v):return statistics.fmean(v) if v else None
def approx(a,b):return a is b if a is None or b is None else abs(a-b)<1e-12
for scope,pols in scopes.items():
 daydates={d['signalDate'] for d in next(iter(pols.values()))}; groups=collections.defaultdict(set)
 for d in daydates:
  for g in group(macro[d]):groups[g].add(d)
 if set(groups)!=set(report['results'][scope]):error('groupNames',scope)
 validated[scope]={}
 for g,gd in groups.items():
  validated[scope][g]={}
  for pol,days in pols.items():
   ds=[d for d in days if d['signalDate'] in gd]; ps=[p for d in ds for p in d['picks']]; oo=[p['outcome'] for p in ps if p['outcome']['strictLabelValid']]; scores=[p['signals']['overall_score'] for p in ps]
   expected={'days':len(ds),'full3Days':sum(len(d['picks'])==3 for d in ds),'selectedSlots':len(ps),'strictLabels':len(oo),'unknownStrictLabels':len(ps)-len(oo),'modelActiveDays':sum(d['modelActive'] for d in ds)}
   strict={'touchCount':sum(o['touch'] for o in oo),'bullRate':mean([o['entryBullish'] for o in oo]),'touchRate':mean([o['touch'] for o in oo]),'loss5Count':sum(o['net5d']<=-.05 for o in oo),'loss5Rate':mean([o['net5d']<=-.05 for o in oo]),'loss10Rate':mean([o['net5d']<=-.10 for o in oo]),'meanD5Net':mean([o['net5d'] for o in oo]),'medianD5Net':statistics.median([o['net5d'] for o in oo]) if oo else None,'meanMAE':mean([o['mae'] for o in oo]),'worstD5Net':min([o['net5d'] for o in oo],default=None),'meanTargetNetProxy':mean([o['targetNetProxy'] for o in oo]),'meanUtility':mean([o['utility'] for o in oo])}
   equal={k:mean([mean([float(p['outcome'][k]) for p in d['picks'] if p['outcome']['strictLabelValid']]) for d in ds if any(p['outcome']['strictLabelValid'] for p in d['picks'])]) for k in ['touch','entryBullish','net5d','targetNetProxy','utility','mae']}
   for label,cut in [('loss5',-.05),('loss10',-.10)]:equal[label]=mean([mean([p['outcome']['net5d']<=cut for p in d['picks'] if p['outcome']['strictLabelValid']]) for d in ds if any(p['outcome']['strictLabelValid'] for p in d['picks'])])
   got=report['results'][scope][g][pol]
   for k,v in expected.items():
    if got[k]!=v:error('counts',[scope,g,pol,k,v,got[k]])
   for part,vals in [('strict',strict),('equalDate',equal),('scores',{'min':min(scores,default=None),'max':max(scores,default=None),'mean':mean(scores),'atLeast70Picks':sum(s>=70 for s in scores)})]:
    for k,v in vals.items():
     if not approx(v,got[part][k]):error('aggregate',[scope,g,pol,part,k,v,got[part][k]])
   checks['policyGroupAggregates']+=1;validated[scope][g][pol]=expected|{'strict':strict}
 for day in daily[scope]:
  d=day['date'];checks['dailyRegimes']+=1
  if day['market']!=macro[d] or day['groups']!=group(macro[d]) or day['eligibleUniverseCount']!=len(eligible[d]):error('dailyContext',[scope,d])
  vv=volatility[d]
  if day['eligibleRealizedVolatility20Count']!=len(vv) or not approx(day['eligibleRealizedVolatility20Median'],statistics.median(vv)):error('universeVolatility',[scope,d])
  for pol,days in pols.items():
   src=next(x for x in days if x['signalDate']==d);got=day['policies'][pol]
   expectedActive=pol in ['rawUtility','balancedEvent0.65'] and (scope=='originalTrain80Reused' or inputs['signalDates'].index(d)>=155)
   if src['modelActive']!=expectedActive or got['modelActive']!=expectedActive:error('warmSeedMislabel',[scope,d,pol])
   exp=[(p['symbol'],p['signals']['overall_score'],p['outcome']['strictLabelValid']) for p in src['picks']]
   obs=[(p['symbol'],p['integerScore'],p['strictValid']) for p in got['picks']]
   if exp!=obs:error('selectedBinding',[scope,d,pol])
   checks['dailyPolicyBindings']+=1
out=pathlib.Path('/tmp/composite-score-independent-policy-regime-20260930.json')
j={'scope':'Independent TRAIN-only grouping audit. Original selected outcomes/ranking already raw-OHLC audited; this checks all315 actual observed market contexts, all groups/aggregates and warm-seed separation without new score, model, selection or external-regime policy.','counts':dict(checks),'differences':dict(dif),'examples':examples,'sourceReportSha256':hashlib.file_digest((O/'report.json').open('rb'),'sha256').hexdigest(),'validated':validated,'limitations':['Natural market-condition directions change across earlier inner80 and originalTRAIN80; descriptive reuse does not justify a switch policy.','Loss5 denotes D5cost-inclusive return<=-5%, not every negative investment return.','No VAL/TEST outcomes regrouped or used to choose defensive threshold.']}
out.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'report':str(out),'counts':dict(checks),'differences':dict(dif)}),flush=True)
if dif:raise SystemExit(1)
