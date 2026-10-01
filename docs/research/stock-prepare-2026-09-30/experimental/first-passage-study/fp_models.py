"""The two fixed HGB FP utility models; reuse prior numeric fit/weight helpers."""
import importlib.util, pathlib, hashlib, json, time, itertools
import numpy as np
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor

ROOT=pathlib.Path('/tmp/composite-score-experimental-20260930')
s=importlib.util.spec_from_file_location('original_numeric_core',ROOT/'fixed-models.py')
original=importlib.util.module_from_spec(s);s.loader.exec_module(original)
CONFIGS=[{'family':'A','complexity':'small','lambda':.65,'inputCount':n,'id':'FP-A-small-lambda0.65-inputs'+str(n)} for n in [18,50]]
target_value=original.target_value
utility_array=original.utility_array
scores=original.scores

def fit_bundle(config,dates,activation,X,events,counts,directory,provenance):
    assert config in CONFIGS
    directory=pathlib.Path(directory);directory.mkdir(exist_ok=True,parents=True)
    params=original.fit_parameters(config);y=utility_array(config,events);groups,w=original.date_weights(counts)
    assert X.dtype==np.float64 and X.shape==(len(y),config['inputCount']) and int(groups.sum())==len(y)
    states=[{'T_safe':t,'L0_FP':l,'B':b,'V':target_value(config,t,b,l)} for t,l,b in itertools.product([0,1],repeat=3)]
    train_sha=hashlib.sha256(X.tobytes()+events.astype(np.uint8).tobytes()+groups.tobytes()+w.tobytes()+y.tobytes()).hexdigest()
    key=config['id']+'-prefix'+str(len(dates));path=directory/(key+'.joblib');mp=directory/(key+'.json')
    metadata={'bundleId':key,'config':config,'trainingDates':dates,'activationDate':activation,'parameters':params,'rowCount':len(y),'queryCount':len(dates),'queryCounts':groups.tolist(),'sampleWeightMean':float(w.mean()),'nativeMissingValues':int(np.isnan(X).sum()),'trainingInputSha256':train_sha,'eventColumnNames':['T_safe','B','L0_FP'],'jointFPUtilityStates':states,'scoreMeaning':'Expected joint first-passage favorable utility, not a single-event probability','targetRisk':'conservative first-passage exit proxy net < 0 after30bps','provenance':provenance}
    if path.exists() or mp.exists():
        assert path.exists() and mp.exists();saved=json.loads(mp.read_text());bundle=joblib.load(path)
        for k,v in metadata.items():assert saved[k]==v and bundle[k]==v,(key,k)
        assert original.sha(path)==saved['joblibSha256'];return bundle,saved
    print('FP_FIT_START',key,len(y),X.shape,flush=True);start=time.monotonic()
    model=HistGradientBoostingRegressor(**params);model.fit(X,y,sample_weight=w);assert model.n_iter_==100
    nodes=b''.join(iteration[0].nodes.tobytes() for iteration in model._predictors)
    metadata.update({'fitWallSeconds':time.monotonic()-start,'treeInfo':{'trees':model.n_iter_,'nodes':sum(len(it[0].nodes) for it in model._predictors),'structuredNodesSha256':hashlib.sha256(nodes).hexdigest(),'baselinePrediction':float(model._baseline_prediction[0,0])}})
    bundle={**metadata,'model':model};joblib.dump(bundle,path);metadata.update(joblibPath=str(path),joblibSha256=original.sha(path));mp.write_text(json.dumps(metadata,ensure_ascii=False,indent=2,allow_nan=False))
    print('FP_FIT_DONE',key,metadata['fitWallSeconds'],flush=True);return bundle,metadata
