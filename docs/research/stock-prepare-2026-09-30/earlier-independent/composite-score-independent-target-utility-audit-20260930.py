# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
"""Read-only independent reproduction of the ONE already frozen raw-utility family."""
import collections, hashlib, json, math, pathlib, statistics
import numpy as np
from scipy.optimize import minimize

B = pathlib.Path('/tmp/composite-score-research-20260930')
W = B / 'raw-composite-study'
E = B / 'earlier-training'
OUT = pathlib.Path('/tmp/composite-score-independent-target-utility-audit-20260930.json')
models = json.loads((W / 'models.json').read_text())
saved_summary = json.loads((W / 'summary.json').read_text())
env = {}
loader = pathlib.Path('/tmp/composite-score-independent-ledger-audit-20260930.py')
exec(compile(loader.read_text().split('\nselected = []')[0], str(loader), 'exec'), env)
outer_rows, outer_dates, calendar, ci, masters = [env[k] for k in ['rows','dates','calendar','ci','masters']]
eligible = env['eligible']
em = json.loads((E / 'manifest.json').read_text())
early_dates = list(em['perDate'])
errors = collections.defaultdict(list)
counts = collections.Counter()

def error(kind, value):
    counts['difference:'+kind] += 1
    if len(errors[kind]) < 20: errors[kind].append(value)

def finite(v):
    return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)

keys = ['open','high','low','close','volume','averageTurnover20','gapFromPreviousClosePercent','rsi14','atrPercent14','volumeRatio20','sma20DistancePercent','position52wObservations','position52wFullWindow']
categories = ['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score']
atom_names = ['chaikinMoneyFlow21','distanceFromPriorHigh20Percent','volumeRatio20','atrPercent14','bollingerWidth20Percent','positiveSignalCloseCloseReturnPercent']
signs = np.array([1.,1.,1.,1.,-1.,-1.])

def atom_values(f,c):
    return [c.get('chaikinMoneyFlow21'),c.get('distanceFromPriorHigh20Percent'),f.get('volumeRatio20'),f.get('atrPercent14'),c.get('bollingerWidth20Percent'),max(0,((1+f['gapFromPreviousClosePercent']/100)*(f['close']/f['open'])-1)*100)]

rows = {d:{} for d in early_dates+outer_dates}
early_source_diffs=[]
actual_early={r['date']:set(r['runtimeEligibleSymbols']) for r in map(json.loads,(E/'earlier-runtime-eligibility.ndjson').open())}
early_context={d:{} for d in early_dates}
for line in (E/'earlier-context.ndjson').open():
    c=json.loads(line);d=c['date'];s=c['symbol']
    if s in actual_early[d]:early_context[d][s]={k:c['context'].get(k) for k in ['chaikinMoneyFlow21','distanceFromPriorHigh20Percent','bollingerWidth20Percent']}
for line in (E / 'earlier-wide.ndjson').open():
    p=json.loads(line); d=p['date']; s=p['symbol']; f=p['feature']
    own=p['flags']['preCommonPool'] and p['flags']['hasCalculatedOutputMetrics'] and eligible(f)
    if own != p['flags']['priorTargetEligible']: early_source_diffs.append([d,s,p['flags']['priorTargetEligible'],bool(own)])
    counts['earlySourceRows']+=1
    if not own:continue
    aa=atom_values(f,early_context[d][s])
    rows[d][s]={'feature':{k:f.get(k) for k in keys},'signals':p['signals'],'atoms':aa,'scorable':all(finite(v) for v in aa)}
    counts['earlyRuntimeEligible']+=1
del early_context
for d in early_dates:
    if set(rows[d])!=actual_early[d]:error('actualEarlierTSgate',[d,sorted(set(rows[d])-actual_early[d]),sorted(actual_early[d]-set(rows[d]))])
for line in (B/'technical-context.ndjson').open():
    p=json.loads(line);d=p['date'];s=p['symbol'];old=outer_rows[d].get(s)
    if old is None or not eligible(old['feature']):continue
    f=old['feature'];aa=atom_values(f,p['context'])
    rows[d][s]={'feature':{k:f.get(k) for k in keys},'signals':old['signals'],'atoms':aa,'scorable':all(finite(v) for v in aa)}
    counts['outerRuntimeEligible']+=1
for d in outer_dates:
    if set(rows[d])!=env['runtime'][d]:error('actualOuterTSgate',d)
del outer_rows, env
raw={}
for line in pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson').open():
    s,rr=json.loads(line)
    raw[s]={r['trade_date']:tuple(r[k] for k in ['open','high','low','close','volume']) for r in rr if r['source']=='kis' and r['trade_date'] in ci}
print('INDEPENDENT_INPUT',dict(counts),flush=True)

cache={}
def outcome(s,d):
    key=(s,d)
    if key in cache:return cache[key]
    rr=[raw.get(s,{}).get(day) for day in calendar[ci[d]+1:ci[d]+6]]
    complete=len(rr)==5 and all(r is not None for r in rr)
    valid=complete and all(all(finite(v) and v>0 for v in r[:4]) and r[2]<=min(r[0],r[3])<=max(r[0],r[3])<=r[1] for r in rr)
    volume=complete and all(finite(r[4]) and r[4]>0 for r in rr)
    zero=any(r is not None and (not finite(r[4]) or r[4]<=0) for r in rr)
    bull=rr[0][3]>rr[0][0] if rr and rr[0] is not None and finite(rr[0][0]) and rr[0][0]>0 else None
    o={'rawMarkValid':bool(valid),'strictLabelValid':bool(valid and volume),'zeroVolumeFlag':bool(zero),'missingBarFlag':not complete,'entryBullish':bull}
    if valid:
        entry=rr[0][0];gross=rr[-1][3]/entry-1;net=gross-.003;touch=max(r[1] for r in rr)>=entry*110/100
        target=(.10 if touch else gross)-.003;utility=target+.025*int(bull)-max(0,-target)
        o.update({'entry':entry,'gross5d':gross,'net5d':net,'touch':bool(touch),'mae':min(0,min(r[2] for r in rr)/entry-1),'maxGainPercent':(max(r[1] for r in rr)/entry-1)*100,'targetNetProxy':target,'rawTargetUtilityProxy':utility,'utility':utility if valid and volume else None,'targetFirstTouchSession':next((j for j,r in enumerate(rr,1) if r[1]>=entry*110/100),None),'touchAndPositiveD5Net':bool(touch and net>0)})
    else:o['utility']=None
    cache[key]=o;return o

def close(a,b,tol=1e-12):
    if isinstance(a,dict):return isinstance(b,dict) and set(a)==set(b) and all(close(v,b[k],tol) for k,v in a.items())
    if isinstance(a,list):return isinstance(b,list) and len(a)==len(b) and all(close(x,y,tol) for x,y in zip(a,b))
    return abs(a-b)<=tol if isinstance(a,float) and finite(b) else a==b

def normalizer(ds):
    ps=np.linspace(0,1,11);nn=[]
    for j,name in enumerate(atom_names):
        vv=np.array([p['atoms'][j] for d in ds for p in rows[d].values() if finite(p['atoms'][j])],dtype=float)
        knots=np.quantile(vv,ps,method='linear');unique=np.unique(knots)
        mids=np.array([(ps[knots==v].min()+ps[knots==v].max())/2 for v in unique])
        nn.append({'atom':name,'finiteEligibleCandidateCount':len(vv),'probabilities':ps.tolist(),'knots':knots.tolist(),'uniqueValues':unique.tolist(),'midpointProbabilities':mids.tolist(),'duplicateKnotCount':int(11-len(unique))})
    return nn

def normalized(aa,nn):
    xx=np.asarray(aa,dtype=float);zz=np.empty_like(xx)
    for j,n in enumerate(nn):zz[:,j]=np.interp(xx[:,j],n['uniqueValues'],n['midpointProbabilities'],left=0.,right=1.)
    return zz

fit_audit={}
for scope,fit in models.items():
    ds=early_dates[:150] if scope=='first150' else early_dates;activation=early_dates[155] if scope=='first150' else outer_dates[0]
    nn=normalizer(ds)
    if not close(nn,fit['normalizers'],0):error('normalizerExact',scope)
    Q=np.zeros((7,7));b=np.zeros(7);c=0.;nrows=0;date_counts=[]
    for d in ds:
        assert calendar[ci[d]+5]<activation
        pp=[p for s,p in rows[d].items() if p['scorable'] and outcome(s,d)['strictLabelValid']]
        zz=normalized([p['atoms'] for p in pp],nn);xx=np.column_stack([np.ones(len(pp)),zz*signs]);yy=np.array([outcome(s,d)['utility'] for s,p in rows[d].items() if p['scorable'] and outcome(s,d)['strictLabelValid']])
        Q+=xx.T@xx/len(pp);b+=xx.T@yy/len(pp);c+=float(yy@yy/len(pp));nrows+=len(pp)
        date_counts.append({'date':d,'eligible':len(rows[d]),'scorable':sum(p['scorable'] for p in rows[d].values()),'fitRows':len(pp),'strictMissingLabels':sum(not outcome(s,d)['strictLabelValid'] for s in rows[d]),'labelMaturityDate':calendar[ci[d]+5]})
    Q/=len(ds);b/=len(ds);c/=len(ds)
    digest=hashlib.sha256(Q.tobytes()+b.tobytes()+np.array([c]).tobytes()).hexdigest()
    if digest!=fit['quadraticSha256']:error('quadraticExactHash',[scope,digest,fit['quadraticSha256']])
    if not close(date_counts,fit['trainingDateCounts'],0) or fit['trainingRows']!=nrows:error('fitCounts',scope)
    obj=lambda th:float(th@Q@th-2*b@th+c+.05*(th[1:]@th[1:]))
    jac=lambda th:2*Q@th-2*b+np.r_[0.,.10*th[1:]]
    opt=minimize(obj,np.zeros(7),jac=jac,method='SLSQP',bounds=[(None,None)]+[(0,None)]*6,options={'ftol':1e-12,'maxiter':1000,'disp':False})
    theta=np.array([fit['intercept']]+fit['coefficients'])
    if not opt.success or not np.array_equal(opt.x,theta):error('fixedOptimizerReplay',[scope,opt.success,opt.x.tolist(),theta.tolist()])
    if not close(obj(theta),fit['objective']) or fit['trainingDates']!=ds or fit['activationDate']!=activation or fit['lastLabelMaturity']!=calendar[ci[ds[-1]]+5]:error('fitObjectiveChronology',scope)
    fit_audit[scope]={'rows':nrows,'quadraticSha256':digest,'theta':opt.x.tolist(),'optimizerSuccess':bool(opt.success),'maturity':calendar[ci[ds[-1]]+5],'activation':activation,'perAtomNormalizerCount':[n['finiteEligibleCandidateCount'] for n in nn]}
    counts['fixedFits']+=1
    print('INDEPENDENT_FIT',scope,fit_audit[scope],flush=True)

def single_normalized(value,n):
    x=n['uniqueValues'];y=n['midpointProbabilities']
    if value<x[0]:return 0.
    if value>x[-1]:return 1.
    for j,v in enumerate(x):
        if value==v:return y[j]
        if j and value<v:return y[j-1]+(value-x[j-1])/(v-x[j-1])*(y[j]-y[j-1])
    raise AssertionError('bad normalizer')

def score(p,fit):
    if not p['scorable']:return None
    mu=fit['intercept']
    for j,n in enumerate(fit['normalizers']):mu+=signs[j]*fit['coefficients'][j]*single_normalized(p['atoms'][j],n)
    return math.floor(min(100,max(0,50+500*mu))+.5),float(mu)

candidate_audit={}
for scope,fit in models.items():
    digest=hashlib.sha256();points=0;max_mu_diff=0.
    for d in early_dates+outer_dates:
        pp=[(s,p) for s,p in sorted(rows[d].items()) if p['scorable']]
        zz=normalized([p['atoms'] for s,p in pp],fit['normalizers']);batch_mu=fit['intercept']+zz@(np.array(fit['coefficients'])*signs)
        batch_scores=np.floor(np.clip(50+500*batch_mu,0,100)+.5).astype(int)
        for (s,p),bm,bs in zip(pp,batch_mu,batch_scores):
            ss,mu=score(p,fit);max_mu_diff=max(max_mu_diff,abs(mu-bm))
            if ss!=int(bs):error('batchVsPortableInteger',[scope,d,s,ss,int(bs),mu,float(bm)])
            digest.update((d+'\t'+s+'\t'+str(ss)+'\n').encode());points+=1
    candidate_audit[scope]={'scorablePoints':points,'sortedDateSymbolIntegerScoreSha256':digest.hexdigest(),'maxBatchVsScalarMuDifference':max_mu_diff}
    counts['allCandidateScoreComparisons']+=points
    print('INDEPENDENT_CANDIDATE',scope,candidate_audit[scope],flush=True)

selected={}
for scope,ds,path,activation,fit in [('inner',early_dates,W/'inner-ledger.json',155,models['first150']),('outer',outer_dates,W/'outer-ledger.json',0,models['all235'])]:
    ledger=json.loads(path.read_text())
    for policy in ledger['policies']:
        name=policy['name'];recent=[];selected[(scope,name)]=[]
        for idx,(d,saved) in enumerate(zip(ds,policy['days'])):
            active=name=='rawComposite' and idx>=activation
            excluded={s for g in recent[-20:] for s in g};pool={s:p for s,p in rows[d].items() if s not in excluded};valid={s:p for s,p in pool.items() if not active or p['scorable']}
            scores={s:score(p,fit) if active else (p['signals']['overall_score'],None) for s,p in valid.items()}
            ordered=sorted(valid,key=lambda s:(valid[s]['feature']['atrPercent14'],s)) if name=='ATRbaseline' else sorted(valid,key=lambda s:(-scores[s][0],-valid[s]['feature']['averageTurnover20'],s))
            chosen=ordered[:3] if len(ordered)>=3 else [];recent.append(set(chosen))
            if chosen!=[p['symbol'] for p in saved['picks']]:error('selection',[scope,name,d,chosen])
            stage=None if chosen else 'observedInputsMissing' if active and len(pool)>=3 else 'runtimeEligibleAfterCooldownBelow3'
            metadata={'signalDate':d,'recommendationDateExpected':calendar[ci[d]+1],'expectedD5date':calendar[ci[d]+5],'cooldown':20,'modelActive':active,'modelScope':fit['scope'] if active else None,'selectionMode':'rawTargetUtilityComposite' if active else 'ATRascending' if name=='ATRbaseline' else 'currentOriginalOverall','runtimeEligibleCount':len(rows[d]),'afterCooldownCount':len(pool),'scorableAfterCooldownCount':len(valid),'unscorableExcludedObservedInputs':len(pool)-len(valid),'pickedCount':len(chosen),'shortfallStage':stage}
            for k,v in metadata.items():
                if not close(v,saved[k],0):error('dayMetadata',[scope,name,d,k,v,saved[k]])
            for rank,(s,p) in enumerate(zip(chosen,saved['picks']),1):
                source=rows[d][s];ss,mu=scores[s];expected_signals={**source['signals'],'overall_score':ss}
                binding={'signals':expected_signals,'sourceSignals':source['signals'],'feature':source['feature'],'atoms':source['atoms'],'scorable':source['scorable'],'scoreMu':mu,'selectionRank':rank,'rawFactors':dict(zip(atom_names,source['atoms'])),'recommendationDate':calendar[ci[d]+1],'expectedD5date':calendar[ci[d]+5],'currentMasterName':masters[s]['name']}
                for k,v in binding.items():
                    if not close(v,p[k]):error('sourceScoreBinding',[scope,name,d,s,k,v,p[k]])
                o=outcome(s,d)
                if not close(o,p['outcome']):error('rawOutcome',[scope,name,d,s,o,p['outcome']])
                rr=[raw.get(s,{}).get(day) for day in calendar[ci[d]+1:ci[d]+6]]
                bars=[{'session':j,'date':calendar[ci[d]+j],'source':'kis',**dict(zip(['open','high','low','close','volume'],r))} if r else {'session':j,'date':calendar[ci[d]+j],'missing':True} for j,r in enumerate(rr,1)]
                if bars!=p['dailyBars'] or p['D1open']!=(rr[0][0] if rr[0] else None):error('rawBars',[scope,name,d,s])
                selected[(scope,name)].append({'date':d,'symbol':s,'score':ss,'outcome':o});counts['selectedInstances']+=1;counts['zeroVolumeInstances']+=o['zeroVolumeFlag'];counts['missingBarInstances']+=o['missingBarFlag']
            counts['policyDays']+=1

def metrics(pp,strict):
    oo=[p['outcome'] for p in pp if p['outcome']['strictLabelValid' if strict else 'rawMarkValid']];n=len(oo)
    if not n:return {'labels':0,'missingLabels':len(pp)}
    nets=[o['net5d'] for o in oo];tn=[o['targetNetProxy'] for o in oo]
    return {'labels':n,'missingLabels':len(pp)-n,'touchCount':sum(o['touch'] for o in oo),'touchRate':statistics.mean(o['touch'] for o in oo),'D1bullishCount':sum(o['entryBullish'] for o in oo),'D1bullishRate':statistics.mean(o['entryBullish'] for o in oo),'touchAndPositiveD5Count':sum(o['touchAndPositiveD5Net'] for o in oo),'meanNet5d':statistics.mean(nets),'medianNet5d':statistics.median(nets),'positiveD5NetRate':statistics.mean(v>0 for v in nets),'loss5Count':sum(v<=-.05 for v in nets),'loss5Rate':statistics.mean(v<=-.05 for v in nets),'loss10Count':sum(v<=-.10 for v in nets),'loss10Rate':statistics.mean(v<=-.10 for v in nets),'worstNet5d':min(nets),'meanMAE':statistics.mean(o['mae'] for o in oo),'worstMAE':min(o['mae'] for o in oo),'meanTargetNetProxy':statistics.mean(tn),'medianTargetNetProxy':statistics.median(tn),'targetProxyLoss5Count':sum(v<=-.05 for v in tn),'targetProxyLoss10Count':sum(v<=-.10 for v in tn),'pooledMeanUtilityProxy':statistics.mean(o['rawTargetUtilityProxy'] for o in oo)}

def summarize(pp,ds):
    groups={d:[p for p in pp if p['date']==d] for d in ds};ss=[p['score'] for p in pp];daily=[]
    for gg in groups.values():
        oo=[p['outcome'] for p in gg if p['outcome']['strictLabelValid']]
        if oo:daily.append({k:statistics.mean(o[k] for o in oo) for k in ['utility','targetNetProxy','net5d','touch','entryBullish']})
    return {'days':len(ds),'full3Days':sum(len(g)==3 for g in groups.values()),'picks':len(pp),'slotCoverage':len(pp)/(3*len(ds)) if ds else None,'zeroVolumePicks':sum(p['outcome']['zeroVolumeFlag'] for p in pp),'missingBarPicks':sum(p['outcome']['missingBarFlag'] for p in pp),'strictPositiveVolume':metrics(pp,True),'rawObservationalMarks':metrics(pp,False),'dateBalancedStrictMeans':{k:statistics.mean(o[k] for o in daily) for k in daily[0]} if daily else {},'strictCoveredDates':len(daily),'scoreMin':min(ss) if ss else None,'scoreMean':statistics.mean(ss) if ss else None,'scoreMax':max(ss) if ss else None,'scoreAtLeast70Picks':sum(s>=70 for s in ss),'all3ScoreAtLeast70Days':sum(len(g)==3 and all(p['score']>=70 for p in g) for g in groups.values()),'all3TouchDays':sum(len(g)==3 and all(p['outcome']['strictLabelValid'] and p['outcome'].get('touch',False) for p in g) for g in groups.values()),'all3D1BullishDays':sum(len(g)==3 and all(p['outcome']['strictLabelValid'] and p['outcome']['entryBullish'] for p in g) for g in groups.values()),'all3PositiveD5Days':sum(len(g)==3 and all(p['outcome']['strictLabelValid'] and p['outcome']['net5d']>0 for p in g) for g in groups.values()),'shortfallDays':[]}

results={}
splits={'originalTrainDiagnostic':outer_dates[:80],'validationReused':outer_dates[85:115],'testReused':outer_dates[120:180],'allOriginal180':outer_dates[:180],'partialFreshSpotcheck':outer_dates[180:]}
for (scope,name),pp in selected.items():
    for split,ds in ({'inner':early_dates[155:]} if scope=='inner' else splits).items():
        own=summarize([p for p in pp if p['date'] in ds],ds);saved=saved_summary['innerResults'][name] if scope=='inner' else saved_summary['outerResults'][split][name]
        if not close(own,saved):error('aggregate',[scope,name,split,own,saved])
        results[scope+':'+split+':'+name]=own
for p,h in json.loads((W/'protected-prior-hashes.json').read_text()).items():
    if hashlib.file_digest(open(p,'rb'),'sha256').hexdigest()!=h:error('protectedHash',p)
paths=[W/'raw-plan.txt',W/'raw-research.py',W/'score-portable.ts',W/'models.json',W/'summary.json',W/'inner-ledger.json',W/'outer-ledger.json',E/'earlier-wide.ndjson',E/'earlier-context.ndjson',E/'earlier-runtime-eligibility.ndjson',pathlib.Path(__file__)]
report={'scope':'Independent ONE frozen target-utility family: no new fits/families/tuning beyond exact prescribed first150/all235 optimizer reproduction; no repository/UI/copy/production writes. Source flags/prices independently loaded; CDF/fit/quadratic/causal activation, actual integer ranking and own continuous20 cooldown, all selected raw5-session marks and strict labels, aggregates checked. Not a formal PR review round.','counts':dict(counts),'differenceCounts':{k:v for k,v in counts.items() if k.startswith('difference:')},'differences':dict(errors),'earlierSourceFlagDifferences':early_source_diffs,'fits':fit_audit,'candidateScoreAudit':candidate_audit,'results':results,'sourceHashes':{str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in paths},'limitations':['Model inputs use TRAIN CDF, output fixed50+500mu is a target-utility index, not calibrated hit probability.','Strict missing future labels remain selected, not usable utility observations; target touches are OHLC execution proxies, not verified fills.','Current-master/currentstatus survivorship, variable earlier feature warmup and raw price adjustment/vintage remain.','Original180 outcomes already repeatedly reused: descriptive diagnostic, not pristine OOS. Overlapping five-day positions imply dependent observations.','No universal daily3 highscore+10/no-loss guarantee follows from a correct implementation.']}
OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'report':str(OUT),'counts':dict(counts),'differenceCounts':report['differenceCounts']},ensure_ascii=False),flush=True)
if errors:raise SystemExit(1)
