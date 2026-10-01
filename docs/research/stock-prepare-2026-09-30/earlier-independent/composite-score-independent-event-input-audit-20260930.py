# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import collections, hashlib, json, math, pathlib
import numpy as np
B=pathlib.Path('/tmp/composite-score-research-20260930');W=B/'event-composite-study';E=B/'earlier-training'
plan=W/'event-plan.txt'
assert hashlib.file_digest(plan.open('rb'),'sha256').hexdigest()=='eef81c7d88c58ffc52545d4d4e1d734e1bef35ef7d61dd82e9cf20a7bd9c7ea5'
source=pathlib.Path('/tmp/composite-score-independent-target-utility-audit-20260930.py');env={}
exec(compile(source.read_text().split('\nfit_audit={}')[0],str(source),'exec'),env)
rows,early_dates,outer_dates,calendar,ci,raw,outcome=[env[k] for k in ['rows','early_dates','outer_dates','calendar','ci','raw','outcome']]
def finite(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
extra_keys=['return5Percent','return20Percent','return60Percent','closeLocation','upperWickRatio','benchmarkReturn20Percent','breadthAboveSma20']
for path in [E/'earlier-context.ndjson',B/'technical-context.ndjson']:
    for line in path.open():
        r=json.loads(line);p=rows[r['date']].get(r['symbol'])
        if p is not None:p['extraContext']=[r['context'].get(k) for k in extra_keys]
for line in (E/'earlier-wide.ndjson').open():
    r=json.loads(line);p=rows[r['date']].get(r['symbol'])
    if p is None:continue
    sma=r['feature'].get('sma60');p['sma60DistancePercent']=(r['feature']['close']/sma-1)*100 if finite(sma) and sma>0 else None
for path in [pathlib.Path('/tmp/upside-scored.ndjson'),pathlib.Path('/tmp/stock-research-fresh-mature-20260930/scored.ndjson')]:
    for line in path.open():
        d,pp=json.loads(line)
        for r in pp:
            p=rows[d].get(r['symbol'])
            if p is None:continue
            sma=r['feature'].get('sma60');p['sma60DistancePercent']=(r['feature']['close']/sma-1)*100 if finite(sma) and sma>0 else None
names=['atrPercent14','volumeRatio20','chaikinMoneyFlow21','distanceFromPriorHigh20Percent','bollingerWidth20Percent','signalCloseCloseReturnPercent','gapFromPreviousClosePercent','signalIntradayReturnPercent','rsi14','sma20DistancePercent','sma60DistancePercent','return5Percent','return20Percent','return60Percent','closeLocation','upperWickPercent','kospiReturn20Percent','breadthAboveSma20Percent']
keys=[];features=[];labels=[];offsets=[];last=0
for d in early_dates+outer_dates:
    offsets.append(last)
    for s,p in rows[d].items():
        f=p['feature'];a=p['atoms'];c=p['extraContext']
        vv=[f['atrPercent14'],f['volumeRatio20'],a[0],a[1],a[4],((1+f['gapFromPreviousClosePercent']/100)*(f['close']/f['open'])-1)*100,f['gapFromPreviousClosePercent'],(f['close']/f['open']-1)*100,f['rsi14'],f['sma20DistancePercent'],p['sma60DistancePercent'],*c[:4],c[4]*100 if finite(c[4]) else None,c[5],c[6]*100 if finite(c[6]) else None]
        assert len(vv)==18
        features.append([v if finite(v) else np.nan for v in vv]);keys.append((d,s));last+=1
        o=outcome(s,d) if d in early_dates else None
        labels.append([int(o['touch']),int(o['entryBullish']),int(o['net5d']<=-.05)] if o is not None and o['strictLabelValid'] else [-1,-1,-1])
offsets.append(last)
X=np.array(features,dtype=np.float64);Y=np.array(labels,dtype=np.int64);offsets=np.array(offsets,dtype=np.int64)
del features,labels,rows,env
audit={}
for scope,n in [('first150',150),('all235',235)]:
    ix=np.flatnonzero((np.arange(len(X))<offsets[n]) & (Y[:,0]>=0));tx=X[ix];ty=Y[ix];weights=np.zeros(len(ix));date_counts=[];at=0
    for k,d in enumerate(early_dates[:n]):
        nn=int(np.count_nonzero((ix>=offsets[k]) & (ix<offsets[k+1])))
        weights[at:at+nn]=len(ix)/(n*nn);at+=nn
        date_counts.append({'date':d,'eligible':int(offsets[k+1]-offsets[k]),'trainingRows':nn,'labelMaturity':calendar[ci[d]+5]})
    assert at==len(ix)
    activation=early_dates[155] if n==150 else outer_dates[0]
    assert all(r['labelMaturity']<activation for r in date_counts)
    audit[scope]={'trainingRows':len(ix),'days':n,'activationDate':activation,'lastLabelMaturity':date_counts[-1]['labelMaturity'],'missingInputsByFeature':dict(zip(names,np.isnan(tx).sum(axis=0).tolist())),'positiveLabelsByHead':dict(zip(['touch','bull','loss5'],ty.sum(axis=0).tolist())),'inputSha256':hashlib.sha256(tx.tobytes()).hexdigest(),'labelSha256':hashlib.sha256(ty.tobytes()).hexdigest(),'weightSha256':hashlib.sha256(weights.tobytes()).hexdigest(),'dateCounts':date_counts}
    print('INDEPENDENT_EVENT_INPUT',scope,{k:v for k,v in audit[scope].items() if k!='dateCounts'},flush=True)
out=pathlib.Path('/tmp/composite-score-independent-event-input-audit-20260930.json')
out.write_text(json.dumps({'scope':'Independent observed-only18 raw feature construction and strictly-mature TRAIN labels/date weights for the final already frozen HGB event family; no fitting, tuning, external outcome inspection or repo writes. Missing observed inputs preserved as native NaN, future label validity never changes candidate membership.','planSha256':hashlib.file_digest(plan.open('rb'),'sha256').hexdigest(),'rows':len(X),'signalDates':early_dates+outer_dates,'featureOrder':names,'models':audit,'source':str(source)},ensure_ascii=False,indent=2)+'\n')
np.savez('/tmp/composite-score-independent-event-input-20260930.npz',X=X,Y=Y,offsets=offsets)
pathlib.Path('/tmp/composite-score-independent-event-input-keys-20260930.json').write_text(json.dumps(keys,ensure_ascii=False))
print('DONE',out,flush=True)
