"""TRAIN-only integer-price barrier oracle, input reconstruction and two spot refits."""
import hashlib,json,pathlib,time
import numpy as np
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor
E=pathlib.Path('/tmp/composite-score-experimental-20260930');F=E/'first-passage-study';C=E/'naver-cache'
def sha(p):
    with pathlib.Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
m=json.loads((C/'manifest.json').read_text());train=m['trainDates'];cal=m['calendarDates'];ci={d:i for i,d in enumerate(cal)}
X=np.load(C/'X50.npy',mmap_mode='r');off=np.load(C/'offsets.npy');sym=np.load(C/'symbols.npy');raw=np.load(C/'rawBars.npy',mmap_mode='r')
panels={};labels=[];label_points=0;unknown_points=0;max_net_delta=0
# Labels are limited to already-created TRAIN files and capped at 2022 signaldates.
paths=[p for p in sorted((F/'naver-fp-labels').glob('*.npz')) if p.stem in set(train)]
for path in paths:
    d=path.stem;idx=train.index(d);a,b=int(off[idx]),int(off[idx+1]);r=np.asarray(raw[sym[a:b],ci[d]+1:ci[d]+6,:])
    p=r[:,:,:4];valid=np.isfinite(p).all(axis=(1,2))&(p>0).all(axis=(1,2))&(p[:,:,1]>=p.max(axis=2)).all(axis=1)&(p[:,:,2]<=p.min(axis=2)).all(axis=1)
    strict=valid&np.isfinite(r[:,:,4]).all(axis=1)&(r[:,:,4]>0).all(axis=1)
    # Every strict stock OHLC in this TRAIN source is integer-valued. Exact
    # cross-products reproduce Decimal barriers without binary floating rounding.
    assert np.all(p[strict]==np.floor(p[strict])) and np.max(p[strict])<1e9
    q=p[strict].astype(np.int64);entry=q[:,0,0];n=len(q);reason=np.zeros(n,dtype=np.uint8);exitday=np.zeros(n,dtype=np.uint8);amb=np.zeros(n,dtype=np.uint8);exitprice=np.zeros(n,dtype=np.float64)
    for j in range(5):
        active=reason==0;o,h,l,c=q[:,j,:].T
        gapstop=active&(20*o<=19*entry);gapTarget=active&~gapstop&(10*o>=11*entry)
        between=active&~gapstop&~gapTarget;intrastop=between&(20*l<=19*entry);intratarget=between&~intrastop&(10*h>=11*entry)
        amb[between&(20*l<=19*entry)&(10*h>=11*entry)]=1
        for hit,code,price in [(gapstop,3,o),(gapTarget,1,entry*1.1),(intrastop,2,entry*.95),(intratarget,1,entry*1.1)]:
            reason[hit]=code;exitday[hit]=j+1;exitprice[hit]=price[hit]
    horizon=reason==0;reason[horizon]=4;exitday[horizon]=5;exitprice[horizon]=q[horizon,-1,3]
    safe=(reason==1).astype(np.uint8);loss=np.isin(reason,[2,3]) | (horizon&(1000*q[:,-1,3]<1003*entry));bull=(q[:,0,3]>entry).astype(np.uint8)
    expected_net=exitprice/entry-1-.003
    with np.load(path,allow_pickle=False) as z:
        assert np.array_equal(z['strict'],strict)
        for k,value in [('safe',safe),('loss',loss.astype(np.uint8)),('ambiguous',amb),('reason',reason),('exitday',exitday)]:
            assert np.array_equal(z[k][strict],value),(d,k)
            assert np.all(z[k][~strict]==0),(d,k,'unknown must remain zero masked')
        assert np.isnan(z['net'][~strict]).all()
        delta=float(np.max(np.abs(z['net'][strict]-expected_net)))
        assert delta<1e-12;(max_net_delta:=max(max_net_delta,delta))
    events=np.column_stack([safe,bull,loss]).astype(np.uint8)
    panels[d]=(strict,events);labels.append({'signalDate':d,'strictRows':n,'unknownRows':int((~strict).sum()),'labelSha256':sha(path)})
    label_points+=n;unknown_points+=int((~strict).sum())
print('ALL_AVAILABLE_TRAIN_FP_LABELS_EXACT',len(paths),label_points,'unknown',unknown_points,flush=True)
params={'loss':'squared_error','max_iter':100,'max_leaf_nodes':7,'max_depth':3,'min_samples_leaf':100,'l2_regularization':1,'learning_rate':.05,'max_bins':255,'random_state':42,'early_stopping':False}
models=[];refits=[]
for path in sorted((F/'naver-models').rglob('*.json')):
    if not path.parent.name.startswith('FP-TRAINfold'):continue
    meta=json.loads(path.read_text());dates=meta['trainingDates'];assert all(d in train for d in dates)
    if not all(d in panels for d in dates):continue
    n=len(dates);expected_epoch={150:'FP-TRAINfold1',350:'FP-TRAINfold2',550:'FP-TRAINfold3'}[n]
    assert path.parent.name==expected_epoch and dates==train[:n] and meta['activationDate']==train[n+5]
    assert cal[ci[dates[-1]]+5]<=meta['activationDate'];inputs=meta['config']['inputCount']
    assert inputs in [18,50] and meta['config']['family']=='A' and meta['config']['complexity']=='small' and meta['config']['lambda']==.65
    xx=np.concatenate([X[int(off[train.index(d)]):int(off[train.index(d)+1]),:inputs][panels[d][0]] for d in dates]);ee=np.concatenate([panels[d][1] for d in dates]);g=np.array([int(panels[d][0].sum()) for d in dates],dtype=np.int32)
    w=np.concatenate([np.full(int(k),len(ee)/(n*int(k)),dtype=np.float64) for k in g]);assert abs(w.mean()-1)<1e-12
    table=np.array([(.8*((i>>2)&1)+.2*(i&1)+.65*(1-((i>>1)&1)))/(1+.65) for i in range(8)])
    y=table[4*ee[:,0]+2*ee[:,2]+ee[:,1]]
    digest=hashlib.sha256(xx.tobytes()+ee.tobytes()+g.tobytes()+w.tobytes()+y.tobytes()).hexdigest()
    assert meta['trainingInputSha256']==digest and meta['queryCounts']==g.tolist() and meta['rowCount']==len(y)
    assert meta['nativeMissingValues']==int(np.isnan(xx).sum()) and meta['parameters']==params
    assert meta['eventColumnNames']==['T_safe','B','L0_FP']
    saved=joblib.load(path.with_suffix('.joblib'));assert sha(path.with_suffix('.joblib'))==meta['joblibSha256']
    tree=hashlib.sha256(b''.join(p[0].nodes.tobytes() for p in saved['model']._predictors)).hexdigest();assert tree==meta['treeInfo']['structuredNodesSha256']
    models.append({'bundle':meta['bundleId'],'epoch':expected_epoch,'inputSha256':digest,'strictRows':len(y),'treeSha256':tree})
    if n==150:
        started=time.monotonic();fitted=HistGradientBoostingRegressor(**params).fit(xx,y,sample_weight=w)
        independent=hashlib.sha256(b''.join(p[0].nodes.tobytes() for p in fitted._predictors)).hexdigest()
        assert independent==tree and float(fitted._baseline_prediction[0,0])==meta['treeInfo']['baselinePrediction']
        sample=X[int(off[200]):int(off[201]),:inputs];assert np.array_equal(fitted.predict(sample),saved['model'].predict(sample))
        refits.append({'bundle':meta['bundleId'],'independent100TreesSha256':independent,'observedPredictionRows':len(sample),'seconds':time.monotonic()-started});print('FP_INDEPENDENT100_TREE_REFIT',json.dumps(refits[-1]),flush=True)
assert len(refits)==2,'Both first150 input ablations must be actually available for complete spot audit'
result={'scope':'Exact integer-stock-OHLC oracle of available TRAIN FP panels, all available fit-input/weight/maturity hashes and two first150 actual100-tree spot refits','availableTrainPanels':len(paths),'strictLabelPoints':label_points,'unknownLabelPointsRetained':unknown_points,'labelEventDifferences':0,'maxExpectedNetFloatDifference':max_net_delta,'modelMetadataAudits':models,'independentRefits':refits,'newNaver2023_2024SignalOutcomesRead':False,'productionChanges':0,'labelPanelHashes':labels,'hashes':{str(p):sha(p) for p in [pathlib.Path(__file__),F/'protocol.json',F/'naver_fp.py',F/'fp_models.py',F/'input-freeze.json',C/'manifest.json']}}
(E/'independent-first-passage-train-audit.json').write_text(json.dumps(result,indent=2,allow_nan=False));print(json.dumps({k:v for k,v in result.items() if k!='labelPanelHashes'}),flush=True)
