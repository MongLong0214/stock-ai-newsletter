# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import collections,datetime,hashlib,json,math,pathlib
import joblib,numpy as np
def read(p):return json.loads(pathlib.Path(p).read_text())
prior=read('/tmp/composite-score-independent-prior-panels-20260930.json')
ia=read('/tmp/composite-score-independent-monthly-input-audit-20260930.json')
original=read('/tmp/composite-score-independent-event-input-audit-20260930.json')
dates=ia['signalDates'];dateindex={d:i for i,d in enumerate(dates)}
keys=read('/tmp/composite-score-independent-monthly-input-keys-20260930.json');symbols=[s for d,s in keys]
oldkeys=read('/tmp/composite-score-independent-event-input-keys-20260930.json');oldindex={tuple(k):i for i,k in enumerate(oldkeys)}
data=np.load('/tmp/composite-score-independent-monthly-input-20260930.npz');X,offsets=data['X'],data['offsets']
src=np.load('/tmp/composite-score-independent-balanced-source-20260930.npz')
sourceindex=np.array([oldindex.get(tuple(k),-1) for k in keys]);heads=['touch','D1bullish','loss5']
scorekeys=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score','overall_score']
def logit(p):p=np.clip(p,1e-6,1-1e-6);return np.log(p)-np.log1p(-p)
MODEL=pathlib.Path('/tmp/composite-score-independent-monthly-models-20260930')
calendar=read('/tmp/stock-research-fresh-mature-20260930/features/metadata.json')['tradingDays'];ci={d:i for i,d in enumerate(calendar)}
runs={};diags=[];dailypriors=[];predcache={};count=collections.Counter()
for scope,dd,activation in [('inner',original['signalDates'][:235],155),('outer',original['signalDates'][235:],0)]:
 recent=[];run=[];bundle=None;meta=None
 for jj,d in enumerate(dd):
  active=jj>=activation;j=dateindex[d];lo,hi=map(int,offsets[j:j+2]);allidx=np.arange(lo,hi);assert (sourceindex[lo:hi]>=0).all()
  signals=src['signals'][sourceindex[lo:hi]];turnover=src['turnover'][sourceindex[lo:hi]]
  excluded={s for group in recent[-20:] for s in group};pool=[i for i in allidx if symbols[i] not in excluded]
  if active:
   if meta is None or meta['activation'][:7]!=d[:7]:
    bundleid=scope+'-'+d;bundle=joblib.load(MODEL/(bundleid+'.joblib'));meta=bundle['meta'];assert meta['activation']==d and meta['scope']==scope
   pp=np.column_stack([bundle['heads'][h].predict_proba(X[lo:hi])[:,1] for h in heads]);z=prior['windows'][d]
   tp=np.array([meta['headMetadata'][h]['dateBalancedPrior'] for h in heads]);rp=np.array([z['recentPriors'][h] for h in heads]);shift=logit(rp)-logit(tp)
   adjusted=1/(1+np.exp(-(logit(pp)+shift)));raw=100*((.8*adjusted[:,0]+.2*adjusted[:,1])+.65*(1-adjusted[:,2]))/(1+.65)
   assert np.isfinite(raw).all() and (raw>=0).all() and (raw<=100).all();ss=np.floor(raw+.5).astype(int)
   pri={'signalDate':d,'scope':scope,'bundleId':bundleid,'activationClosedAsOf':meta['activation'],'modelAgeCalendarDays':(datetime.date.fromisoformat(d)-datetime.date.fromisoformat(meta['activation'])).days,'modelAgeTradingSignalDays':ci[d]-ci[meta['activation']],'latestTrainingLabelMaturity':meta['lastLabelMaturity'],'bundleTrainPrior':dict(zip(heads,map(float,tp))),'recent20Prior':z['recentPriors'],'logitShift':dict(zip(heads,map(float,shift)))}
   dailypriors.append(pri);predcache[scope+'|'+d]=np.column_stack([pp,adjusted,raw,ss]);count['predictedCandidateRows']+=len(pp)
  else:ss=signals[:,6]
  ranked=sorted(pool,key=lambda i:(-int(ss[i-lo]),-turnover[i-lo],symbols[i]));picked=ranked[:3] if len(ranked)>=3 else []
  day={'signalDate':d,'recommendationDateExpected':calendar[ci[d]+1],'expectedD5date':calendar[ci[d]+5],'modelActive':active,'modelBundleId':bundleid if active else None,'afterCooldownCount':len(pool),'runtimeEligibleCount':len(allidx),'picks':[]}
  for rank,i in enumerate(picked,1):
   t=i-lo;signalrow={k:int(signals[t,n]) for n,k in enumerate(scorekeys)}
   p={'symbol':symbols[i],'selectionRank':rank,'rowIndex':int(i),'sourceSignals':signalrow,'signals':{**signalrow,'overall_score':int(ss[t])},'atoms':[None if not np.isfinite(v) else float(v) for v in X[i]],'rawFactors':{k:None if not np.isfinite(v) else float(v) for k,v in zip(ia['featureOrder'],X[i])},'scoreRawComposite':float(raw[t]) if active else None}
   if active:p.update({'bundleId':bundleid,'probabilitiesRaw':dict(zip(heads,map(float,pp[t]))),'probabilities':dict(zip(heads,map(float,adjusted[t])))})
   day['picks'].append(p)
  if active:
   def mass(ii):
    ix=np.array([i-lo for i in ii]);rr=raw[ix];tt=ss[ix]
    return {'candidateCount':len(ix),'scoreZeroCount':int((tt==0).sum()),'score100Count':int((tt==100).sum()),'rawScoreAtOrBelowZeroCount':int((rr<=0).sum()),'scoreMax':int(tt.max()) if len(ix) else None,'rawScoreMax':float(rr.max()) if len(ix) else None}
   rawrank=sorted(pool,key=lambda i:(-float(raw[i-lo]),-turnover[i-lo],symbols[i]));rawtop=rawrank[:3]
   top=lambda ii:[{'symbol':symbols[i],'integerScore':int(ss[i-lo]),'rawScore':float(raw[i-lo])} for i in ii]
   diag={'scope':scope,'signalDate':d,'modelBundleId':bundleid,'eligible':mass(allidx),'afterOwnCooldown':mass(pool),'publishedTop3':top(picked),'rawTop3ObservedOnly':top(rawtop),'sameObservedExclusionsNotSeparatePolicy':True,'rawTop3HasDifferentNames':{symbols[i] for i in picked}!={symbols[i] for i in rawtop},'publishedTop3AllSameInteger':len(picked)==3 and len({int(ss[i-lo]) for i in picked})==1,'topIntegerScoreTiedCandidateCount':sum(int(ss[i-lo])==int(ss[picked[0]-lo]) for i in pool) if picked else 0}
   diags.append(diag);day['scoreMassDiagnostic']=diag;day['priorShift']=pri
  recent.append([symbols[i] for i in picked]);run.append(day)
 runs[scope]=run
np.savez_compressed('/tmp/composite-score-independent-monthly-predictions-20260930.npz',**predcache)
need={p['symbol'] for run in runs.values() for day in run for p in day['picks']};rawprices={}
for line in pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson').open():
 s,rows=json.loads(line)
 if s in need:rawprices[s]={r['trade_date']:tuple(r[k] for k in ['open','high','low','close','volume']) for r in rows if r['source']=='kis' and r['trade_date'] in ci}
env={'raw':rawprices,'calendar':calendar,'ci':ci,'cache':{},'finite':lambda v:isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)}
o_source=pathlib.Path('/tmp/composite-score-independent-target-utility-audit-20260930.py').read_text().split('\ndef outcome(s,d):')[1].split('\ndef close(')[0];exec('def outcome(s,d):'+o_source,env)
for scope,run in runs.items():
 for day in run:
  d=day['signalDate'];count['policyDays']+=1
  for p in day['picks']:
   s=p['symbol'];p['outcome']=env['outcome'](s,d);count['selectedInstances']+=1;count['zeroVolumeInstances']+=p['outcome']['zeroVolumeFlag'];count['missingBarInstances']+=p['outcome']['missingBarFlag']
   rr=[rawprices.get(s,{}).get(date) for date in calendar[ci[d]+1:ci[d]+6]]
   p['dailyBars']=[{'session':n,'date':calendar[ci[d]+n],'source':'kis',**dict(zip(['open','high','low','close','volume'],r))} if r else {'session':n,'date':calendar[ci[d]+n],'missing':True} for n,r in enumerate(rr,1)];p['D1open']=rr[0][0] if rr and rr[0] else None
out=pathlib.Path('/tmp/composite-score-independent-monthly-replay-20260930.json')
j={'scope':'Independent replay of the ONE frozen monthly150 family with independently refitted all15 bundles, exact18 observed native-NaN inputs, date-balanced training labels and each fresh training prior. Same canonical recent20 prior and fixed .65 bounded integer score. Own continuous20 state, integer/turnover/ASCII authoritative. All selected raw fivebar outcomes; no unknown-outcome selection filter. Reused causal adaptive prequential research, no production writes or new families.','counts':dict(count),'runs':runs,'diagnostics':diags,'dailyBundlePriors':dailypriors}
out.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'report':str(out),'counts':dict(count),'activeDays':len(diags)}),flush=True)
