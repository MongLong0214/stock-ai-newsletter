"""Independent mature421 raw-label/input reconstruction and actual fixed100-tree refit."""
import json,pathlib,hashlib,time
import numpy as np
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor
from threadpoolctl import threadpool_limits
D=pathlib.Path('/tmp/stock-composite-production-20260930');E=pathlib.Path('/tmp/composite-score-experimental-20260930');F=E/'freshest-kis-fit';R=pathlib.Path('/Users/isaac/WebstormProjects/stock-ai-newsletter')
def read(p):return json.loads(pathlib.Path(p).read_text())
def sha(p):
    with pathlib.Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
start=time.monotonic();artifactpath=R/'scripts/stock-picks/models/composite-utility-v1.json';artifactbytes=artifactpath.read_bytes();artifact=json.loads(artifactbytes);(D/'independent-model-snapshot.json').write_bytes(artifactbytes);snapshotsha=hashlib.sha256(artifactbytes).hexdigest();meta=artifact['metadata'];asof=meta['trainingAsOf']
info=read('/tmp/composite-score-independent-monthly-input-audit-20260930.json');dates=info['signalDates'];cal=info['calendar'];ci={d:i for i,d in enumerate(cal)};keys=read('/tmp/composite-score-independent-monthly-input-keys-20260930.json');z=np.load(E/'independent-kis-inputs.npz');X=z['X'];off=z['offsets']
syms=sorted({s for _,s in keys});sindex={s:i for i,s in enumerate(syms)};raw=np.full((len(syms),len(cal),5),np.nan);rawpath=pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson');seen=set()
for line in rawpath.open():
    s,rows=json.loads(line)
    if s not in sindex:continue
    for r in rows:
        assert r['source']=='kis'
        if r['trade_date'] not in ci:continue
        k=(s,r['trade_date']);assert k not in seen;seen.add(k)
        raw[sindex[s],ci[r['trade_date']]]=[r.get(k) if isinstance(r.get(k),(int,float)) else np.nan for k in ['open','high','low','close','volume']]
input_parts=[];event_parts=[];query=[];known_dates=[];withheld={};strictkeys=[];panels=[]
for j,d in enumerate(dates):
    a,b=int(off[j]),int(off[j+1]);ids=[sindex[s] for _,s in keys[a:b]]
    if ci[d]+5>=len(cal) or cal[ci[d]+5]>asof:withheld[d]=b-a;continue
    rr=raw[ids,ci[d]+1:ci[d]+6];p=rr[:,:,:4];strict=np.isfinite(rr).all(axis=(1,2))&(rr>0).all(axis=(1,2))&(p[:,:,1]>=p.max(axis=2)).all(axis=1)&(p[:,:,2]<=p.min(axis=2)).all(axis=1)
    ent=rr[:,0,0];net=np.divide(rr[:,-1,3],ent,out=np.full(b-a,np.nan),where=np.isfinite(ent)&(ent>0))-1-.003
    event=np.column_stack([(rr[:,:,1]>=ent[:,None]*110/100).any(axis=1),rr[:,0,3]>ent,net<0]).astype(np.uint8);assert strict.sum()>0
    localkeys=[keys[a+i] for i in np.flatnonzero(strict)];order=sorted(range(len(localkeys)),key=lambda i:tuple(localkeys[i]));xx=X[a:b][strict][order];ee=event[strict][order]
    input_parts.append(xx);event_parts.append(ee);query.append(int(strict.sum()));known_dates.append(d);strictkeys.extend(localkeys[i] for i in order)
    panels.append(dict(signalDate=d,labelMaturityDate=cal[ci[d]+5],eligible=b-a,strictTrainingRows=int(strict.sum()),futureUnknownRows=int((~strict).sum())))
xx=np.ascontiguousarray(np.concatenate(input_parts),dtype=np.float64);ee=np.concatenate(event_parts);groups=np.array(query,dtype=np.int32);w=np.concatenate([np.full(n,len(xx)/(len(query)*n),dtype=np.float64) for n in query]);values=np.array([(.8*((i>>2)&1)+.2*(i&1)+.65*(1-((i>>1)&1)))/(1+.65) for i in range(8)]);yy=values[4*ee[:,0]+2*ee[:,2]+ee[:,1]]
owner=np.load(F/'fit-inputs.npz');assert np.array_equal(xx,owner['X'],equal_nan=True) and np.array_equal(ee,owner['events']) and np.array_equal(groups,owner['groups']) and np.array_equal(w,owner['weights']) and np.array_equal(yy,owner['y'])
digest=hashlib.sha256(xx.tobytes()+ee.tobytes()+groups.tobytes()+w.tobytes()+yy.tobytes()).hexdigest();assert digest==meta['inputSha256'];assert panels==meta['perDateTraining'] and withheld==meta['immatureSignalPanelsExcluded'];assert len(query)==421 and len(xx)==506470 and known_dates[-1]=='2026-09-18' and panels[-1]['labelMaturityDate']=='2026-09-29'
assert artifact['featureNames']==read(E/'featurespec.json')['featureNames'];assert all(sha(p)==h for p,h in meta['inputHashes'].items());print('PRODUCTION_FRESH_ACTUAL_INPUT_EXACT',len(query),len(xx),digest,flush=True)
params=dict(loss='squared_error',max_iter=100,max_leaf_nodes=7,max_depth=3,min_samples_leaf=100,l2_regularization=1,learning_rate=.05,max_bins=255,random_state=42,early_stopping=False);assert artifact['parameters']==params
with threadpool_limits(limits=1):model=HistGradientBoostingRegressor(**params).fit(xx,yy,sample_weight=w)
saved=joblib.load(F/'model.joblib');assert model.n_iter_==saved.n_iter_==100 and np.array_equal(model._baseline_prediction,saved._baseline_prediction)
for a,b in zip(model._predictors,saved._predictors):assert np.array_equal(a[0].nodes,b[0].nodes)
treehash=hashlib.sha256(b''.join(p[0].nodes.tobytes() for p in model._predictors)).hexdigest();assert treehash==read(F/'audit.json')['structuredNodesSha256'];assert float(model._baseline_prediction[0,0])==artifact['baselinePrediction']
for iteration,tree in zip(model._predictors,artifact['trees']):
    assert len(iteration[0].nodes)==len(tree)
    for n,v in zip(iteration[0].nodes,tree):
        assert bool(n['is_leaf'])==v['isLeaf'] and float(n['value'])==v['value'] and int(n['feature_idx'])==v['featureIdx'] and bool(n['missing_go_to_left'])==v['missingGoLeft'] and int(n['left'])==v['left'] and int(n['right'])==v['right'] and not n['is_categorical']
        if not n['is_leaf']:assert (float(n['num_threshold']) if np.isfinite(n['num_threshold']) else 'Infinity' if n['num_threshold']>0 else '-Infinity')==v['numThreshold']
sample=np.linspace(0,len(xx)-1,100,dtype=int);cases=[xx[i].copy() for i in sample];casekeys=[strictkeys[i] for i in sample];cases.extend([np.full(50,np.nan),np.zeros(50)])
for j in range(50):v=xx[sample[j]].copy();v[j]=np.nan;cases.append(v)
for iteration in model._predictors:
    for n in iteration[0].nodes:
        if not n['is_leaf'] and np.isfinite(n['num_threshold']):
            for a in [np.nextafter(n['num_threshold'],-np.inf),float(n['num_threshold']),np.nextafter(n['num_threshold'],np.inf)]:v=xx[sample[len(cases)%100]].copy();v[int(n['feature_idx'])]=a;cases.append(v)
pred=model.predict(np.array(cases));fixtures=[{'inputs':[float(v) if np.isfinite(v) else None for v in row],'prediction':float(p),'utility':float(np.clip(p,0,1)),'score':int(np.floor(100*np.clip(p,0,1)+.5))} for row,p in zip(cases,pred)];(D/'independent-native-model-cases.json').write_text(json.dumps({'modelSnapshotSha256':snapshotsha,'observedKeys':casekeys,'cases':fixtures},allow_nan=False))
result={'scope':'Independent all mature421 KIS raw5bar labels, original independently-audited509015 50-feature cache, complete X/events/datequeries/weights/inputhash/maturity/withheld and actual fresh100tree refit + JSON export structure','modelSnapshotSha256':snapshotsha,'observedInputRows':len(X),'trainingDates':known_dates,'trainingPanels':len(query),'trainingRows':len(xx),'withheldImmaturePanels':withheld,'nativeMissingInputValues':int(np.isnan(xx).sum()),'fitInputSha256':digest,'independentRefittedTrees':100,'independentTreeNodeSha256':treehash,'nativeTSPredictorCasesReady':len(cases),'rawSourceSha256':sha(rawpath),'differences':[],'newModelSearch':0,'productionEdits':0,'asOf':asof,'closedD5Maturity':'2026-09-29','freshModelPerformanceClaim':False,'seconds':time.monotonic()-start}
(D/'independent-fresh-model-audit.json').write_text(json.dumps(result,indent=2,allow_nan=False));print('COMPLETE_PRODUCTION_FRESH_MODEL',treehash,len(cases),flush=True)
