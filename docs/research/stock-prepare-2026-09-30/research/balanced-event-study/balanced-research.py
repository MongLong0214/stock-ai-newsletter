# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import pathlib,json,hashlib,math,statistics,datetime
import numpy as np
import joblib

BASE=pathlib.Path('/tmp/composite-score-research-20260930');EVENT=BASE/'event-composite-study';OUT=BASE/'balanced-event-study';PLAN=OUT/'balanced-plan.txt'
event_source=(EVENT/'event-research.py').read_text();data_prefix=event_source.split('\nFEATURE_NAMES=')[0]
data_prefix=data_prefix.replace("OUT=BASE/'event-composite-study'","OUT=BASE/'balanced-event-study'").replace("PLAN=OUT/'event-plan.txt'","PLAN=OUT/'balanced-plan.txt'").replace('eef81c7d88c58ffc52545d4d4e1d734e1bef35ef7d61dd82e9cf20a7bd9c7ea5','f23a807dbbebb22086e4334cbd54a8a89bbc26e87308c3949f262f17d624bc15').replace("['weight-study','atom-study','raw-composite-study']","['weight-study','atom-study','raw-composite-study','event-composite-study']")
# Read-only frozen observed data/TS gate/raw labels loader only, no classifier fit code.
exec(compile(data_prefix,str(EVENT/'event-research.py')+'#balanced-data-only','exec'),globals())
LAMBDAS=[.2,.35,.5,.65,.8,1.0];HEAD_NAMES=['touch','D1bullish','loss5']
model_hashes={'first150':'a8653b31385a9af2627378fc4d7baf09070ac77ab53ab2984da55edc036a8b94','all235':'ef8b69a6e9c9d8c311579b96241b1accb6b71d3703feb4ebb9d25a7ed7b37677'}
models={}
for scope,h in model_hashes.items():
    path=EVENT/(scope+'-model.joblib');assert sha(path)==h;models[scope]=joblib.load(path)
    assert all(m.n_iter_==100 for m in models[scope]['heads'].values())
FEATURE_NAMES=models['first150']['featureNames'];assert FEATURE_NAMES==models['all235']['featureNames'] and len(FEATURE_NAMES)==18
probability_cache={}
def cache_probabilities(scope,ds):
    model=models[scope];cache={};file=OUT/(scope+'-candidate-probabilities.ndjson');count=0
    with file.open('w') as h:
        for d in ds:
            pp=rows[d];xx=np.array([[v if finite(v) else np.nan for v in p['atoms']] for p in pp],dtype=float)
            probabilities=np.column_stack([model['heads'][head].predict_proba(xx)[:,1] for head in HEAD_NAMES]);cache[d]={p['symbol']:tuple(map(float,probs)) for p,probs in zip(pp,probabilities)}
            h.write(json.dumps({'date':d,'sourceScope':scope,'predictions':[{'symbol':p['symbol'],'probabilities':dict(zip(HEAD_NAMES,map(float,probs)))} for p,probs in zip(pp,probabilities)]},separators=(',',':'))+'\n');count+=len(pp)
    probability_cache[scope]=cache;print('CACHED',scope,len(ds),count,flush=True)
def score_points(pp,model):
    probs=np.array([probability_cache[model['scope']][p['date']][p['symbol']] for p in pp]) if pp else np.empty((0,3))
    raw_scores=100*(.8*probs[:,0]+.2*probs[:,1])-(100*model['lambda'])*probs[:,2]
    scores=np.floor(np.clip(raw_scores,0,100)+.5).astype(int)
    return [(int(s),float(raw_score),{**p,'probabilities':dict(zip(HEAD_NAMES,map(float,prob)))}) for s,raw_score,p,prob in zip(scores,raw_scores,pp,probs)]
raw_source=(BASE/'raw-composite-study/raw-research.py').read_text()
policy_code='def run_policy('+raw_source.split('\ndef run_policy(')[1].split('\ninner={')[0]
policy_code=policy_code.replace("scorable=[p for p in after_cd if p['scorable']] if active else after_cd","scorable=after_cd").replace("'scoreMu':mu","'scoreRawComposite':mu").replace("'rawTargetUtilityComposite'","'balancedEventComposite'").replace("dict(zip(ATOM_NAMES,p['atoms']))","dict(zip(FEATURE_NAMES,p['atoms']))")
exec(compile(policy_code,str(BASE/'raw-composite-study/raw-research.py')+'#balanced-policy','exec'),globals())
metric_code='def metrics('+raw_source.split('\ndef metrics(')[1].split('\ninner_results=')[0]
exec(compile(metric_code,str(BASE/'raw-composite-study/raw-research.py')+'#balanced-metrics','exec'),globals())
cache_probabilities('first150',early_dates[155:])
inner={};inner_results={}
for lam in LAMBDAS:
    key='lambda'+str(lam);run=run_policy(key,early_dates,{**models['first150'],'lambda':lam},155);run['lambda']=lam
    for d in run['days']:d['lambda']=lam if d['modelActive'] else None
    inner[key]=run;s=summarize(run,early_dates[155:]);m=s['strictPositiveVolume'];s['lambda']=lam;s['targetSquaredDistance']=(m['touchRate']-.40)**2+(m['loss5Rate']-.30)**2;inner_results[key]=s
    print('INNER_POLICY',key,json.dumps(s),flush=True)
old=json.loads((EVENT/'inner-ledger.json').read_text());old_run=next(p for p in old['policies'] if p['name']=='eventComposite');differences=[]
for a,b in zip(inner['lambda0.2']['days'],old_run['days']):
    if [(p['symbol'],p['signals']['overall_score']) for p in a['picks']]!=[(p['symbol'],p['signals']['overall_score']) for p in b['picks']]:differences.append(a['signalDate'])
assert not differences,'Lambda.2 numerical equivalence failed'
chosen_key=min(inner_results,key=lambda k:(inner_results[k]['targetSquaredDistance'],-inner_results[k]['strictPositiveVolume']['D1bullishRate'],inner_results[k]['lambda']))
chosen_lambda=inner_results[chosen_key]['lambda']
choice={'chosenLambda':chosen_lambda,'chosenPolicyKey':chosen_key,'decisionRule':'min squared distance to strict touch40% and D5net<=-5loss30%; exact tie higher strict D1bull, then lowerlambda','choiceMadeBeforeOuterPredictionOrEvaluation':True,'innerRange':[early_dates[155],early_dates[-1]],'allInnerResults':inner_results,'oldLambdaPoint2IntegerRosterDifferences':differences,'knownPreviousPoint2Outcomes':True,'classifierFitsThisStudy':0,'savedModelHashes':model_hashes,'chosenAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'planSha256':sha(PLAN)}
(OUT/'chosen-lambda.json').write_text(json.dumps(choice,ensure_ascii=False,indent=2));print('CHOSEN_BEFORE_OUTER',chosen_lambda,flush=True)
# No outer-grid evaluation: the choice is already saved; forecast/choose with selectedlambda only.
cache_probabilities('all235',outer_dates)
outer={'balancedEventComposite':run_policy('balancedEventComposite',outer_dates,{**models['all235'],'lambda':chosen_lambda},0),'currentOverall':run_policy('currentOverall',outer_dates),'ATRbaseline':run_policy('ATRbaseline',outer_dates,mode='atr')}
outer['balancedEventComposite']['lambda']=chosen_lambda
for d in outer['balancedEventComposite']['days']:d['lambda']=chosen_lambda
splits={'originalTrainDiagnostic':original_dates[:80],'validationReused':original_dates[85:115],'testReused':original_dates[120:],'allOriginal180':original_dates,'partialFreshSpotcheck':[outer_dates[-1]]}
outer_results={split:{k:summarize(run,ds) for k,run in outer.items()} for split,ds in splits.items()}
for split,result in outer_results.items():print('OUTER_CHOSEN',split,json.dumps(result),flush=True)
raw_audit={'selectedInstances':0,'categoryMutations':[],'labelDifferences':[],'integerScoreDifferences':[],'maturityViolations':[],'zeroVolumeInstances':0,'missingBarInstances':0,'strictMissingSelections':[],'oldPoint2IntegerRosterDifferences':differences}
for scope,runs in [('inner',inner),('outer',outer)]:
    for name,run in runs.items():
        for d in run['days']:
            for p in d['picks']:
                key=[scope,name,d['signalDate'],p['symbol']];o=p['outcome'];raw_audit['selectedInstances']+=1;raw_audit['zeroVolumeInstances']+=o['zeroVolumeFlag'];raw_audit['missingBarInstances']+=o['missingBarFlag']
                if any(p['signals'][k]!=p['sourceSignals'][k] for k in CATEGORIES):raw_audit['categoryMutations'].append(key)
                if o!=outcome(p['symbol'],d['signalDate']):raw_audit['labelDifferences'].append(key)
                if d['modelActive']:
                    model={**models[d['modelScope']],'lambda':run['lambda']}
                    if score_points([p],model)[0][0]!=p['signals']['overall_score']:raw_audit['integerScoreDifferences'].append(key)
                    if model['lastLabelMaturity']>=d['signalDate']:raw_audit['maturityViolations'].append(key)
                if not o['strictLabelValid']:raw_audit['strictMissingSelections'].append({'selection':key,'zeroVolumeFlag':o['zeroVolumeFlag'],'missingBarFlag':o['missingBarFlag']})
assert not any(raw_audit[k] for k in ['categoryMutations','labelDifferences','integerScoreDifferences','maturityViolations'])
assert all(sha(EVENT/(scope+'-model.joblib'))==h for scope,h in model_hashes.items())
assert all(sha(p)==h for p,h in protected.items()),'Original research artifacts changed'
paths=[PLAN,pathlib.Path(__file__),EVENT/'event-research.py',BASE/'raw-composite-study/raw-research.py',EVENT/'first150-model.joblib',EVENT/'all235-model.joblib',EARLY/'earlier-wide.ndjson',EARLY/'earlier-context.ndjson',EARLY/'earlier-runtime-eligibility.ndjson',BASE/'technical-context.ndjson',BASE/'current-signals.ndjson',BASE/'horizon-runtime-eligibility.ndjson',RAW,OUT/'chosen-lambda.json',OUT/'first150-candidate-probabilities.ndjson',OUT/'all235-candidate-probabilities.ndjson']
source_hashes={str(p):sha(p) for p in paths}
def ledger(runs):return {'actualPublishedHistory':False,'fixedPenaltyFamilyOnly':True,'classifierFitsThisStudy':0,'selectedLambda':chosen_lambda,'planSha256':sha(PLAN),'sourceHashes':source_hashes,'policies':list(runs.values())}
(OUT/'inner-ledger.json').write_text(json.dumps(ledger(inner),ensure_ascii=False,indent=2,allow_nan=False));(OUT/'outer-ledger.json').write_text(json.dumps(ledger(outer),ensure_ascii=False,indent=2,allow_nan=False))
(OUT/'fresh-selections.json').write_text(json.dumps({'actualPublishedHistory':False,'selectedLambda':chosen_lambda,'partialFreshOneDayOnly':True,'policies':[{'name':k,'day':v['days'][-1]} for k,v in outer.items()]},ensure_ascii=False,indent=2,allow_nan=False))
report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'plan':PLAN.read_text(),'planSha256':sha(PLAN),'savedModelHashes':model_hashes,'classifierFitsThisStudy':0,'lambdaGrid':LAMBDAS,'chosenLambda':chosen_lambda,'choice':choice,'innerResults':inner_results,'outerResults':outer_results,'trainingRawAudit':training_raw_audit,'selectedRawAudit':raw_audit,'sourceHashes':source_hashes,'protectedPriorHashes':protected,'promotion':'Research only; no production writes','caveats':['Strictloss means D5net<=-5% with30bpscost, not allnegativeD5 outcomes','Original180/point2/ideas previouslyseen; reuseddiagnostic not pristine OOS','Only inner80 choselambda; oneouterlambda, no outer tuning or classifier refits','Native missing observed inputs allowed; future missinglabels/zero-volume retained in selections','Currentmaster survivorship/earlier80..314vsprod320 warmup remains','Daily-high target exit is anexecutionproxy, not actualfills; repeatedstocks/overlappinglabels dependence remains','Fixedscores cannot be boosted to make3high; publishedinteger decidesrank']}
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False));(OUT/'summary.json').write_text(json.dumps({k:v for k,v in report.items() if k not in ['plan','protectedPriorHashes']},ensure_ascii=False,indent=2,allow_nan=False))
print('AUDIT',json.dumps(raw_audit),flush=True);print('DONE',OUT,flush=True)
