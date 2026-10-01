# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1", "lightgbm==4.7.0"]
# ///
"""Frozen separate4-config L0 KIS research. Only chronological TRAIN chooses configurations; L0 anynegative risk replaces L5."""
import sys,json,pathlib,hashlib,math,statistics,collections,datetime,time,importlib.util
import numpy as np
import joblib

OUT=pathlib.Path('/tmp/composite-score-experimental-20260930')
BASE=pathlib.Path('/tmp/composite-score-research-20260930')
PLAN=OUT/'kis-l0-protocol.json'
PLAN_HASH='3c76fbf4dba4ec521365394542802e8add4b6d4795d7856ed35284dab4cb9e5e'
FEATURE_HASH='5c953745cef23f54ac619d2b80ce12b559436fce7f7e43ac30550f4c8f7579a2'
def sha(p):
    with pathlib.Path(p).open('rb') as h:return hashlib.file_digest(h,'sha256').hexdigest()
assert sha(PLAN)==PLAN_HASH
spec=importlib.util.spec_from_file_location('fixed_models',OUT/'fixed-models-l0.py');core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
protocol=json.loads(PLAN.read_text());featurespec=json.loads((OUT/'featurespec.json').read_text());featuremanifest=json.loads((OUT/'manifest.json').read_text());featureaudit=json.loads((OUT/'audit.json').read_text())
assert featuremanifest['completedAtUTC'] and featuremanifest['rows']==509015 and featuremanifest['signalDateCount']==423
assert sha(OUT/'extra-features.ndjson')==FEATURE_HASH
assert featuremanifest['outputs']['extra-features.ndjson']['sha256']==FEATURE_HASH
for name in ['featurespec.json','audit.json']:assert sha(OUT/name)==featuremanifest['outputs'][name]['sha256']
assert sha(featuremanifest['module']['path'])==featuremanifest['module']['sha256']
assert featurespec['featureNames']==protocol['shared']['inputAblations']['expanded50']
assert featurespec['originalFeatureNames']==protocol['shared']['inputAblations']['original18']
for key in ['original18AtomDifferences','membershipDifferences','currentOhlcvDifferences','sourceSignalCategoryMutationCount','futureSuffix32InputDifferences','olderThan320Prefix32InputDifferences']:assert featureaudit[key]==0,(key,featureaudit[key])
assert featureaudit['futureSuffixMutationWitnessCount']==100 and featureaudit['olderThan320PrefixMutationWitnessCount']==100
input_freeze={str(p):sha(p) for p in [PLAN,pathlib.Path(__file__),OUT/'fixed-models-l0.py',OUT/'extra-features.ndjson',OUT/'featurespec.json',OUT/'manifest.json',OUT/'audit.json',OUT/'extra_features.py']}
freeze_path=OUT/'kis-l0-input-freeze.json'
if freeze_path.exists():assert json.loads(freeze_path.read_text())['sourceHashes']==input_freeze
else:freeze_path.write_text(json.dumps({'frozenAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'beforeScientificFit':True,'sourceHashes':input_freeze},indent=2))

# Reuse only the old read-only raw-OHLC/actual-TS gate loader; no old learner executes.
event_path=BASE/'event-composite-study/event-research.py';event_source=event_path.read_text();prefix=event_source.split('\nFEATURE_NAMES=')[0]
prefix=prefix.replace("OUT=BASE/'event-composite-study'","OUT=pathlib.Path('/tmp/composite-score-experimental-20260930')")
prefix=prefix.replace("'event-plan.txt'","'kis-l0-protocol.json'")
prefix=prefix.replace('eef81c7d88c58ffc52545d4d4e1d734e1bef35ef7d61dd82e9cf20a7bd9c7ea5',PLAN_HASH)
assert PLAN_HASH in prefix
exec(compile(prefix,str(event_path)+'#read-only-loader','exec'),globals())
MODEL_DIR=OUT/'kis-l0-models';CAL_DIR=OUT/'kis-l0-calibrators';PRED_DIR=OUT/'kis-l0-predictions';TRAIN_DIR=OUT/'kis-l0-training-configs'
for d in [MODEL_DIR,CAL_DIR,PRED_DIR,TRAIN_DIR]:d.mkdir(exist_ok=True)
FEATURE_NAMES=featurespec['featureNames']
assert len(FEATURE_NAMES)==50 and len(rows)==416
for d in rows:
    for p in rows[d]:
        if 'outcome' not in p:p['outcome']=outcome(p['symbol'],d)
    assert len({p['symbol'] for p in rows[d]})==len(rows[d])
order={d:{p['symbol']:i for i,p in enumerate(pp)} for d,pp in rows.items()}
X={d:np.full((len(pp),50),np.nan,dtype=np.float64) for d,pp in rows.items()}
seen={d:np.zeros(len(pp),dtype=bool) for d,pp in rows.items()};joined=0;extras=0
for line in (OUT/'extra-features.ndjson').open():
    r=json.loads(line);d=r['date']
    if d not in rows:extras+=1;continue
    i=order[d][r['symbol']];p=rows[d][i];assert not seen[d][i] and r['runtimeEligible']
    vv=r['originalInputs18']+r['extraInputs32'];assert len(vv)==50
    xx=np.array([v if finite(v) else np.nan for v in vv],dtype=np.float64)
    old=np.array([v if finite(v) else np.nan for v in p['atoms']],dtype=np.float64)
    assert np.array_equal(xx[:18],old,equal_nan=True),(d,r['symbol'],'Original18 source parity')
    assert r['sourceSignals']==p['sourceSignals'],(d,r['symbol'],'Original seven scores changed')
    X[d][i]=xx;seen[d][i]=True;joined+=1
assert joined==501213 and extras==7802 and all(v.all() for v in seen.values())
del order,seen
strict={d:np.array([p['outcome']['strictLabelValid'] for p in pp],dtype=bool) for d,pp in rows.items()}
events={d:np.array([[int(bool(p['outcome'].get('touch',False))),int(bool(p['outcome'].get('entryBullish',False))),int(p['outcome'].get('net5d',0)<0)] for p in pp],dtype=np.uint8) for d,pp in rows.items()}
assert all(strict[d].any() for d in rows)
print('FEATURE_JOIN_DONE',joined,'dateContiguousQueries',len(rows),'nativeNaNs',sum(int(np.isnan(xx).sum()) for xx in X.values()),flush=True)
provenance={'fixedInputHashes':input_freeze,'observedInputOrder':FEATURE_NAMES,'strictTrainingLabelOnly':True,'unknownFutureDoesNotFilterSelection':True,'queryOrder':'dates chronological, rows retain joined original symbol order within each date','allSourceSixCategoriesPreserved':True}
bundle_cache={};cal_cache={};prediction_cache={};model_metadata={};cal_metadata={}
def get_bundle(config,n,activation):
    key=(config['id'],n)
    if key in bundle_cache:
        assert bundle_cache[key]['activationDate']==activation;return bundle_cache[key]
    ds=early_dates[:n];assert len(ds)==n
    assert all(days[di[d]+5]<activation for d in ds)
    xx=np.concatenate([X[d][strict[d],:config['inputCount']] for d in ds]);ee=np.concatenate([events[d][strict[d]] for d in ds]);counts=[int(strict[d].sum()) for d in ds]
    assert len(counts)==len(ds) and sum(counts)==len(xx)
    pp={**provenance,'latestTrainingLabelMaturity':days[di[ds[-1]]+5],'dateContiguousFirstLastWitness':[{'date':d,'firstSymbol':rows[d][int(np.flatnonzero(strict[d])[0])]['symbol'],'lastSymbol':rows[d][int(np.flatnonzero(strict[d])[-1])]['symbol'],'rows':int(strict[d].sum())} for d in ds]}
    bundle,metadata=core.fit_bundle(config,ds,activation,xx,ee,counts,MODEL_DIR,pp)
    model_metadata[bundle['bundleId']]=metadata;bundle_cache[key]=bundle;return bundle
def predict(bundle,d):
    key=(bundle['bundleId'],d)
    if key not in prediction_cache:
        path=PRED_DIR/(bundle['bundleId']+'-'+d+'.npy')
        if path.exists():v=np.load(path,allow_pickle=False)
        else:
            v=bundle['model'].predict(X[d][:,:bundle['config']['inputCount']]);np.save(path,v,allow_pickle=False)
        assert len(v)==len(rows[d]) and np.isfinite(v).all();prediction_cache[key]=v
    return prediction_cache[key]
def calibrate(config,intervals,activation,key):
    dates=[];mm=[];ee=[];counts=[];sources=[]
    for n,a,b in intervals:
        bundle=get_bundle(config,n,early_dates[n+5])
        for d in early_dates[a:b]:
            assert days[di[d]+5]<activation
            dates.append(d);mm.append(predict(bundle,d)[strict[d]]);ee.append(events[d][strict[d]]);counts.append(int(strict[d].sum()))
            sources.append({'date':d,'bundleId':bundle['bundleId'],'modelFitLastDate':bundle['trainingDates'][-1],'modelLastLabelMaturity':bundle['provenance']['latestTrainingLabelMaturity'],'predictionWasOOF':d>bundle['trainingDates'][-1],'outcomeMaturityDate':days[di[d]+5]})
    assert len(set(dates))==len(dates) and dates==sorted(dates) and all(x['predictionWasOOF'] for x in sources)
    ck=config['id']+'-'+key
    bundle,metadata=core.fit_calibrator(config,dates,mm,ee,counts,CAL_DIR,ck,activation,{**provenance,'OOFPredictionSources':sources})
    cal_metadata[ck]=metadata;return bundle
def raw_bars(p,d):
    i=di[d];bb=raw.get(p['symbol'],[])[i+1:i+6]
    return [{'session':j,'date':days[i+j],'source':'kis',**dict(zip(['open','high','low','close','volume'],bar))} if bar else {'session':j,'date':days[i+j],'missing':True} for j,bar in enumerate(bb,1)]
def run_policy(name,ds,schedule=None,mode='overall'):
    recent=[];daily=[];active_bundle=None;active_cal=None
    for idx,d in enumerate(ds):
        if schedule and idx in schedule:active_bundle,active_cal=schedule[idx]
        excluded={s for ss in recent[-20:] for s in ss};ii=[i for i,p in enumerate(rows[d]) if p['symbol'] not in excluded]
        active=active_bundle is not None
        if active:
            predictions=predict(active_bundle,d);ss,expected=core.scores(active_bundle['config'],predictions,active_cal)
        else:
            predictions=expected=None;ss=np.array([p['sourceSignals']['overall_score'] for p in rows[d]],dtype=np.int32)
        key=lambda i:(-int(ss[i]),-rows[d][i]['feature']['averageTurnover20'],rows[d][i]['symbol'])
        ranked=sorted(ii,key=(lambda i:(rows[d][i]['feature']['atrPercent14'],rows[d][i]['symbol'])) if mode=='atr' else key)
        chosen=ranked[:3] if len(ranked)>=3 else [];recent.append([rows[d][i]['symbol'] for i in chosen]);assert not excluded.intersection(recent[-1])
        day={'signalDate':d,'recommendationDateExpected':days[di[d]+1],'expectedD5date':days[di[d]+5],'cooldown':20,'modelActive':active,'modelScope':active_bundle['bundleId'] if active else None,'calibratorId':active_cal['calibratorId'] if active_cal else None,'selectionMode':('directGoalUtilityRegressor' if active_bundle['config']['family']=='A' else 'LambdaMARTCausalIsotonicGoalUtility') if active else 'ATRascending' if mode=='atr' else 'currentOriginalOverall','runtimeEligibleCount':len(rows[d]),'afterCooldownCount':len(ii),'scorableAfterCooldownCount':len(ii),'unscorableExcludedObservedInputs':0,'pickedCount':len(chosen),'shortfallStage':None if chosen else 'runtimeEligibleAfterCooldownBelow3','picks':[]}
        if active:
            raw_top=sorted(ii,key=lambda i:(-float(expected[i]),-rows[d][i]['feature']['averageTurnover20'],rows[d][i]['symbol']))[:3]
            day['scoreDiagnostics']={'eligibleScore0Count':int((ss==0).sum()),'eligibleScore100Count':int((ss==100).sum()),'eligibleScoreMax':int(ss.max()),'eligibleScoreMin':int(ss.min()),'eligibleAllScoreMax0':bool(ss.max()==0),'top3IntegerVsRawDifferent':chosen!=raw_top,'top3RawSymbols':[rows[d][i]['symbol'] for i in raw_top],'top3IntegerAllTied':len(chosen)==3 and len(set(int(ss[i]) for i in chosen))==1,'topIntegerTieCount':sum(int(ss[i])==int(ss[chosen[0]]) for i in ii) if chosen else 0}
        for rank,i in enumerate(chosen,1):
            p=rows[d][i];bars=raw_bars(p,d)
            q={**p,'signals':{**p['sourceSignals'],'overall_score':int(ss[i])},'selectionRank':rank,'rawFactors':dict(zip(FEATURE_NAMES,[float(v) if np.isfinite(v) else None for v in X[d][i]])),'recommendationDate':days[di[d]+1],'expectedD5date':days[di[d]+5],'D1open':bars[0].get('open') if bars else None,'dailyBars':bars}
            if active:q.update({'expectedGoalUtility':float(expected[i]),'nativeModelPrediction':float(predictions[i]),'modelConfig':active_bundle['config'],'calibratorId':active_cal['calibratorId'] if active_cal else None})
            day['picks'].append(q)
        daily.append(day)
    return {'name':name,'actualPublishedHistory':False,'initialState':'empty on '+ds[0],'days':daily}
metric_code='def metrics('+loader_source.split('\ndef metrics(')[1].split('\ninner_results=')[0]
exec(compile(metric_code,str(loader)+'#read-only-metrics','exec'),globals())
old_metrics=metrics
def metrics(pp,strict_labels):
    result=old_metrics(pp,strict_labels);vv=[p for p in pp if p['outcome']['strictLabelValid' if strict_labels else 'rawMarkValid']]
    if vv:
        result.update({'anyNegativeD5NetCount':sum(p['outcome']['net5d']<0 for p in vv),'anyNegativeD5NetRate':statistics.mean(p['outcome']['net5d']<0 for p in vv),'touchAndLoss5Count':sum(p['outcome']['touch'] and p['outcome']['net5d']<=-.05 for p in vv),'touchAndNonNegativeD5Count':sum(p['outcome']['touch'] and p['outcome']['net5d']>=0 for p in vv),'touchAndNonNegativeD5Rate':statistics.mean(p['outcome']['touch'] and p['outcome']['net5d']>=0 for p in vv),'touchAndNegativeD5Count':sum(p['outcome']['touch'] and p['outcome']['net5d']<0 for p in vv),'touchAndNegativeD5Rate':statistics.mean(p['outcome']['touch'] and p['outcome']['net5d']<0 for p in vv),'touchAndPositiveD5Rate':statistics.mean(p['outcome']['touchAndPositiveD5Net'] for p in vv),'T_x_L5_JointCounts':{str(t)+'_'+str(l):sum(int(p['outcome']['touch'])==t and int(p['outcome']['net5d']<=-.05)==l for p in vv) for t in [0,1] for l in [0,1]}})
    return result
def summarize_extra(run,ds):
    result=summarize(run,ds);dd=[d for d in run['days'] if d['signalDate'] in set(ds)];pp=[p for d in dd for p in d['picks']];vv=[p for p in pp if p['outcome']['strictLabelValid'] and 'expectedGoalUtility' in p]
    result['tieDiagnostics']={'activeDays':sum(d['modelActive'] for d in dd),'integerVsRawTop3DifferentDays':sum(d.get('scoreDiagnostics',{}).get('top3IntegerVsRawDifferent',False) for d in dd),'all3IntegerTiedDays':sum(d.get('scoreDiagnostics',{}).get('top3IntegerAllTied',False) for d in dd),'eligibleAllScoreMax0Days':sum(d.get('scoreDiagnostics',{}).get('eligibleAllScoreMax0',False) for d in dd)}
    bins=[]
    for j in range(10):
        bb=[p for p in vv if j/10<=p['expectedGoalUtility']<(j+1)/10 or j==9 and p['expectedGoalUtility']==1]
        def y(p):
            o=p['outcome'];return core.target_value(p['modelConfig'],int(o['touch']),int(o['entryBullish']),int(o['net5d']<0))
        bins.append({'from':j/10,'through':(j+1)/10,'points':len(bb),'meanExpectedUtility':statistics.mean(p['expectedGoalUtility'] for p in bb) if bb else None,'meanActualUtility':statistics.mean(y(p) for p in bb) if bb else None,'outcomes':metrics(bb,True)})
    result['selectedUtilityCalibrationBins']=bins
    if vv:
        yy=[core.target_value(p['modelConfig'],int(p['outcome']['touch']),int(p['outcome']['entryBullish']),int(p['outcome']['net5d']<0)) for p in vv]
        result['expectedUtilityCalibration']={'strictPoints':len(vv),'meanPredicted':statistics.mean(p['expectedGoalUtility'] for p in vv),'meanActual':statistics.mean(yy),'MSE':statistics.mean((p['expectedGoalUtility']-y)**2 for p,y in zip(vv,yy))}
    return result
def choice_key(result,config):
    m=result['strictPositiveVolume'];assert m['labels']>0
    objective=max(0,.40-m['touchRate'])**2+max(0,m['anyNegativeD5NetRate']-.30)**2
    return (objective,-m['meanNet5d'],-m['meanTargetNetProxy'],-m['D1bullishRate'],0 if config['complexity']=='small' else 1,config['lambda'],config['inputCount'])
def save_ledger(path,runs):
    path.write_text(json.dumps({'actualPublishedHistory':False,'scoreMeaning':'Expected bounded favorable-outcome utility index; NOT touch probability or percentile','planSha256':PLAN_HASH,'sourceHashes':input_freeze,'currentMasterNameSnapshot':meta['downloadedAt'],'policies':list(runs.values())},ensure_ascii=False,allow_nan=False))
def write_json(path,x):path.write_text(json.dumps(x,ensure_ascii=False,indent=2,allow_nan=False))
assessment_dates=early_dates[110:130]+early_dates[135:150]
train_results=[];configs={c['id']:c for c in core.CONFIGS}
winner_path=OUT/'kis-l0-winners-frozen.json'
for config in core.CONFIGS:
    fit80=get_bundle(config,80,early_dates[85]);fit105=get_bundle(config,105,early_dates[110]);fit130=get_bundle(config,130,early_dates[135])
    if config['family']=='A':schedule={85:(fit80,None),110:(fit105,None),135:(fit130,None)}
    else:
        cal20=calibrate(config,[(80,85,105)],early_dates[110],'train-cal20');cal40=calibrate(config,[(80,85,105),(105,110,130)],early_dates[135],'train-cal40')
        schedule={110:(fit105,cal20),135:(fit130,cal40)}
    run=run_policy(config['id'],early_dates[:150],schedule)
    result=summarize_extra(run,assessment_dates);rankkey=choice_key(result,config)
    entry={'config':config,'assessmentDates':assessment_dates,'assessment':result,'selectionKey':rankkey,'learnerBundles':[fit80['bundleId'],fit105['bundleId'],fit130['bundleId']]}
    write_json(TRAIN_DIR/(config['id']+'-result.json'),entry);save_ledger(TRAIN_DIR/(config['id']+'-ledger.json'),{config['id']:run});train_results.append(entry)
    print('TRAIN_CONFIG_RESULT',config['id'],json.dumps({k:result['strictPositiveVolume'][k] for k in ['touchRate','loss5Rate','D1bullishRate','anyNegativeD5NetRate','meanNet5d']}),'objective',rankkey[0],flush=True)
    # Free memory for this policy; saved exact models and predictions remain resumable.
    prediction_cache.clear()
winners={f:min((e for e in train_results if e['config']['family']==f),key=lambda e:e['selectionKey']) for f in ['A','B']}
frozen={'frozenAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'selectionOnlyTRAINFirst150':True,'externalInnerOuterNotUsedForChoice':True,'planSha256':PLAN_HASH,'sourceHashes':input_freeze,'assessmentDates':assessment_dates,'all24Results':train_results,'winners':winners}
if winner_path.exists():
    old=json.loads(winner_path.read_text());assert old['winners']==winners and old['all24Results']==train_results
else:write_json(winner_path,frozen)
print('TWO_WINNERS_FROZEN',json.dumps({f:e['config'] for f,e in winners.items()}),flush=True)

# Inner80 is a later report, never allowed to alter either chosen configuration.
inner={};inner_results={}
for f,entry in winners.items():
    c=entry['config'];bundle=get_bundle(c,150,early_dates[155]);cal=None
    if f=='B':cal=calibrate(c,[(80,85,105),(105,110,130),(130,135,150)],early_dates[155],'inner-cal55')
    name='winner'+f;inner[name]=run_policy(name,early_dates,{155:(bundle,cal)});inner_results[name]=summarize_extra(inner[name],early_dates[155:])
for name,mode in [('currentOverall','overall'),('ATRbaseline','atr')]:
    inner[name]=run_policy(name,early_dates,mode=mode);inner_results[name]=summarize_extra(inner[name],early_dates[155:])
save_ledger(OUT/'kis-l0-inner-ledger.json',inner);write_json(OUT/'kis-l0-inner-results.json',inner_results)
print('INNER_RESULTS',json.dumps({n:{k:r['strictPositiveVolume'][k] for k in ['touchRate','loss5Rate','D1bullishRate','anyNegativeD5NetRate','meanNet5d']} for n,r in inner_results.items()}),flush=True)

# Full235 fixed winner refits and fixed causal OOF calibrator; original180 repeatedly reused.
outer={}
for f,entry in winners.items():
    c=entry['config'];bundle=get_bundle(c,235,outer_dates[0]);cal=None
    if f=='B':cal=calibrate(c,[(80,85,105),(105,110,130),(130,135,155),(155,160,180),(180,185,205),(205,210,235)],outer_dates[0],'outer-cal125')
    name='winner'+f;outer[name]=run_policy(name,outer_dates,{0:(bundle,cal)})
for name,mode in [('currentOverall','overall'),('ATRbaseline','atr')]:outer[name]=run_policy(name,outer_dates,mode=mode)
old_outer=json.loads((BASE/'monthly-adaptive-study/outer-ledger.json').read_text())
for old in old_outer['policies']:
    if old['name']=='boundedEventComposite':outer['staticBoundedComposite']=old
    if old['name'] in ['currentOverall','ATRbaseline']:
        assert [[p['symbol'] for p in d['picks']] for d in old['days']]==[[p['symbol'] for p in d['picks']] for d in outer[old['name']]['days']],old['name']+' old baseline roster differs'
splits={'originalTrainDiagnostic':original_dates[:80],'validationReused':original_dates[85:115],'testReused':original_dates[120:],'allOriginal180':original_dates,'partialFreshSpotcheck':[outer_dates[-1]]}
outer_results={s:{n:summarize_extra(run,ds) for n,run in outer.items()} for s,ds in splits.items()}
save_ledger(OUT/'kis-l0-outer-ledger.json',outer);write_json(OUT/'kis-l0-outer-results.json',outer_results)
for s,v in outer_results.items():print('OUTER_RESULTS',s,json.dumps({n:{k:r['strictPositiveVolume'][k] for k in ['touchRate','loss5Rate','D1bullishRate','anyNegativeD5NetRate','meanNet5d']} for n,r in v.items()}),flush=True)

audit={'selectedInstances':0,'rawOutcomeDifferences':[],'sourceCategoryDifferences':[],'publishedIntegerDifferences':[],'maturityViolations':[],'futureUnknownSelected':[],'threeStockShortfalls':[]}
for scope,runs in [('inner',inner),('outer',outer)]:
    for name,run in runs.items():
        for d in run['days']:
            if d['pickedCount']!=3:audit['threeStockShortfalls'].append([scope,name,d['signalDate']])
            for p in d['picks']:
                key=[scope,name,d['signalDate'],p['symbol']];audit['selectedInstances']+=1
                if p['outcome']!=outcome(p['symbol'],d['signalDate']):audit['rawOutcomeDifferences'].append(key)
                if any(p['signals'][k]!=p['sourceSignals'][k] for k in CATEGORIES):audit['sourceCategoryDifferences'].append(key)
                if d['modelActive'] and name.startswith('winner'):
                    if int(math.floor(100*p['expectedGoalUtility']+.5))!=p['signals']['overall_score']:audit['publishedIntegerDifferences'].append(key)
                    fit=model_metadata[d['modelScope']]
                    if fit['provenance']['latestTrainingLabelMaturity']>=d['signalDate']:audit['maturityViolations'].append(key)
                if not p['outcome']['strictLabelValid']:audit['futureUnknownSelected'].append({'selection':key,'zeroVolume':p['outcome']['zeroVolumeFlag'],'missingBar':p['outcome']['missingBarFlag']})
assert not any(audit[k] for k in ['rawOutcomeDifferences','sourceCategoryDifferences','publishedIntegerDifferences','maturityViolations'])
source_current={str(p):sha(p) for p in [PLAN,pathlib.Path(__file__),OUT/'fixed-models-l0.py',OUT/'extra-features.ndjson',OUT/'featurespec.json',OUT/'manifest.json',OUT/'audit.json',OUT/'extra_features.py']};assert source_current==input_freeze
assert all(sha(p)==h for p,h in protected.items()),'Previous protected research artifacts changed'
fresh={'actualPublishedHistory':False,'partialFreshOneDayOnly':True,'policies':[{'name':n,'day':run['days'][-1]} for n,run in outer.items()]};write_json(OUT/'kis-l0-fresh-selections.json',fresh)
report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'planSha256':PLAN_HASH,'sourceHashes':input_freeze,'featureRowsJoined':joined,'extraCalibrationPanelsExcluded':extras,'scientificVariantCount':4,'L0TrainingConfigurationResults':train_results,'twoTRAINWinnersFrozen':winners,'innerResults':inner_results,'outerResults':outer_results,'models':model_metadata,'calibrators':cal_metadata,'trainingRawAudit':training_raw_audit,'selectedRawAudit':audit,'promotion':'Research only; no production/source/UI/wording/DB changes','caveats':['Original180/val/test reused and hypothesis design already informed; not pristine OOS','Current-master/current-adjusted data and earlier80..314bar original warmup bias remains','Overall is expected favorable utility index, not probability of10%touch','Intraday10% target exit proxy is not confirmed fills','Only strict known labels train/calibrate/evaluate; missing future selections remain in full ledgers','Separate4 L0 A/B configurations fixed small/lambda.65; selected on causal first150TRAIN35assessmentdates','Inner80 and original180 do not retune chosen configurations','Repeated stocks/overlapping5day labels dependent; date-balanced estimates also reported']}
write_json(OUT/'kis-l0-report.json',report);write_json(OUT/'kis-l0-selected-raw-audit.json',audit)
print('DONE',OUT/'kis-l0-report.json',flush=True)
