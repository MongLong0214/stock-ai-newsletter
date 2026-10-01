# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import pathlib,json,hashlib,math,statistics,datetime
import numpy as np
import joblib

BASE=pathlib.Path('/tmp/composite-score-research-20260930');EVENT=BASE/'event-composite-study';OUT=BASE/'bounded-objective-study';PLAN=OUT/'bounded-plan.txt'
PLAN_HASH='6ceaeec62bc065333a5058c800a0f519218249e846431fb97199d739c3a6b023'
event_source=(EVENT/'event-research.py').read_text();data_prefix=event_source.split('\nFEATURE_NAMES=')[0]
data_prefix=data_prefix.replace("OUT=BASE/'event-composite-study'","OUT=BASE/'bounded-objective-study'").replace("PLAN=OUT/'event-plan.txt'","PLAN=OUT/'bounded-plan.txt'").replace('eef81c7d88c58ffc52545d4d4e1d734e1bef35ef7d61dd82e9cf20a7bd9c7ea5',PLAN_HASH).replace("['weight-study','atom-study','raw-composite-study']","['weight-study','atom-study','raw-composite-study','event-composite-study','balanced-event-study','regime-train-study','prior-shift-study']")
# Frozen read-only observed input + actual TS gate + raw labels loader; no fit executes.
exec(compile(data_prefix,str(EVENT/'event-research.py')+'#prior-shift-data-only','exec'),globals())
HEAD_NAMES=['touch','D1bullish','loss5'];LAMBDA=.65;EPS=1e-6
MODEL_HASHES={'first150':'a8653b31385a9af2627378fc4d7baf09070ac77ab53ab2984da55edc036a8b94','all235':'ef8b69a6e9c9d8c311579b96241b1accb6b71d3703feb4ebb9d25a7ed7b37677'}
models={}
for scope,h in MODEL_HASHES.items():
    path=EVENT/(scope+'-model.joblib');assert sha(path)==h;models[scope]=joblib.load(path)
    assert all(m.n_iter_==100 for m in models[scope]['heads'].values())
FEATURE_NAMES=models['first150']['featureNames'];assert FEATURE_NAMES==models['all235']['featureNames'] and len(FEATURE_NAMES)==18

prior_report=json.loads((BASE/'balanced-event-study/report.json').read_text());probability_cache={}
for scope in MODEL_HASHES:
    path=BASE/'balanced-event-study'/(scope+'-candidate-probabilities.ndjson')
    assert sha(path)==prior_report['sourceHashes'][str(path)]
    cache={}
    for line in path.open():
        x=json.loads(line);assert x['sourceScope']==scope
        cache[x['date']]={p['symbol']:tuple(p['probabilities'][h] for h in HEAD_NAMES) for p in x['predictions']}
    probability_cache[scope]=cache
    print('UNCHANGED_PREDICTION_CACHE',scope,len(cache),flush=True)

extra=BASE/'calibration-extra';extra_gate=load_gate(extra/'runtime-eligibility.ndjson')
extra_manifest=json.loads((extra/'manifest.json').read_text());extra_points={d:[] for d in extra_gate}
for line in (extra/'wide.ndjson').open():
    x=json.loads(line);d=x['date']
    if x['symbol'] in extra_gate[d]:extra_points[d].append({'symbol':x['symbol'],'sourceLabel':x.get('label'),'outcome':outcome(x['symbol'],d)})
for d,pp in extra_points.items():
    assert set(p['symbol'] for p in pp)==extra_gate[d]
    emat=extra_manifest['maturity'][d]
    if emat['mature']:assert days[di[d]+5]==emat['maturityDate']
    else:assert all(p['sourceLabel'] is None and not p['outcome']['strictLabelValid'] for p in pp)

calibration_rows={**rows,**extra_points};calibration_dates=sorted(calibration_rows)
assert len(calibration_dates)==423
assert calibration_dates==days[di[calibration_dates[0]]:di[calibration_dates[-1]]+1], 'Signal panel calendar has gaps; do not compress'
panel={};source_label_diff=[]
for d,pp in calibration_rows.items():
    oo=[]
    for p in pp:
        o=p.get('outcome') or outcome(p['symbol'],d);p['outcome']=o
        if o['strictLabelValid']:
            oo.append(o);l=p['sourceLabel']
            if not l or l.get('status') not in ['hit','miss'] or abs((l['return5d']-.003)-o['net5d'])>1e-9 or bool(l['touched'])!=o['touch'] or bool(l['entryBullish'])!=o['entryBullish']:source_label_diff.append([d,p['symbol']])
    end=days[di[d]+5] if di[d]+5<len(days) else None
    panel[d]={'signalDate':d,'maturityDate':end,'runtimeEligibleCount':len(pp),'strictLabelCount':len(oo),
      'unknownStrictLabels':len(pp)-len(oo),'prevalence':dict(zip(HEAD_NAMES,[statistics.mean(o['touch'] for o in oo),statistics.mean(o['entryBullish'] for o in oo),statistics.mean(o['net5d']<=-.05 for o in oo)])) if oo else None}
assert not source_label_diff,'Calibration raw labels differ from frozen source'
(OUT/'calibration-panel-prevalences.json').write_text(json.dumps({'runtimeGateExact':True,'sourceLabelDifferences':source_label_diff,'panels':[panel[d] for d in calibration_dates]},ensure_ascii=False,indent=2))

training_prior={}
for scope,ds in [('first150',early_dates[:150]),('all235',early_dates)]:
    assert all(panel[d]['strictLabelCount']>0 for d in ds)
    training_prior[scope]={h:statistics.mean(panel[d]['prevalence'][h] for d in ds) for h in HEAD_NAMES}
    for h in HEAD_NAMES:assert abs(training_prior[scope][h]-models[scope]['metadata'][h]['dateBalancedWeightedEventRate'])<1e-12
    assert sum(panel[d]['strictLabelCount'] for d in ds)==models[scope]['trainingRows']
def logit(v):
    v=np.clip(v,EPS,1-EPS);return np.log(v)-np.log1p(-v)
prior_by_date={};calendar_gaps=[]
def build_asof(scope,ds):
    for d in ds:
        end=di[d]-5;wanted=days[end-19:end+1]
        if len(wanted)!=20 or any(c not in panel or panel[c]['strictLabelCount']==0 for c in wanted):calendar_gaps.append([scope,d,wanted]);continue
        pps=[panel[c] for c in wanted];assert all(p['maturityDate'] is not None and p['maturityDate']<=d for p in pps)
        recent={h:statistics.mean(p['prevalence'][h] for p in pps) for h in HEAD_NAMES}
        shift={h:float(logit(recent[h])-logit(training_prior[scope][h])) for h in HEAD_NAMES}
        prior_by_date[(scope,d)]={'closedAsOfSignalDate':d,'modelScope':scope,'panelCount':20,'panels':pps,
          'equalDateRecentPrior':recent,'equalDateTrainPrior':training_prior[scope],'logitShift':shift,
          'maxIncludedMaturityDate':max(p['maturityDate'] for p in pps),'allIncludedLabelsMatureByAsOf':True}
    assert not calendar_gaps,'Mature20 calibration panels unavailable, cannot invent fallback'
previous_prior_days=json.loads((BASE/'prior-shift-study/asof-prior-shifts.json').read_text())['days']
previous_priors={(p['modelScope'],p['closedAsOfSignalDate']):p for p in previous_prior_days}
build_asof('first150',early_dates[155:])
assert all(previous_priors[k]==v for k,v in prior_by_date.items()),'First150 priors changed'

def score_points(pp,model):
    if not pp:return []
    probs=np.array([probability_cache[model['scope']][p['date']][p['symbol']] for p in pp])
    shift=np.array([[prior_by_date[(model['scope'],p['date'])]['logitShift'][h] for h in HEAD_NAMES] for p in pp])
    adjusted=1/(1+np.exp(-(logit(probs)+shift)))
    before=100*(.8*probs[:,0]+.2*probs[:,1])-(100*LAMBDA)*probs[:,2]
    subtractive=100*(.8*adjusted[:,0]+.2*adjusted[:,1])-(100*LAMBDA)*adjusted[:,2]
    after=100*((.8*adjusted[:,0]+.2*adjusted[:,1])+LAMBDA*(1-adjusted[:,2]))/(1+LAMBDA)
    ss=np.floor(after+.5).astype(int);assert np.all((ss>=0)&(ss<=100))
    oldss=np.floor(np.clip(before,0,100)+.5).astype(int);priorint=np.floor(np.clip(subtractive,0,100)+.5).astype(int)
    return [(int(s),float(v),{**p,'probabilitiesRaw':dict(zip(HEAD_NAMES,map(float,praw))),
      'probabilities':dict(zip(HEAD_NAMES,map(float,padj))),'scoreBeforePriorShift':int(old),
      'scoreRawBeforePriorShift':float(bef),'scoreRawPriorShiftSubtractive':float(sub),'scorePriorShiftSubtractive':int(pi)}) for s,v,p,praw,padj,old,bef,sub,pi in zip(ss,after,pp,probs,adjusted,oldss,before,subtractive,priorint)]
raw_source=(BASE/'raw-composite-study/raw-research.py').read_text()
policy_code='def run_policy('+raw_source.split('\ndef run_policy(')[1].split('\ninner={')[0]
policy_code=policy_code.replace("scorable=[p for p in after_cd if p['scorable']] if active else after_cd","scorable=after_cd").replace("'scoreMu':mu","'scoreRawComposite':mu").replace("'rawTargetUtilityComposite'","'boundedEventComposite'").replace("dict(zip(ATOM_NAMES,p['atoms']))","dict(zip(FEATURE_NAMES,p['atoms']))")
exec(compile(policy_code,str(BASE/'raw-composite-study/raw-research.py')+'#prior-shift-policy','exec'),globals())
base_run_policy=run_policy
score_mass_daily=[]
def run_policy(name,ds,model=None,activation=0,mode='overall'):
    run=base_run_policy(name,ds,model,activation,mode)
    recent=[]
    for d in run['days']:
        if d['modelActive']:
            excluded={s for ss in recent[-20:] for s in ss}
            all_scored=score_points(rows[d['signalDate']],model)
            after=[q for q in all_scored if q[2]['symbol'] not in excluded]
            def mass(v):
                return {'candidateCount':len(v),'scoreZeroCount':sum(q[0]==0 for q in v),
                  'score100Count':sum(q[0]==100 for q in v),'rawScoreAtOrBelowZeroCount':sum(q[1]<=0 for q in v),
                  'scoreMax':max((q[0] for q in v),default=None),'rawScoreMax':max((q[1] for q in v),default=None)}
            ranked=sorted(after,key=lambda q:(-q[0],-q[2]['feature']['averageTurnover20'],q[2]['symbol']))
            raw_ranked=sorted(after,key=lambda q:(-q[1],-q[2]['feature']['averageTurnover20'],q[2]['symbol']))
            top=ranked[:3];rawtop=raw_ranked[:3]
            diag={'modelScope':model['scope'],'signalDate':d['signalDate'],'eligible':mass(all_scored),'afterOwnCooldown':mass(after),
              'publishedTop3':[{'symbol':q[2]['symbol'],'integerScore':q[0],'rawScore':q[1]} for q in top],
              'rawTop3ObservedOnly':[{'symbol':q[2]['symbol'],'integerScore':q[0],'rawScore':q[1]} for q in rawtop],
              'sameObservedExclusionsNotSeparatePolicy':True,'rawTop3HasDifferentNames':set(q[2]['symbol'] for q in top)!=set(q[2]['symbol'] for q in rawtop),
              'publishedTop3AllSameInteger':len(top)==3 and len(set(q[0] for q in top))==1,
              'topIntegerScoreTiedCandidateCount':sum(q[0]==top[0][0] for q in after) if top else 0}
            d['scoreMassDiagnostic']=diag;score_mass_daily.append(diag)
        recent.append([p['symbol'] for p in d['picks']])
    return run
metric_code='def metrics('+raw_source.split('\ndef metrics(')[1].split('\ninner_results=')[0]
exec(compile(metric_code,str(BASE/'raw-composite-study/raw-research.py')+'#prior-shift-metrics','exec'),globals())
old_summarize=summarize
def summarize(run,ds):
    v=old_summarize(run,ds);pp=[p for d in run['days'] if d['signalDate'] in set(ds) for p in d['picks']]
    for label,strict in [('strictPositiveVolume',True),('rawObservationalMarks',False)]:
        oo=[p['outcome'] for p in pp if p['outcome']['strictLabelValid' if strict else 'rawMarkValid']]
        v[label]['anyNegativeD5NetCount']=sum(o['net5d']<0 for o in oo)
        v[label]['anyNegativeD5NetRate']=statistics.mean(o['net5d']<0 for o in oo) if oo else None
    return v

prior_inner=json.loads((BASE/'balanced-event-study/inner-ledger.json').read_text())['policies']
raw_inner=json.loads((BASE/'raw-composite-study/inner-ledger.json').read_text())['policies']
previous_corrected_inner=json.loads((BASE/'prior-shift-study/inner-ledger.json').read_text())['policies']
inner={'boundedEventComposite':run_policy('boundedEventComposite',early_dates,models['first150'],155),
       'previousPriorCorrected0.65':next(p for p in previous_corrected_inner if p['name']=='priorShiftEventComposite'),
       'unadjustedBalanced0.65':next(p for p in prior_inner if p['name']=='lambda0.65'),
       'currentOverall':next(p for p in raw_inner if p['name']=='currentOverall'),
       'ATRbaseline':next(p for p in raw_inner if p['name']=='ATRbaseline')}
for d in inner['boundedEventComposite']['days']:
    if d['modelActive']:d['priorShift']=prior_by_date[(d['modelScope'],d['signalDate'])]
inner_results={k:summarize(v,early_dates[155:]) for k,v in inner.items()}
(OUT/'inner-stage-results-before-outer.json').write_text(json.dumps({'frozenFamilyNoSelection':True,'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'planSha256':sha(PLAN),'innerResults':inner_results},ensure_ascii=False,indent=2))
print('INNER_FIXED_FAMILY',json.dumps(inner_results),flush=True)

# Same family regardless inner result. No retuning/selection; first outer calibration now.
build_asof('all235',outer_dates)
assert prior_by_date==previous_priors,'All prior windows/probabilities changed'
previous_outer=json.loads((BASE/'balanced-event-study/outer-ledger.json').read_text())['policies']
previous_corrected_outer=json.loads((BASE/'prior-shift-study/outer-ledger.json').read_text())['policies']
outer={'boundedEventComposite':run_policy('boundedEventComposite',outer_dates,models['all235'],0),
       'previousPriorCorrected0.65':next(p for p in previous_corrected_outer if p['name']=='priorShiftEventComposite'),
       'unadjustedBalanced0.65':next(p for p in previous_outer if p['name']=='balancedEventComposite'),
       'currentOverall':next(p for p in previous_outer if p['name']=='currentOverall'),
       'ATRbaseline':next(p for p in previous_outer if p['name']=='ATRbaseline')}
for d in outer['boundedEventComposite']['days']:d['priorShift']=prior_by_date[(d['modelScope'],d['signalDate'])]
splits={'originalTrainDiagnostic':original_dates[:80],'validationReused':original_dates[85:115],'testReused':original_dates[120:],'allOriginal180':original_dates,'partialFreshSpotcheck':[outer_dates[-1]]}
outer_results={split:{k:summarize(run,ds) for k,run in outer.items()} for split,ds in splits.items()}
for split,result in outer_results.items():print('OUTER_FIXED_FAMILY',split,json.dumps(result),flush=True)

calibration={}
for split,ds in [('inner80',early_dates[155:])]+list(splits.items()):
    runs=inner if split=='inner80' else outer
    calibration[split]={}
    for key in ['boundedEventComposite','previousPriorCorrected0.65']:
        pp=[p for d in runs[key]['days'] if d['signalDate'] in set(ds) for p in d['picks'] if p['outcome']['strictLabelValid']]
        calibration[split][key]={}
        for head in HEAD_NAMES:
            value=lambda p:float(p['outcome']['touch']) if head=='touch' else float(p['outcome']['entryBullish']) if head=='D1bullish' else float(p['outcome']['net5d']<=-.05)
            bins=[]
            for j in range(10):
                bb=[p for p in pp if j/10<=p['probabilities'][head]<(j+1)/10 or j==9 and p['probabilities'][head]==1]
                bins.append({'from':j/10,'through':(j+1)/10,'points':len(bb),'meanPredicted':statistics.mean(p['probabilities'][head] for p in bb) if bb else None,'empiricalRate':statistics.mean(value(p) for p in bb) if bb else None})
            calibration[split][key][head]={'points':len(pp),'meanPredicted':statistics.mean(p['probabilities'][head] for p in pp) if pp else None,'empiricalRate':statistics.mean(value(p) for p in pp) if pp else None,'brier':statistics.mean((p['probabilities'][head]-value(p))**2 for p in pp) if pp else None,'fixedDeciles':bins}

bootstrap={}
for split in ['testReused','allOriginal180']:
    ds=splits[split];n=len(ds);rng=np.random.default_rng(42);starts=rng.integers(0,n,size=(1000,math.ceil(n/10)))
    indices=((starts[:,:,None]+np.arange(10))%n).reshape(1000,-1)[:,:n]
    bootstrap[split]={}
    for key in ['boundedEventComposite','previousPriorCorrected0.65']:
        dm={d['signalDate']:d for d in outer[key]['days']};daily=[]
        for d in ds:
            oo=[p['outcome'] for p in dm[d]['picks'] if p['outcome']['strictLabelValid']]
            daily.append([len(oo),sum(o['touch'] for o in oo),sum(o['net5d']<=-.05 for o in oo),sum(o['net5d']<0 for o in oo),sum(o['net5d'] for o in oo)])
        sums=np.array(daily)[indices].sum(axis=1);values=sums[:,1:]/sums[:,:1]
        bootstrap[split][key]={'blockDays':10,'draws':1000,'seed':42,'circularMovingBlock':True,'descriptiveOnly':True,'intervals95':{m:[float(v) for v in np.quantile(values[:,i],[.025,.975])] for i,m in enumerate(['touchRate','loss5Rate','anyNegativeD5NetRate','meanD5Net'])}}

audit={'selectedInstances':0,'categoryMutations':[],'rawLabelDifferences':[],'integerScoreDifferences':[],'calibrationMaturityViolations':[],'modelMaturityViolations':[],'unknownStrictSelections':[]}
for scope,runs in [('inner',{'boundedEventComposite':inner['boundedEventComposite']}),('outer',{'boundedEventComposite':outer['boundedEventComposite']})]:
    for name,run in runs.items():
        for d in run['days']:
            for p in d['picks']:
                key=[scope,d['signalDate'],p['symbol']];audit['selectedInstances']+=1
                if any(p['signals'][k]!=p['sourceSignals'][k] for k in CATEGORIES):audit['categoryMutations'].append(key)
                if p['outcome']!=outcome(p['symbol'],d['signalDate']):audit['rawLabelDifferences'].append(key)
                if d['modelActive']:
                    model=models[d['modelScope']]
                    if score_points([p],model)[0][0]!=p['signals']['overall_score']:audit['integerScoreDifferences'].append(key)
                    if model['lastLabelMaturity']>=d['signalDate']:audit['modelMaturityViolations'].append(key)
                    if prior_by_date[(d['modelScope'],d['signalDate'])]['maxIncludedMaturityDate']>d['signalDate']:audit['calibrationMaturityViolations'].append(key)
                if not p['outcome']['strictLabelValid']:audit['unknownStrictSelections'].append({'selection':key,'zeroVolumeFlag':p['outcome']['zeroVolumeFlag'],'missingBarFlag':p['outcome']['missingBarFlag']})
assert not any(audit[k] for k in ['categoryMutations','rawLabelDifferences','integerScoreDifferences','calibrationMaturityViolations','modelMaturityViolations'])
assert all(sha(EVENT/(s+'-model.joblib'))==h for s,h in MODEL_HASHES.items())
assert all(sha(p)==h for p,h in protected.items()),'Previous research artifacts changed'
source_paths=[PLAN,pathlib.Path(__file__),EVENT/'event-research.py',BASE/'raw-composite-study/raw-research.py',EVENT/'first150-model.joblib',EVENT/'all235-model.joblib',BASE/'balanced-event-study/first150-candidate-probabilities.ndjson',BASE/'balanced-event-study/all235-candidate-probabilities.ndjson',extra/'wide.ndjson',extra/'context.ndjson',extra/'runtime-eligibility.ndjson',extra/'manifest.json',BASE/'prior-shift-study/asof-prior-shifts.json',BASE/'prior-shift-study/inner-ledger.json',BASE/'prior-shift-study/outer-ledger.json',RAW]
source_hashes={str(p):sha(p) for p in source_paths}
def ledger(runs):return {'actualPublishedHistory':False,'classifierFitsThisStudy':0,'fixedFamily':'rolling20MatureObservedPriorOddsBoundedFavorableObjectives','lambda':LAMBDA,'sourceHashes':source_hashes,'planSha256':sha(PLAN),'policies':list(runs.values())}
(OUT/'inner-ledger.json').write_text(json.dumps(ledger(inner),ensure_ascii=False,indent=2,allow_nan=False))
(OUT/'outer-ledger.json').write_text(json.dumps(ledger(outer),ensure_ascii=False,indent=2,allow_nan=False))
(OUT/'asof-prior-shifts.json').write_text(json.dumps({'trainingPriors':training_prior,'calendarGaps':calendar_gaps,'days':[v for v in prior_by_date.values()]},ensure_ascii=False,indent=2))
(OUT/'score-mass-and-ties.json').write_text(json.dumps({'observedOnly':True,'noAlternatePolicyPerformance':True,'days':score_mass_daily},ensure_ascii=False,indent=2))
(OUT/'fresh-selections.json').write_text(json.dumps({'actualPublishedHistory':False,'partialFreshOneDayOnly':True,'policies':[{'name':k,'day':v['days'][-1]} for k,v in outer.items()]},ensure_ascii=False,indent=2,allow_nan=False))
report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'plan':PLAN.read_text(),'planSha256':sha(PLAN),'classifierFitsThisStudy':0,'mappingOnlyNoPriorOrHeadChanges':True,'savedModelHashes':MODEL_HASHES,'trainingPriors':training_prior,'panelCount':len(panel),'innerResults':inner_results,'outerResults':outer_results,'probabilityCalibration':calibration,'descriptiveBlockBootstrap':bootstrap,'selectedRawAudit':audit,'calibrationSourceLabelDifferences':source_label_diff,'calibrationCalendarGaps':calendar_gaps,'sourceHashes':source_hashes,'protectedPriorHashes':protected,'promotion':'Research only; no production writes','caveats':['Previouslyseen/reused periods not pristine OOS','Observed recent20 prevalence as currentprior proxy is our fixed hypothesis, not guaranteed by Saerens2002','Classconditional drift or miscalibrated rawheads can invalidate odds correction','Anynegative D5net and D5net<=-5 loss are separately reported','Same-close maturelabels allowed only closedasof with actual calendar+5 maturity','Strictlabel unknown retained in selections; currentmaster andpartialwarmup biases remain','Daily-high target exit is only assumedexecutionproxy, not actualfills; bootstrap cannot erase selection/search reuse']}
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False))
(OUT/'summary.json').write_text(json.dumps({k:v for k,v in report.items() if k not in ['plan','protectedPriorHashes','probabilityCalibration']},ensure_ascii=False,indent=2,allow_nan=False))
print('AUDIT',json.dumps(audit),flush=True);print('DONE',OUT,flush=True)
