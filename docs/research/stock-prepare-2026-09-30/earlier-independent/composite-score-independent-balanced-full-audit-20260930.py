# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3"]
# ///
import collections,hashlib,json,math,pathlib,statistics
import numpy as np
B=pathlib.Path('/tmp/composite-score-research-20260930');W=B/'balanced-event-study'
choice=json.loads((W/'chosen-lambda.json').read_text());published=json.loads((W/'summary.json').read_text())
inner=json.loads('/tmp/composite-score-independent-balanced-inner-ledger-20260930.json' and pathlib.Path('/tmp/composite-score-independent-balanced-inner-ledger-20260930.json').read_text())['policies']
inner_report=json.loads(pathlib.Path('/tmp/composite-score-independent-balanced-inner-20260930.json').read_text());lam=inner_report['chosenLambda']
assert lam==choice['chosenLambda']==published['chosenLambda']==.65
data=np.load('/tmp/composite-score-independent-event-input-20260930.npz');X,Y,offsets=[data[k] for k in ['X','Y','offsets']]
inputs=json.loads(pathlib.Path('/tmp/composite-score-independent-event-input-audit-20260930.json').read_text());dates=inputs['signalDates'];keys=json.loads(pathlib.Path('/tmp/composite-score-independent-event-input-keys-20260930.json').read_text());symbols=[s for d,s in keys]
sources=np.load('/tmp/composite-score-independent-balanced-source-20260930.npz');signals,turnover=sources['signals'],sources['turnover'];preds=np.load('/tmp/composite-score-independent-event-predictions-20260930.npz')
score_keys=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score','overall_score'];heads=['touch','D1bullish','loss5']
errors=collections.defaultdict(list);counts=collections.Counter()
def error(k,v):
    counts['difference:'+k]+=1
    if len(errors[k])<15:errors[k].append(v)
def finite(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def close(a,b,tol=1e-12):
    if isinstance(a,dict):return isinstance(b,dict) and set(a)==set(b) and all(close(v,b[k],tol) for k,v in a.items())
    if isinstance(a,list):return isinstance(b,list) and len(a)==len(b) and all(close(x,y,tol) for x,y in zip(a,b))
    return abs(a-b)<=tol if isinstance(a,float) and finite(b) else a==b
outer={};pp=preds['all235'];new_scores=np.floor(np.clip(100*(.8*pp[:,0]+.2*pp[:,1])-(100*lam)*pp[:,2],0,100)+.5).astype(int)
for name in ['balancedEventComposite','currentOverall','ATRbaseline']:
    recent=[];days=[]
    for j,d in enumerate(dates[235:],235):
        excluded={s for group in recent[-20:] for s in group};pool=[i for i in range(offsets[j],offsets[j+1]) if symbols[i] not in excluded]
        ranked=sorted(pool,key=lambda i:(X[i,0],symbols[i])) if name=='ATRbaseline' else sorted(pool,key=lambda i:(-int(new_scores[i-offsets[235]] if name=='balancedEventComposite' else signals[i,6]),-turnover[i],symbols[i]))
        chosen=ranked[:3] if len(ranked)>=3 else [];recent.append([symbols[i] for i in chosen])
        days.append({'signalDate':d,'modelActive':name=='balancedEventComposite','afterCooldownCount':len(pool),'picks':[{'symbol':symbols[i],'overall_score':int(new_scores[i-offsets[235]] if name=='balancedEventComposite' else signals[i,6]),'rowIndex':int(i)} for i in chosen]})
    outer[name]=days
ledgers={'inner':json.loads((W/'inner-ledger.json').read_text()),'outer':json.loads((W/'outer-ledger.json').read_text())}
need={p['symbol'] for ledger in ledgers.values() for policy in ledger['policies'] for day in policy['days'] for p in day['picks']}
fm=json.loads(pathlib.Path('/tmp/stock-research-fresh-mature-20260930/features/metadata.json').read_text());calendar=fm['tradingDays'];ci={d:i for i,d in enumerate(calendar)}
raw={}
for line in pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson').open():
    s,rr=json.loads(line)
    if s in need:raw[s]={r['trade_date']:tuple(r[k] for k in ['open','high','low','close','volume']) for r in rr if r['source']=='kis' and r['trade_date'] in ci}
env={'raw':raw,'calendar':calendar,'ci':ci,'cache':{},'finite':finite}
own_outcome_source=pathlib.Path('/tmp/composite-score-independent-target-utility-audit-20260930.py').read_text().split('\ndef outcome(s,d):')[1].split('\ndef close(')[0]
exec('def outcome(s,d):'+own_outcome_source,env);outcome=env['outcome'];results={}
for scope,ledger in ledgers.items():
    for policy in ledger['policies']:
        name=policy['name'];penalty=policy.get('lambda',lam);days=inner[str(penalty)] if scope=='inner' else outer[name];own_points=[]
        for j,(own,saved) in enumerate(zip(days,policy['days'])):
            d=own['signalDate'];active=own['modelActive'];absolute_date=j if scope=='inner' else 235+j
            if [(p['symbol'],p['overall_score']) for p in own['picks']]!=[(p['symbol'],p['signals']['overall_score']) for p in saved['picks']]:error('selection',[scope,name,d])
            n=int(offsets[absolute_date+1]-offsets[absolute_date]);metadata={'signalDate':d,'recommendationDateExpected':calendar[ci[d]+1],'expectedD5date':calendar[ci[d]+5],'cooldown':20,'runtimeEligibleCount':n,'afterCooldownCount':own['afterCooldownCount'],'scorableAfterCooldownCount':own['afterCooldownCount'],'unscorableExcludedObservedInputs':0,'pickedCount':len(own['picks']),'modelActive':active,'modelScope':'first150' if active and scope=='inner' else 'all235' if active else None,'lambda':penalty if active else None,'selectionMode':'balancedEventComposite' if active else 'ATRascending' if name=='ATRbaseline' else 'currentOriginalOverall','shortfallStage':None if own['picks'] else 'runtimeEligibleAfterCooldownBelow3'}
            if scope=='outer' and not active:metadata.pop('lambda')
            for k,v in metadata.items():
                if not close(v,saved[k]):error('dayMetadata',[scope,name,d,k,v,saved[k]])
            for rank,(pick,p) in enumerate(zip(own['picks'],saved['picks']),1):
                i=pick['rowIndex'];s=pick['symbol'];score=pick['overall_score'];source_signals={k:int(signals[i,t]) for t,k in enumerate(score_keys)}
                expected={**source_signals,'overall_score':score}
                if p['sourceSignals']!=source_signals or p['signals']!=expected or p['selectionRank']!=rank:error('sourceScoreBinding',[scope,name,d,s])
                atoms=[None if not np.isfinite(v) else float(v) for v in X[i]]
                if not close(atoms,p['atoms']) or not close(dict(zip(inputs['featureOrder'],atoms)),p['rawFactors']):error('observed18Binding',[scope,name,d,s])
                if active:
                    probs=preds['first150'][i] if scope=='inner' else preds['all235'][i-offsets[235]]
                    expected_probs=dict(zip(heads,map(float,probs)));raw_score=float(100*(.8*probs[0]+.2*probs[1])-(100*penalty)*probs[2])
                    if not close(expected_probs,p['probabilities']) or not close(raw_score,p['scoreRawComposite']):error('headScoreBinding',[scope,name,d,s])
                    if inputs['models']['first150' if scope=='inner' else 'all235']['lastLabelMaturity']>=d:error('maturity',[scope,name,d,s])
                elif p['scoreRawComposite'] is not None:error('warmSeedUsesModel',[scope,name,d,s])
                o=outcome(s,d)
                if not close(o,p['outcome']):error('rawOutcome',[scope,name,d,s,o,p['outcome']])
                bars=[raw.get(s,{}).get(day) for day in calendar[ci[d]+1:ci[d]+6]]
                expected_bars=[{'session':t,'date':calendar[ci[d]+t],'source':'kis',**dict(zip(['open','high','low','close','volume'],r))} if r else {'session':t,'date':calendar[ci[d]+t],'missing':True} for t,r in enumerate(bars,1)]
                if expected_bars!=p['dailyBars'] or p['D1open']!=(bars[0][0] if bars[0] else None):error('rawBars',[scope,name,d,s])
                own_points.append({'date':d,'symbol':s,'score':score,'outcome':o});counts['selectedInstances']+=1;counts['zeroVolumeInstances']+=o['zeroVolumeFlag'];counts['missingBarInstances']+=o['missingBarFlag']
            counts['policyDays']+=1
        metric_source=pathlib.Path('/tmp/composite-score-independent-target-utility-audit-20260930.py').read_text().split('\ndef metrics(pp,strict):')[1].split('\nresults={}')[0]
        metric_env={'statistics':statistics};exec('def metrics(pp,strict):'+metric_source,metric_env)
        splits={'inner':dates[155:235]} if scope=='inner' else {'originalTrainDiagnostic':dates[235:315],'validationReused':dates[320:350],'testReused':dates[355:415],'allOriginal180':dates[235:415],'partialFreshSpotcheck':dates[415:]}
        for split,ds in splits.items():
            own=metric_env['summarize']([p for p in own_points if p['date'] in ds],ds);saved=published['innerResults'][name] if scope=='inner' else published['outerResults'][split][name]
            for k,v in own.items():
                if not close(v,saved[k]):error('aggregate',[scope,name,split,k,v,saved[k]])
            if scope=='inner':
                m=own['strictPositiveVolume'];dist=(m['touchRate']-.4)**2+(m['loss5Rate']-.3)**2
                if not close(dist,saved['targetSquaredDistance']):error('targetDistance',name)
            results[scope+':'+split+':'+name]=own
for p,h in published['savedModelHashes'].items():
    if hashlib.file_digest((B/'event-composite-study'/(p+'-model.joblib')).open('rb'),'sha256').hexdigest()!=h:error('savedModelHash',p)
for path,h in json.loads((W/'protected-prior-hashes.json').read_text()).items():
    if hashlib.file_digest(open(path,'rb'),'sha256').hexdigest()!=h:error('protectedPriorHash',path)
stat_choice=(W/'chosen-lambda.json').stat();stat_outer=(W/'all235-candidate-probabilities.ndjson').stat()
chronology={'chosenAtUTC':choice['chosenAtUTC'],'choiceMtimeBeforeOuterCacheMtime':stat_choice.st_mtime<=stat_outer.st_mtime,'onlyChosenOuterLambda':sorted(set(p.get('lambda') for p in ledgers['outer']['policies'] if 'lambda' in p)),'classifierFitsThisStudy':published['classifierFitsThisStudy']}
if not chronology['choiceMtimeBeforeOuterCacheMtime'] or chronology['onlyChosenOuterLambda']!=[lam] or chronology['classifierFitsThisStudy']!=0:error('choiceChronology',chronology)
out=pathlib.Path('/tmp/composite-score-independent-balanced-full-audit-20260930.json')
report={'scope':'Independent frozen six-inner/ONE chosen-outer balanced grid audit, no refits/hypotheses/outer selection. Uses independently validated saved-head feature/prediction cache, actual TS source category scores/turnover and full own continuous20 cooldown. All selected raw five-session prices/outcomes and strict missing rows verified; integer ranking/head/category binding, maturity/choice/aggregates protected hashes checked.','planSha256':published['planSha256'],'chosenLambda':lam,'counts':dict(counts),'differenceCounts':{k:v for k,v in counts.items() if k.startswith('difference:')},'differences':dict(errors),'choiceChronology':chronology,'results':results,'limitations':['Loss5 is cost-inclusive D5net<=-5%, not any negative return.','Reported targets are retrospective frequencies, not calibrated future guarantees.','Original180/point2/results repeatedly reused, no pristine OOS claim.','Daily-high target-exit proxy is not verified fills; raw volume0 observational marks remain non-executable.','Current-master bias and variable early feature warmup remain.']}
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'report':str(out),'chosenLambda':lam,'counts':dict(counts),'differenceCounts':report['differenceCounts']},ensure_ascii=False),flush=True)
if errors:raise SystemExit(1)
