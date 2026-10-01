# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import collections, datetime, hashlib, json, math, pathlib, statistics
import numpy as np
from scipy.optimize import minimize
from scipy.stats import rankdata

B = pathlib.Path('/tmp/composite-score-research-20260930')
W = B / 'weight-study'
own_loader = pathlib.Path('/tmp/composite-score-independent-ledger-audit-20260930.py')
env = {}
exec(compile(own_loader.read_text().split('\nselected = []')[0], str(own_loader), 'exec'), env)
rows, eligible, dates, calendar, ci = env['rows'], env['eligible'], env['dates'], env['calendar'], env['ci']
masters = env['masters']
fits = json.loads((W / 'weights.json').read_text())
published = json.loads((W / 'summary.json').read_text())
categories = ['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score']
errors = collections.defaultdict(list)
counts = collections.Counter()
raw = {}
for line in env['FRESH'].joinpath('input/prices.ndjson').open():
    s, rr = json.loads(line)
    raw[s] = {r['trade_date']:tuple(r[k] for k in ['open','high','low','close','volume']) for r in rr if r['source']=='kis' and r['trade_date'] in ci}

def error(kind, value):
    counts[kind] += 1
    if len(errors[kind])<15:errors[kind].append(value)

cache = {}
mark_phase = 'training'
phase_dates = collections.defaultdict(set)
def mark(s,d):
    phase_dates[mark_phase].add(d)
    key = (s,d)
    if key in cache: return cache[key]
    rr = [raw.get(s,{}).get(day) for day in calendar[ci[d]+1:ci[d]+6]]
    complete = len(rr)==5 and all(r is not None for r in rr)
    valid = complete and all(all(isinstance(v,(float,int)) and math.isfinite(v) and v>0 for v in r[:4]) and r[2]<=min(r[0],r[3])<=max(r[0],r[3])<=r[1] for r in rr)
    zero = any(r is not None and r[4]<=0 for r in rr)
    bull = rr[0][3]>rr[0][0] if rr and rr[0] is not None and rr[0][0]>0 else None
    r = {'rawMarkValid':bool(valid),'zeroVolumeFlag':bool(zero),'missingBarFlag':not complete,'entryBullish':bull}
    strict = bool(valid and not zero and bull is not None)
    r['utilityLabelValid']=strict
    if valid:
        entry=rr[0][0];net=rr[-1][3]/entry-1-.003;touch=max(r[1] for r in rr)>=entry*110/100;mae=min(0,min(r[2] for r in rr)/entry-1)
        r.update({'entry':entry,'net5d':net,'gross5d':net+.003,'touch':touch,'mae':mae,'maxGainPercent':(max(r[1] for r in rr)/entry-1)*100,'touchAndPositiveNet':touch and net>0,'bullishAndTouch':bool(bull and touch)})
    r['utility']=r['net5d']+.10*int(r['touch'] and r['net5d']>0)+.025*int(bull)-max(0,-r['net5d'])-.5*max(0,-r['mae']-.05) if strict else None
    cache[key]=r
    return r

def quantize(w):
    units = np.rint(w*1_000_000).astype(int)
    excess=int(units[0]+units[5]-350_000)
    if excess>0:
        source=max([0,5],key=lambda k:units[k]-50_000);target=max([1,2,3,4],key=lambda k:500_000-units[k]);units[source]-=excess;units[target]+=excess
    delta=int(1_000_000-units.sum())
    if delta:
        target=max([1,2,3,4],key=lambda k:500_000-units[k] if delta>0 else units[k]-50_000);units[target]+=delta
    return units

fit_audit = {}
for name, saved in fits.items():
    ndate=40 if saved['scope']=='first40' else 80
    ds=dates[:ndate];activation=dates[45] if ndate==40 else dates[85]
    if not all(calendar[ci[d]+5]<activation for d in ds):error('maturity',name)
    gg=np.zeros((6,6));bb=np.zeros(6);cc=0.0;nrows=0;missing=0
    for d in ds:
        allpp=[p for p in rows[d].values() if eligible(p['feature'])]
        valid=[p for p in allpp if mark(p['feature']['symbol'],d)['utilityLabelValid']]
        nrows+=len(valid);missing+=len(allpp)-len(valid)
        xx=np.array([[p['signals'][k] for k in categories] for p in valid],dtype=float)
        x=xx/100 if saved['family']=='arithmetic' else np.log(np.maximum(xx,1))/np.log(100)
        utility=np.array([mark(p['feature']['symbol'],d)['utility'] for p in valid])
        target=(rankdata(utility,method='average')-.5)/len(valid)
        gg+=x.T@x/len(valid);bb+=x.T@target/len(valid);cc+=float(target@target/len(valid))
    gg/=len(ds);bb/=len(ds);cc/=len(ds)
    digest=hashlib.sha256(gg.tobytes()+bb.tobytes()+np.array([cc]).tobytes()).hexdigest()
    if digest!=saved['trainingQuadraticSha256']:error('trainingQuadraticHash',[name,digest,saved['trainingQuadraticSha256']])
    equal=np.full(6,1/6)
    obj=lambda w:float(w@gg@w-2*bb@w+cc+.05*((w-equal)@(w-equal)))
    jac=lambda w:2*gg@w-2*bb+.10*(w-equal)
    constraints=[{'type':'eq','fun':lambda w:float(w.sum()-1),'jac':lambda w:np.ones(6)},{'type':'ineq','fun':lambda w:float(.35-w[0]-w[5]),'jac':lambda w:np.array([-1.,0,0,0,0,-1.])}]
    opt=minimize(obj,equal,jac=jac,method='SLSQP',bounds=[(.05,.50)]*6,constraints=constraints,options={'ftol':1e-12,'maxiter':1000,'disp':False})
    units=quantize(opt.x)
    if not opt.success or list(units)!=saved['weightMillionths']:error('fixedOptimizerReplay',[name,opt.success,list(map(int,units)),saved['weightMillionths']])
    if nrows!=saved['trainingRows'] or missing!=saved['missingTrainingUtilityLabels']:error('trainingCounts',[name,nrows,missing,saved['trainingRows'],saved['missingTrainingUtilityLabels']])
    if abs(obj(units/1_000_000)-saved['objectiveFrozen'])>1e-12:error('objective',name)
    fit_audit[name]={'rows':nrows,'missing':missing,'quadraticHash':digest,'weights':list(map(int,units)),'optimizerSuccess':bool(opt.success),'lastLabelMaturity':calendar[ci[ds[-1]]+5],'activation':activation}
    counts['fixedFits']+=1
assert phase_dates['training']==set(dates[:80])
mark_phase='selectionDiagnostic'

def score(p,fit):
    c=[p['signals'][k] for k in categories];w=fit['weightMillionths']
    if fit['family']=='arithmetic':return (sum(a*b for a,b in zip(c,w))+500_000)//1_000_000
    if any(v==0 for v in c):return 0
    return min(100,max(0,math.floor(math.exp(sum(a/1_000_000*math.log(b) for a,b in zip(w,c)))+.5)))

selected_runs = {}
for scope,path,activation in [('inner',W/'inner-ledger.json',45),('outer',W/'outer-ledger.json',85)]:
    ledger=json.loads(path.read_text());ndays=80 if scope=='inner' else 181
    for policy in ledger['policies']:
        name=policy['name'];fit=fits[('first40_' if scope=='inner' else 'first80_')+name] if name in ['arithmetic','geometric'] else None
        recent=[];selected_runs[(scope,name)]=[]
        for idx,(d,saved_day) in enumerate(zip(dates[:ndays],policy['days'])):
            active=fit is not None and idx>=activation
            excluded=set().union(*recent[-20:]) if recent else set()
            pool=[p for p in rows[d].values() if eligible(p['feature']) and p['feature']['symbol'] not in excluded]
            ranked=sorted([(score(p,fit) if active else p['signals']['overall_score'],p) for p in pool],key=lambda v:(-v[0],-v[1]['feature']['averageTurnover20'],v[1]['feature']['symbol']))
            chosen=ranked[:3] if len(ranked)>=3 else []
            symbols=[p['feature']['symbol'] for s,p in chosen]
            recent.append(set(symbols))
            if symbols!=[p['symbol'] for p in saved_day['picks']]:error('selection',[scope,name,d,symbols])
            expected={'signalDate':d,'modelActive':active,'fitScope':fit['scope'] if active else None,'cooldown':20,'commonEligibleCount':sum(eligible(p['feature']) for p in rows[d].values()),'afterCooldownCount':len(pool),'pickedCount':len(chosen),'recommendationDateExpected':calendar[ci[d]+1],'expectedD5date':calendar[ci[d]+5]}
            for k,v in expected.items():
                if saved_day[k]!=v:error('dayMetadata',[scope,name,d,k,v,saved_day[k]])
            for rank,((display,source),p) in enumerate(zip(chosen,saved_day['picks']),1):
                source_signals=source['signals'];expected_signals={**source_signals,'overall_score':display}
                if p['signals']!=expected_signals or p['sourceSignals']!=source_signals or p['feature']!=source['feature']:error('scoreSourceBinding',[scope,name,d,p['symbol']])
                if p['selectionRank']!=rank or p['currentMasterName']!=masters[p['symbol']]['name']:error('rankName',[scope,name,d,p['symbol']])
                own=mark(p['symbol'],d)
                for k,v in own.items():
                    sv=p.get(k);same=abs(v-sv)<=1e-12 if isinstance(v,float) and isinstance(sv,(float,int)) else v==sv
                    if not same:error('rawOutcomeUtility',[scope,name,d,p['symbol'],k,v,sv])
                for offset,b in enumerate(p['dailyBars'],1):
                    day=calendar[ci[d]+offset];r=raw.get(p['symbol'],{}).get(day)
                    expected_bar={'session':offset,'date':day,'source':'kis',**dict(zip(['open','high','low','close','volume'],r))} if r else {'session':offset,'date':day,'missing':True}
                    if b!=expected_bar:error('rawBars',[scope,name,d,p['symbol'],day])
                selected_runs[(scope,name)].append({'date':d,'symbol':p['symbol'],'signals':expected_signals,**own})
                counts['selectedInstances']+=1
                counts['zeroVolumeInstances']+=own['zeroVolumeFlag']
            counts['policyDates']+=1

def observe(pp,strict):
    vv=[p for p in pp if p['utilityLabelValid'] if strict] if strict else [p for p in pp if p['rawMarkValid']]
    n=len(vv);rr=[p['net5d'] for p in vv]
    return {'validLabels':n,'missingLabels':len(pp)-n,'touchCount':sum(p['touch'] for p in vv),'touchRate':sum(p['touch'] for p in vv)/n if n else None,'D1bullishCount':sum(p['entryBullish'] for p in vv),'D1bullishRate':sum(p['entryBullish'] for p in vv)/n if n else None,'meanNet5d':statistics.mean(rr) if n else None,'medianNet5d':statistics.median(rr) if n else None,'positiveNetRate':sum(r>0 for r in rr)/n if n else None,'loss5Count':sum(r<=-.05 for r in rr),'loss10Count':sum(r<=-.10 for r in rr),'loss5Rate':sum(r<=-.05 for r in rr)/n if n else None,'loss10Rate':sum(r<=-.10 for r in rr)/n if n else None,'meanMAE':statistics.mean(p['mae'] for p in vv) if n else None,'worstNet5d':min(rr) if n else None,'worstMAE':min(p['mae'] for p in vv) if n else None}

def summary(pp):
    group=collections.defaultdict(list)
    for p in pp:group[p['date']].append(p)
    daily_utility=[statistics.mean(p['utility'] for p in g if p['utilityLabelValid']) for g in group.values() if any(p['utilityLabelValid'] for p in g)]
    scores=[p['signals']['overall_score'] for p in pp]
    return {'rawMark':observe(pp,False),'strictPositiveVolumeLabels':observe(pp,True),'signalDateMeanUtility':statistics.mean(daily_utility) if daily_utility else None,'utilityCoveredDates':len(daily_utility),'scoreMin':min(scores),'scoreMean':statistics.mean(scores),'scoreMax':max(scores),'scoreAtLeast70Count':sum(s>=70 for s in scores),'all3ScoreAtLeast70Days':sum(len(g)==3 and all(p['signals']['overall_score']>=70 for p in g) for g in group.values()),'all3TouchDays':sum(len(g)==3 and all(p['touch'] for p in g) for g in group.values()),'all3BullishDays':sum(len(g)==3 and all(p['entryBullish'] for p in g) for g in group.values()),'all3PositiveNetDays':sum(len(g)==3 and all(p['rawMarkValid'] and p['net5d']>0 for p in g) for g in group.values())}

independent_results={}
for (scope,name),pp in selected_runs.items():
    splitsets={'inner':dates[45:80]} if scope=='inner' else {'trainSeed':dates[:80],'validation':dates[85:115],'test':dates[120:180],'partialFreshSpotcheck':dates[180:]}
    for split,ds in splitsets.items():
        saved=published['innerResults'][name] if scope=='inner' else published['outerResults'][split][name]
        own=summary([p for p in pp if p['date'] in ds])
        for k,v in own.items():
            if isinstance(v,dict):
                for kk,vv in v.items():
                    sv=saved[k][kk];same=abs(vv-sv)<=1e-12 if isinstance(vv,float) and isinstance(sv,(int,float)) else vv==sv
                    if not same:error('aggregate',[scope,name,split,k,kk,vv,sv])
            else:
                sv=saved[k];same=abs(v-sv)<=1e-12 if isinstance(v,float) and isinstance(sv,(int,float)) else v==sv
                if not same:error('aggregate',[scope,name,split,k,v,sv])
        independent_results[f'{scope}:{split}:{name}']=own

reference=independent_results['inner:inner:currentOriginalOverall']['strictPositiveVolumeLabels'];passed=[];failures={}
for name in ['arithmetic','geometric']:
    m=independent_results[f'inner:inner:{name}'];a=m['strictPositiveVolumeLabels'];fail=[]
    for k in ['loss5Rate','loss10Rate']:
        if a[k] is None or reference[k] is None or a[k]>=reference[k]:fail.append(k+'NotStrictlyLower')
    if a['meanNet5d'] is None or a['meanNet5d']<=reference['meanNet5d']:fail.append('meanNetNotStrictlyHigher')
    if a['touchRate'] is None or a['touchRate']<.10:fail.append('touchBelow10Percent')
    if a['D1bullishRate'] is None or a['D1bullishRate']<reference['D1bullishRate']:fail.append('D1bullishBelowCurrent')
    if fail!=published['innerAcceptanceFailures'][name]:error('innerChoiceFailures',[name,fail,published['innerAcceptanceFailures'][name]])
    failures[name]=fail
    if not fail:passed.append(name)
choice=max(passed,key=lambda name:(independent_results[f'inner:inner:{name}']['signalDateMeanUtility'],name=='arithmetic')) if passed else None
if choice!=published['innerChoice']:error('innerChoice',[choice,published['innerChoice']])
for p,h in json.loads((W/'protected-prior-hashes.json').read_text()).items():
    actual=hashlib.file_digest(open(p,'rb'),'sha256').hexdigest()
    if actual!=h:error('protectedPriorHash',p)
hashes={str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [W/'weight-plan.txt',W/'weight-research.py',W/'weights.json',W/'summary.json',W/'inner-ledger.json',W/'outer-ledger.json',own_loader,pathlib.Path(__file__)]}
out=pathlib.Path('/tmp/composite-score-independent-weight-audit-20260930.json')
report={'scope':'Independent reproduction of only the two frozen learned-weight families; no new families/thresholds/model designs, no source/UI/copy/production writes, not a PR review round. Training quadratics/utility and optimizer replay from independent source/price loader, causal maturation45/85, original-overall seeded own cooldown, actual integer score ranking and raw selected OHLCV/utility/aggregates.','counts':dict(counts),'differenceCounts':{k:v for k,v in counts.items() if k not in ['fixedFits','selectedInstances','zeroVolumeInstances','policyDates']},'differences':dict(errors),'fitAudit':fit_audit,'trainingSignalDatesUsed':sorted(phase_dates['training']),'innerChoice':choice,'innerFailures':failures,'results':independent_results,'sourceHashes':hashes,'judgment':'Neither fixed family passes inner selection. Higher learned scores or more touch alone do not support performance promotion. Geometric zero veto uses existing ATR3 preference, training log(max(category,1)) differs from published ANYzero0 by specified design, and category duplication remains. Source snapshot/survivorship, price adjustments/vintage, fixedcosts and non-executable zero-volume marks remain limits.'}
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'report':str(out),'counts':dict(counts),'differenceCounts':report['differenceCounts'],'innerChoice':choice,'innerFailures':failures},ensure_ascii=False))
if errors:raise SystemExit(1)
