# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import pathlib, json, hashlib, math, statistics, collections, datetime
import numpy as np
from scipy.optimize import minimize
from scipy.stats import rankdata

BASE=pathlib.Path('/tmp/composite-score-research-20260930');OUT=BASE/'weight-study';PLAN=OUT/'weight-plan.txt'
protected=json.loads((OUT/'protected-prior-hashes.json').read_text())
assert all(hashlib.file_digest(pathlib.Path(p).open('rb'),'sha256').hexdigest()==h for p,h in protected.items())
# Reuse only the frozen exact source/TS eligibility/raw label loader, not prior analysis outcomes.
loader=BASE/'horizon-research.py';loader_text=loader.read_text().split('\ndef metric(pp):')[0]
env={};exec(compile(loader_text,str(loader),'exec'),env)
rows=env['rows'];eligible=env['eligible'];raw=env['raw'];dates=env['dates'];historical=env['historical'];days=env['days'];di=env['di'];keys=env['keys'];meta=env['meta'];manifest=env['manifest']
categories=keys[:6];original=np.array([.20,.15,.25,.10,.20,.10]);equal=np.full(6,1/6)
families=['arithmetic','geometric'];fit_dates={'first40':historical[:40],'first80':historical[:80]}
inner_dates=historical[45:80];outer_splits={'trainSeed':historical[:80],'validation':historical[85:115],'test':historical[120:],'partialFreshSpotcheck':[dates[-1]]}
strict=lambda p:p['rawMarkValid'] and not p['zeroVolumeFlag'] and p['entryBullish'] is not None
for date,points in rows.items():
    for p in points:
        p['utilityLabelValid']=bool(strict(p))
        if strict(p):
            n=p['net5d'];p['utility']=n+.10*int(p['touch'] and n>0)+.025*int(p['entryBullish'])-max(0,-n)-.5*max(0,-p['mae']-.05)
        else:p['utility']=None

def quantize(w):
    units=np.rint(w*1_000_000).astype(int);adjustments=[]
    excess=int(units[0]+units[5]-350_000)
    if excess>0:
        source=max([0,5],key=lambda k:units[k]-50_000);target=max([1,2,3,4],key=lambda k:500_000-units[k]);units[source]-=excess;units[target]+=excess;adjustments.append({'reason':'trendSentimentCapRounding','source':source,'target':target,'millionths':excess})
    delta=int(1_000_000-units.sum())
    if delta:
        target=max([1,2,3,4],key=lambda k:500_000-units[k] if delta>0 else units[k]-50_000);units[target]+=delta;adjustments.append({'reason':'sumResidualRounding','target':target,'millionths':delta})
    assert units.sum()==1_000_000 and np.all((units>=50_000)&(units<=500_000)) and units[0]+units[5]<=350_000
    return units,adjustments

fits={}
for scope,ds in fit_dates.items():
    activation=historical[45] if scope=='first40' else historical[85]
    assert all(days[di[d]+5]<activation for d in ds)
    for family in families:
        gg=np.zeros((6,6));bb=np.zeros(6);cc=0.;nrows=0;missing=0;counts=[]
        for d in ds:
            allpoints=eligible[d];pp=[p for p in allpoints if strict(p)];missing+=len(allpoints)-len(pp)
            xx=np.array([[p['signals'][k] for k in categories] for p in pp],dtype=float)
            x=xx/100 if family=='arithmetic' else np.log(np.maximum(xx,1))/np.log(100)
            utility=np.array([p['utility'] for p in pp]);y=(rankdata(utility,method='average')-.5)/len(pp)
            gg+=x.T@x/len(pp);bb+=x.T@y/len(pp);cc+=float(y@y/len(pp));nrows+=len(pp);counts.append({'date':d,'validLabels':len(pp),'missingLabels':len(allpoints)-len(pp)})
        gg/=len(ds);bb/=len(ds);cc/=len(ds)
        objective=lambda w:float(w@gg@w-2*bb@w+cc+.05*((w-equal)@(w-equal)))
        jac=lambda w:2*gg@w-2*bb+.10*(w-equal)
        constraints=[{'type':'eq','fun':lambda w:float(w.sum()-1),'jac':lambda w:np.ones(6)},{'type':'ineq','fun':lambda w:float(.35-w[0]-w[5]),'jac':lambda w:np.array([-1.,0,0,0,0,-1.])}]
        result=minimize(objective,equal,jac=jac,method='SLSQP',bounds=[(.05,.50)]*6,constraints=constraints,options={'ftol':1e-12,'maxiter':1000,'disp':False})
        assert result.success and abs(result.x.sum()-1)<1e-8 and result.x[0]+result.x[5]<=.35+1e-8,(scope,family,result.message)
        units,adjustments=quantize(result.x);w=units/1_000_000
        name=scope+'_'+family
        fits[name]={'scope':scope,'family':family,'categories':categories,'weightMillionths':units.tolist(),'weights':{k:float(v) for k,v in zip(categories,w)},'rawOptimizerWeights':result.x.tolist(),'roundingAdjustments':adjustments,'weightSum':int(units.sum())/1_000_000,'trendSentimentSum':int(units[0]+units[5])/1_000_000,'objectiveFrozen':objective(w),'objectiveRaw':objective(result.x),'objectiveEqual':objective(equal),'objectiveOriginalCurrentWeights':objective(original),'trainingRows':nrows,'missingTrainingUtilityLabels':missing,'trainingDays':len(ds),'trainingDateCounts':counts,'trainSignalFrom':ds[0],'trainSignalThrough':ds[-1],'lastTrainingLabelMaturity':days[di[ds[-1]]+5],'activationDate':activation,'allMaturitiesStrictlyEarlier':True,'solver':{'method':'SLSQP','success':bool(result.success),'status':int(result.status),'message':str(result.message),'iterations':int(result.nit),'ftol':1e-12,'maxiter':1000},'trainingQuadraticSha256':hashlib.sha256(gg.tobytes()+bb.tobytes()+np.array([cc]).tobytes()).hexdigest()}
        print('FIT',name,json.dumps({k:fits[name][k] for k in ['weights','objectiveFrozen','objectiveEqual','trainingRows','missingTrainingUtilityLabels']}),flush=True)
(OUT/'weights.json').write_text(json.dumps(fits,indent=2))

def score(p,fit):
    values=[p['signals'][k] for k in categories];units=fit['weightMillionths']
    if fit['family']=='arithmetic':value=(sum(u*v for u,v in zip(units,values))+500_000)//1_000_000
    elif any(v==0 for v in values):value=0
    else:value=math.floor(math.exp(sum(u/1_000_000*math.log(v) for u,v in zip(units,values)))+.5)
    return int(min(100,max(0,value)))

def select(name,fit,activation_index,signal_dates):
    recent=[];daily=[];picks=[]
    for idx,d in enumerate(signal_dates):
        active=fit is not None and idx>=activation_index;excluded={s for ss in recent[-20:] for s in ss};pool=[p for p in eligible[d] if p['symbol'] not in excluded]
        scored=[(score(p,fit) if active else p['signals']['overall_score'],p) for p in pool]
        ranked=sorted(scored,key=lambda pair:(-pair[0],-pair[1]['feature']['averageTurnover20'],pair[1]['symbol']))
        chosen=ranked[:3] if len(ranked)>=3 else [];recent.append([p['symbol'] for s,p in chosen]);assert not excluded.intersection(p['symbol'] for s,p in chosen)
        daily.append({'signalDate':d,'recommendationDateExpected':days[di[d]+1],'expectedD5date':days[di[d]+5],'modelActive':active,'fitScope':fit['scope'] if active else None,'selectionMode':fit['family'] if active else 'currentOriginalOverallSeed' if fit is not None else 'currentOriginalOverall','cooldown':20,'commonEligibleCount':len(eligible[d]),'afterCooldownCount':len(pool),'pickedCount':len(chosen),'shortfallReason':None if chosen else 'fewerThanThreeRuntimeEligibleCandidatesAfterCooldown'})
        for rank,(s,p) in enumerate(chosen,1):
            published={**p['signals'],'overall_score':s}
            assert all(published[k]==p['signals'][k] for k in categories)
            picks.append({**p,'sourceSignals':p['signals'],'signals':published,'selectionRank':rank,'weightFamily':fit['family'] if active else None,'fitScope':fit['scope'] if active else None,'modelActive':active})
    return {'name':name,'daily':daily,'picks':picks}

inner={f:select('inner_'+f,fits['first40_'+f],45,historical[:80]) for f in families};inner['currentOriginalOverall']=select('currentOriginalOverall',None,0,historical[:80])
outer={f:select('outer_'+f,fits['first80_'+f],85,dates) for f in families};outer['currentOriginalOverall']=select('currentOriginalOverall',None,0,dates)

def observations(pp,strict_only):
    valid=[p for p in pp if strict(p)] if strict_only else [p for p in pp if p['rawMarkValid']];n=len(valid);rr=[p['net5d'] for p in valid];bull=[p['entryBullish'] for p in valid if p['entryBullish'] is not None]
    return {'validLabels':n,'missingLabels':len(pp)-n,'touchCount':sum(p['touch'] for p in valid),'touchRate':sum(p['touch'] for p in valid)/n if n else None,'D1bullishCount':sum(bull),'D1bullishRate':sum(bull)/len(bull) if bull else None,'meanNet5d':statistics.mean(rr) if rr else None,'medianNet5d':statistics.median(rr) if rr else None,'positiveNetRate':sum(r>0 for r in rr)/n if n else None,'loss5Count':sum(r<=-.05 for r in rr),'loss10Count':sum(r<=-.1 for r in rr),'loss5Rate':sum(r<=-.05 for r in rr)/n if n else None,'loss10Rate':sum(r<=-.1 for r in rr)/n if n else None,'meanMAE':statistics.mean(p['mae'] for p in valid) if valid else None,'worstNet5d':min(rr) if rr else None,'worstMAE':min(p['mae'] for p in valid) if valid else None}

def summarize(run,ds):
    pp=[p for p in run['picks'] if p['date'] in ds];dd=[d for d in run['daily'] if d['signalDate'] in ds];group=collections.defaultdict(list)
    for p in pp:group[p['date']].append(p)
    utilities=[statistics.mean(p['utility'] for p in group[d] if strict(p)) for d in ds if any(strict(p) for p in group[d])];scores=[p['signals']['overall_score'] for p in pp]
    return {'days':len(dd),'full3Days':sum(d['pickedCount']==3 for d in dd),'picks':len(pp),'slotCoverage':len(pp)/(3*len(dd)) if dd else None,'zeroVolumePicks':sum(p['zeroVolumeFlag'] for p in pp),'rawMark':observations(pp,False),'strictPositiveVolumeLabels':observations(pp,True),'signalDateMeanUtility':statistics.mean(utilities) if utilities else None,'utilityCoveredDates':len(utilities),'scoreMin':min(scores) if scores else None,'scoreMean':statistics.mean(scores) if scores else None,'scoreMax':max(scores) if scores else None,'scoreAtLeast70Count':sum(s>=70 for s in scores),'all3ScoreAtLeast70Days':sum(len(g)==3 and all(p['signals']['overall_score']>=70 for p in g) for g in group.values()),'all3TouchDays':sum(len(g)==3 and all(p.get('touch',False) for p in g) for g in group.values()),'all3BullishDays':sum(len(g)==3 and all(p['entryBullish'] for p in g) for g in group.values()),'all3PositiveNetDays':sum(len(g)==3 and all(p['rawMarkValid'] and p['net5d']>0 for p in g) for g in group.values()),'shortfallDays':[d['signalDate'] for d in dd if d['pickedCount']!=3]}

inner_summary={name:summarize(run,inner_dates) for name,run in inner.items()};inner_failures={};passed=[]
reference=inner_summary['currentOriginalOverall'];bb=reference['strictPositiveVolumeLabels']
for family in families:
    ss=inner_summary[family];aa=ss['strictPositiveVolumeLabels'];fail=[]
    if ss['full3Days']!=35:fail.append('notExactly3EveryInnerDay')
    for key in ['loss5Rate','loss10Rate']:
        if aa[key] is None or bb[key] is None or aa[key]>=bb[key]:fail.append(key+'NotStrictlyLower')
    if aa['meanNet5d'] is None or bb['meanNet5d'] is None or aa['meanNet5d']<=bb['meanNet5d']:fail.append('meanNetNotStrictlyHigher')
    if aa['touchRate'] is None or aa['touchRate']<.10:fail.append('touchBelow10Percent')
    if aa['D1bullishRate'] is None or bb['D1bullishRate'] is None or aa['D1bullishRate']<bb['D1bullishRate']:fail.append('D1bullishBelowCurrent')
    inner_failures[family]=fail
    if not fail:passed.append(family)
choice=max(passed,key=lambda f:(inner_summary[f]['signalDateMeanUtility'],f=='arithmetic')) if passed else None
print('INNER',json.dumps(inner_summary),flush=True);print('INNER_CHOICE',choice,'failures',json.dumps(inner_failures),flush=True)
report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'plan':PLAN.read_text(),'planSha256':hashlib.sha256(PLAN.read_bytes()).hexdigest(),'sourceScoreVersion':manifest['signalScoreVersion'],'sourceScoreCommit':manifest['sourceCommit'],'weights':fits,'innerSplit':{'trainDates':historical[:40],'purgeDates':historical[40:45],'evaluationDates':inner_dates},'innerResults':inner_summary,'innerAcceptanceFailures':inner_failures,'innerChoice':choice,'outerResults':{},'outerComparisons':{},'promotionSupported':[],'caveats':['Research only; source categories remain exactly unchanged, integer overall controls all ranking','Historical train/inner/validation/test dates previously seen; no pristine OOS claim','Zero-volume or unknown future bars make utility/strict-label evaluation missing; selections retained and raw mark shown separately','Existing current master/status pool is biased snapshot and already filters common gate before export','No external-date optimization or final-test-driven family choice; both80refit families replayed diagnostically even if innerreject','Geometric family category0 implies publishedoverall0 although fit predictor substitutes1 for log; this specified mismatch is disclosed']}
for split,ds in outer_splits.items():
    results={name:summarize(run,ds) for name,run in outer.items()};report['outerResults'][split]=results;report['outerComparisons'][split]={}
    for family in families:
        aa=results[family]['strictPositiveVolumeLabels'];bb=results['currentOriginalOverall']['strictPositiveVolumeLabels'];fail=[]
        for key,direction in [('touchRate',1),('D1bullishRate',1),('meanNet5d',1),('medianNet5d',1),('loss5Rate',-1),('loss10Rate',-1),('meanMAE',1)]:
            if aa[key] is None or bb[key] is None or (aa[key]<bb[key] if direction==1 else aa[key]>bb[key]):fail.append(key+'WorseThanCurrentOverall')
        if results[family]['full3Days']!=len(ds):fail.append('notExactly3EveryDay')
        if aa['meanNet5d'] is None or aa['meanNet5d']<=0:fail.append('nonPositiveMeanNet')
        if aa['medianNet5d'] is None or aa['medianNet5d']<=0:fail.append('nonPositiveMedianNet')
        report['outerComparisons'][split][family]={'failures':fail,'comparisonScope':'strict positive-volume validlabels; missing counts remain in summary'}
    print('OUTER',split,json.dumps(results),flush=True)
if choice is not None and all(not report['outerComparisons'][split][choice]['failures'] and report['outerResults'][split][choice]['strictPositiveVolumeLabels']['missingLabels']==0 for split in ['validation','test']):report['promotionSupported'].append(choice)

master_names={m['symbol']:m['name'] for m in meta['masters']}
audit={'instances':0,'categoryMutations':[],'labelDifferences':[],'expectedUnavailableSourceLabels':[],'zeroVolumeInstances':0,'missingBarInstances':0,'maturityViolations':[]}
def ledger(runs):
    result={'actualPublishedHistory':False,'initialState':'empty on '+dates[0],'cooldown':20,'tieContract':'actual rounded integer overall desc, turnover desc, symbol lexical','scoreSourceCommit':manifest['sourceCommit'],'nameSnapshotAt':meta['downloadedAt'],'policies':[]}
    for name,run in runs.items():
        grouped=collections.defaultdict(list)
        for p in run['picks']:grouped[p['date']].append(p)
        policy={'name':name,'days':[]}
        for d in run['daily']:
            day={**d,'picks':[]};date=d['signalDate'];i=di[date]
            for p in grouped[date]:
                audit['instances']+=1;audit['zeroVolumeInstances']+=p['zeroVolumeFlag'];audit['missingBarInstances']+=p['missingBarFlag'];label=p['sourceLabel'];key=[name,date,p['symbol']]
                if any(p['signals'][k]!=p['sourceSignals'][k] for k in categories):audit['categoryMutations'].append(key)
                if p['rawMarkValid'] and (not label or label.get('status') not in ['hit','miss']):audit['expectedUnavailableSourceLabels'].append({'selection':key,'sourceStatus':label.get('status') if label else None,'utilityLabelValid':p['utilityLabelValid'],'zeroVolumeFlag':p['zeroVolumeFlag'],'note':'Raw observational mark shown; source tradable label unavailable, strict utility label remains missing'})
                elif p['rawMarkValid'] and (abs(p['net5d']-(label['return5d']-.003))>1e-9 or abs(p['mae']-label['maxDrawdown'])>1e-9 or p['touch']!=label['touched'] or p['entry']!=label['entry'] or days[i+1]!=label['entryDate']):audit['labelDifferences'].append(key)
                rr=raw.get(p['symbol'],[])[i+1:i+6]
                day['picks'].append({**p,'currentMasterName':master_names.get(p['symbol']),'recommendationDate':days[i+1],'expectedD5date':days[i+5],'D1open':rr[0][0] if rr and rr[0] else None,'dailyBars':[{'session':j,'date':days[i+j],'source':'kis',**dict(zip(['open','high','low','close','volume'],bar))} if bar else {'session':j,'date':days[i+j],'missing':True} for j,bar in enumerate(rr,1)]})
            policy['days'].append(day)
        result['policies'].append(policy)
    return result
inner_ledger=ledger(inner);outer_ledger=ledger(outer)
for fit in fits.values():
    if fit['lastTrainingLabelMaturity']>=fit['activationDate']:audit['maturityViolations'].append([fit['scope'],fit['family']])
prior=json.loads((BASE/'horizon-ledger.json').read_text());old_current=next(p for p in prior['policies'] if p['name']=='currentOverallDescCooldown20');new_current=next(p for p in outer_ledger['policies'] if p['name']=='currentOriginalOverall');differences=[d['signalDate'] for d,old in zip(new_current['days'],old_current['days']) if [p['symbol'] for p in d['picks']]!=[p['symbol'] for p in old['picks']]]
assert not differences,'Current overall baseline drift';report['currentOverall181BaselineDifferences']=differences;report['rawAudit']=audit
assert all(hashlib.file_digest(pathlib.Path(p).open('rb'),'sha256').hexdigest()==h for p,h in protected.items()),'Earlier files mutated'
report['protectedPriorHashes']=protected;report['sourceHashes']={str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [PLAN,loader,BASE/'current-signals.ndjson',BASE/'current-signals-manifest.json',BASE/'horizon-runtime-eligibility.ndjson',BASE/'horizon-runtime-eligibility-audit.json',OUT/'weights.json',pathlib.Path(__file__),env['PRIMARY'],env['META'],env['FRESH']/'scored.ndjson',env['FRESH']/'features/metadata.json',env['RAW']]}
for l in [inner_ledger,outer_ledger]:l['sourceHashes']=report['sourceHashes'];l['planSha256']=report['planSha256']
(OUT/'inner-ledger.json').write_text(json.dumps(inner_ledger,ensure_ascii=False,indent=2));(OUT/'outer-ledger.json').write_text(json.dumps(outer_ledger,ensure_ascii=False,indent=2));(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));(OUT/'summary.json').write_text(json.dumps({k:v for k,v in report.items() if k not in ['plan','protectedPriorHashes']},ensure_ascii=False,indent=2));(OUT/'fresh-selections.json').write_text(json.dumps({'actualPublishedHistory':False,'partialFreshHoldoutOnly':True,'policies':[{'name':p['name'],'day':p['days'][-1]} for p in outer_ledger['policies']]},ensure_ascii=False,indent=2))
print('AUDIT',json.dumps(audit),flush=True);print('PROMOTION',json.dumps(report['promotionSupported']),flush=True)
