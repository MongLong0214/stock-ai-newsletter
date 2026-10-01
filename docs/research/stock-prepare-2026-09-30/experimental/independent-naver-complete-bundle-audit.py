"""All completed L5/L0/FP inputs, fitted structures and causal calibrators; no tree refits."""
import pathlib,time,json,hashlib
import numpy as np
import joblib
from sklearn.isotonic import IsotonicRegression
from independent_naver_common import *
dirs={'L5':(E/'naver/models',E/'naver/calibrators'),'L0':(E/'naver-l0/models',E/'naver-l0/calibrators'),'FP':(F/'naver-models',None)}
results=[];calresults=[];bundles={};started=time.monotonic()
for risk,(md,cd) in dirs.items():
    for path in sorted(md.rglob('*.json')):
        m=read(path);c=m['config'];dd=m['trainingDates'];epoch=path.parent.name;activation=m['activationDate']
        if 'TRAINfold' in epoch:
            n={1:150,2:350,3:550}[int(epoch[-1])];assert dd==train[:n] and activation==train[n+5]
        else:
            asof=epoch.removeprefix('FP-');assert asof in primary and asof==activation;assert dd==window(asof)[:460]
        assert all(calendar[ci[d]+5]<=activation for d in dd)
        assert m['provenance']['latestTrainingLabelMaturity']==calendar[ci[dd[-1]]+5] and m['provenance']['availableClosedAsOf']==activation
        xx,ee,g,w=parts(dd,c['inputCount'],risk);v,gains,grade=target(ee,c['lambda'])
        data=xx.tobytes()+ee.tobytes()+g.tobytes()+w.tobytes()+v.tobytes()
        if risk!='FP':data+=grade.tobytes()
        digest=hashlib.sha256(data).hexdigest();assert digest==m['trainingInputSha256'],(risk,epoch,m['bundleId'],'fit input')
        assert m['queryCounts']==g.tolist() and m['rowCount']==len(v) and m['sampleWeightMean']==float(w.mean()) and m['nativeMissingValues']==int(np.isnan(xx).sum())
        if risk!='FP':assert m['labelGain']==gains
        bundle=joblib.load(path.with_suffix('.joblib'));assert sha(path.with_suffix('.joblib'))==m['joblibSha256'];model=bundle['model']
        assert all(model.get_params()[k]==value for k,value in m['parameters'].items());assert model.n_iter_==m['parameters'].get('max_iter',m['parameters'].get('n_estimators'))
        if c['family']=='A':
            th=hashlib.sha256(b''.join(it[0].nodes.tobytes() for it in model._predictors)).hexdigest();assert th==m['treeInfo']['structuredNodesSha256'];assert float(model._baseline_prediction[0,0])==m['treeInfo']['baselinePrediction']
        else:
            th=hashlib.sha256(json.dumps(model.booster_.dump_model(),sort_keys=True,separators=(',',':')).encode()).hexdigest();assert th==m['treeInfo']['dumpModelSha256']
        bundles[(risk,epoch,m['bundleId'])]=bundle;results.append({'risk':risk,'epoch':epoch,'bundle':m['bundleId'],'rows':len(v),'inputSha256':digest,'treeSha256':th,'latestMaturity':calendar[ci[dd[-1]]+5],'activation':activation});print('BUNDLE_EXACT',risk,epoch,m['bundleId'],flush=True)
        del xx,data
    if cd is None:continue
    for path in sorted(cd.rglob('*.json')):
        m=read(path);c=m['config'];dd=m['OOFDates'];epoch=path.parent.name;activation=m['activationDate'];p=m['provenance'];bundle=bundles[(risk,epoch,p['sameLearnerBundle'])]
        assert p['sameLearnerTrainingDates']==bundle['trainingDates']
        if 'TRAINfold' in epoch:
            n={1:150,2:350,3:550}[int(epoch[-1])];assert dd==train[n+5:n+45] and activation==train[n+50]
        else:assert dd==window(epoch)[465:] and activation==epoch
        assert len(dd)==40 and dd==sorted(set(dd));assert all(calendar[ci[d]+5]<=activation and d>bundle['trainingDates'][-1] for d in dd)
        assert calendar[ci[bundle['trainingDates'][-1]]+5]<dd[0]
        parts_margin=[];parts_event=[];counts=[]
        for d in dd:
            mask=label(d)['strict'];pred=bundle['model'].predict(X[slice(*span(d)),:c['inputCount']]);parts_margin.append(pred[mask]);parts_event.append(events(d,risk)[mask]);counts.append(int(mask.sum()))
        margin=np.concatenate(parts_margin);ee=np.concatenate(parts_event);g=np.array(counts,dtype=np.int32);w=np.concatenate([np.full(int(k),len(ee)/(40*int(k)),dtype=np.float64) for k in g]);v,_,_=target(ee,c['lambda'])
        digest=hashlib.sha256(margin.tobytes()+ee.tobytes()+g.tobytes()+w.tobytes()+v.tobytes()).hexdigest();assert digest==m['trainingInputSha256'],(risk,epoch,'cal input')
        assert m['dateCounts']==g.tolist() and m['rows']==len(v)
        fitted=IsotonicRegression(increasing=True,out_of_bounds='clip',y_min=0,y_max=1).fit(margin,v,sample_weight=w);saved=joblib.load(path.with_suffix('.joblib'));assert sha(path.with_suffix('.joblib'))==m['joblibSha256']
        assert np.array_equal(fitted.X_thresholds_,saved['model'].X_thresholds_) and np.array_equal(fitted.y_thresholds_,saved['model'].y_thresholds_)
        assert m['xThresholds']==fitted.X_thresholds_.tolist() and m['expectedUtilityThresholds']==fitted.y_thresholds_.tolist()
        calresults.append({'risk':risk,'epoch':epoch,'calibrator':m['calibratorId'],'rows':len(v),'inputSha256':digest,'independentThresholdCount':len(fitted.X_thresholds_)});print('CAUSAL_ISOTONIC_EXACT',risk,epoch,flush=True)
report={'scope':'All completed NAVER L5/L0/FP actual model inputs/query/date weights/maturity/parameters/saved tree structures and independent full isotonic refits. Six actual tree spot refits are separate reports; not130 new tree fits.','models':results,'calibrators':calresults,'modelCount':len(results),'calibratorCount':len(calresults),'differences':[],'seconds':time.monotonic()-started,'newPrimaryLabelsReadOnlyAfterAllFiveWinnersFrozen':True,'productionChanges':0,'sourceTruthLimitation':'Conditional on frozen NAVER source; currentmaster/status/adjusted-vintage and KIS source transfer unproven','hashes':{str(p):sha(p) for p in [pathlib.Path(__file__),E/'independent_naver_common.py',C/'manifest.json',*winnerfiles]}}
(E/'independent-naver-complete-bundle-audit.json').write_text(json.dumps(report,indent=2,allow_nan=False));print('COMPLETE',len(results),len(calresults),flush=True)
