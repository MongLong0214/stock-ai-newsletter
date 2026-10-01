# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import collections, hashlib, json, pathlib
import numpy as np
import joblib
from sklearn.ensemble import HistGradientBoostingClassifier
from threadpoolctl import threadpool_limits
B=pathlib.Path('/tmp/composite-score-research-20260930');W=B/'event-composite-study'
input_audit=json.loads(pathlib.Path('/tmp/composite-score-independent-event-input-audit-20260930.json').read_text())
data=np.load('/tmp/composite-score-independent-event-input-20260930.npz');X,Y,offsets=[data[k] for k in ['X','Y','offsets']]
heads=['touch','D1bullish','loss5'];params={'max_iter':100,'max_leaf_nodes':7,'max_depth':3,'min_samples_leaf':100,'learning_rate':.05,'l2_regularization':1,'early_stopping':False,'random_state':42,'loss':'log_loss','max_bins':255}
errors=collections.defaultdict(list);results={};predictions={}
def error(k,v):
    if len(errors[k])<20:errors[k].append(v)
with threadpool_limits(limits=1):
    for scope,n in [('first150',150),('all235',235)]:
        model=joblib.load(W/(scope+'-model.joblib'));metadata=json.loads((W/(scope+'-model-meta.json')).read_text());ia=input_audit['models'][scope]
        ix=np.flatnonzero((np.arange(len(X))<offsets[n]) & (Y[:,0]>=0));tx=X[ix];ty=Y[ix];weights=np.zeros(len(ix));at=0
        for k in range(n):
            nn=int(np.count_nonzero((ix>=offsets[k]) & (ix<offsets[k+1])));weights[at:at+nn]=len(ix)/(n*nn);at+=nn
        digest=hashlib.sha256(tx.tobytes()+weights.tobytes()+b''.join(np.ascontiguousarray(ty[:,j]).tobytes() for j in range(3))).hexdigest()
        if digest!=model['trainingInputSha256'] or digest!=metadata['trainingInputSha256']:error('independentTrainingInputHash',[scope,digest,model['trainingInputSha256']])
        if model['parameters']!=params or metadata['parameters']!=params or model['featureNames']!=input_audit['featureOrder']:error('frozenParametersFeatures',scope)
        for key in ['trainingRows','activationDate','lastLabelMaturity']:
            expected=ia[key] if key in ia else None
            if expected!=model[key] or metadata[key]!=model[key]:error('trainingMetadata',[scope,key,expected,model[key]])
        if model['trainingDates']!=input_audit['signalDates'][:n]:error('trainingDates',scope)
        rows={}
        for j,h in enumerate(heads):
            saved=model['heads'][h]
            if saved.n_iter_!=100 or list(saved.classes_)!=[0,1] or any(saved.get_params()[k]!=v for k,v in params.items()):error('headParameters',[scope,h])
            refit=HistGradientBoostingClassifier(**params);refit.fit(tx,ty[:,j],sample_weight=weights)
            node_diff=[];max_value_diff=0.
            if not np.array_equal(saved._baseline_prediction,refit._baseline_prediction):error('baselineLogitExact',[scope,h])
            for i,(ss,rr) in enumerate(zip(saved._predictors,refit._predictors)):
                if len(ss)!=1 or len(rr)!=1:error('binaryTreeShape',[scope,h,i]);continue
                for field in ss[0].nodes.dtype.names:
                    if not np.array_equal(ss[0].nodes[field],rr[0].nodes[field],equal_nan=True):node_diff.append([i,field])
                max_value_diff=max(max_value_diff,float(np.max(np.abs(ss[0].nodes['value']-rr[0].nodes['value']))) if len(ss[0].nodes)==len(rr[0].nodes) else float('inf'))
            if node_diff:error('independentHeadRefitNodes',[scope,h,node_diff[:20],len(node_diff),max_value_diff])
            rows[h]={'positiveCount':int(ty[:,j].sum()),'baselineLogit':float(saved._baseline_prediction[0,0]),'nodeFieldDifferences':len(node_diff),'maxLeafValueDifference':max_value_diff,'iterations':refit.n_iter_}
            print('INDEPENDENT_HEAD',scope,h,rows[h],flush=True)
        px=X[:offsets[235]] if scope=='first150' else X[offsets[235]:]
        predictions[scope]=np.column_stack([model['heads'][h].predict_proba(px)[:,1] for h in heads])
        results[scope]={'trainingRows':len(ix),'combinedIndependentXWeightYsha256':digest,'heads':rows,'maturity':ia['lastLabelMaturity'],'activation':ia['activationDate'],'modelJoblibSha256':hashlib.file_digest((W/(scope+'-model.joblib')).open('rb'),'sha256').hexdigest()}
np.savez('/tmp/composite-score-independent-event-predictions-20260930.npz',**predictions)
out=pathlib.Path('/tmp/composite-score-independent-event-model-audit-20260930.json')
out.write_text(json.dumps({'scope':'Exact independent reproduction of ONLY six already-frozen HGB heads (two prescribed scopes), using independently built18observed feature arrays/raw mature labels/date-balanced weights. No family or parameter selection, external labels, output adjustment or repo writes. All fitted tree fields compared to owner joblib models.','fits':results,'differences':dict(errors),'predictorCacheScope':'first150 over earlier235; all235 over outer181; no future labels used in predictions','inputAudit':str(pathlib.Path('/tmp/composite-score-independent-event-input-audit-20260930.json'))},ensure_ascii=False,indent=2)+'\n')
print('DONE',out,'differences',dict(errors),flush=True)
if errors:raise SystemExit(1)
