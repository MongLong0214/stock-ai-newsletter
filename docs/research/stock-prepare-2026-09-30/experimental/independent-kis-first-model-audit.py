# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1", "lightgbm==4.7.0"]
# ///
"""Independent exact-input spot refits, without executing the research runner."""
import hashlib,json,pathlib,math,itertools,time,sys
import numpy as np
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor
from lightgbm import LGBMRanker

E=pathlib.Path('/tmp/composite-score-experimental-20260930')
def sha(path):
    with pathlib.Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
old=pathlib.Path('/tmp/composite-score-independent-monthly-input-20260930.npz')
z=np.load(old);X18=z['X'];Y=z['Y'];offsets=z['offsets']
keys=json.loads(pathlib.Path('/tmp/composite-score-independent-monthly-input-keys-20260930.json').read_text())
info=json.loads(pathlib.Path('/tmp/composite-score-independent-monthly-input-audit-20260930.json').read_text())
dates=info['signalDates'];calendar=info['calendar'];ci={d:i for i,d in enumerate(calendar)}
assert len(keys)==509015 and len(dates)==423 and len(offsets)==424
only_B='--only-B' in sys.argv
if only_B:
    X=np.load(E/'independent-kis-inputs.npz')['X']
    assert np.array_equal(X[:,:18],X18,equal_nan=True)
else:
    lookup={tuple(k):i for i,k in enumerate(keys)}
    X=np.full((len(keys),50),np.nan,dtype=np.float64);seen=np.zeros(len(keys),dtype=bool)
    for line in (E/'extra-features.ndjson').open():
        p=json.loads(line);i=lookup[(p['date'],p['symbol'])]
        assert not seen[i] and p['runtimeEligible'];seen[i]=True
        X[i]=np.array([np.nan if v is None else v for v in p['originalInputs18']+p['extraInputs32']],dtype=np.float64)
    assert seen.all() and np.array_equal(X[:,:18],X18,equal_nan=True)
    np.savez(E/'independent-kis-inputs.npz',X=X,Y=Y,offsets=offsets)

results=[];differences=[]
def check(condition,label,details=None):
    if not condition:differences.append({'check':label,'details':details})
for family,inputs in [('A',18),('A',50),('B',18),('B',50)]:
    if only_B and family!='B':continue
    key=f'{family}-small-lambda0.35-inputs{inputs}-prefix80'
    mp=E/'kis-models'/(key+'.json');jp=mp.with_suffix('.joblib')
    if not mp.exists():results.append({'bundle':key,'status':'NOT_YET_AVAILABLE'});continue
    m=json.loads(mp.read_text());saved=joblib.load(jp);c=m['config'];n=80;dd=dates[:n]
    masks=[np.all(Y[offsets[i]:offsets[i+1]]>=0,axis=1) for i in range(n)]
    xx=np.concatenate([X[offsets[i]:offsets[i+1]][masks[i],:inputs] for i in range(n)])
    ee=np.concatenate([Y[offsets[i]:offsets[i+1]][masks[i]].astype(np.uint8) for i in range(n)])
    groups=np.array([int(mask.sum()) for mask in masks],dtype=np.int32)
    w=np.concatenate([np.full(int(k),len(ee)/(n*int(k)),dtype=np.float64) for k in groups])
    table=np.array([(.8*((i>>2)&1)+.2*(i&1)+.35*(1-((i>>1)&1)))/(1+.35) for i in range(8)])
    bits=4*ee[:,0]+2*ee[:,2]+ee[:,1];yy=table[bits]
    gains=sorted(set(float(v) for v in table));grade=np.array([gains.index(float(v)) for v in yy],dtype=np.int32)
    digest=hashlib.sha256(xx.tobytes()+ee.tobytes()+groups.tobytes()+w.tobytes()+yy.tobytes()+grade.tobytes()).hexdigest()
    check(m['trainingDates']==dd,key+' dates');check(m['activationDate']==dates[85],key+' activation')
    check(calendar[ci[dd[-1]]+5]<m['activationDate'],key+' maturity')
    check(m['rowCount']==len(ee) and m['queryCounts']==groups.tolist(),key+' query rows')
    check(m['trainingInputSha256']==digest,key+' exact input hash',digest)
    check(m['nativeMissingValues']==int(np.isnan(xx).sum()),key+' native NaN count')
    check(m['joblibSha256']==sha(jp),key+' saved model hash')
    params={'loss':'squared_error','max_iter':100,'max_leaf_nodes':7,'max_depth':3,'min_samples_leaf':100,'l2_regularization':1,'learning_rate':.05,'max_bins':255,'random_state':42,'early_stopping':False} if family=='A' else {'objective':'lambdarank','boosting_type':'gbdt','n_estimators':100,'num_leaves':7,'max_depth':3,'min_child_samples':100,'reg_lambda':1,'learning_rate':.05,'max_bin':255,'random_state':42,'n_jobs':4,'deterministic':True,'force_col_wise':True,'lambdarank_norm':True,'lambdarank_truncation_level':6,'label_gain':gains,'metric':'None','subsample':1,'subsample_freq':0,'colsample_bytree':1,'verbosity':-1}
    check(m['parameters']==params,key+' frozen parameters')
    started=time.monotonic()
    if family=='A':
        fitted=HistGradientBoostingRegressor(**params).fit(xx,yy,sample_weight=w)
        tree=hashlib.sha256(b''.join(p[0].nodes.tobytes() for p in fitted._predictors)).hexdigest()
        check(tree==m['treeInfo']['structuredNodesSha256'],key+' all100 trees',tree)
        check(float(fitted._baseline_prediction[0,0])==m['treeInfo']['baselinePrediction'],key+' baseline')
    else:
        fitted=LGBMRanker(**params).fit(xx,grade,group=groups,sample_weight=w,feature_name=['observed'+str(j) for j in range(inputs)])
        dumped=json.dumps(fitted.booster_.dump_model(),sort_keys=True,separators=(',',':'))
        tree=hashlib.sha256(dumped.encode()).hexdigest();check(tree==m['treeInfo']['dumpModelSha256'],key+' all100 trees',tree)
    sample=X[offsets[85]:offsets[86],:inputs]
    predicted=fitted.predict(sample);original=saved['model'].predict(sample)
    check(np.array_equal(predicted,original),key+' complete activation panel predictions')
    print('CHECKED',key,'tree',tree,'input',digest,'seconds',time.monotonic()-started,flush=True)
    results.append({'bundle':key,'status':'COMPLETE','rowCount':len(ee),'inputSha256':digest,'treeSha256':tree,'predictionPanel':dates[85],'predictionRows':len(sample),'independentFitSeconds':time.monotonic()-started})
report={'scope':'Independent spot refits of available first80 small lambda.35 bundles; not all24 fits audited','sourceHashes':{str(p):sha(p) for p in [pathlib.Path(__file__),old,E/'extra-features.ndjson',E/'kis-protocol.json',E/'kis-research.py',E/'fixed-models.py']},'fullObservedJoinRows':len(keys),'original18Parity':True,'strictRawLabelsFromPreviouslyAudited423Panels':True,'matrixPath':str(E/'independent-kis-inputs.npz'),'fits':results,'differences':differences,'newNaver2023_2024LabelsRead':False,'productionChanged':False}
(E/('independent-kis-first-B-model-audit.json' if only_B else 'independent-kis-first-model-audit.json')).write_text(json.dumps(report,indent=2,allow_nan=False))
print(json.dumps({'fits':results,'differences':differences}),flush=True)
assert not differences
