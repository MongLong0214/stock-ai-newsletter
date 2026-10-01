# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3"]
# ///
import collections,json,pathlib,statistics
import numpy as np
def read(p):return json.loads(pathlib.Path(p).read_text())
B=pathlib.Path('/tmp/composite-score-research-20260930');published=read(B/'bounded-objective-study/report.json');a=read('/tmp/composite-score-independent-bounded-replay-20260930.json');b=read('/tmp/composite-score-independent-prior-replay-20260930.json');d=read('/tmp/composite-score-independent-event-input-audit-20260930.json')['signalDates'];runs={'boundedEventComposite':a['runs'],'previousPriorCorrected0.65':b['runs']};diffs=[];checks=collections.Counter()
def mean(x):return statistics.mean(x) if x else None
def close(x,y):
 if x is None or y is None:return x is y
 if isinstance(x,dict):return set(x)==set(y) and all(close(x[k],y[k]) for k in x)
 if isinstance(x,list):return len(x)==len(y) and all(close(a,b) for a,b in zip(x,y))
 return abs(x-y)<1e-12
splits={'inner80':d[155:235],'originalTrainDiagnostic':d[235:315],'validationReused':d[320:350],'testReused':d[355:415],'allOriginal180':d[235:415],'partialFreshSpotcheck':d[415:]}
heads={'touch':lambda o:float(o['touch']),'D1bullish':lambda o:float(o['entryBullish']),'loss5':lambda o:float(o['net5d']<=-.05)}
for split,ds in splits.items():
 for name,rr in runs.items():
  pp=[p for day in rr['inner' if split=='inner80' else 'outer'] if day['signalDate'] in ds for p in day['picks'] if p['outcome']['strictLabelValid']]
  for head,label in heads.items():
   bins=[]
   for j in range(10):
    subset=[p for p in pp if j/10<=p['probabilities'][head]<(j+1)/10 or j==9 and p['probabilities'][head]==1]
    bins.append({'from':j/10,'through':(j+1)/10,'points':len(subset),'meanPredicted':mean([p['probabilities'][head] for p in subset]),'empiricalRate':mean([label(p['outcome']) for p in subset])})
   own={'points':len(pp),'meanPredicted':mean([p['probabilities'][head] for p in pp]),'empiricalRate':mean([label(p['outcome']) for p in pp]),'brier':mean([(p['probabilities'][head]-label(p['outcome']))**2 for p in pp]),'fixedDeciles':bins}
   if not close(own,published['probabilityCalibration'][split][name][head]):diffs.append(['headCalibration',split,name,head])
   checks['headCalibrationGroups']+=1;checks['probabilityBins']+=10
for split in ['testReused','allOriginal180']:
 ds=splits[split];n=len(ds);rng=np.random.default_rng(42);starts=rng.integers(0,n,(1000,int(np.ceil(n/10))));indices=((starts[:,:,None]+np.arange(10))%n).reshape(1000,-1)[:,:n]
 for name,rr in runs.items():
  days={day['signalDate']:day for day in rr['outer']};daily=[]
  for date in ds:
   oo=[p['outcome'] for p in days[date]['picks'] if p['outcome']['strictLabelValid']]
   daily.append([len(oo),sum(o['touch'] for o in oo),sum(o['net5d']<=-.05 for o in oo),sum(o['net5d']<0 for o in oo),sum(o['net5d'] for o in oo)])
  totals=np.array(daily)[indices].sum(axis=1);values=totals[:,1:]/totals[:,:1]
  own={'blockDays':10,'draws':1000,'seed':42,'circularMovingBlock':True,'descriptiveOnly':True,'intervals95':{metric:np.quantile(values[:,i],[.025,.975]).tolist() for i,metric in enumerate(['touchRate','loss5Rate','anyNegativeD5NetRate','meanD5Net'])}}
  if not close(own,published['descriptiveBlockBootstrap'][split][name]):diffs.append(['descriptiveBootstrap',split,name])
  checks['bootstrapPolicyScopes']+=1;checks['bootstrapIntervals']+=4
out=pathlib.Path('/tmp/composite-score-independent-bounded-diagnostics-audit-20260930.json');out.write_text(json.dumps({'scope':'Independent selected head reliability/deciles and fixed descriptive10-day circular1000-draw seed42 uncertainty; own raw outcomes/frozen selections only, no refit/reselection/new variant. Does not remove reused-period/search bias.','counts':dict(checks),'differences':diffs},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'report':str(out),'counts':dict(checks),'differences':diffs}),flush=True)
if diffs:raise SystemExit(1)
