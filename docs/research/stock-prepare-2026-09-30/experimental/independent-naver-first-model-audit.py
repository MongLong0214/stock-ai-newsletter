"""Independent TRAIN-only input reconstruction and four spot refits; no runner exec."""
import hashlib,json,pathlib,re,time,sys
import numpy as np
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor
from lightgbm import LGBMRanker

E=pathlib.Path('/tmp/composite-score-experimental-20260930'); C=E/'naver-cache'
def sha(p):
    with pathlib.Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
m=json.loads((C/'manifest.json').read_text()); obs=json.loads((E/'naver-ts-observed/manifest.json').read_text())
dates=m['signalDates']; train=m['trainDates']; calendar=m['calendarDates']; syms=m['symbols']; ci={d:i for i,d in enumerate(calendar)}
assert train==dates[:len(train)] and all(d<'2023-01-01' for d in train)
X=np.load(C/'X50.npy',mmap_mode='r'); off=np.load(C/'offsets.npy'); sym=np.load(C/'symbols.npy'); raw=np.load(C/'rawBars.npy',mmap_mode='r')
source=np.memmap(obs['output']['path'],mode='r',dtype='<f8',shape=(obs['output']['rows'],28))
order=np.lexsort((source[:,1],source[:,0])); ordered=source[order]
assert np.array_equal(ordered[:,:2],np.column_stack([np.repeat(np.arange(len(dates)),np.diff(off)),sym]))
assert np.array_equal(ordered[:,2:20],X[:,:18],equal_nan=True)
assert np.array_equal(ordered[:,20:27],np.load(C/'sourceSignals7.npy'))
assert np.array_equal(ordered[:,27],np.load(C/'turnover.npy'))
print('ALL_OBSERVED_CACHE_ORIGINAL18_SOURCE7_TURNOVER_PARITY',len(X),flush=True)

# Decode only 2020 TRAIN-bar objects from the symbol-major raw JSON. The other
# dates remain uninterpreted text; no 2023-24 signal outcome is calculated/read.
needed=calendar[ci[train[0]]+1:ci[train[149]]+6]; needed_set=set(needed)
decoded=np.full((len(syms),len(needed),5),np.nan,dtype=np.float64)
dd={d:i for i,d in enumerate(needed)}; ss={s:i for i,s in enumerate(syms)}
bar_pattern=re.compile(r'\{"close":.*?"volume":[^}]*\}')
date_pattern=re.compile(r'"trade_date":"([^"]+)"')
decoded_rows=0
for line in (E/'naver-history/prices.ndjson').open():
    symbol=json.loads(line[1:line.index(',')])
    if symbol not in ss:continue
    for match in bar_pattern.finditer(line):
        text=match.group(); date=date_pattern.search(text).group(1)
        if date not in needed_set:continue
        p=json.loads(text);assert p['source']=='naver-fchart' and p['symbol']==symbol
        assert all(np.isnan(decoded[ss[symbol],dd[date]]))
        decoded[ss[symbol],dd[date]]=[np.nan if p[k] is None else p[k] for k in ['open','high','low','close','volume']]
        decoded_rows+=1
assert np.array_equal(decoded,raw[:,ci[needed[0]]:ci[needed[-1]]+1],equal_nan=True)
print('TRAIN_RAW_PRICE_CACHE_PARITY',decoded_rows,needed[0],needed[-1],flush=True)

panels=[]; masks=[]; counts=[]
for i,d in enumerate(train[:150]):
    first=dd[calendar[ci[d]+1]]; a,b=int(off[i]),int(off[i+1]); rr=decoded[sym[a:b],first:first+5,:]
    pp=rr[:,:,:4]
    valid=np.isfinite(pp).all(axis=(1,2)) & (pp>0).all(axis=(1,2))
    valid &= (pp[:,:,1]>=pp.max(axis=2)).all(axis=1) & (pp[:,:,2]<=pp.min(axis=2)).all(axis=1)
    strict=valid & np.isfinite(rr[:,:,4]).all(axis=1) & (rr[:,:,4]>0).all(axis=1)
    entry=rr[:,0,0]; net=rr[:,-1,3]/entry-1-.003
    t=(rr[:,:,1]>=entry[:,None]*110/100).any(axis=1); bull=rr[:,0,3]>rr[:,0,0]
    ee=np.column_stack([t,bull,net<=-.05]).astype(np.uint8)
    masks.append(strict);panels.append(ee[strict]);counts.append(int(strict.sum()))
assert min(counts)>0
ee=np.concatenate(panels);groups=np.array(counts,dtype=np.int32);w=np.concatenate([np.full(k,len(ee)/(150*k),dtype=np.float64) for k in counts])
assert abs(w.mean()-1)<1e-12
table=np.array([(.8*((i>>2)&1)+.2*(i&1)+.35*(1-((i>>1)&1)))/(1+.35) for i in range(8)])
yy=table[4*ee[:,0]+2*ee[:,2]+ee[:,1]];gains=sorted(set(float(v) for v in table));grade=np.array([gains.index(float(v)) for v in yy],dtype=np.int32)
results=[];missing=[]
for family,inputs in [('A',18),('A',50),('B',18),('B',50)]:
    key=f'{family}-small-lambda0.35-inputs{inputs}-prefix150';mp=E/'naver/models/TRAINfold1'/(key+'.json');jp=mp.with_suffix('.joblib')
    if not mp.exists():missing.append(key);continue
    meta=json.loads(mp.read_text());saved=joblib.load(jp)
    xx=np.concatenate([X[int(off[i]):int(off[i+1]),:inputs][mask] for i,mask in enumerate(masks)])
    digest=hashlib.sha256(xx.tobytes()+ee.tobytes()+groups.tobytes()+w.tobytes()+yy.tobytes()+grade.tobytes()).hexdigest()
    assert digest==meta['trainingInputSha256'] and meta['rowCount']==len(ee)
    assert meta['trainingDates']==train[:150] and meta['queryCounts']==counts
    assert meta['activationDate']==train[155] and calendar[ci[train[149]]+5]<=train[155]
    assert meta['provenance']['latestTrainingLabelMaturity']==needed[-1]
    assert meta['nativeMissingValues']==int(np.isnan(xx).sum()) and sha(jp)==meta['joblibSha256']
    params={'loss':'squared_error','max_iter':100,'max_leaf_nodes':7,'max_depth':3,'min_samples_leaf':100,'l2_regularization':1,'learning_rate':.05,'max_bins':255,'random_state':42,'early_stopping':False} if family=='A' else {'objective':'lambdarank','boosting_type':'gbdt','n_estimators':100,'num_leaves':7,'max_depth':3,'min_child_samples':100,'reg_lambda':1,'learning_rate':.05,'max_bin':255,'random_state':42,'n_jobs':4,'deterministic':True,'force_col_wise':True,'lambdarank_norm':True,'lambdarank_truncation_level':6,'label_gain':gains,'metric':'None','subsample':1,'subsample_freq':0,'colsample_bytree':1,'verbosity':-1}
    assert meta['parameters']==params
    started=time.monotonic()
    if family=='A':
        fitted=HistGradientBoostingRegressor(**params).fit(xx,yy,sample_weight=w)
        tree=hashlib.sha256(b''.join(p[0].nodes.tobytes() for p in fitted._predictors)).hexdigest()
        assert tree==meta['treeInfo']['structuredNodesSha256'] and float(fitted._baseline_prediction[0,0])==meta['treeInfo']['baselinePrediction']
    else:
        fitted=LGBMRanker(**params).fit(xx,grade,group=groups,sample_weight=w,feature_name=['observed'+str(j) for j in range(inputs)])
        tree=hashlib.sha256(json.dumps(fitted.booster_.dump_model(),sort_keys=True,separators=(',',':')).encode()).hexdigest()
        assert tree==meta['treeInfo']['dumpModelSha256']
    # Predict an observed-only assessment panel: its outcomes are not queried.
    sample=X[int(off[200]):int(off[201]),:inputs]
    assert np.array_equal(fitted.predict(sample),saved['model'].predict(sample))
    record={'bundle':key,'strictRows':len(ee),'inputSha256':digest,'all100TreeSha256':tree,'assessmentObservedPredictionDate':train[200],'predictionRows':len(sample),'seconds':time.monotonic()-started}
    results.append(record);print('INDEPENDENT_REFIT_COMPLETE',json.dumps(record),flush=True)
report={'scope':'TRAINfold1 first150 raw-label/input reconstruction and four available small lambda.35 spot refits; no PRIMARY signal outcomes','allObservedCacheOriginal18Rows':len(X),'original18Source7TurnoverDifferences':0,'rawTrainBarObjectsDecoded':decoded_rows,'rawTrainFirstBar':needed[0],'rawTrainLastBar':needed[-1],'rawTrainCacheDifferences':0,'strictRows':len(ee),'completeIndependentRefits':results,'notYetAvailable':missing,'differences':[],'newNaver2023_2024SignalOutcomesRead':False,'sourceTruthLimitation':'Conditional on frozen NAVER source; no point-in-time adjusted vintage or KIS exchange-close equivalence proof','sourceHashes':{str(p):sha(p) for p in [pathlib.Path(__file__),E/'naver-protocol.json',E/'naver-research.py',E/'fixed-models.py',C/'manifest.json',E/'naver-history/prices.ndjson']}}
(E/'independent-naver-first-model-audit.json').write_text(json.dumps(report,indent=2,allow_nan=False))
print(json.dumps(report),flush=True)
