# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1", "lightgbm==4.7.0"]
# ///
"""All L5 bundle input/maturity/hash checks and independent OOF isotonic refits."""
import json,pathlib,hashlib,itertools,time
import numpy as np
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression
from lightgbm import LGBMRanker
E=pathlib.Path('/tmp/composite-score-experimental-20260930')
def sha(p):
    with pathlib.Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
z=np.load(E/'independent-kis-inputs.npz');X=z['X'];Y=z['Y'];offsets=z['offsets']
info=json.loads(pathlib.Path('/tmp/composite-score-independent-monthly-input-audit-20260930.json').read_text())
dates=info['signalDates'];pos={d:i for i,d in enumerate(dates)};calendar=info['calendar'];ci={d:i for i,d in enumerate(calendar)}
errors=[];models={};results=[];calResults=[]
def check(ok,k,detail=None):
    if not ok:errors.append({'check':k,'detail':detail})
def parts(dd,n):
    xx=[];ee=[];count=[]
    for d in dd:
        i=pos[d];a,b=map(int,offsets[i:i+2]);mask=np.all(Y[a:b]>=0,axis=1)
        xx.append(X[a:b][mask,:n]);ee.append(Y[a:b][mask].astype(np.uint8));count.append(int(mask.sum()))
    return xx,ee,np.array(count,dtype=np.int32)
def weights(groups):return np.concatenate([np.full(int(n),int(groups.sum())/(len(groups)*int(n)),dtype=np.float64) for n in groups])
def targets(ee,lam):
    table=np.array([(.8*((i>>2)&1)+.2*(i&1)+lam*(1-((i>>1)&1)))/(1+lam) for i in range(8)])
    gains=sorted(set(float(v) for v in table));v=table[4*ee[:,0]+2*ee[:,2]+ee[:,1]]
    grade=np.array([gains.index(float(q)) for q in v],dtype=np.int32)
    return v,gains,grade
for f in sorted((E/'kis-models').glob('*.json')):
    m=json.loads(f.read_text());c=m['config'];dd=m['trainingDates'];xx,ee,g=parts(dd,c['inputCount']);xx=np.concatenate(xx);ee=np.concatenate(ee);w=weights(g);v,gains,grade=targets(ee,c['lambda'])
    digest=hashlib.sha256(xx.tobytes()+ee.tobytes()+g.tobytes()+w.tobytes()+v.tobytes()+grade.tobytes()).hexdigest();k=m['bundleId'];jp=f.with_suffix('.joblib');bundle=joblib.load(jp);models[k]=bundle
    check(dd==dates[:len(dd)],k+' prefix dates');check(all(calendar[ci[d]+5]<m['activationDate'] for d in dd),k+' all causal label maturities')
    check(m['trainingInputSha256']==digest,k+' independent full inputs',digest);check(m['queryCounts']==g.tolist() and m['rowCount']==len(v),k+' strict query counts');check(m['sampleWeightMean']==float(w.mean()),k+' equal date mean1')
    check(m['labelGain']==gains,k+' gain order');check(m['nativeMissingValues']==int(np.isnan(xx).sum()),k+' nativeNaN retain');check(m['joblibSha256']==sha(jp),k+' saved joblib')
    check(all(bundle['model'].get_params()[p]==val for p,val in m['parameters'].items()),k+' actual estimator params')
    check(bundle['model'].n_iter_==m['parameters'].get('max_iter',m['parameters'].get('n_estimators')),k+' complete iterations')
    if c['family']=='A':
        tree=hashlib.sha256(b''.join(q[0].nodes.tobytes() for q in bundle['model']._predictors)).hexdigest();check(tree==m['treeInfo']['structuredNodesSha256'],k+' saved all tree bytes')
    else:
        dump=json.dumps(bundle['model'].booster_.dump_model(),sort_keys=True,separators=(',',':'));check(hashlib.sha256(dump.encode()).hexdigest()==m['treeInfo']['dumpModelSha256'],k+' saved all tree dump')
    results.append({'bundle':k,'rows':len(v),'nativeNaNs':int(np.isnan(xx).sum()),'inputHash':digest,'latestMaturity':calendar[ci[dd[-1]]+5],'activation':m['activationDate']})
    print('INPUT_CHECK',k,len(v),flush=True)
for f in sorted((E/'kis-calibrators').glob('*.json')):
    m=json.loads(f.read_text());c=m['config'];dd=m['OOFDates'];sources=m['provenance']['OOFPredictionSources'];margin=[];ep=[];counts=[];k=m['calibratorId']
    check([s['date'] for s in sources]==dd,k+' prediction sources date order');check(len(set(dd))==len(dd) and dd==sorted(dd),k+' unique chronological dates')
    for s in sources:
        d=s['date'];i=pos[d];a,b=map(int,offsets[i:i+2]);mask=np.all(Y[a:b]>=0,axis=1);bundle=models[s['bundleId']]
        check(bundle['trainingDates'][-1]<d and calendar[ci[bundle['trainingDates'][-1]]+5]<d,k+' OOF learner '+d)
        check(calendar[ci[d]+5]<m['activationDate'],k+' calibration maturity '+d)
        margin.append(bundle['model'].predict(X[a:b][mask,:c['inputCount']]));ep.append(Y[a:b][mask].astype(np.uint8));counts.append(int(mask.sum()))
    mm=np.concatenate(margin);ee=np.concatenate(ep);g=np.array(counts,dtype=np.int32);w=weights(g);v,_,_=targets(ee,c['lambda'])
    digest=hashlib.sha256(mm.astype(np.float64).tobytes()+ee.tobytes()+g.tobytes()+w.tobytes()+v.tobytes()).hexdigest();check(digest==m['trainingInputSha256'],k+' OOF input hash',digest)
    check(m['dateCounts']==g.tolist() and m['rows']==len(v),k+' strict calibration query counts')
    fitted=IsotonicRegression(increasing=True,out_of_bounds='clip',y_min=0,y_max=1).fit(mm,v,sample_weight=w)
    saved=joblib.load(f.with_suffix('.joblib'));check(sha(f.with_suffix('.joblib'))==m['joblibSha256'],k+' saved joblib')
    check(np.array_equal(fitted.X_thresholds_,saved['model'].X_thresholds_) and np.array_equal(fitted.y_thresholds_,saved['model'].y_thresholds_),k+' independent complete isotonic thresholds')
    calResults.append({'calibrator':k,'dates':len(dd),'rows':len(v),'inputHash':digest,'independentThresholdCount':len(fitted.X_thresholds_)})
    print('ISOTONIC_REFIT',k,len(dd),len(v),flush=True)
report={'scope':'All L5 saved model inputs/maturity/actual estimator params; independent OOF predictions and all26 isotonic refits. Model tree refits only separate four spot audits.','models':results,'calibrators':calResults,'differences':errors,'sourceHashes':{str(p):sha(p) for p in [pathlib.Path(__file__),E/'kis-input-freeze.json',E/'kis-protocol.json',E/'kis-research.py',E/'fixed-models.py']},'newNaver2023_2024LabelsRead':False,'productionChanged':False}
(E/'independent-kis-bundle-audit.json').write_text(json.dumps(report,indent=2,allow_nan=False));print('DIFFERENCES',len(errors),flush=True);assert not errors
