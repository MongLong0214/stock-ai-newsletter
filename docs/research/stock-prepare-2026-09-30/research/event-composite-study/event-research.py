# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import json, pathlib, hashlib, math, statistics, collections, datetime
import numpy as np
import joblib
from sklearn.ensemble import HistGradientBoostingClassifier

BASE=pathlib.Path('/tmp/composite-score-research-20260930');OUT=BASE/'event-composite-study';PLAN=OUT/'event-plan.txt'
loader=BASE/'raw-composite-study/raw-research.py';loader_source=loader.read_text()
prefix=loader_source.split('\ndef normalizer(ds):')[0]
replacements={
    "OUT=BASE/'raw-composite-study'":"OUT=BASE/'event-composite-study'",
    "PLAN=OUT/'raw-plan.txt'":"PLAN=OUT/'event-plan.txt'",
    "ea4b357d30d2b156818327a7717007d8127d4bc8857065557776a97fde1b48f6":"eef81c7d88c58ffc52545d4d4e1d734e1bef35ef7d61dd82e9cf20a7bd9c7ea5",
    "['weight-study','atom-study']":"['weight-study','atom-study','raw-composite-study']",
    "context[key]=(c.get('chaikinMoneyFlow21'),c.get('distanceFromPriorHigh20Percent'),c.get('bollingerWidth20Percent'))":"context[key]=tuple(c.get(k) for k in ['chaikinMoneyFlow21','distanceFromPriorHigh20Percent','bollingerWidth20Percent','return5Percent','return20Percent','return60Percent','closeLocation','upperWickRatio','benchmarkReturn20Percent','breadthAboveSma20'])",
    "context.get((date,symbol),(None,None,None))":"context.get((date,symbol),(None,)*10)",
    "atoms=[c[0],c[1],f.get('volumeRatio20'),f.get('atrPercent14'),c[2],max(0,close_return*100)]":"atoms=[f.get('atrPercent14'),f.get('volumeRatio20'),c[0],c[1],c[2],close_return*100,f.get('gapFromPreviousClosePercent'),(f['close']/f['open']-1)*100,f.get('rsi14'),f.get('sma20DistancePercent'),(f['close']/f['sma60']-1)*100 if finite(f.get('sma60')) and f['sma60']>0 else None,c[3],c[4],c[5],c[6],c[7]*100 if finite(c[7]) else None,c[8],c[9]*100 if finite(c[9]) else None]",
    "'sma20DistancePercent','position52wObservations'":"'sma20DistancePercent','sma60','position52wObservations'",
    "'scorable'":"'observedAllFeaturesFinite'",
}
for a,b in replacements.items():
    assert a in prefix,a;prefix=prefix.replace(a,b)
# Reuse frozen read-only eligibility/raw-label loader. No previous model-fit code executes.
exec(compile(prefix,str(loader)+'#event-loader','exec'),globals())
FEATURE_NAMES=['atrPercent14','volumeRatio20','chaikinMoneyFlow21','distanceFromPriorHigh20Percent','bollingerWidth20Percent','signalCloseCloseReturnPercent','gapFromPreviousClosePercent','signalIntradayReturnPercent','rsi14','sma20DistancePercent','sma60DistancePercent','return5Percent','return20Percent','return60Percent','closeLocation','upperWickPercent','kospiReturn20Percent','breadthAboveSma20Percent']
HEAD_NAMES=['touch','D1bullish','loss5']
PARAMS={'max_iter':100,'max_leaf_nodes':7,'max_depth':3,'min_samples_leaf':100,'learning_rate':.05,'l2_regularization':1,'early_stopping':False,'random_state':42,'loss':'log_loss','max_bins':255}
def input_array(pp):
    return np.array([[v if finite(v) else np.nan for v in p['atoms']] for p in pp],dtype=float)
def serialize_head(model):
    result={'baselineLogit':float(model._baseline_prediction[0,0]),'trees':[],'leafValuesAlreadyIncludeLearningRate':True}
    for iteration in model._predictors:
        assert len(iteration)==1;predictor=iteration[0];nodes=[]
        for n in predictor.nodes:
            assert not n['is_categorical']
            threshold=float(n['num_threshold'])
            encoded=None if n['is_leaf'] else threshold if math.isfinite(threshold) else 'Infinity' if threshold>0 else '-Infinity'
            nodes.append({'leaf':bool(n['is_leaf']),'value':float(n['value']),'feature':int(n['feature_idx']),'threshold':encoded,'missingGoLeft':bool(n['missing_go_to_left']),'left':int(n['left']),'right':int(n['right']),'count':int(n['count'])})
        result['trees'].append(nodes)
    assert len(result['trees'])==100
    return result
def fit_scope(scope,ds,activation):
    pp=[];weights=[];counts=[];total=sum(sum(p['outcome']['strictLabelValid'] for p in rows[d]) for d in ds)
    for d in ds:
        vv=[p for p in rows[d] if p['outcome']['strictLabelValid']];assert vv and days[di[d]+5]<activation
        pp.extend(vv);weights.extend([total/(len(ds)*len(vv))]*len(vv));counts.append({'date':d,'eligible':len(rows[d]),'strictFitLabels':len(vv),'missingLabels':len(rows[d])-len(vv),'featureMissingFitPoints':sum(not p['observedAllFeaturesFinite'] for p in vv),'maturityDate':days[di[d]+5]})
    xx=input_array(pp);weight=np.array(weights);assert abs(weight.mean()-1)<1e-12
    labels={'touch':np.array([p['outcome']['touch'] for p in pp],dtype=int),'D1bullish':np.array([p['outcome']['entryBullish'] for p in pp],dtype=int),'loss5':np.array([p['outcome']['net5d']<=-.05 for p in pp],dtype=int)}
    fitted={};metadata={};portable={}
    print('FIT_START',scope,len(pp),'features',xx.shape,'missingValues',int(np.isnan(xx).sum()),flush=True)
    for head in HEAD_NAMES:
        model=HistGradientBoostingClassifier(**PARAMS);model.fit(xx,labels[head],sample_weight=weight)
        assert model.n_iter_==100 and list(model.classes_)==[0,1]
        fitted[head]=model;metadata[head]={'positiveCount':int(labels[head].sum()),'pooledEventRate':float(labels[head].mean()),'dateBalancedWeightedEventRate':float(np.average(labels[head],weights=weight)),'iterations':model.n_iter_,'baselineLogit':float(model._baseline_prediction[0,0])}
        print('HEAD_FIT',scope,head,json.dumps(metadata[head]),flush=True)
    result={'scope':scope,'family':'directEventHGBComposite','featureNames':FEATURE_NAMES,'parameters':PARAMS,'heads':fitted,'metadata':metadata,'trainingDates':ds,'trainingRows':len(pp),'trainingDateCounts':counts,'activationDate':activation,'lastLabelMaturity':days[di[ds[-1]]+5],'allMaturitiesStrictlyEarlier':True,'sampleWeightMean':float(weight.mean()),'trainingInputSha256':hashlib.sha256(xx.tobytes()+weight.tobytes()+b''.join(labels[h].tobytes() for h in HEAD_NAMES)).hexdigest()}
    portable_artifact={k:v for k,v in result.items() if k!='heads'};portable_artifact['scoreMap']={'touchWeight':.8,'bullWeight':.2,'lossPenaltyPoints':20,'rounding':'floor(clamp(100*(.8*pTouch+.2*pBull)-20*pLoss5,0,100)+.5)'}
    joblib.dump(result,OUT/(scope+'-model.joblib'));(OUT/(scope+'-model-meta.json')).write_text(json.dumps(portable_artifact,ensure_ascii=False,indent=2,allow_nan=False))
    return result,portable_artifact
models={};portable_models={}
for scope,ds,activation in [('first150',early_dates[:150],early_dates[155]),('all235',early_dates,outer_dates[0])]:
    saved=OUT/(scope+'-model.joblib')
    if saved.exists():
        models[scope]=joblib.load(saved);portable_models[scope]=json.loads((OUT/(scope+'-model-meta.json')).read_text())
        assert models[scope]['trainingDates']==ds and models[scope]['activationDate']==activation and models[scope]['parameters']==PARAMS and models[scope]['featureNames']==FEATURE_NAMES
        assert all(head.n_iter_==100 for head in models[scope]['heads'].values())
        print('RESUME_SAVED_FITTED_HEADS',scope,models[scope]['trainingInputSha256'],flush=True)
    else:models[scope],portable_models[scope]=fit_scope(scope,ds,activation)
def predict_heads(pp,model):
    if not pp:return np.empty((0,3))
    xx=input_array(pp);return np.column_stack([model['heads'][head].predict_proba(xx)[:,1] for head in HEAD_NAMES])
def score_points(pp,model):
    probs=predict_heads(pp,model);raw_scores=100*(.8*probs[:,0]+.2*probs[:,1])-20*probs[:,2];ss=np.floor(np.clip(raw_scores,0,100)+.5).astype(int)
    return [(int(s),float(raw_score),{**p,'probabilities':dict(zip(HEAD_NAMES,map(float,prob)))}) for s,raw_score,p,prob in zip(ss,raw_scores,pp,probs)]
# Same frozen integer/cooldown/ledger rules; native missing routing changes only observed scorable gate.
policy_code=loader_source.split('\ndef run_policy(')[1].split('\ninner={')[0]
policy_code='def run_policy('+policy_code
policy_code=policy_code.replace("scorable=[p for p in after_cd if p['scorable']] if active else after_cd","scorable=after_cd")
policy_code=policy_code.replace("'scoreMu':mu","'scoreRawComposite':mu")
policy_code=policy_code.replace("'rawTargetUtilityComposite'","'directEventComposite'")
policy_code=policy_code.replace("dict(zip(ATOM_NAMES,p['atoms']))","dict(zip(FEATURE_NAMES,p['atoms']))")
exec(compile(policy_code,str(loader)+'#event-policy','exec'),globals())
inner={'eventComposite':run_policy('eventComposite',early_dates,models['first150'],155),'currentOverall':run_policy('currentOverall',early_dates),'ATRbaseline':run_policy('ATRbaseline',early_dates,mode='atr')}
outer={'eventComposite':run_policy('eventComposite',outer_dates,models['all235'],0),'currentOverall':run_policy('currentOverall',outer_dates),'ATRbaseline':run_policy('ATRbaseline',outer_dates,mode='atr')}
metric_code='def metrics('+loader_source.split('\ndef metrics(')[1].split('\ninner_results=')[0]
exec(compile(metric_code,str(loader)+'#event-metrics','exec'),globals())
inner_results={k:summarize(v,early_dates[155:]) for k,v in inner.items()}
splits={'originalTrainDiagnostic':original_dates[:80],'validationReused':original_dates[85:115],'testReused':original_dates[120:],'allOriginal180':original_dates,'partialFreshSpotcheck':[outer_dates[-1]]}
outer_results={split:{k:summarize(run,ds) for k,run in outer.items()} for split,ds in splits.items()}
print('INNER',json.dumps(inner_results),flush=True)
for split,v in outer_results.items():print('OUTER',split,json.dumps(v),flush=True)
audit={'selectedInstances':0,'categoryMutations':[],'labelDifferences':[],'publishedScoreDifferences':[],'zeroVolumeInstances':0,'missingBarInstances':0,'maturityViolations':[],'baselineOuter181Differences':[],'futureMissingSelections':[]}
for scope,runs in [('inner',inner),('outer',outer)]:
    for name,run in runs.items():
        for d in run['days']:
            for p in d['picks']:
                audit['selectedInstances']+=1;o=p['outcome'];audit['zeroVolumeInstances']+=o['zeroVolumeFlag'];audit['missingBarInstances']+=o['missingBarFlag'];key=[scope,name,d['signalDate'],p['symbol']]
                if any(p['signals'][k]!=p['sourceSignals'][k] for k in CATEGORIES):audit['categoryMutations'].append(key)
                if o!=outcome(p['symbol'],d['signalDate']):audit['labelDifferences'].append(key)
                if d['modelActive']:
                    model=models[d['modelScope']]
                    if score_points([p],model)[0][0]!=p['signals']['overall_score']:audit['publishedScoreDifferences'].append(key)
                    if model['lastLabelMaturity']>=d['signalDate']:audit['maturityViolations'].append(key)
                if not o['strictLabelValid']:audit['futureMissingSelections'].append({'selection':key,'zeroVolume':o['zeroVolumeFlag'],'missingBar':o['missingBarFlag']})
prior=json.loads((BASE/'horizon-ledger.json').read_text())
for name,pname in [('currentOverall','currentOverallDescCooldown20'),('ATRbaseline','baselineV2Cooldown20')]:
    old=next(p for p in prior['policies'] if p['name']==pname)
    for a,b in zip(outer[name]['days'],old['days']):
        if [p['symbol'] for p in a['picks']]!=[p['symbol'] for p in b['picks']]:audit['baselineOuter181Differences'].append([name,a['signalDate']])
assert not any(audit[k] for k in ['categoryMutations','labelDifferences','publishedScoreDifferences','maturityViolations','baselineOuter181Differences'])
def universe_summary(ds):
    daily=[];pp=[]
    for d in ds:
        vv=[]
        for p in rows[d]:
            o=p.get('outcome') or outcome(p['symbol'],d)
            q={**p,'outcome':o};pp.append(q)
            if o['strictLabelValid']:vv.append(o)
        daily.append({'date':d,'eligible':len(rows[d]),'strictLabels':len(vv),'missingLabels':len(rows[d])-len(vv),**({k:statistics.mean(o[k] for o in vv) for k in ['touch','entryBullish','net5d','targetNetProxy','utility']} if vv else {})})
    return {'pooled':metrics(pp,True),'dates':len(ds),'dateBalanced':{k:statistics.mean(d[k] for d in daily if k in d) for k in ['touch','entryBullish','net5d','targetNetProxy','utility']},'daily':daily}
universe={k:universe_summary(ds) for k,ds in {'earlierFirst150':early_dates[:150],'earlierInner80':early_dates[155:],'earlierAll235':early_dates,**splits}.items()}
years={}
for scope,run in [('inner235',inner['eventComposite']),('outer181',outer['eventComposite'])]:
    for year in sorted({d['signalDate'][:4] for d in run['days']}):years[scope+'_'+year]=summarize(run,[d['signalDate'] for d in run['days'] if d['signalDate'][:4]==year])
calibration={};score_bins={}
for label,ds in {'inner':early_dates[155:],**splits}.items():
    run=inner['eventComposite'] if label=='inner' else outer['eventComposite'];pp=[p for d in run['days'] if d['signalDate'] in ds for p in d['picks']];vv=[p for p in pp if p['outcome']['strictLabelValid']]
    calibration[label]={}
    for head in HEAD_NAMES:
        bins=[]
        for j in range(10):
            bb=[p for p in vv if j/10<=p['probabilities'][head]<(j+1)/10 or j==9 and p['probabilities'][head]==1]
            label_value=lambda p:bool(p['outcome']['touch']) if head=='touch' else bool(p['outcome']['entryBullish']) if head=='D1bullish' else p['outcome']['net5d']<=-.05
            bins.append({'from':j/10,'through':(j+1)/10,'points':len(bb),'meanPredicted':statistics.mean(p['probabilities'][head] for p in bb) if bb else None,'empiricalRate':statistics.mean(label_value(p) for p in bb) if bb else None})
        calibration[label][head]={'points':len(vv),'missingLabels':len(pp)-len(vv),'meanPredicted':statistics.mean(p['probabilities'][head] for p in vv) if vv else None,'empiricalRate':statistics.mean(label_value(p) for p in vv) if vv else None,'brier':statistics.mean((p['probabilities'][head]-label_value(p))**2 for p in vv) if vv else None,'fixedProbabilityDeciles':bins}
    score_bins[label]=[{'from':low,'throughInclusive':min(100,low+9),'picks':len(bb:=[p for p in pp if low<=p['signals']['overall_score']<=min(100,low+9)]),'metrics':metrics(bb,True)} for low in range(0,101,10)]
assert all(sha(p)==h for p,h in protected.items()),'Previous artifact changed during event run'
source_paths=[PLAN,pathlib.Path(__file__),loader,EARLY/'earlier-wide.ndjson',EARLY/'earlier-context.ndjson',EARLY/'manifest.json',EARLY/'earlier-runtime-eligibility.ndjson',EARLY/'earlier-runtime-eligibility-audit.json',BASE/'technical-context.ndjson',BASE/'current-signals.ndjson',BASE/'current-signals-manifest.json',BASE/'horizon-runtime-eligibility.ndjson',pathlib.Path('/tmp/upside-scored.ndjson'),META,FRESH/'scored.ndjson',FRESH/'features/metadata.json',RAW]+[OUT/(scope+suffix) for scope in ['first150','all235'] for suffix in ['-model.joblib','-model-meta.json']]
source_hashes={str(p):sha(p) for p in source_paths}
def ledger(runs):return {'actualPublishedHistory':False,'fixedCompositeScoreMeaning':'Weighted direct-event index, not a single-event probability or percentile','sourceHashes':source_hashes,'planSha256':sha(PLAN),'currentMasterNameSnapshot':meta['downloadedAt'],'policies':list(runs.values())}
(OUT/'inner-ledger.json').write_text(json.dumps(ledger(inner),ensure_ascii=False,indent=2,allow_nan=False));(OUT/'outer-ledger.json').write_text(json.dumps(ledger(outer),ensure_ascii=False,indent=2,allow_nan=False))
(OUT/'fresh-selections.json').write_text(json.dumps({'partialFreshOneDayOnly':True,'actualPublishedHistory':False,'policies':[{'name':k,'day':v['days'][-1]} for k,v in outer.items()]},ensure_ascii=False,indent=2,allow_nan=False))
report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'plan':PLAN.read_text(),'planSha256':sha(PLAN),'familyCount':1,'fitScopes':2,'classifierFits':6,'parameters':PARAMS,'featureNames':FEATURE_NAMES,'headNames':HEAD_NAMES,'models':{k:{a:b for a,b in m.items() if a!='heads'} for k,m in models.items()},'inputCounts':input_counts,'innerResults':inner_results,'outerResults':outer_results,'universeRegimes':universe,'selectedYearSummaries':years,'selectedProbabilityCalibration':calibration,'scoreBins':score_bins,'trainingRawAudit':training_raw_audit,'selectedRawAudit':audit,'sourceHashes':source_hashes,'protectedPriorHashes':protected,'promotion':'Research only; no production writes or promotion','caveats':['Original180 splits repeatedly reused; not pristine OOS','Currentmaster/status survivorship and earlier80..314warmup vsproduction320 remain','HGB native NaN routing uses only observed inputs; missing future labels do not filter selection','Fixed weighted event index is not a probability of+10%; rawheads/reliability shown','Target daily-high exit is an illustrative execution proxy, not confirmed fills; no invented stops','Dependence from repeated stocks/overlappingwindows; date-balanced descriptive reporting','Single frozen family, two causal scopes, six heads; no external fitting/tuning/threshold search; stop after result']}
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False));(OUT/'summary.json').write_text(json.dumps({k:v for k,v in report.items() if k not in ['plan','models','universeRegimes','protectedPriorHashes','scoreBins','selectedProbabilityCalibration']},ensure_ascii=False,indent=2,allow_nan=False))
(OUT/'calibration.json').write_text(json.dumps(calibration,ensure_ascii=False,indent=2));(OUT/'score-bins.json').write_text(json.dumps(score_bins,ensure_ascii=False,indent=2));(OUT/'universe-regimes.json').write_text(json.dumps(universe,ensure_ascii=False,indent=2))
print('AUDIT',json.dumps(audit),flush=True);print('DONE',OUT,flush=True)
