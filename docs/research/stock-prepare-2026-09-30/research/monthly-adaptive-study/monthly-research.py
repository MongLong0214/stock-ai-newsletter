# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import pathlib,json,hashlib,math,statistics,datetime
import numpy as np
import joblib
from sklearn.ensemble import HistGradientBoostingClassifier

BASE=pathlib.Path('/tmp/composite-score-research-20260930');EVENT=BASE/'event-composite-study';OUT=BASE/'monthly-adaptive-study';PLAN=OUT/'monthly-plan.txt'
PLAN_HASH='4c2e51f8e1ec46760e58e1fc1bc5dffb27c266a96d4ce6649e26ceab556dd9bc'
event_source=(EVENT/'event-research.py').read_text();data_prefix=event_source.split('\nFEATURE_NAMES=')[0]
data_prefix=data_prefix.replace("OUT=BASE/'event-composite-study'","OUT=BASE/'monthly-adaptive-study'").replace("PLAN=OUT/'event-plan.txt'","PLAN=OUT/'monthly-plan.txt'").replace('eef81c7d88c58ffc52545d4d4e1d734e1bef35ef7d61dd82e9cf20a7bd9c7ea5',PLAN_HASH).replace("['weight-study','atom-study','raw-composite-study']","['weight-study','atom-study','raw-composite-study','event-composite-study','balanced-event-study','regime-train-study','prior-shift-study','bounded-objective-study']")
exec(compile(data_prefix,str(EVENT/'event-research.py')+'#monthly-readonly-loader','exec'),globals())
FEATURE_NAMES=json.loads((EVENT/'report.json').read_text())['featureNames'];assert len(FEATURE_NAMES)==18
HEAD_NAMES=['touch','D1bullish','loss5'];EPS=1e-6;LAMBDA=.65
PARAMS={'max_iter':100,'max_leaf_nodes':7,'max_depth':3,'min_samples_leaf':100,'learning_rate':.05,'l2_regularization':1,'early_stopping':False,'random_state':42,'loss':'log_loss','max_bins':255}
assert PARAMS==json.loads((EVENT/'report.json').read_text())['parameters']
extra=BASE/'calibration-extra';extra_gate=load_gate(extra/'runtime-eligibility.ndjson');context={}
for line in (extra/'context.ndjson').open():
    x=json.loads(line);d=x['date'];s=x['symbol']
    if s in extra_gate[d]:
        c=x['context'];context[(d,s)]=tuple(c.get(k) for k in ['chaikinMoneyFlow21','distanceFromPriorHigh20Percent','bollingerWidth20Percent','return5Percent','return20Percent','return60Percent','closeLocation','upperWickRatio','benchmarkReturn20Percent','breadthAboveSma20'])
extra_rows={d:[] for d in extra_gate}
for line in (extra/'wide.ndjson').open():
    x=json.loads(line);d=x['date'];s=x['symbol']
    if s in extra_gate[d]:
        assert (d,s) in context
        p=point(d,x,x['signals'],'calibration-extra');p['outcome']=outcome(s,d);extra_rows[d].append(p)
del context
calrows={**rows,**extra_rows};caldates=sorted(calrows)
assert len(caldates)==423 and caldates==days[di[caldates[0]]:di[caldates[-1]]+1]
for d,pp in calrows.items():
    expected=extra_gate[d] if d in extra_gate else all_gate[d]
    assert set(p['symbol'] for p in pp)==expected
    for p in pp:p['outcome']=p.get('outcome') or outcome(p['symbol'],d)
prior_panel_file=BASE/'prior-shift-study/calibration-panel-prevalences.json';saved_panels=json.loads(prior_panel_file.read_text())['panels'];panel={p['signalDate']:p for p in saved_panels}
for d,pp in calrows.items():
    oo=[p['outcome'] for p in pp if p['outcome']['strictLabelValid']]
    assert len(oo)==panel[d]['strictLabelCount']
    actual=[statistics.mean(o['touch'] for o in oo),statistics.mean(o['entryBullish'] for o in oo),statistics.mean(o['net5d']<=-.05 for o in oo)] if oo else None
    assert actual is None and panel[d]['prevalence'] is None or actual==[panel[d]['prevalence'][h] for h in HEAD_NAMES]
saved_priors=json.loads((BASE/'prior-shift-study/asof-prior-shifts.json').read_text())['days'];prior_windows={(p['modelScope'],p['closedAsOfSignalDate']):p for p in saved_priors}
models={};bundle_meta=[];prediction_cache={};daily_prior=[];score_mass=[];fit_sequence=[]
(OUT/'bundles').mkdir(exist_ok=True)

def input_array(pp):return np.array([[v if finite(v) else np.nan for v in p['atoms']] for p in pp],dtype=np.float64)
def logit(v):
    v=np.clip(v,EPS,1-EPS);return np.log(v)-np.log1p(-v)
def fit_bundle(scope,activation):
    end=di[activation]-5;ds=days[end-149:end+1]
    assert len(ds)==150 and all(d in calrows and panel[d]['strictLabelCount']>0 for d in ds),'Do not compress missing TRAIN panels'
    assert all(panel[d]['maturityDate'] is not None and panel[d]['maturityDate']<=activation for d in ds)
    pp=[p for d in ds for p in calrows[d] if p['outcome']['strictLabelValid']]
    counts={d:panel[d]['strictLabelCount'] for d in ds};n=len(pp)
    xx=input_array(pp);ww=np.array([n/(150*counts[p['date']]) for p in pp],dtype=np.float64)
    labels={'touch':np.array([p['outcome']['touch'] for p in pp],dtype=np.uint8),'D1bullish':np.array([p['outcome']['entryBullish'] for p in pp],dtype=np.uint8),'loss5':np.array([p['outcome']['net5d']<=-.05 for p in pp],dtype=np.uint8)}
    train_prior={h:statistics.mean(panel[d]['prevalence'][h] for d in ds) for h in HEAD_NAMES}
    assert abs(float(ww.mean())-1)<1e-12
    for h in HEAD_NAMES:assert abs(float(np.average(labels[h],weights=ww))-train_prior[h])<1e-12
    bundle_id=scope+'-'+activation;metadata={'bundleId':bundle_id,'scope':scope,'activationClosedAsOf':activation,'trainingSignalDates':ds,'trainingWindowPanels':150,'trainingStrictCounts':counts,'trainingRows':n,'unknownLabelsExcludedOnlyTraining':sum(len(calrows[d])-counts[d] for d in ds),'trainPrior':train_prior,'latestTrainingLabelMaturity':max(panel[d]['maturityDate'] for d in ds),'allTrainingLabelsMatureByActivation':True,'sampleWeightMean':float(ww.mean()),'featureNames':FEATURE_NAMES,'parameters':PARAMS,'nativeMissingInputCount':int(np.isnan(xx).sum()),'trainingInputSha256':hashlib.sha256(xx.tobytes()+ww.tobytes()+b''.join(labels[h].tobytes() for h in HEAD_NAMES)).hexdigest(),'heads':{}}
    fit_sequence.append(bundle_id);fitted={};path=OUT/'bundles'/(bundle_id+'.joblib');metapath=OUT/'bundles'/(bundle_id+'.json')
    if path.exists() or metapath.exists():
        assert path.exists() and metapath.exists(),'Incomplete saved bundle must not be silently overwritten'
        saved=json.loads(metapath.read_text());bundle=joblib.load(path)
        for k,v in metadata.items():
            if k!='heads':assert saved[k]==v and bundle[k]==v,(bundle_id,k,'Saved bundle provenance mismatch')
        assert sha(path)==saved['joblibSha256']
        for h in HEAD_NAMES:
            model=bundle['models'][h];assert model.get_params()==HistGradientBoostingClassifier(**PARAMS).get_params() and model.n_iter_==100
            expected={'positiveCount':int(labels[h].sum()),'dateBalancedPrior':train_prior[h],'baselineLogit':float(model._baseline_prediction[0,0]),'treeCount':100,'nodeCount':sum(len(it[0].nodes) for it in model._predictors),'structuredTreeNodesSha256':hashlib.sha256(b''.join(it[0].nodes.tobytes() for it in model._predictors)).hexdigest()}
            assert saved['heads'][h]==expected and bundle['heads'][h]==expected
        models[bundle_id]=bundle;bundle_meta.append(saved);print('LOAD_EXACT_SAVED_BUNDLE',bundle_id,saved['joblibSha256'],flush=True)
        return bundle
    print('FIT_BUNDLE_START',bundle_id,n,ds[0],ds[-1],metadata['latestTrainingLabelMaturity'],flush=True)
    for h in HEAD_NAMES:
        model=HistGradientBoostingClassifier(**PARAMS);model.fit(xx,labels[h],sample_weight=ww);assert model.n_iter_==100
        fitted[h]=model;node_bytes=b''.join(it[0].nodes.tobytes() for it in model._predictors)
        metadata['heads'][h]={'positiveCount':int(labels[h].sum()),'dateBalancedPrior':train_prior[h],'baselineLogit':float(model._baseline_prediction[0,0]),'treeCount':100,'nodeCount':sum(len(it[0].nodes) for it in model._predictors),'structuredTreeNodesSha256':hashlib.sha256(node_bytes).hexdigest()}
        print('FIT_HEAD_DONE',bundle_id,h,flush=True)
    bundle={**metadata,'models':fitted};path=OUT/'bundles'/(bundle_id+'.joblib');joblib.dump(bundle,path);metadata['joblibPath']=str(path);metadata['joblibSha256']=sha(path)
    (OUT/'bundles'/(bundle_id+'.json')).write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
    models[bundle_id]=bundle;bundle_meta.append(metadata);print('FIT_BUNDLE_DONE',bundle_id,flush=True)
    return bundle

def prepare_predictions(scope,d,bundle):
    pp=rows[d];xx=input_array(pp);praw=np.column_stack([bundle['models'][h].predict_proba(xx)[:,1] for h in HEAD_NAMES])
    old_scope='first150' if scope=='inner' else 'all235';window=prior_windows[(old_scope,d)]
    assert window['maxIncludedMaturityDate']<=d
    recent=window['equalDateRecentPrior'];shift=np.array([float(logit(recent[h])-logit(bundle['trainPrior'][h])) for h in HEAD_NAMES])
    adjusted=1/(1+np.exp(-(logit(praw)+shift)))
    ssraw=100*((.8*adjusted[:,0]+.2*adjusted[:,1])+LAMBDA*(1-adjusted[:,2]))/(1+LAMBDA)
    ss=np.floor(ssraw+.5).astype(int);assert np.all((ss>=0)&(ss<=100))
    prediction_cache[(scope,d)]={p['symbol']:(int(s),float(v),dict(zip(HEAD_NAMES,map(float,pr))),dict(zip(HEAD_NAMES,map(float,pa)))) for p,s,v,pr,pa in zip(pp,ss,ssraw,praw,adjusted)}
    current={'signalDate':d,'scope':scope,'bundleId':bundle['bundleId'],'activationClosedAsOf':bundle['activationClosedAsOf'],'modelAgeCalendarDays':(datetime.date.fromisoformat(d)-datetime.date.fromisoformat(bundle['activationClosedAsOf'])).days,'modelAgeTradingSignalDays':di[d]-di[bundle['activationClosedAsOf']],'latestTrainingLabelMaturity':bundle['latestTrainingLabelMaturity'],'bundleTrainPrior':bundle['trainPrior'],'recent20Prior':recent,'logitShift':dict(zip(HEAD_NAMES,map(float,shift))),'panels':window['panels'],'maxCalibrationMaturity':window['maxIncludedMaturityDate']}
    daily_prior.append(current);return current

def run_adaptive(scope,ds,activation):
    recent=[];daily=[];bundle=None
    for idx,d in enumerate(ds):
        active=idx>=activation
        if active and (bundle is None or bundle['activationClosedAsOf'][:7]!=d[:7]):bundle=fit_bundle(scope,d)
        pr=prepare_predictions(scope,d,bundle) if active else None
        excluded={s for ss in recent[-20:] for s in ss};pool=[p for p in rows[d] if p['symbol'] not in excluded]
        def scored(p):
            if not active:return (p['sourceSignals']['overall_score'],None,p)
            s,v,praw,padj=prediction_cache[(scope,d)][p['symbol']];return (s,v,{**p,'probabilitiesRaw':praw,'probabilities':padj,'bundleId':bundle['bundleId']})
        qq=[scored(p) for p in pool];ranked=sorted(qq,key=lambda q:(-q[0],-q[2]['feature']['averageTurnover20'],q[2]['symbol']))
        chosen=ranked[:3] if len(ranked)>=3 else [];recent.append([p['symbol'] for s,v,p in chosen]);assert not excluded.intersection(recent[-1])
        day={'signalDate':d,'recommendationDateExpected':days[di[d]+1],'expectedD5date':days[di[d]+5],'cooldown':20,'modelActive':active,'modelScope':scope if active else None,'modelBundleId':bundle['bundleId'] if active else None,'selectionMode':'monthlyAdaptiveBoundedComposite' if active else 'currentOriginalOverall','runtimeEligibleCount':len(rows[d]),'afterCooldownCount':len(pool),'scorableAfterCooldownCount':len(pool),'unscorableExcludedObservedInputs':0,'pickedCount':len(chosen),'shortfallStage':None if chosen else 'runtimeEligibleAfterCooldownBelow3','priorShift':pr,'picks':[]}
        for rank,(s,v,p) in enumerate(chosen,1):
            o=p['outcome'];i=di[d];bars=raw.get(p['symbol'],[])[i+1:i+6]
            day['picks'].append({**p,'outcome':o,'signals':{**p['sourceSignals'],'overall_score':s},'selectionRank':rank,'scoreRawComposite':v,'rawFactors':dict(zip(FEATURE_NAMES,p['atoms'])),'recommendationDate':days[i+1],'expectedD5date':days[i+5],'D1open':bars[0][0] if bars and bars[0] else None,'dailyBars':[{'session':j,'date':days[i+j],'source':'kis',**dict(zip(['open','high','low','close','volume'],bar))} if bar else {'session':j,'date':days[i+j],'missing':True} for j,bar in enumerate(bars,1)]})
        if active:
            allq=[scored(p) for p in rows[d]];rawtop=sorted(qq,key=lambda q:(-q[1],-q[2]['feature']['averageTurnover20'],q[2]['symbol']))[:3]
            def mass(v):return {'candidateCount':len(v),'scoreZeroCount':sum(q[0]==0 for q in v),'score100Count':sum(q[0]==100 for q in v),'rawScoreAtOrBelowZeroCount':sum(q[1]<=0 for q in v),'scoreMax':max((q[0] for q in v),default=None),'rawScoreMax':max((q[1] for q in v),default=None)}
            diag={'scope':scope,'signalDate':d,'modelBundleId':bundle['bundleId'],'eligible':mass(allq),'afterOwnCooldown':mass(qq),'sameObservedExclusionsNotSeparatePolicy':True,'publishedTop3AllSameInteger':len(chosen)==3 and len(set(q[0] for q in chosen))==1,'topIntegerScoreTiedCandidateCount':sum(q[0]==chosen[0][0] for q in qq) if chosen else 0,'rawTop3HasDifferentNames':set(q[2]['symbol'] for q in chosen)!=set(q[2]['symbol'] for q in rawtop),'publishedTop3':[{'symbol':q[2]['symbol'],'integerScore':q[0],'rawScore':q[1]} for q in chosen],'rawTop3ObservedOnly':[{'symbol':q[2]['symbol'],'integerScore':q[0],'rawScore':q[1]} for q in rawtop]}
            day['scoreMassDiagnostic']=diag;score_mass.append(diag)
        daily.append(day)
    return {'name':'monthlyAdaptiveComposite','actualPublishedHistory':False,'initialState':'empty on '+ds[0],'days':daily}

raw_source=(BASE/'raw-composite-study/raw-research.py').read_text();metric_code='def metrics('+raw_source.split('\ndef metrics(')[1].split('\ninner_results=')[0]
exec(compile(metric_code,str(BASE/'raw-composite-study/raw-research.py')+'#monthly-metrics','exec'),globals())
original_summarize=summarize
def summarize(run,ds):
    v=original_summarize(run,ds);pp=[p for d in run['days'] if d['signalDate'] in set(ds) for p in d['picks']]
    for name,strict in [('strictPositiveVolume',True),('rawObservationalMarks',False)]:
        oo=[p['outcome'] for p in pp if p['outcome']['strictLabelValid' if strict else 'rawMarkValid']]
        v[name]['anyNegativeD5NetCount']=sum(o['net5d']<0 for o in oo);v[name]['anyNegativeD5NetRate']=statistics.mean(o['net5d']<0 for o in oo) if oo else None
    return v
def prior_runs(p):return {r['name']:r for r in json.loads(p.read_text())['policies']}
bi=prior_runs(BASE/'bounded-objective-study/inner-ledger.json');bo=prior_runs(BASE/'bounded-objective-study/outer-ledger.json')
comparators={'staticBoundedComposite':'boundedEventComposite','previousPriorCorrected0.65':'priorShiftEventComposite','unadjustedBalanced0.65':'lambda0.65','currentOverall':'currentOverall','ATRbaseline':'ATRbaseline'}
inner={'monthlyAdaptiveComposite':run_adaptive('inner',early_dates,155),**{k:bi[v] for k,v in comparators.items()}}
inner_results={k:summarize(v,early_dates[155:]) for k,v in inner.items()}
(OUT/'inner-stage-results-before-outer.json').write_text(json.dumps({'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sameFrozenFamilyNoSelectionOrRetune':True,'planSha256':sha(PLAN),'innerResults':inner_results,'completedBundles':bundle_meta},ensure_ascii=False,indent=2))
print('INNER_DONE_BEFORE_OUTER',json.dumps(inner_results),flush=True)
outer_comparators={**comparators,'unadjustedBalanced0.65':'balancedEventComposite'}
outer={'monthlyAdaptiveComposite':run_adaptive('outer',outer_dates,0),**{k:bo[v] for k,v in outer_comparators.items()}}
splits={'originalTrainDiagnostic':original_dates[:80],'validationReused':original_dates[85:115],'testReused':original_dates[120:],'allOriginal180':original_dates,'partialFreshSpotcheck':[outer_dates[-1]]}
outer_results={split:{k:summarize(run,ds) for k,run in outer.items()} for split,ds in splits.items()}
for split,v in outer_results.items():print('OUTER_DONE',split,json.dumps(v),flush=True)

calibration={}
for split,ds in [('inner80',early_dates[155:])]+list(splits.items()):
    runs=inner if split=='inner80' else outer;calibration[split]={}
    for name in ['monthlyAdaptiveComposite','staticBoundedComposite']:
        pp=[p for d in runs[name]['days'] if d['signalDate'] in set(ds) for p in d['picks'] if p['outcome']['strictLabelValid']];calibration[split][name]={}
        for h in HEAD_NAMES:
            target=lambda p:float(p['outcome']['touch']) if h=='touch' else float(p['outcome']['entryBullish']) if h=='D1bullish' else float(p['outcome']['net5d']<=-.05)
            bins=[]
            for j in range(10):
                bb=[p for p in pp if j/10<=p['probabilities'][h]<(j+1)/10 or j==9 and p['probabilities'][h]==1]
                bins.append({'from':j/10,'through':(j+1)/10,'points':len(bb),'meanPredicted':statistics.mean(p['probabilities'][h] for p in bb) if bb else None,'empiricalRate':statistics.mean(target(p) for p in bb) if bb else None})
            calibration[split][name][h]={'points':len(pp),'meanPredicted':statistics.mean(p['probabilities'][h] for p in pp),'empiricalRate':statistics.mean(target(p) for p in pp),'brier':statistics.mean((p['probabilities'][h]-target(p))**2 for p in pp),'fixedDeciles':bins}
bootstrap={}
for split in ['testReused','allOriginal180']:
    ds=splits[split];n=len(ds);rng=np.random.default_rng(42);starts=rng.integers(0,n,size=(1000,math.ceil(n/10)));idx=((starts[:,:,None]+np.arange(10))%n).reshape(1000,-1)[:,:n];bootstrap[split]={}
    for name in ['monthlyAdaptiveComposite','staticBoundedComposite']:
        dm={d['signalDate']:d for d in outer[name]['days']};dd=[]
        for d in ds:
            oo=[p['outcome'] for p in dm[d]['picks'] if p['outcome']['strictLabelValid']];dd.append([len(oo),sum(o['touch'] for o in oo),sum(o['net5d']<=-.05 for o in oo),sum(o['net5d']<0 for o in oo),sum(o['net5d'] for o in oo)])
        sums=np.array(dd)[idx].sum(axis=1);v=sums[:,1:]/sums[:,:1];bootstrap[split][name]={'blockDays':10,'draws':1000,'seed':42,'circularMovingBlock':True,'descriptiveOnly':True,'intervals95':{m:[float(z) for z in np.quantile(v[:,i],[.025,.975])] for i,m in enumerate(['touchRate','loss5Rate','anyNegativeD5NetRate','meanD5Net'])}}
audit={'selectedInstances':0,'categoryMutations':[],'rawLabelDifferences':[],'integerScoreDifferences':[],'trainingMaturityViolations':[],'calibrationMaturityViolations':[],'unknownStrictSelections':[]}
for scope,runs in [('inner',inner),('outer',outer)]:
    for d in runs['monthlyAdaptiveComposite']['days']:
        for p in d['picks']:
            key=[scope,d['signalDate'],p['symbol']];audit['selectedInstances']+=1
            if any(p['signals'][k]!=p['sourceSignals'][k] for k in CATEGORIES):audit['categoryMutations'].append(key)
            if p['outcome']!=outcome(p['symbol'],d['signalDate']):audit['rawLabelDifferences'].append(key)
            if d['modelActive']:
                current=prediction_cache[(scope,d['signalDate'])][p['symbol']]
                if current[0]!=p['signals']['overall_score']:audit['integerScoreDifferences'].append(key)
                model=models[d['modelBundleId']]
                if model['latestTrainingLabelMaturity']>d['signalDate'] or model['activationClosedAsOf']>d['signalDate']:audit['trainingMaturityViolations'].append(key)
                if d['priorShift']['maxCalibrationMaturity']>d['signalDate']:audit['calibrationMaturityViolations'].append(key)
            if not p['outcome']['strictLabelValid']:audit['unknownStrictSelections'].append({'selection':key,'zeroVolumeFlag':p['outcome']['zeroVolumeFlag'],'missingBarFlag':p['outcome']['missingBarFlag']})
assert not any(audit[k] for k in ['categoryMutations','rawLabelDifferences','integerScoreDifferences','trainingMaturityViolations','calibrationMaturityViolations'])
assert all(sha(p)==h for p,h in protected.items()),'Previous quant research files changed'
assert len(bundle_meta)==15 and len(fit_sequence)==15,'Calendar-month scheduled bundle count changed'
paths=[PLAN,pathlib.Path(__file__),EVENT/'event-research.py',BASE/'raw-composite-study/raw-research.py',extra/'wide.ndjson',extra/'context.ndjson',extra/'runtime-eligibility.ndjson',prior_panel_file,BASE/'prior-shift-study/asof-prior-shifts.json',RAW]+[pathlib.Path(m['joblibPath']) for m in bundle_meta]
source_hashes={str(p):sha(p) for p in paths}
def ledger(runs):return {'actualPublishedHistory':False,'family':'monthlyRolling150CausalAdaptiveBoundedIndex','planSha256':sha(PLAN),'sourceHashes':source_hashes,'rollingMaturePreviousValidationLabelsAllowedForLaterPrequentialTraining':True,'policies':list(runs.values())}
(OUT/'inner-ledger.json').write_text(json.dumps(ledger(inner),ensure_ascii=False,indent=2,allow_nan=False));(OUT/'outer-ledger.json').write_text(json.dumps(ledger(outer),ensure_ascii=False,indent=2,allow_nan=False))
(OUT/'daily-bundle-priors.json').write_text(json.dumps({'bundleCount':len(bundle_meta),'days':daily_prior},ensure_ascii=False,indent=2,allow_nan=False))
(OUT/'score-mass-and-ties.json').write_text(json.dumps({'observedOnly':True,'noAlternatePolicyOutcomes':True,'days':score_mass},ensure_ascii=False,indent=2))
(OUT/'fresh-selections.json').write_text(json.dumps({'actualPublishedHistory':False,'partialFreshOneDayOnly':True,'policies':[{'name':k,'day':v['days'][-1]} for k,v in outer.items()]},ensure_ascii=False,indent=2,allow_nan=False))
report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'plan':PLAN.read_text(),'planSha256':sha(PLAN),'familyCount':1,'bundleCount':len(bundle_meta),'classifierFits':3*len(bundle_meta),'bundleMetadata':bundle_meta,'parameters':PARAMS,'featureNames':FEATURE_NAMES,'innerResults':inner_results,'outerResults':outer_results,'probabilityCalibration':calibration,'descriptiveBlockBootstrap':bootstrap,'selectedRawAudit':audit,'sourceHashes':source_hashes,'protectedPriorHashes':protected,'promotion':'Research only; no production writes','caveats':['Monthly rolling150 is ONE frozen hypothesis, not tuned/optimal byliterature proof','Later matured originalvalidation/test labels may train later bundles causally; prequential adaptive replay notfrozen/pristineOOS','Sameclosingdate maturelabels allowed onlyclosedasof andrawcalendar+5 guard','Original periods repeatedly seen; currentmaster/status andpartialwarmup biasesremain','Observedinput NaNnative andfutureunknownlabels retainedselection','Bounded score is weightedfavorableobjective index, nottouch probability; integerbucketing/tiesremain','Targetdailyhigh exit is executionproxy, notfills; repeatedstocks/overlappinglabels andbootstrap reusedselection limitations']}
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False));(OUT/'summary.json').write_text(json.dumps({k:v for k,v in report.items() if k not in ['plan','protectedPriorHashes','probabilityCalibration','bundleMetadata']},ensure_ascii=False,indent=2,allow_nan=False))
print('AUDIT',json.dumps(audit),flush=True);print('DONE',OUT,flush=True)
