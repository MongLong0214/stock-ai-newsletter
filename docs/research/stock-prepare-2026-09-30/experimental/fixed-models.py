"""The frozen 24 configurations and learner/calibrator mechanics; no data loading."""
import hashlib,json,itertools,pathlib,time
import numpy as np
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression
from lightgbm import LGBMRanker

COMPLEXITY={'small':(100,7,3,100,1),'medium':(200,15,4,200,5)}
LAMBDAS=[.35,.65,1.0]
CONFIGS=[{'family':f,'complexity':c,'lambda':lam,'inputCount':n,'id':f+'-'+c+'-lambda'+str(lam)+'-inputs'+str(n)} for f,c,lam,n in itertools.product(['A','B'],COMPLEXITY,LAMBDAS,[18,50])]
assert len(CONFIGS)==24

def sha(p):
    with pathlib.Path(p).open('rb') as h:return hashlib.file_digest(h,'sha256').hexdigest()

def target_value(config,t,b,loss5):
    return (.8*t+.2*b+config['lambda']*(1-loss5))/(1+config['lambda'])

def grade_mapping(config):
    states=[{'T':t,'L5':l,'B':b,'V':target_value(config,t,b,l)} for t,l,b in itertools.product([0,1],repeat=3)]
    gains=sorted(set(x['V'] for x in states))
    for x in states:x['grade']=gains.index(x['V'])
    return states,gains

def utility_array(config,events):
    """Canonical scalar eight-state table avoids changes in floating grouping."""
    states,_=grade_mapping(config)
    lookup=np.array([target_value(config,(i>>2)&1,i&1,(i>>1)&1) for i in range(8)])
    bits=events[:,0].astype(np.uint8)*4+events[:,2].astype(np.uint8)*2+events[:,1].astype(np.uint8)
    return lookup[bits]

def fit_parameters(config):
    it,leaf,depth,minleaf,l2=COMPLEXITY[config['complexity']]
    if config['family']=='A':return {'loss':'squared_error','max_iter':it,'max_leaf_nodes':leaf,'max_depth':depth,'min_samples_leaf':minleaf,'l2_regularization':l2,'learning_rate':.05,'max_bins':255,'random_state':42,'early_stopping':False}
    _,gains=grade_mapping(config)
    return {'objective':'lambdarank','boosting_type':'gbdt','n_estimators':it,'num_leaves':leaf,'max_depth':depth,'min_child_samples':minleaf,'reg_lambda':l2,'learning_rate':.05,'max_bin':255,'random_state':42,'n_jobs':4,'deterministic':True,'force_col_wise':True,'lambdarank_norm':True,'lambdarank_truncation_level':6,'label_gain':gains,'metric':'None','subsample':1,'subsample_freq':0,'colsample_bytree':1,'verbosity':-1}

def date_weights(counts):
    counts=np.array(counts,dtype=np.int32);assert np.all(counts>0)
    n=int(counts.sum());d=len(counts)
    weight=np.concatenate([np.full(int(k),n/(d*int(k)),dtype=np.float64) for k in counts]);assert abs(weight.mean()-1)<1e-12
    return counts,weight

def fit_bundle(config,dates,activation,X,events,counts,directory,provenance):
    directory=pathlib.Path(directory);directory.mkdir(exist_ok=True,parents=True)
    params=fit_parameters(config);y=utility_array(config,events);groups,w=date_weights(counts)
    assert X.dtype==np.float64 and X.shape==(len(y),config['inputCount']) and int(groups.sum())==len(y)
    states,gains=grade_mapping(config);grades=np.array([gains.index(v) for v in y],dtype=np.int32)
    train_sha=hashlib.sha256(X.tobytes()+events.astype(np.uint8).tobytes()+groups.tobytes()+w.tobytes()+y.tobytes()+grades.tobytes()).hexdigest()
    key=config['id']+'-prefix'+str(len(dates));path=directory/(key+'.joblib');mp=directory/(key+'.json')
    metadata={'bundleId':key,'config':config,'trainingDates':dates,'activationDate':activation,'parameters':params,'rowCount':len(y),'queryCount':len(dates),'queryCounts':groups.tolist(),'sampleWeightMean':float(w.mean()),'nativeMissingValues':int(np.isnan(X).sum()),'trainingInputSha256':train_sha,'stateGrades':states,'labelGain':gains,'provenance':provenance}
    if path.exists() or mp.exists():
        assert path.exists() and mp.exists(),'Incomplete model cannot be overwritten'
        saved=json.loads(mp.read_text());bundle=joblib.load(path)
        for k,v in metadata.items():assert saved[k]==v and bundle[k]==v,(key,k,'Saved model provenance changed')
        assert sha(path)==saved['joblibSha256']
        print('LOAD_EXACT_MODEL',key,flush=True);return bundle,saved
    print('FIT_START',key,len(y),X.shape,'queries',len(dates),flush=True);start=time.monotonic()
    if config['family']=='A':
        model=HistGradientBoostingRegressor(**params);model.fit(X,y,sample_weight=w)
        assert model.n_iter_==params['max_iter']
        tree_bytes=b''.join(iteration[0].nodes.tobytes() for iteration in model._predictors)
        tree_info={'trees':model.n_iter_,'nodes':sum(len(iteration[0].nodes) for iteration in model._predictors),'structuredNodesSha256':hashlib.sha256(tree_bytes).hexdigest(),'baselinePrediction':float(model._baseline_prediction[0,0])}
    else:
        model=LGBMRanker(**params);model.fit(X,grades,group=groups,sample_weight=w,feature_name=['observed'+str(j) for j in range(config['inputCount'])])
        assert model.n_iter_==params['n_estimators']
        tree_json=json.dumps(model.booster_.dump_model(),sort_keys=True,separators=(',',':'))
        tree_info={'trees':model.n_iter_,'dumpModelSha256':hashlib.sha256(tree_json.encode()).hexdigest(),'nativeBoosterParameters':model.booster_.params}
    metadata.update({'fitWallSeconds':time.monotonic()-start,'treeInfo':tree_info});bundle={**metadata,'model':model}
    joblib.dump(bundle,path);metadata['joblibPath']=str(path);metadata['joblibSha256']=sha(path);mp.write_text(json.dumps(metadata,ensure_ascii=False,indent=2,allow_nan=False))
    print('FIT_DONE',key,metadata['fitWallSeconds'],flush=True);return bundle,metadata

def fit_calibrator(config,dates,margin_parts,event_parts,counts,directory,key,activation,provenance):
    assert config['family']=='B';directory=pathlib.Path(directory);directory.mkdir(exist_ok=True,parents=True)
    margins=np.concatenate(margin_parts).astype(np.float64);events=np.concatenate(event_parts).astype(np.uint8);y=utility_array(config,events);groups,w=date_weights(counts)
    assert len(y)==len(margins)==int(groups.sum()) and np.isfinite(margins).all()
    data_sha=hashlib.sha256(margins.tobytes()+events.tobytes()+groups.tobytes()+w.tobytes()+y.tobytes()).hexdigest()
    path=directory/(key+'.joblib');mp=directory/(key+'.json')
    metadata={'calibratorId':key,'config':config,'OOFDates':dates,'activationDate':activation,'rows':len(y),'dateCount':len(dates),'dateCounts':groups.tolist(),'sampleWeightMean':float(w.mean()),'trainingInputSha256':data_sha,'parameters':{'increasing':True,'out_of_bounds':'clip','y_min':0,'y_max':1},'provenance':provenance}
    if path.exists() or mp.exists():
        assert path.exists() and mp.exists();saved=json.loads(mp.read_text());bundle=joblib.load(path)
        for k,v in metadata.items():assert saved[k]==v and bundle[k]==v,(key,k)
        assert sha(path)==saved['joblibSha256'];return bundle,saved
    model=IsotonicRegression(**metadata['parameters']);model.fit(margins,y,sample_weight=w)
    metadata['xThresholds']=model.X_thresholds_.tolist();metadata['expectedUtilityThresholds']=model.y_thresholds_.tolist();bundle={**metadata,'model':model}
    joblib.dump(bundle,path);metadata['joblibPath']=str(path);metadata['joblibSha256']=sha(path);mp.write_text(json.dumps(metadata,ensure_ascii=False,indent=2,allow_nan=False))
    print('CALIBRATION_FIT',key,len(y),len(model.X_thresholds_),flush=True);return bundle,metadata

def scores(config,raw_prediction,calibrator=None):
    expected=np.asarray(raw_prediction,dtype=np.float64) if config['family']=='A' else calibrator['model'].predict(raw_prediction)
    clipped=np.clip(expected,0,1);ss=np.floor(100*clipped+.5).astype(np.int32)
    assert np.isfinite(expected).all() and np.all((ss>=0)&(ss<=100))
    return ss,clipped
