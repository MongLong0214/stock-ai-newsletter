# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import json, pathlib, hashlib, math, statistics, collections, datetime
import numpy as np
from scipy.optimize import minimize

BASE=pathlib.Path('/tmp/composite-score-research-20260930');OUT=BASE/'raw-composite-study'
EARLY=BASE/'earlier-training';FRESH=pathlib.Path('/tmp/stock-research-fresh-mature-20260930')
PLAN=OUT/'raw-plan.txt';RAW=FRESH/'input/prices.ndjson';META=pathlib.Path('/private/tmp/stock-target-rebuilt-20260929/metadata.json')
EARLY_GATE=EARLY/'earlier-runtime-eligibility.ndjson';EARLY_GATE_AUDIT=EARLY/'earlier-runtime-eligibility-audit.json'
ATOM_NAMES=['chaikinMoneyFlow21','distanceFromPriorHigh20Percent','volumeRatio20','atrPercent14','bollingerWidth20Percent','positiveSignalCloseCloseReturnPercent']
CATEGORIES=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score'];SCORE_KEYS=CATEGORIES+['overall_score']
SIGN=np.array([1.,1.,1.,1.,-1.,-1.]);PROBS=np.linspace(0,1,11)
finite=lambda v:isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def sha(path):
    with pathlib.Path(path).open('rb') as h:return hashlib.file_digest(h,'sha256').hexdigest()
assert EARLY_GATE.exists() and EARLY_GATE_AUDIT.exists(),'Actual TS earlier runtime export must finish before fitting'
assert sha(PLAN)=='ea4b357d30d2b156818327a7717007d8127d4bc8857065557776a97fde1b48f6'
protected_files=[p for p in BASE.iterdir() if p.is_file()]+[p for folder in ['weight-study','atom-study'] for p in (BASE/folder).iterdir() if p.is_file()]
protected={str(p):sha(p) for p in protected_files};(OUT/'protected-prior-hashes.json').write_text(json.dumps(protected,indent=2))
meta=json.loads(META.read_text());fm=json.loads((FRESH/'features/metadata.json').read_text());em=json.loads((EARLY/'manifest.json').read_text())
manifest=json.loads((BASE/'current-signals-manifest.json').read_text());names={m['symbol']:m['name'] for m in meta['masters']}
days=fm['tradingDays'];di={d:i for i,d in enumerate(days)};early_dates=list(em['perDate']);original_dates=meta['evaluationDates'];outer_dates=original_dates+fm['evaluationDates']
assert len(early_dates)==235 and len(outer_dates)==181 and early_dates[-1]=='2025-12-15' and days[di[early_dates[-1]]+5]=='2025-12-22'
assert days[di[early_dates[149]]+5]<early_dates[155] and days[di[early_dates[-1]]+5]<outer_dates[0]

def load_gate(path):
    result={}
    for line in path.open():
        x=json.loads(line)
        if 'runtimeEligibleSymbols' in x:result[x['date']]=set(x['runtimeEligibleSymbols'])
        elif 'symbols' in x:result[x['date']]=set(x['symbols'])
        elif 'eligible' in x:
            result.setdefault(x['date'],set())
            if x['eligible']:result[x['date']].add(x['symbol'])
        else:raise ValueError('Unknown runtime eligibility export schema')
    return result
early_gate=load_gate(EARLY_GATE);outer_gate=load_gate(BASE/'horizon-runtime-eligibility.ndjson')
assert list(early_gate)==early_dates and list(outer_gate)==outer_dates
all_gate={**early_gate,**outer_gate};context={};context_points=0
for path in [EARLY/'earlier-context.ndjson',BASE/'technical-context.ndjson']:
    for line in path.open():
        x=json.loads(line);d=x['date'];s=x['symbol']
        if s not in all_gate.get(d,set()):continue
        key=(d,s);assert key not in context
        c=x['context'];context[key]=(c.get('chaikinMoneyFlow21'),c.get('distanceFromPriorHigh20Percent'),c.get('bollingerWidth20Percent'))
        context_points+=1
print('CONTEXT',context_points,flush=True)

rows={d:[] for d in early_dates+outer_dates};input_counts={'earlierTotal':0,'earlierEligible':0,'outerTotal':0,'outerEligible':0,'missingContextEligible':0}
def point(date,p,signals,source):
    f=p['feature'];symbol=p['symbol'];c=context.get((date,symbol),(None,None,None))
    if (date,symbol) not in context:input_counts['missingContextEligible']+=1
    close_return=(1+f['gapFromPreviousClosePercent']/100)*(f['close']/f['open'])-1
    atoms=[c[0],c[1],f.get('volumeRatio20'),f.get('atrPercent14'),c[2],max(0,close_return*100)]
    observed={k:f.get(k) for k in ['open','high','low','close','volume','averageTurnover20','gapFromPreviousClosePercent','rsi14','atrPercent14','volumeRatio20','sma20DistancePercent','position52wObservations','position52wFullWindow']}
    return {'date':date,'symbol':symbol,'currentMasterName':names.get(symbol),'source':source,'atoms':atoms,'scorable':all(finite(v) for v in atoms),'feature':observed,'sourceSignals':signals,'sourceLabel':p.get('label'),'sourceEligibleSnapshot':p.get('flags',{}).get('priorTargetEligible',p.get('eligible'))}
for line in (EARLY/'earlier-wide.ndjson').open():
    p=json.loads(line);d=p['date'];input_counts['earlierTotal']+=1
    if p['symbol'] not in early_gate[d]:continue
    assert p['flags']['preCommonPool'] and p['flags']['hasCalculatedOutputMetrics']
    rows[d].append(point(d,p,p['signals'],'earlier-training'));input_counts['earlierEligible']+=1
score_iter=iter((BASE/'current-signals.ndjson').open())
for path,source in [(pathlib.Path('/tmp/upside-scored.ndjson'),'primary'),(FRESH/'scored.ndjson','fresh-mature')]:
    for line in path.open():
        d,pp=json.loads(line)
        for p in pp:
            ss=json.loads(next(score_iter));assert ss['date']==d and ss['symbol']==p['symbol'] and ss['provenance']==source
            input_counts['outerTotal']+=1
            if p['symbol'] not in outer_gate[d]:continue
            rows[d].append(point(d,p,ss['signals'],source));input_counts['outerEligible']+=1
assert next(score_iter,None) is None
assert all(set(p['symbol'] for p in rows[d])==all_gate[d] for d in rows)
del context
print('ROWS',json.dumps(input_counts),'scorable',sum(p['scorable'] for pp in rows.values() for p in pp),flush=True)

raw={}
for line in RAW.open():
    symbol,rr=json.loads(line);bars=[None]*len(days)
    for r in rr:
        if r['source']=='kis' and r['trade_date'] in di:
            idx=di[r['trade_date']];assert bars[idx] is None;bars[idx]=tuple(r[k] for k in ['open','high','low','close','volume'])
    raw[symbol]=bars
def outcome(symbol,date):
    i=di[date];rr=raw.get(symbol,[])[i+1:i+6];complete=len(rr)==5 and all(r is not None for r in rr)
    valid=complete and all(all(finite(v) and v>0 for v in r[:4]) and r[1]>=max(r[0],r[2],r[3]) and r[2]<=min(r[0],r[1],r[3]) for r in rr)
    volume_positive=complete and all(finite(r[4]) and r[4]>0 for r in rr)
    zero=any(r is not None and (not finite(r[4]) or r[4]<=0) for r in rr)
    result={'rawMarkValid':bool(valid),'strictLabelValid':bool(valid and volume_positive),'zeroVolumeFlag':bool(zero),'missingBarFlag':not complete,'entryBullish':rr[0][3]>rr[0][0] if rr and rr[0] is not None and finite(rr[0][0]) and rr[0][0]>0 else None}
    if valid:
        entry=rr[0][0];gross=rr[-1][3]/entry-1;net=gross-.003;touch=max(r[1] for r in rr)>=entry*110/100
        target_net=(.10 if touch else gross)-.003;utility=target_net+.025*int(result['entryBullish'])-max(0,-target_net)
        first_touch=next((j for j,r in enumerate(rr,1) if r[1]>=entry*110/100),None)
        result.update({'entry':entry,'gross5d':gross,'net5d':net,'touch':bool(touch),'mae':min(0,min(r[2] for r in rr)/entry-1),'maxGainPercent':(max(r[1] for r in rr)/entry-1)*100,'targetNetProxy':target_net,'rawTargetUtilityProxy':utility,'utility':utility if result['strictLabelValid'] else None,'targetFirstTouchSession':first_touch,'touchAndPositiveD5Net':bool(touch and net>0)})
    else:result['utility']=None
    return result
training_raw_audit={'strictSourceComparisons':0,'sourceLabelDifferences':[],'zeroVolumePoints':0,'missingBarPoints':0}
for d in early_dates:
    for p in rows[d]:
        o=outcome(p['symbol'],d);p['outcome']=o;training_raw_audit['zeroVolumePoints']+=o['zeroVolumeFlag'];training_raw_audit['missingBarPoints']+=o['missingBarFlag']
        if o['strictLabelValid']:
            training_raw_audit['strictSourceComparisons']+=1;l=p['sourceLabel']
            if not l or l.get('status') not in ['hit','miss'] or abs((l['return5d']-.003)-o['net5d'])>1e-9 or bool(l['touched'])!=o['touch'] or abs(l['maxDrawdown']-o['mae'])>1e-9 or bool(l['entryBullish'])!=o['entryBullish']:
                training_raw_audit['sourceLabelDifferences'].append([d,p['symbol'],l,o])
assert not training_raw_audit['sourceLabelDifferences'],'Raw training outcome differs from frozen source label'
print('TRAIN_RAW',json.dumps(training_raw_audit),flush=True)

def normalizer(ds):
    result=[]
    for j,name in enumerate(ATOM_NAMES):
        values=np.array([p['atoms'][j] for d in ds for p in rows[d] if finite(p['atoms'][j])],dtype=float)
        assert len(values)>0;knots=np.quantile(values,PROBS,method='linear');unique=np.unique(knots);perc=np.array([(PROBS[knots==v].min()+PROBS[knots==v].max())/2 for v in unique])
        result.append({'atom':name,'finiteEligibleCandidateCount':len(values),'probabilities':PROBS.tolist(),'knots':knots.tolist(),'uniqueValues':unique.tolist(),'midpointProbabilities':perc.tolist(),'duplicateKnotCount':int(len(knots)-len(unique))})
    return result
def normalize(values,norm):
    xx=np.asarray(values,dtype=float);out=np.empty_like(xx)
    for j,n in enumerate(norm):out[:,j]=np.interp(xx[:,j],n['uniqueValues'],n['midpointProbabilities'],left=0.,right=1.)
    return out
def fit_model(scope,ds,activation):
    norm=normalizer(ds);qq=np.zeros((7,7));bb=np.zeros(7);cc=0.;counts=[];used_dates=0;full_rows=0
    for d in ds:
        candidates=rows[d];pp=[p for p in candidates if p['scorable'] and p['outcome']['strictLabelValid']]
        assert days[di[d]+5]<activation
        count={'date':d,'eligible':len(candidates),'scorable':sum(p['scorable'] for p in candidates),'fitRows':len(pp),'strictMissingLabels':sum(not p['outcome']['strictLabelValid'] for p in candidates),'labelMaturityDate':days[di[d]+5]};counts.append(count)
        if not pp:continue
        zz=normalize([p['atoms'] for p in pp],norm);xx=np.column_stack([np.ones(len(pp)),zz*SIGN]);yy=np.array([p['outcome']['utility'] for p in pp])
        qq+=xx.T@xx/len(pp);bb+=xx.T@yy/len(pp);cc+=float(yy@yy/len(pp));used_dates+=1;full_rows+=len(pp)
    assert used_dates==len(ds),'Missing all valid candidates on a fit date';qq/=used_dates;bb/=used_dates;cc/=used_dates
    objective=lambda theta:float(theta@qq@theta-2*bb@theta+cc+.05*(theta[1:]@theta[1:]))
    jac=lambda theta:2*qq@theta-2*bb+np.r_[0.,.10*theta[1:]]
    result=minimize(objective,np.zeros(7),jac=jac,method='SLSQP',bounds=[(None,None)]+[(0,None)]*6,options={'ftol':1e-12,'maxiter':1000,'disp':False})
    assert result.success and min(result.x[1:])>=0,(scope,result.message,result.x)
    theta=result.x;model={'scope':scope,'family':'rawTargetUtilityNonnegativeRidge','atoms':ATOM_NAMES,'signs':SIGN.tolist(),'intercept':float(theta[0]),'coefficients':theta[1:].tolist(),'normalizers':norm,'scoreMap':{'neutral':50,'utilityMultiplier':500,'rounding':'floor(clamp(50+500*mu,0,100)+0.5)'},'trainingDates':ds,'trainingRows':full_rows,'trainingDays':used_dates,'lastLabelMaturity':days[di[ds[-1]]+5],'activationDate':activation,'allMaturitiesStrictlyEarlier':True,'trainingDateCounts':counts,'objective':objective(theta),'objectiveAtZero':objective(np.zeros(7)),'quadratic':{'Q':qq.tolist(),'b':bb.tolist(),'c':cc},'quadraticSha256':hashlib.sha256(qq.tobytes()+bb.tobytes()+np.array([cc]).tobytes()).hexdigest(),'solver':{'method':'SLSQP','success':bool(result.success),'iterations':int(result.nit),'status':int(result.status),'message':str(result.message),'ftol':1e-12,'maxiter':1000,'initialization':[0]*7},'fixedRidge':.05}
    print('FIT',scope,json.dumps({k:model[k] for k in ['intercept','coefficients','trainingRows','objective','objectiveAtZero']}),flush=True)
    (OUT/(scope+'-model.json')).write_text(json.dumps(model,ensure_ascii=False,indent=2));return model
models={'first150':fit_model('first150',early_dates[:150],early_dates[155]),'all235':fit_model('all235',early_dates,outer_dates[0])}
(OUT/'models.json').write_text(json.dumps(models,ensure_ascii=False,indent=2))
def score_points(pp,model):
    if not pp:return []
    zz=normalize([p['atoms'] for p in pp],model['normalizers']);mu=model['intercept']+zz@(np.array(model['coefficients'])*SIGN)
    ss=np.floor(np.clip(50+500*mu,0,100)+.5).astype(int)
    return [(int(s),float(u),p) for s,u,p in zip(ss,mu,pp)]
def run_policy(name,ds,model=None,activation=0,mode='overall'):
    recent=[];daily=[]
    for idx,d in enumerate(ds):
        active=model is not None and idx>=activation;excluded={s for ss in recent[-20:] for s in ss};after_cd=[p for p in rows[d] if p['symbol'] not in excluded]
        scorable=[p for p in after_cd if p['scorable']] if active else after_cd
        scored=score_points(scorable,model) if active else [(p['sourceSignals']['overall_score'],None,p) for p in scorable]
        if mode=='atr':ranked=sorted(scored,key=lambda q:(q[2]['feature']['atrPercent14'],q[2]['symbol']))
        else:ranked=sorted(scored,key=lambda q:(-q[0],-q[2]['feature']['averageTurnover20'],q[2]['symbol']))
        chosen=ranked[:3] if len(ranked)>=3 else [];recent.append([p['symbol'] for _,_,p in chosen])
        assert not excluded.intersection(recent[-1])
        stage=None if chosen else 'observedInputsMissing' if active and len(after_cd)>=3 else 'runtimeEligibleAfterCooldownBelow3'
        day={'signalDate':d,'recommendationDateExpected':days[di[d]+1],'expectedD5date':days[di[d]+5],'cooldown':20,'modelActive':active,'modelScope':model['scope'] if active else None,'selectionMode':'rawTargetUtilityComposite' if active else 'ATRascending' if mode=='atr' else 'currentOriginalOverall','runtimeEligibleCount':len(rows[d]),'afterCooldownCount':len(after_cd),'scorableAfterCooldownCount':len(scorable),'unscorableExcludedObservedInputs':len(after_cd)-len(scorable),'pickedCount':len(chosen),'shortfallStage':stage,'picks':[]}
        for rank,(s,mu,p) in enumerate(chosen,1):
            o=p.get('outcome') or outcome(p['symbol'],d);i=di[d];bars=raw.get(p['symbol'],[])[i+1:i+6];signals={**p['sourceSignals'],'overall_score':s}
            day['picks'].append({**p,'outcome':o,'signals':signals,'selectionRank':rank,'scoreMu':mu,'rawFactors':dict(zip(ATOM_NAMES,p['atoms'])),'recommendationDate':days[i+1],'expectedD5date':days[i+5],'D1open':bars[0][0] if bars and bars[0] else None,'dailyBars':[{'session':j,'date':days[i+j],'source':'kis',**dict(zip(['open','high','low','close','volume'],bar))} if bar else {'session':j,'date':days[i+j],'missing':True} for j,bar in enumerate(bars,1)]})
        daily.append(day)
    return {'name':name,'actualPublishedHistory':False,'initialState':'empty on '+ds[0],'days':daily}
inner={
    'rawComposite':run_policy('rawComposite',early_dates,models['first150'],155),
    'currentOverall':run_policy('currentOverall',early_dates),
    'ATRbaseline':run_policy('ATRbaseline',early_dates,mode='atr')}
outer={
    'rawComposite':run_policy('rawComposite',outer_dates,models['all235'],0),
    'currentOverall':run_policy('currentOverall',outer_dates),
    'ATRbaseline':run_policy('ATRbaseline',outer_dates,mode='atr')}
def metrics(pp,strict):
    vv=[p for p in pp if p['outcome']['strictLabelValid' if strict else 'rawMarkValid']];oo=[p['outcome'] for p in vv];n=len(oo)
    if not n:return {'labels':0,'missingLabels':len(pp)}
    nets=[o['net5d'] for o in oo];target=[o['targetNetProxy'] for o in oo]
    return {'labels':n,'missingLabels':len(pp)-n,'touchCount':sum(o['touch'] for o in oo),'touchRate':statistics.mean(o['touch'] for o in oo),'D1bullishCount':sum(o['entryBullish'] for o in oo),'D1bullishRate':statistics.mean(o['entryBullish'] for o in oo),'touchAndPositiveD5Count':sum(o['touchAndPositiveD5Net'] for o in oo),'meanNet5d':statistics.mean(nets),'medianNet5d':statistics.median(nets),'positiveD5NetRate':statistics.mean(v>0 for v in nets),'loss5Count':sum(v<=-.05 for v in nets),'loss5Rate':statistics.mean(v<=-.05 for v in nets),'loss10Count':sum(v<=-.10 for v in nets),'loss10Rate':statistics.mean(v<=-.10 for v in nets),'worstNet5d':min(nets),'meanMAE':statistics.mean(o['mae'] for o in oo),'worstMAE':min(o['mae'] for o in oo),'meanTargetNetProxy':statistics.mean(target),'medianTargetNetProxy':statistics.median(target),'targetProxyLoss5Count':sum(v<=-.05 for v in target),'targetProxyLoss10Count':sum(v<=-.10 for v in target),'pooledMeanUtilityProxy':statistics.mean(o['rawTargetUtilityProxy'] for o in oo)}
def summarize(run,ds):
    dd=[d for d in run['days'] if d['signalDate'] in set(ds)];pp=[p for d in dd for p in d['picks']];ss=[p['signals']['overall_score'] for p in pp];datebalanced=[]
    for d in dd:
        valid=[p['outcome'] for p in d['picks'] if p['outcome']['strictLabelValid']]
        if valid:datebalanced.append({k:statistics.mean(o[k] for o in valid) for k in ['utility','targetNetProxy','net5d','touch','entryBullish']})
    return {'days':len(dd),'full3Days':sum(d['pickedCount']==3 for d in dd),'picks':len(pp),'slotCoverage':len(pp)/(3*len(dd)) if dd else None,'zeroVolumePicks':sum(p['outcome']['zeroVolumeFlag'] for p in pp),'missingBarPicks':sum(p['outcome']['missingBarFlag'] for p in pp),'strictPositiveVolume':metrics(pp,True),'rawObservationalMarks':metrics(pp,False),'dateBalancedStrictMeans':{k:statistics.mean(v[k] for v in datebalanced) for k in datebalanced[0]} if datebalanced else {},'strictCoveredDates':len(datebalanced),'scoreMin':min(ss) if ss else None,'scoreMean':statistics.mean(ss) if ss else None,'scoreMax':max(ss) if ss else None,'scoreAtLeast70Picks':sum(s>=70 for s in ss),'all3ScoreAtLeast70Days':sum(len(d['picks'])==3 and all(p['signals']['overall_score']>=70 for p in d['picks']) for d in dd),'all3TouchDays':sum(len(d['picks'])==3 and all(p['outcome'].get('touch',False) and p['outcome']['strictLabelValid'] for p in d['picks']) for d in dd),'all3D1BullishDays':sum(len(d['picks'])==3 and all(p['outcome']['strictLabelValid'] and p['outcome']['entryBullish'] for p in d['picks']) for d in dd),'all3PositiveD5Days':sum(len(d['picks'])==3 and all(p['outcome']['strictLabelValid'] and p['outcome']['net5d']>0 for p in d['picks']) for d in dd),'shortfallDays':[{k:d[k] for k in ['signalDate','shortfallStage','runtimeEligibleCount','afterCooldownCount','scorableAfterCooldownCount']} for d in dd if d['pickedCount']!=3]}
inner_results={k:summarize(v,early_dates[155:]) for k,v in inner.items()}
splits={'originalTrainDiagnostic':original_dates[:80],'validationReused':original_dates[85:115],'testReused':original_dates[120:],'allOriginal180':original_dates,'partialFreshSpotcheck':[outer_dates[-1]]}
outer_results={split:{k:summarize(run,ds) for k,run in outer.items()} for split,ds in splits.items()}
print('INNER',json.dumps(inner_results),flush=True)
for split,v in outer_results.items():print('OUTER',split,json.dumps(v),flush=True)
comparison={'scope':'Descriptive fixed-family tradeoff; no family reselection or invented promotion gate','inner':{},'outer':{}}
for label,result in [('inner',inner_results)]+[(s,x) for s,x in outer_results.items()]:
    a=result['rawComposite'];b=result['currentOverall'];am=a['strictPositiveVolume'];bm=b['strictPositiveVolume']
    v={'full3Coverage':a['full3Days']==a['days'],'utilityDifferenceVsCurrent':a['dateBalancedStrictMeans'].get('utility',0)-b['dateBalancedStrictMeans'].get('utility',0),'touchCountDifferenceVsCurrent':am.get('touchCount',0)-bm.get('touchCount',0),'touchRateDifferenceVsCurrent':am.get('touchRate',0)-bm.get('touchRate',0),'D5MeanNetDifferenceVsCurrent':am.get('meanNet5d',0)-bm.get('meanNet5d',0),'D5Loss5RateDifferenceVsCurrent':am.get('loss5Rate',0)-bm.get('loss5Rate',0),'D5Loss10RateDifferenceVsCurrent':am.get('loss10Rate',0)-bm.get('loss10Rate',0),'D1bullishRateDifferenceVsCurrent':am.get('D1bullishRate',0)-bm.get('D1bullishRate',0)}
    if label=='inner':comparison['inner']=v
    else:comparison['outer'][label]=v

audit={'selectedInstances':0,'rawPriceOrDerivedDifferences':[],'categoryMutations':[],'publishedScoreDifferences':[],'sourceLabelDifferences':[],'expectedUnavailableSourceLabels':[],'zeroVolumeInstances':0,'missingBarInstances':0,'maturityViolations':[],'baselineOuter181Differences':[]}
for scope,runs in [('inner',inner),('outer',outer)]:
    for name,run in runs.items():
        for d in run['days']:
            for p in d['picks']:
                audit['selectedInstances']+=1;audit['zeroVolumeInstances']+=p['outcome']['zeroVolumeFlag'];audit['missingBarInstances']+=p['outcome']['missingBarFlag'];key=[scope,name,d['signalDate'],p['symbol']]
                if any(p['signals'][k]!=p['sourceSignals'][k] for k in CATEGORIES):audit['categoryMutations'].append(key)
                if p['outcome']!=outcome(p['symbol'],d['signalDate']):audit['rawPriceOrDerivedDifferences'].append(key)
                if d['modelActive']:
                    fit=models[d['modelScope']]
                    if score_points([p],fit)[0][0]!=p['signals']['overall_score']:audit['publishedScoreDifferences'].append(key)
                    if fit['lastLabelMaturity']>=d['signalDate']:audit['maturityViolations'].append(key)
                l=p['sourceLabel'];o=p['outcome']
                if o['strictLabelValid'] and (not l or l.get('status') not in ['hit','miss'] or abs((l['return5d']-.003)-o['net5d'])>1e-9 or bool(l['touched'])!=o['touch'] or abs(l['maxDrawdown']-o['mae'])>1e-9 or bool(l['entryBullish'])!=o['entryBullish']):audit['sourceLabelDifferences'].append(key)
                elif not o['strictLabelValid']:audit['expectedUnavailableSourceLabels'].append({'selection':key,'sourceStatus':l.get('status') if l else None,'zeroVolume':o['zeroVolumeFlag'],'missingBar':o['missingBarFlag'],'strictUtility':None})
prior=json.loads((BASE/'horizon-ledger.json').read_text())
for name,pname in [('currentOverall','currentOverallDescCooldown20'),('ATRbaseline','baselineV2Cooldown20')]:
    old=next(p for p in prior['policies'] if p['name']==pname)
    for a,b in zip(outer[name]['days'],old['days']):
        if [p['symbol'] for p in a['picks']]!=[p['symbol'] for p in b['picks']]:audit['baselineOuter181Differences'].append([name,a['signalDate']])
assert not any(audit[k] for k in ['rawPriceOrDerivedDifferences','categoryMutations','publishedScoreDifferences','sourceLabelDifferences','maturityViolations','baselineOuter181Differences'])
assert all(sha(p)==h for p,h in protected.items()),'Previous research output changed during run'
paths=[PLAN,pathlib.Path(__file__),EARLY/'earlier-wide.ndjson',EARLY/'earlier-context.ndjson',EARLY/'manifest.json',EARLY_GATE,EARLY_GATE_AUDIT,BASE/'technical-context.ndjson',BASE/'current-signals.ndjson',BASE/'current-signals-manifest.json',BASE/'horizon-runtime-eligibility.ndjson',BASE/'horizon-runtime-eligibility-audit.json',pathlib.Path('/tmp/upside-scored.ndjson'),META,FRESH/'scored.ndjson',FRESH/'features/metadata.json',RAW,OUT/'models.json']
source_hashes={str(p):sha(p) for p in paths}
def make_ledger(runs):return {'actualPublishedHistory':False,'scoreMeaning':'Fixed target-utility index, not a probability or percentile; daily-high target exit is an execution proxy','sourceHashes':source_hashes,'planSha256':sha(PLAN),'currentMasterNameSnapshot':meta['downloadedAt'],'policies':list(runs.values())}
(OUT/'inner-ledger.json').write_text(json.dumps(make_ledger(inner),ensure_ascii=False,indent=2))
(OUT/'outer-ledger.json').write_text(json.dumps(make_ledger(outer),ensure_ascii=False,indent=2))
(OUT/'fresh-selections.json').write_text(json.dumps({'partialFreshOneDayOnly':True,'actualPublishedHistory':False,'policies':[{'name':k,'day':v['days'][-1]} for k,v in outer.items()]},ensure_ascii=False,indent=2))
score_bins={}
for split,ds in {'inner':early_dates[155:],**splits}.items():
    run=inner['rawComposite'] if split=='inner' else outer['rawComposite'];pp=[p for d in run['days'] if d['signalDate'] in ds for p in d['picks']]
    score_bins[split]=[{'from':low,'throughInclusive':min(100,low+9),'picks':len(qq:= [p for p in pp if low<=p['signals']['overall_score']<=min(100,low+9)]),'metrics':metrics(qq,True)} for low in range(0,101,10)]
(OUT/'score-bins.json').write_text(json.dumps(score_bins,ensure_ascii=False,indent=2))
report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'plan':PLAN.read_text(),'planSha256':sha(PLAN),'fitFamilyCount':1,'fitCount':2,'inputCounts':input_counts,'modelFiles':{'first150':str(OUT/'first150-model.json'),'all235':str(OUT/'all235-model.json')},'models':models,'earlierRuntimeEligibilityAudit':json.loads(EARLY_GATE_AUDIT.read_text()),'trainingRawAudit':training_raw_audit,'innerDates':{'fit':early_dates[:150],'purge':early_dates[150:155],'evaluation':early_dates[155:]},'innerResults':inner_results,'outerResults':outer_results,'primaryTradeoffComparison':comparison,'selectedRawAudit':audit,'scoreBins':score_bins,'sourceHashes':source_hashes,'protectedPriorHashes':protected,'promotion':'Research evidence only; no production promotion performed or categorical guarantee','caveats':['Earlier235 current-master survivorship bias remains; historical feature warmup80..314 differs production320','Original180/validation/test and model ideas already reused; NOT pristine OOS','Daily-high >=10% target exit is a conservative cap but still execution assumption, not confirmed fills; no stoploss ordering','Fixed score means fitted target utility scaled0..100, not chance of+10% or cross-sectional percentile','Future missing/zero-volume labels retained in selection, only fit and strict evaluation exclude invalid outcomes','Repeated stocks and overlapping five-day windows imply dependent observations; date-balanced utility reported','No hyperparameter/family/threshold search; two causal fits of one frozen family only']}
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
(OUT/'summary.json').write_text(json.dumps({k:v for k,v in report.items() if k not in ['plan','protectedPriorHashes','models','scoreBins']},ensure_ascii=False,indent=2))
print('AUDIT',json.dumps(audit),flush=True);print('DONE',OUT,flush=True)
