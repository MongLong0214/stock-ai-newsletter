# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3"]
# ///
import collections,hashlib,json,math,pathlib
import numpy as np
B=pathlib.Path('/tmp/composite-score-research-20260930');E=B/'calibration-extra'
def read(p):return json.loads(pathlib.Path(p).read_text())
old=np.load('/tmp/composite-score-independent-event-input-20260930.npz');oldkeys=read('/tmp/composite-score-independent-event-input-keys-20260930.json');ia=read('/tmp/composite-score-independent-event-input-audit-20260930.json');dates0=ia['signalDates'];oldby={d:(int(old['offsets'][j]),int(old['offsets'][j+1])) for j,d in enumerate(dates0)}
calendar=read('/tmp/stock-research-fresh-mature-20260930/features/metadata.json')['tradingDays'];ci={d:i for i,d in enumerate(calendar)}
gate={r['date']:set(r['runtimeEligibleSymbols']) for r in map(json.loads,(E/'runtime-eligibility.ndjson').open())};context={}
for line in (E/'context.ndjson').open():
 r=json.loads(line)
 if r['symbol'] in gate[r['date']]:context[(r['date'],r['symbol'])]=r['context']
def finite(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
extra=collections.defaultdict(list)
for line in (E/'wide.ndjson').open():
 r=json.loads(line);d,s=r['date'],r['symbol']
 if s not in gate[d]:continue
 f,c=r['feature'],context[(d,s)];vv=[f['atrPercent14'],f['volumeRatio20'],c['chaikinMoneyFlow21'],c['distanceFromPriorHigh20Percent'],c['bollingerWidth20Percent'],((1+f['gapFromPreviousClosePercent']/100)*(f['close']/f['open'])-1)*100,f['gapFromPreviousClosePercent'],(f['close']/f['open']-1)*100,f['rsi14'],f['sma20DistancePercent'],(f['close']/f['sma60']-1)*100 if finite(f.get('sma60')) and f['sma60']>0 else None,c['return5Percent'],c['return20Percent'],c['return60Percent'],c['closeLocation'],c['upperWickRatio']*100 if finite(c['upperWickRatio']) else None,c['benchmarkReturn20Percent'],c['breadthAboveSma20']*100 if finite(c['breadthAboveSma20']) else None]
 assert len(vv)==18;extra[d].append((s,[v if finite(v) else np.nan for v in vv]))
for d,pp in extra.items():assert {s for s,v in pp}==gate[d] and len(pp)==len(gate[d])
dates=sorted(set(dates0)|set(extra),key=ci.__getitem__);assert len(dates)==423 and dates==calendar[ci[dates[0]]:ci[dates[-1]]+1]
xx=[];keys=[];offsets=[0]
for d in dates:
 if d in oldby:
  lo,hi=oldby[d];xx.append(old['X'][lo:hi]);keys.extend(oldkeys[lo:hi])
 else:xx.append(np.array([v for s,v in extra[d]],dtype=float));keys.extend([[d,s] for s,v in extra[d]])
 offsets.append(len(keys))
X=np.vstack(xx);offsets=np.array(offsets,dtype=np.int64);assert X.shape==(509015,18)
need={s for d,s in keys};raw={};rawpath=pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson')
for line in rawpath.open():
 s,rows=json.loads(line)
 if s in need:raw[s]={r['trade_date']:tuple(r[k] for k in ['open','high','low','close','volume']) for r in rows if r['source']=='kis' and r['trade_date'] in ci and r['trade_date']>dates[0]}
Y=np.full((len(keys),3),-1,dtype=np.int64);panel=read('/tmp/composite-score-independent-prior-panels-20260930.json')['panels'];checks=collections.Counter()
for j,d in enumerate(dates):
 futures=calendar[ci[d]+1:ci[d]+6]
 for i in range(offsets[j],offsets[j+1]):
  s=keys[i][1];rr=[raw.get(s,{}).get(day) for day in futures]
  valid=len(rr)==5 and all(r is not None and all(finite(v) and v>0 for v in r[:4]) and r[2]<=min(r[0],r[3])<=max(r[0],r[3])<=r[1] and finite(r[4]) and r[4]>0 for r in rr)
  if valid:
   entry=rr[0][0];Y[i]=[int(max(r[1] for r in rr)>=entry*110/100),int(rr[0][3]>entry),int(rr[-1][3]/entry-1-.003<=-.05)]
 yy=Y[offsets[j]:offsets[j+1]];known=yy[yy[:,0]>=0];p=panel[d]
 assert len(yy)==p['counts']['eligible'] and len(known)==p['counts']['strict'] and dict(zip(['touch','D1bullish','loss5'],known.sum(axis=0).tolist()))=={h:p['counts'][h] for h in ['touch','D1bullish','loss5']};checks['panelCountsRawLabelsExact']+=1
 for v in X[offsets[j]:offsets[j+1]]:checks['observedNativeNaNPoints']+=bool(np.isnan(v).any())
np.savez('/tmp/composite-score-independent-monthly-input-20260930.npz',X=X,Y=Y,offsets=offsets)
pathlib.Path('/tmp/composite-score-independent-monthly-input-keys-20260930.json').write_text(json.dumps(keys,ensure_ascii=False)+'\n')
report={'scope':'Independent all423 observed18-input cache plus all509015 raw5bar class labels for separately frozen monthly150 study; native missing inputs remain in universe and fit subject only to matured strict labels. No models fitted, no policy selected, no external threshold optimization. Individual labels are cached for asof-bounded training only; future outcomes cannot be selected as training rows.','rows':len(X),'signalDates':dates,'calendar':calendar,'featureOrder':ia['featureOrder'],'counts':dict(checks),'inputMatrixSha256':hashlib.sha256(X.tobytes()).hexdigest(),'rawLabelMatrixSha256':hashlib.sha256(Y.tobytes()).hexdigest(),'rawInputSha256':hashlib.file_digest(rawpath.open('rb'),'sha256').hexdigest(),'extraInputSourceHashes':{str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [E/'wide.ndjson',E/'context.ndjson',E/'runtime-eligibility.ndjson']},'strictRows':int((Y[:,0]>=0).sum()),'unknownRows':int((Y[:,0]<0).sum()),'originalFrozenInputsReusedExactly':True}
out=pathlib.Path('/tmp/composite-score-independent-monthly-input-audit-20260930.json');out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'report':str(out),'rows':len(X),'counts':dict(checks),'strictRows':report['strictRows'],'unknownRows':report['unknownRows']}),flush=True)
