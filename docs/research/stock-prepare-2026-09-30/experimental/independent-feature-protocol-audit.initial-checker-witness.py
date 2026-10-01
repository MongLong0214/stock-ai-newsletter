# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3"]
# ///
import collections,hashlib,importlib.util,itertools,json,math,pathlib,statistics
import numpy as np
B=pathlib.Path('/tmp/composite-score-experimental-20260930');sp=importlib.util.spec_from_file_location('owner_features',B/'extra_features.py');m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
def read(p):return json.loads(pathlib.Path(p).read_text())
def sha(p):return hashlib.file_digest(pathlib.Path(p).open('rb'),'sha256').hexdigest()
errors=collections.defaultdict(list);counts=collections.Counter()
def error(k,v):
 counts['difference:'+k]+=1
 if len(errors[k])<8:errors[k].append(v)
def same(a,b):
 if a is None or b is None:return a is b
 return math.isclose(a,b,rel_tol=2e-11,abs_tol=2e-11)
def valid(r):
 if not r:return None
 o,h,l,c=[r[k] for k in ['open','high','low','close']]
 if not all(isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x) and x>0 for x in [o,h,l,c]) or not (l<=min(o,c)<=max(o,c)<=h):return None
 v=r.get('volume');v=v if isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) and v>=0 else None
 return o,h,l,c,v
def independent32(calendar,rr,t):
 bb=[valid(rr.get(d)) for d in calendar[max(0,t-319):t+1]];end=len(bb)-1
 def window(n,e=end):
  if e-n+1<0 or e<0:return None
  a=bb[e-n+1:e+1];return a if len(a)==n and all(b is not None for b in a) else None
 def avg(xs):return sum(xs)/len(xs) if xs is not None and all(x is not None for x in xs) else None
 def ratio(a,b):return a/b if a is not None and b is not None and b>0 else None
 def vals(n,fn,e=end):
  w=window(n,e);return [fn(b) for b in w] if w is not None else None
 def ret(n,e=end):
  w=window(n+1,e);return (w[-1][3]/w[0][3]-1)*100 if w else None
 c=bb[-1][3] if bb[-1] else None;out={f'return{n}Percent':ret(n) for n in [1,2,3,10,40,120]}
 ma5=avg(vals(5,lambda b:b[3]));ma20=avg(vals(20,lambda b:b[3]));out['closeSma5DistancePercent']=(c/ma5-1)*100 if c is not None and ma5 is not None else None;out['sma5ToSma20Ratio']=ratio(ma5,ma20);out['return20ExcludingRecent5Percent']=ret(15,end-5)
 for n in [5,10,60,120]:
  w=window(n,end-1);h=max(b[1] for b in w) if w else None;out[f'distanceFromPriorHigh{n}Percent']=(c/h-1)*100 if c is not None and h is not None else None
 suffix=[]
 for b in reversed(bb):
  if b is None:break
  suffix.append(b)
 suffix.reverse();tr=[b[1]-b[2] if i==0 else max(b[1]-b[2],abs(b[1]-suffix[i-1][3]),abs(b[2]-suffix[i-1][3])) for i,b in enumerate(suffix)]
 atr={}
 for n in [5,20]:
  a=sum(tr[:n])/n if len(tr)>=n else None
  for x in tr[n:]:a=(a*(n-1)+x)/n
  atr[n]=a
 out['atr5ToAtr20Ratio']=ratio(atr[5],atr[20]);w=window(21);returns=[math.log(b[3]/a[3]) for a,b in zip(w,w[1:])] if w else None
 out['returnVolatility5To20Ratio']=ratio(statistics.stdev(returns[-5:]) if returns else None,statistics.stdev(returns) if returns else None)
 out['normalizedRange5To20Ratio']=ratio(avg(vals(5,lambda b:(b[1]-b[2])/b[3])),avg(vals(20,lambda b:(b[1]-b[2])/b[3])))
 w=window(22);ttr=[max(b[1]-b[2],abs(b[1]-a[3]),abs(b[2]-a[3])) for a,b in zip(w,w[1:])] if w else None;out['todayTrToPrior20MeanRatio']=ratio(ttr[-1],avg(ttr[:-1])) if ttr else None
 out['volumeMean3ToPrevious20Ratio']=ratio(avg(vals(3,lambda b:b[4])),avg(vals(20,lambda b:b[4],end-3)));out['volumeMean5ToPrevious20Ratio']=ratio(avg(vals(5,lambda b:b[4])),avg(vals(20,lambda b:b[4],end-5)));out['todayVolumeToPrior5MeanRatio']=ratio(bb[-1][4] if bb[-1] else None,avg(vals(5,lambda b:b[4],end-1)))
 w=window(5);vv=[b[4] for b in w] if w else None;out['bullishVolumeShare5']=ratio(sum(b[4]*(b[3]>b[0]) for b in w),sum(vv)) if vv and all(v is not None for v in vv) else None
 w=window(11);vv=[b[4] for b in w[1:]] if w else None;out['upCloseVolumeShare10']=ratio(sum(b[4]*(b[3]>a[3]) for a,b in zip(w,w[1:])),sum(vv)) if vv and all(v is not None for v in vv) else None
 turnover=lambda b:b[3]*b[4] if b[4] is not None else None;out['todayTurnoverToPrior20MeanRatio']=ratio(turnover(bb[-1]) if bb[-1] else None,avg(vals(20,turnover,end-1)));av=avg(vals(20,turnover));out['logAverageTurnover20']=math.log(av) if av is not None and av>0 else None
 for n in [3,5]:
  out[f'clvMean{n}']=avg(vals(n,lambda b:(2*b[3]-b[2]-b[1])/(b[1]-b[2]) if b[1]>b[2] else None));out[f'candleBodyMean{n}Percent']=avg(vals(n,lambda b:(b[3]/b[0]-1)*100))
 out['upperWickMean5']=avg(vals(5,lambda b:(b[1]-max(b[0],b[3]))/(b[1]-b[2]) if b[1]>b[2] else None));w=window(6);out['positiveCloseDays5']=sum(b[3]>a[3] for a,b in zip(w,w[1:])) if w else None
 w=window(20,end-1);out['priorHigh20AgeSessions']=20-max(i for i,b in enumerate(w) if b[1]==max(z[1] for z in w)) if w else None;w=window(60,end-1);out['drawdownFromPrior60ClosePeakPercent']=min(0,(c/max(b[3] for b in w)-1)*100) if c is not None and w else None
 return [out[n] for n in m.EXTRA_FEATURE_NAMES]
expected_hashes={'kis-protocol.json':'30c5978c644ce0b8afce2331c3dbcf34754ff077b192cd76ec771eee20864c5c','naver-protocol.json':'377ed12d88de69989043bd7ef21b4b057a44c2fbab90ba19f4f679189e69033c','extra_features.py':'b35b34b70b3420e5756b4d14883d385e61bb8bf1c1127eb53c71a75ca358786b','extra-features.ndjson':'5c953745cef23f54ac619d2b80ce12b559436fce7f7e43ac30550f4c8f7579a2'}
for n,h in expected_hashes.items():
 if sha(B/n)!=h:error('sourceHash',n)
manifest=read(B/'manifest.json');spec=read(B/'featurespec.json');assert spec['featureNames']==m.ORIGINAL_FEATURE_NAMES+m.EXTRA_FEATURE_NAMES
original=read('/tmp/composite-score-independent-monthly-input-audit-20260930.json');keys=read('/tmp/composite-score-independent-monthly-input-keys-20260930.json');index={tuple(k):i for i,k in enumerate(keys)};X=np.load('/tmp/composite-score-independent-monthly-input-20260930.npz')['X'];allsyms=sorted({s for d,s in keys});chosen={allsyms[i] for i in np.linspace(0,len(allsyms)-1,32,dtype=int)};samples=collections.defaultdict(list);seen=set();perdate=collections.Counter()
for line in (B/'extra-features.ndjson').open():
 p=json.loads(line);key=(p['date'],p['symbol']);assert key not in seen;seen.add(key);i=index[key];a=p['originalInputs18'];b=[float(v) if np.isfinite(v) else None for v in X[i]]
 if a!=b:error('original18Parity',key)
 if not p['runtimeEligible'] or len(p['extraInputs32'])!=32:error('rowSchema',key)
 if p['symbol'] in chosen:samples[p['symbol']].append(p)
 perdate[p['date']]+=1;counts['original18Rows']+=1
if seen!=set(index) or dict(sorted(perdate.items()))!=manifest['eligibleCountByDate']:error('membership','Keys/counts not identical')
del seen,index,keys,X
raw={s:{} for s in chosen};rawpath=pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson')
for line in rawpath.open():
 s,rows=json.loads(line)
 if s in chosen:
  for r in rows:
   if r['trade_date'] in raw[s] and raw[s][r['trade_date']]!=r:error('rawDuplicateConflict',[s,r['trade_date']])
   raw[s][r['trade_date']]=r
calendar=read('/tmp/stock-research-fresh-mature-20260930/input/metadata.json')['tradingDays'];ci={d:i for i,d in enumerate(calendar)};samplecases=[]
for s,points in samples.items():
 rr=raw[s];own=m.ObservedSetupFeatures(calendar,rr)
 for k in np.linspace(0,len(points)-1,20,dtype=int):
  p=points[k];d=p['date'];t=ci[d];a=independent32(calendar,rr,t);b=p['extraInputs32'];c=own.at(d)
  for n,x,y,z in zip(m.EXTRA_FEATURE_NAMES,a,b,c):
   if not same(x,y) or not same(x,z):error('independent32RawWindow',[s,d,n,x,y,z])
  bounded=calendar[max(0,t-319):t+1];trim=m.ObservedSetupFeatures(bounded,{dd:rr[dd] for dd in bounded if dd in rr}).at(d)
  if any(not same(v,w) for v,w in zip(a,trim)):error('exact320Trim',[s,d])
  counts['independent32ActualCases']+=1;counts['independent32FeatureValues']+=32;counts['exact320TrimCases']+=1
  samplecases.append([s,d])
synthetic=[str(i).zfill(4) for i in range(450)];base={d:{'open':100+i,'high':110+i,'low':95+i,'close':105+i,'volume':1000+i,'source':'kis'} for i,d in enumerate(synthetic)}
for source in ['kis','naver-fchart']:
 rr={d:{**r,'source':source} for d,r in base.items()};rr[synthetic[-1]]['volume']=0;v=m.ObservedSetupFeatures(synthetic,rr,expected_source=source);out=dict(zip(m.EXTRA_FEATURE_NAMES,v.at(synthetic[-1])))
 if v.bars[-1][4]!=0 or out['todayVolumeToPrior5MeanRatio']!=0 or out['return1Percent'] is None:error('zeroVolumeObserved',source)
 for volume in [-1,None,float('nan')]:
  changed={**rr,synthetic[-1]:{**rr[synthetic[-1]],'volume':volume}};q=m.ObservedSetupFeatures(synthetic,changed,expected_source=source);out=dict(zip(m.EXTRA_FEATURE_NAMES,q.at(synthetic[-1])))
  if q.bars[-1][4] is not None or out['todayVolumeToPrior5MeanRatio'] is not None or out['return1Percent'] is None:error('negativeMissingVolume',source)
 changed={**rr,synthetic[-1]:{**rr[synthetic[-1]],'open':0,'high':0,'low':0,'volume':0}};q=m.ObservedSetupFeatures(synthetic,changed,expected_source=source)
 if q.bars[-1] is not None or any(x is not None for x in q.at(synthetic[-1])):error('invalidOhlNoCarry',source)
 counts['providerVolumeContractCases']+=5
try:m.ObservedSetupFeatures(synthetic,{**base,synthetic[-1]:{**base[synthetic[-1]],'source':'naver-fchart'}});error('mixedProviderAccepted',True)
except ValueError:counts['mixedProviderReject']+=1
before=m.ObservedSetupFeatures(synthetic,base).at(synthetic[-1]);oldchange={d:({**r,'open':1,'high':9000,'low':.5,'close':1000,'volume':1e9} if i<130 else r) for i,(d,r) in enumerate(base.items())};after=m.ObservedSetupFeatures(synthetic,oldchange).at(synthetic[-1])
if before!=after:error('pre320Dependency',True)
counts['olderThan320MutationCases']+=1
grade_sets={}
for lam in [.35,.65,1.0]:
 vals=sorted({(.8*T+.2*Bull+lam*(1-L))/(1+lam) for T,L,Bull in itertools.product([0,1],repeat=3)});grade_sets[str(lam)]=vals
 if len(vals)!=(7 if lam==1 else 8) or vals[0]!=0 or vals[-1]!=1:error('gradeDefinition',[lam,vals])
kis=read(B/'kis-protocol.json');nav=read(B/'naver-protocol.json');assert kis['shared']==nav['shared'];s=kis['shared'];assert s['inputAblations']['original18']==m.ORIGINAL_FEATURE_NAMES and s['inputAblations']['expanded50']==spec['featureNames'];assert s['frozenVariantCount']==24
for prefix,act in zip(kis['trainingOnlyConfigurationFits']['prefixes'],kis['trainingOnlyConfigurationFits']['activationIndices']):
 if prefix-1+5>=act:error('prefixMaturity',[prefix,act])
for x in kis['trainingOnlyConfigurationFits']['BcalibrationSchedule']:
 if max(end-1+5 for start,end in x['OOFIntervals'])>=x['activation']:error('OOFCalibrationMaturity',x)
for x in nav['TRAINfolds']:
 p=x['learnerPrefix'];cs,ce=x['calibrationInterval'];vs,ve=x['assessmentInterval']
 if p-1+5>=cs or ce-1+5>=vs or ce-cs!=40 or ve-vs!=80:error('naverFoldMaturity',x)
assert nav['quarterlyRefit']['trainingWindowPanels']==505
out={'scope':'Independent actual bounded320 KIS feature export/module and frozen protocols. Full original18/key parity; 640 stratified raw32 computations from independent bounded-window formulas. Synthetic provider/zero-vs-missing/invalidOHLC/older320 tests. No labels, model fits or new2023-24 price read; source files untouched. Runner/model/selection audit awaits source.','sourceHashes':expected_hashes,'counts':dict(counts),'differenceCounts':{k:v for k,v in counts.items() if k.startswith('difference:')},'differences':dict(errors),'gradeGains':grade_sets,'sampleCases':samplecases,'limitations':['50 inputs contain repeated price/volume atoms, not50 independent predictors.','Observed past volume0 preservation differs intentionally from positive current eligibility and positive future5 label guards.','Naver current adjusted-vintage/volume and currentmaster survival remain; synthetic provider symmetry does not establish historical source equivalence.','OOF ranker margin-to-final-learner isotonic transfer and integer flat/tie effects require actual policy replay.']}
path=B/'independent-feature-protocol-audit.json';path.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'report':str(path),'counts':dict(counts),'differences':out['differenceCounts']}),flush=True)
if errors:raise SystemExit(1)
