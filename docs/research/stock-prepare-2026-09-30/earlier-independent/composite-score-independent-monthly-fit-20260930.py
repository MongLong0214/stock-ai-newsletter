# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import hashlib,json,pathlib
import joblib,numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
B=pathlib.Path('/tmp/composite-score-research-20260930/monthly-adaptive-study');assert hashlib.sha256((B/'monthly-plan.txt').read_bytes()).hexdigest()=='4c2e51f8e1ec46760e58e1fc1bc5dffb27c266a96d4ce6649e26ceab556dd9bc'
OUT=pathlib.Path('/tmp/composite-score-independent-monthly-models-20260930');OUT.mkdir(exist_ok=True)
def read(p):return json.loads(pathlib.Path(p).read_text())
ia=read('/tmp/composite-score-independent-monthly-input-audit-20260930.json');dates=ia['signalDates'];calendar=ia['calendar'];ci={d:i for i,d in enumerate(calendar)};index={d:i for i,d in enumerate(dates)};data=np.load('/tmp/composite-score-independent-monthly-input-20260930.npz');X,Y,offsets=[data[k] for k in ['X','Y','offsets']];old=read('/tmp/composite-score-independent-event-input-audit-20260930.json')['signalDates'];scopes={'inner':old[155:235],'outer':old[235:]};heads=['touch','D1bullish','loss5'];params={'max_iter':100,'max_leaf_nodes':7,'max_depth':3,'min_samples_leaf':100,'learning_rate':.05,'l2_regularization':1,'early_stopping':False,'random_state':42,'loss':'log_loss','max_bins':255};bundles=[]
for scope,ds in scopes.items():
 activations=[d for j,d in enumerate(ds) if j==0 or d[:7]!=ds[j-1][:7]]
 for asof in activations:
  end=ci[asof]-5;train=calendar[end-149:end+1];assert len(train)==150 and all(d in index for d in train) and all(calendar[ci[d]+5]<=asof for d in train)
  ix=[];date_counts=[]
  for d in train:
   lo,hi=map(int,offsets[index[d]:index[d]+2]);valid=np.arange(lo,hi)[Y[lo:hi,0]>=0];assert len(valid)>0;ix.extend(valid.tolist());date_counts.append({'date':d,'eligible':hi-lo,'strict':len(valid),'unknown':hi-lo-len(valid),'maturityDate':calendar[ci[d]+5]})
  ix=np.array(ix);xx,yy=X[ix],Y[ix];weights=np.concatenate([np.full(c['strict'],len(ix)/(150*c['strict'])) for c in date_counts]);assert abs(weights.mean()-1)<1e-12
  name=scope+'-'+asof;meta={'scope':scope,'activation':asof,'trainDates':train,'dateCounts':date_counts,'trainingRows':len(ix),'lastLabelMaturity':asof,'params':params,'sourceInputSha256':hashlib.sha256(xx.tobytes()).hexdigest(),'sourceLabelsSha256':hashlib.sha256(yy.tobytes()).hexdigest(),'sourceWeightSha256':hashlib.sha256(weights.tobytes()).hexdigest(),'trainingCombinedSha256':hashlib.sha256(xx.tobytes()+weights.tobytes()+b''.join(yy[:,h].tobytes() for h in range(3))).hexdigest(),'nativeNaNByFeature':dict(zip(ia['featureOrder'],np.isnan(xx).sum(axis=0).tolist())),'headMetadata':{}}
  models={};print('INDEPENDENT_MONTHLY_FIT_START',name,len(ix),flush=True)
  for h,head in enumerate(heads):
   model=HistGradientBoostingClassifier(**params).fit(xx,yy[:,h],sample_weight=weights);assert model.n_iter_==100 and model.classes_.tolist()==[0,1];models[head]=model
   meta['headMetadata'][head]={'positiveCount':int(yy[:,h].sum()),'pooledPrior':float(yy[:,h].mean()),'dateBalancedPrior':float(np.average(yy[:,h],weights=weights)),'baselineLogit':float(model._baseline_prediction[0,0]),'iterations':100,'allStructuredTreesSha256':hashlib.sha256(b''.join(t[0].nodes.tobytes() for t in model._predictors)).hexdigest()}
   print('INDEPENDENT_HEAD_READY',name,head,meta['headMetadata'][head]['allStructuredTreesSha256'],flush=True)
  joblib.dump({'heads':models,'meta':meta},OUT/(name+'.joblib'));(OUT/(name+'.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n');bundles.append(meta)
  (OUT/'completed-bundles.json').write_text(json.dumps({'planSha256':hashlib.sha256((B/'monthly-plan.txt').read_bytes()).hexdigest(),'independentExactRefitsOnly':True,'noNewHyperparametersOrPolicies':True,'completed':bundles},ensure_ascii=False,indent=2)+'\n')
assert len(bundles)==15
print('ALL15_INDEPENDENT_BUNDLES_READY',OUT,flush=True)
