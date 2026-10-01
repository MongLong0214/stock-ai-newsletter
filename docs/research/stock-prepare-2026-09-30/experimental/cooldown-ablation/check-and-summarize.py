# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3"]
# ///
"""Independent pure-Python raw-price oracle, own-state checks and paired CD effects."""
import collections,datetime,hashlib,json,math,pathlib,statistics
import numpy as np
D=pathlib.Path('/tmp/composite-score-experimental-20260930/cooldown-ablation')
R=pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson')
def sha(p):
 with pathlib.Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
fm=json.loads(pathlib.Path('/tmp/stock-research-fresh-mature-20260930/features/metadata.json').read_text());days=fm['tradingDays'];ci={d:i for i,d in enumerate(days)}
ledgers={t:json.loads((D/(t+'-ledger.json')).read_text()) for t in ['L0','L5']}
reports={t:json.loads((D/(t+'-report.json')).read_text()) for t in ['L0','L5']}
wanted=collections.defaultdict(set);instances=[];cooldown=[]
for tag,l in ledgers.items():
 for run in l['policies']:
  last={}
  for index,d in enumerate(run['days']):
   assert len(d['picks'])==3 and len({p['symbol'] for p in d['picks']})==3
   for p in d['picks']:
    s=p['symbol'];key=(s,d['signalDate']);wanted[s].add(d['signalDate']);instances.append((tag,run['name'],run['scope'],d['signalDate'],p))
    if s in last and index-last[s]<=run['cooldown']:cooldown.append([tag,run['name'],d['signalDate'],s])
    last[s]=index
raw={}
for line in R.open():
 s,rr=json.loads(line)
 if s in wanted:raw[s]={r['trade_date']:tuple(r[k] for k in ['open','high','low','close','volume']) for r in rr if r['source']=='kis' and r['trade_date'] in ci}
finite=lambda v:isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def oracle(s,d):
 i=ci[d];rr=[raw.get(s,{}).get(x) for x in days[i+1:i+6]]
 complete=len(rr)==5 and all(r is not None for r in rr)
 valid=complete and all(all(finite(v) and v>0 for v in r[:4]) and r[1]>=max(r[0],r[2],r[3]) and r[2]<=min(r[0],r[1],r[3]) for r in rr)
 pos=complete and all(finite(r[4]) and r[4]>0 for r in rr)
 zero=any(r is not None and (not finite(r[4]) or r[4]<=0) for r in rr)
 bull=rr[0][3]>rr[0][0] if rr and rr[0] is not None and finite(rr[0][0]) and rr[0][0]>0 else None
 o={'rawMarkValid':bool(valid),'strictLabelValid':bool(valid and pos),'zeroVolumeFlag':bool(zero),'missingBarFlag':not complete,'entryBullish':bull}
 if valid:
  entry=rr[0][0];gross=rr[-1][3]/entry-1;net=gross-.003;touch=max(r[1] for r in rr)>=entry*110/100;proxy=(.10 if touch else gross)-.003;util=proxy+.025*int(bull)-max(0,-proxy)
  o.update({'entry':entry,'gross5d':gross,'net5d':net,'touch':bool(touch),'mae':min(0,min(r[2] for r in rr)/entry-1),'maxGainPercent':(max(r[1] for r in rr)/entry-1)*100,'targetNetProxy':proxy,'rawTargetUtilityProxy':util,'utility':util if valid and pos else None,'targetFirstTouchSession':next((j for j,r in enumerate(rr,1) if r[1]>=entry*110/100),None),'touchAndPositiveD5Net':bool(touch and net>0)})
 else:o['utility']=None
 return o
checks={};diff=[];barsdiff=[]
for tag,name,scope,d,p in instances:
 key=(p['symbol'],d)
 if key not in checks:checks[key]=oracle(*key)
 if p['outcome']!=checks[key]:diff.append([tag,name,scope,d,p['symbol']])
 i=ci[d]
 for j,b in enumerate(p['dailyBars'],1):
  r=raw.get(p['symbol'],{}).get(days[i+j]);expected={'date':days[i+j],'session':j,'source':'kis',**dict(zip(['open','high','low','close','volume'],r))} if r is not None else {'date':days[i+j],'session':j,'missing':True}
  if b!=expected:barsdiff.append([tag,name,scope,d,p['symbol'],j])
assert not cooldown and not diff and not barsdiff,(cooldown,diff,barsdiff)
# All holdings below are hypothetical D1..D5 overlap, not observed trades or estimated correlation.
def exposure(run,selected):
 active=collections.Counter();positions=[]
 for d in run['days']:
  for p in d['picks']:
   entry=ci[p['recommendationDate']];positions.append((p['symbol'],entry,entry+4))
   for j in range(entry,entry+5):active[j]+=1
 selected_i=[ci[d['picks'][0]['recommendationDate']] for d in selected]
 n=[active[i] for i in selected_i]
 return {'plannedConcurrent5SessionPositionsAtEntryMean':statistics.mean(n),'plannedConcurrent5SessionPositionsAtEntryMax':max(n),'meanConcurrentPositionPairsAtEntry':statistics.mean(x*(x-1)/2 for x in n),'meaning':'Daily recommended positions share market sessions, so return observations depend on common market shocks; no actual trade/fill or measured return-correlation assertion'}
def arr(dd):
 result=[]
 for d in dd:
  oo=[p['outcome'] for p in d['picks'] if p['outcome']['strictLabelValid']]
  result.append([len(oo)]+[sum(f(o) for o in oo) for f in [lambda o:o['touch'],lambda o:o['net5d']<0,lambda o:o['net5d']<=-.05,lambda o:o['entryBullish'],lambda o:o['net5d'],lambda o:o['targetNetProxy']]])
 return np.array(result,dtype=np.float64)
paired={};exposures={};metricnames=['touchRate','L0Rate','L5Rate','D1bullishRate','meanNet5d','meanTargetNetProxy']
for tag,l in ledgers.items():
 for split,v in reports[tag]['results'].items():
  scope='TRAIN35' if split=='TRAIN35' else 'inner80' if split=='inner80' else 'outer180'
  runmap={p['name']:p for p in l['policies'] if p['scope']==scope}
  full=next(iter(runmap.values()))['days'];dates=[d['signalDate'] for d in full]
  if split=='TRAIN35':idx=list(range(110,130))+list(range(135,150))
  elif split=='inner80':idx=list(range(155,235))
  elif split=='originalTrainReused':idx=list(range(80))
  elif split=='validationReused':idx=list(range(85,115))
  elif split=='test60Reused':idx=list(range(120,180))
  elif split=='allOriginal180':idx=list(range(180))
  else:idx=[180]
  for name,m in v.items():
   selected=[runmap[name]['days'][i] for i in idx];exposures[tag+'-'+split+'-'+name]=exposure(runmap[name],selected)
  for family in ['A','B','currentOverall']:
   k=tag+'-'+family;a=[runmap[k+'-CD5']['days'][i] for i in idx];b=[runmap[k+'-CD20']['days'][i] for i in idx]
   assert [d['signalDate'] for d in a]==[d['signalDate'] for d in b]
   aa,bb=arr(a),arr(b);n=len(a);rng=np.random.default_rng(42);values=[]
   for _ in range(1000):
    starts=rng.integers(0,n,size=math.ceil(n/10));ix=np.concatenate([(s+np.arange(10))%n for s in starts])[:n];am,bm=aa[ix].sum(axis=0),bb[ix].sum(axis=0)
    if am[0]>0 and bm[0]>0:values.append(am[1:]/am[0]-bm[1:]/bm[0])
   qq=np.quantile(np.array(values),[.025,.975],axis=0)
   paired[tag+'-'+split+'-'+family]={'CD5minusCD20':{q:m1-m2 for q,m1,m2 in zip(metricnames,[v[k+'-CD5'].get(q) for q in metricnames],[v[k+'-CD20'].get(q) for q in metricnames])},'descriptivePairedBlock95':{q:[float(qq[0,j]),float(qq[1,j])] for j,q in enumerate(metricnames)},'replicates':1000,'seed':42,'blockLength':10}
report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'selectedInstancesChecked':len(instances),'uniqueSymbolSignalRawOutcomesChecked':len(checks),'raw5PriceFieldComparisons':len(instances)*25,'rawOutcomeDifferences':diff,'rawDailyBarDifferences':barsdiff,'cooldownOwnStateViolations':cooldown,'sourceHashes':{str(p):sha(p) for p in [pathlib.Path(__file__),D/'replay.py',D/'protocol.json',R,*[D/(t+s) for t in ['L0','L5'] for s in ['-ledger.json','-report.json']]]},'plannedPositionDependence':exposures,'pairedCooldownEffects':paired,'interpretation':'CD5-only diagnostic with same already frozen CD20 TRAIN-selected configuration; original180 reused, no outer tuning and no clean OOS claim; repeated entries and common session risk accounted descriptively, not measured correlation; no fits or product changes'}
p=D/'independent-raw-and-paired-effects.json';assert not p.exists();p.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
print(json.dumps({'selectedInstancesChecked':len(instances),'uniqueRawOutcomes':len(checks),'raw5PriceFieldComparisons':len(instances)*25,'rawOutcomeDifferences':len(diff),'rawDailyBarDifferences':len(barsdiff),'cooldownViolations':len(cooldown),'output':str(p)}),flush=True)
