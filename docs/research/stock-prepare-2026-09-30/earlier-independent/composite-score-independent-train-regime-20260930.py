# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3"]
# ///
import collections,hashlib,json,pathlib,statistics
import numpy as np
B=pathlib.Path('/tmp/composite-score-research-20260930');data=np.load('/tmp/composite-score-independent-event-input-20260930.npz');X,Y,offsets=[data[k] for k in ['X','Y','offsets']]
inputs=json.loads(pathlib.Path('/tmp/composite-score-independent-event-input-audit-20260930.json').read_text());dates=inputs['signalDates'][:235]
benchmark_sma={};context_path=B/'earlier-training/earlier-context.ndjson'
for line in context_path.open():
    r=json.loads(line);d=r['date'];v=r['context']['benchmarkSma20DistancePercent']
    if d in benchmark_sma:assert benchmark_sma[d]==v
    else:benchmark_sma[d]=v
assert len(benchmark_sma)==235 and all(v is not None and np.isfinite(v) for v in benchmark_sma.values())
flags={}
for j,d in enumerate(dates):
    xx=X[offsets[j]:offsets[j+1]]
    assert np.isfinite(xx[:,16:18]).all() and len(set(xx[:,16]))==len(set(xx[:,17]))==1
    f=[bool(xx[0,16]<0),bool(benchmark_sma[d]<0),bool(xx[0,17]<50)]
    flags[d]={'kospiReturn20Below0':f[0],'kospiSma20DistanceBelow0':f[1],'breadthBelowHalf':f[2],'anyNaturalWeak':any(f),'allNaturalWeak':all(f),'kospiReturn20Percent':float(xx[0,16]),'kospiSma20DistancePercent':benchmark_sma[d],'breadthAboveSma20Ratio':float(xx[0,17]/100)}
def cohort(ds,flag=None,value=True):
    rows=[];daily=[]
    for j,d in enumerate(dates):
        if d not in ds or flag is not None and flags[d][flag]!=value:continue
        yy=Y[offsets[j]:offsets[j+1]];valid=yy[yy[:,0]>=0]
        rows.append(valid)
        daily.append({'date':d,'eligible':len(yy),'strictKnownLabels':len(valid),'unknownLabels':len(yy)-len(valid),'touchRate':float(valid[:,0].mean()),'D1bullRate':float(valid[:,1].mean()),'loss5Rate':float(valid[:,2].mean()),'touchCount':int(valid[:,0].sum()),'D1bullCount':int(valid[:,1].sum()),'loss5Count':int(valid[:,2].sum())})
    combined=np.vstack(rows) if rows else np.empty((0,3))
    return {'signalDays':len(daily),'eligiblePoints':sum(r['eligible'] for r in daily),'strictKnownLabels':len(combined),'unknownLabels':sum(r['unknownLabels'] for r in daily),'touchCount':int(combined[:,0].sum()),'D1bullCount':int(combined[:,1].sum()),'loss5Count':int(combined[:,2].sum()),'pooled':{'touchRate':float(combined[:,0].mean()) if len(combined) else None,'D1bullRate':float(combined[:,1].mean()) if len(combined) else None,'loss5Rate':float(combined[:,2].mean()) if len(combined) else None},'dateBalanced':{k:statistics.mean(d[k] for d in daily) if daily else None for k in ['touchRate','D1bullRate','loss5Rate']},'daily':daily}
results={}
for scope,ds in [('earlierFirst150',set(dates[:150])),('earlierAll235',set(dates))]:
    results[scope]={'all':cohort(ds)}
    for flag in ['kospiReturn20Below0','kospiSma20DistanceBelow0','breadthBelowHalf','anyNaturalWeak','allNaturalWeak']:
        results[scope][flag+':true']=cohort(ds,flag,True);results[scope][flag+':false']=cohort(ds,flag,False)
out=pathlib.Path('/tmp/composite-score-independent-train-regime-20260930.json')
report={'scope':'TRAIN-only descriptive natural macro partitions at pre-specified0/0/0.5 thresholds. Earlier first150 and all235 observed-currentmaster candidate universe/raw mature labels only; no outer outcomes, learned-score policy variants, new models, threshold optimization or portfolio-performance claim. All235 includes previously used inner80 labels, acknowledged training-data reuse.','sourceInputAudit':str(pathlib.Path('/tmp/composite-score-independent-event-input-audit-20260930.json')),'contextSha256':hashlib.file_digest(context_path.open('rb'),'sha256').hexdigest(),'naturalPartitions':['KOSPI20closeReturn<0','KOSPIclose/SMA20distance<0','breadthAboveSMA20<0.5'],'results':results,'dateFlags':flags,'limits':['Candidate-universe rates do not establish top3 strategy safety or causal future market prediction.','Correlated market indicators share information; all235 already includes inner-period outcomes.','Current-master/status snapshot and shorter earlier warmup bias remain; strict unknown labels retained in eligible denominators and reported.','Loss5 means cost-inclusive D5net<=-5%, not every negative return.']}
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'report':str(out),'brief':{scope:{k:{a:v[a] for a in ['signalDays','strictKnownLabels','pooled','dateBalanced']} for k,v in rr.items()} for scope,rr in results.items()}},ensure_ascii=False),flush=True)
