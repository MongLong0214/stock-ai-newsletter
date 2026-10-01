# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3"]
# ///
import collections,json,math,pathlib,statistics
import numpy as np
def read(p):return json.loads(pathlib.Path(p).read_text())
prior=read('/tmp/composite-score-independent-prior-panels-20260930.json');ia=read('/tmp/composite-score-independent-event-input-audit-20260930.json');dates=ia['signalDates'];keys=read('/tmp/composite-score-independent-event-input-keys-20260930.json');symbols=[s for d,s in keys]
data=np.load('/tmp/composite-score-independent-event-input-20260930.npz');X,offsets=data['X'],data['offsets'];src=np.load('/tmp/composite-score-independent-balanced-source-20260930.npz');signals,turnover=src['signals'],src['turnover'];pred=np.load('/tmp/composite-score-independent-event-predictions-20260930.npz')
heads=['touch','D1bullish','loss5'];categories=ia['featureOrder'];scorekeys=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score','overall_score']
def logit(p):p=np.clip(p,1e-6,1-1e-6);return np.log(p)-np.log1p(-p)
runs={};diags=[]
for scope,dd,start,activation in [('inner',dates[:235],0,155),('outer',dates[235:],235,0)]:
 recent=[];run=[];model='first150' if scope=='inner' else 'all235'
 for jj,d in enumerate(dd):
  j=start+jj;active=jj>=activation;lo,hi=int(offsets[j]),int(offsets[j+1]);allidx=np.arange(lo,hi);excluded={s for group in recent[-20:] for s in group};pool=[i for i in allidx if symbols[i] not in excluded]
  if active:
   pp=pred[model][lo:hi] if scope=='inner' else pred[model][lo-offsets[235]:hi-offsets[235]]
   z=prior['windows'][d];rp=np.array([z['recentPriors'][h] for h in heads]);tp=np.array([prior['trainingPriors'][model][h] for h in heads]);shift=logit(rp)-logit(tp);adjusted=1/(1+np.exp(-(logit(pp)+shift)))
   before=100*(.8*pp[:,0]+.2*pp[:,1])-(100*.65)*pp[:,2];raw=100*(.8*adjusted[:,0]+.2*adjusted[:,1])-(100*.65)*adjusted[:,2];ss=np.floor(np.clip(raw,0,100)+.5).astype(int)
  else:ss=signals[lo:hi,6]
  ranked=sorted(pool,key=lambda i:(-int(ss[i-lo]),-turnover[i],symbols[i]));picked=ranked[:3] if len(ranked)>=3 else []
  day={'signalDate':d,'modelActive':active,'afterCooldownCount':len(pool),'picks':[]}
  for rank,i in enumerate(picked,1):
   t=i-lo;p={'symbol':symbols[i],'selectionRank':rank,'rowIndex':int(i),'sourceSignals':{k:int(signals[i,n]) for n,k in enumerate(scorekeys)},'signals':{**{k:int(signals[i,n]) for n,k in enumerate(scorekeys)},'overall_score':int(ss[t])},'atoms':[None if not np.isfinite(v) else float(v) for v in X[i]],'rawFactors':{k:None if not np.isfinite(v) else float(v) for k,v in zip(categories,X[i])}}
   if active:p.update({'probabilitiesRaw':dict(zip(heads,map(float,pp[t]))),'probabilities':dict(zip(heads,map(float,adjusted[t]))),'scoreRawComposite':float(raw[t]),'scoreBeforePriorShift':int(np.floor(np.clip(before[t],0,100)+.5)),'scoreRawBeforePriorShift':float(before[t])})
   else:p['scoreRawComposite']=None
   day['picks'].append(p)
  if active:
   def mass(ii):
    ix=np.array([i-lo for i in ii]);rr=raw[ix];tt=ss[ix]
    return {'candidateCount':len(ix),'scoreZeroCount':int((tt==0).sum()),'score100Count':int((tt==100).sum()),'rawScoreAtOrBelowZeroCount':int((rr<=0).sum()),'scoreMax':int(tt.max()) if len(ix) else None,'rawScoreMax':float(rr.max()) if len(ix) else None}
   rawrank=sorted(pool,key=lambda i:(-float(raw[i-lo]),-turnover[i],symbols[i]));rawtop=rawrank[:3]
   top=lambda ii:[{'symbol':symbols[i],'integerScore':int(ss[i-lo]),'rawScore':float(raw[i-lo])} for i in ii]
   diag={'modelScope':model,'signalDate':d,'eligible':mass(allidx),'afterOwnCooldown':mass(pool),'publishedTop3':top(picked),'rawTop3ObservedOnly':top(rawtop),'sameObservedExclusionsNotSeparatePolicy':True,'rawTop3HasDifferentNames':{symbols[i] for i in picked}!={symbols[i] for i in rawtop},'publishedTop3AllSameInteger':len(picked)==3 and len({int(ss[i-lo]) for i in picked})==1,'topIntegerScoreTiedCandidateCount':sum(int(ss[i-lo])==int(ss[picked[0]-lo]) for i in pool) if picked else 0}
   diags.append(diag);day['scoreMassDiagnostic']=diag;day['recentPriors']=z['recentPriors'];day['logitShift']=dict(zip(heads,map(float,shift)))
  recent.append([symbols[i] for i in picked]);run.append(day)
 runs[scope]=run
calendar=read('/tmp/stock-research-fresh-mature-20260930/features/metadata.json')['tradingDays'];ci={d:i for i,d in enumerate(calendar)};need={p['symbol'] for run in runs.values() for day in run for p in day['picks']};rawprices={}
for line in pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson').open():
 s,rows=json.loads(line)
 if s in need:rawprices[s]={r['trade_date']:tuple(r[k] for k in ['open','high','low','close','volume']) for r in rows if r['source']=='kis' and r['trade_date'] in ci}
env={'raw':rawprices,'calendar':calendar,'ci':ci,'cache':{},'finite':lambda v:isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)}
o_source=pathlib.Path('/tmp/composite-score-independent-target-utility-audit-20260930.py').read_text().split('\ndef outcome(s,d):')[1].split('\ndef close(')[0];exec('def outcome(s,d):'+o_source,env)
counts=collections.Counter()
for scope,run in runs.items():
 for day in run:
  d=day['signalDate'];counts['policyDays']+=1
  for p in day['picks']:
   s=p['symbol'];p['outcome']=env['outcome'](s,d);counts['selectedInstances']+=1;counts['zeroVolumeInstances']+=p['outcome']['zeroVolumeFlag'];counts['missingBarInstances']+=p['outcome']['missingBarFlag']
   rr=[rawprices.get(s,{}).get(date) for date in calendar[ci[d]+1:ci[d]+6]]
   p['dailyBars']=[{'session':n,'date':calendar[ci[d]+n],'source':'kis',**dict(zip(['open','high','low','close','volume'],r))} if r else {'session':n,'date':calendar[ci[d]+n],'missing':True} for n,r in enumerate(rr,1)];p['D1open']=rr[0][0] if rr and rr[0] else None
out=pathlib.Path('/tmp/composite-score-independent-prior-replay-20260930.json');j={'scope':'One fixed rolling-prior20 family independent continuous20 replay. Frozen saved-head predictions/input/source scores verified separately; no refit or threshold change. Ownraw all selected five-session outcomes and observed score-mass/tie diagnostics.','counts':dict(counts),'runs':runs,'diagnostics':diags}
out.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'report':str(out),'counts':dict(counts),'all261ObservedDiagnostics':len(diags)}),flush=True)
