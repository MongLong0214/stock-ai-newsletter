"""One fixed same-integer tie diagnostic. No model fit or prediction calls."""
import ast, json, pathlib, hashlib, datetime, math, statistics, sys
import numpy as np
import joblib
D=pathlib.Path(__file__).resolve().parent;B=D.parent;C=B/'naver-cache'
def sha(p):
 with pathlib.Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
PLAN=D/'protocol.json';PLAN_SHA='3f8332167db23152842c0f6a30849094ed7e215ccd9f62a997b9aadbfa339c58'
assert sha(PLAN)==PLAN_SHA;plan=json.loads(PLAN.read_text());protected=dict(plan['sourceHashes'])
manifest=json.loads((C/'manifest.json').read_text());calendar=manifest['calendarDates'];dates=manifest['primaryDates'];symbols=manifest['symbols'];names=manifest['masterNames'];di={d:i for i,d in enumerate(calendar)};si={d:i for i,d in enumerate(manifest['signalDates'])}
X=np.load(C/'X50.npy',mmap_mode='r');sourceScores=np.load(C/'sourceSignals7.npy',mmap_mode='r');turnover=np.load(C/'turnover.npy',mmap_mode='r');symbolIndices=np.load(C/'symbols.npy',mmap_mode='r');offsets=np.load(C/'offsets.npy',mmap_mode='r');raw=np.load(C/'rawBars.npy',mmap_mode='r')
for e in manifest['files'].values():protected[e['path']]=e['sha256']
assert all(sha(p)==h for p,h in protected.items())
# Only these pure observed-array/raw-label function bodies; no old top-level code executes.
labels={};allow_primary=True;train=manifest['trainDates'];RISK='L5'
tree=ast.parse((B/'naver-research.py').read_text());nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['span','label_panel','get_outcome']];assert len(nodes)==3
exec(compile(ast.Module(body=nodes,type_ignores=[]),'readonly-raw-functions','exec'),globals())
sys.path.insert(0,str(B/'outcome-diagnostic'));from outcome_diagnostic import diagnose_five_session_outcomes
SCORE_KEYS=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score','overall_score']
inputs=[('L5',B/'naver',B/'naver/primary-ledger.json'),('L0',B/'naver-l0',B/'naver-l0/primary-ledger.json'),('FP',B/'first-passage-study',B/'first-passage-study/naver-primary-ledger.json')]
original={};definitions={};baseline=None
for risk,folder,path in inputs:
 data=json.loads(path.read_text())
 for run in data['policies']:
  if run['name'].startswith('winner'):
   key=risk+'-'+('A' if run['name'] in ['winnerA','winnerFP'] else 'B');original[key]=run;definitions[key]=(risk,folder)
  elif baseline is None:pass
 if risk=='L5':baseline={r['name']:r for r in data['policies'] if not r['name'].startswith('winner')}
 else:
  for r in data['policies']:
   if r['name'] in baseline:
    assert [[p['symbol'] for p in d['picks']] for d in r['days']]==[[p['symbol'] for p in d['picks']] for d in baseline[r['name']]['days']]
assert len(original)==5 and len(dates)==489
for risk,folder,path in inputs:
 reportpath=folder/('naver-primary-report.json' if risk=='FP' else 'primary-report.json');report=json.loads(reportpath.read_text())
 for m in report['models'].values():protected[m['joblibPath']]=m['joblibSha256']
 for m in report.get('calibrators',{}).values():protected[m['joblibPath']]=m['joblibSha256']
cal_cache={};outcome_cache={};prediction_arrays={};audit={'modelFitCalls':0,'modelPredictionCalls':0,'calibratorFitCalls':0,'originalRosterDifferences':[],'originalIntegerDifferences':[],'originalExpectedDifferences':[],'baselineRosterDifferences':[],'rawOutcomeDifferences':[],'lowerIntegerOutrankViolations':[],'cooldownViolations':[],'maturityViolations':[]}
def prediction(key,day):
 risk,folder=definitions[key];epoch=day['modelEpoch'];scope=day['modelScope'];pdir=folder/('naver-predictions' if risk=='FP' else 'predictions');path=pdir/epoch/(scope+'-'+day['signalDate']+'.npy');protected[str(path)]=sha(path)
 pred=np.load(path,allow_pickle=False);assert len(pred)==span(day['signalDate'])[1]-span(day['signalDate'])[0] and np.isfinite(pred).all()
 if day['calibratorId']:
  path=folder/'calibrators'/epoch/(day['calibratorId']+'.joblib')
  if str(path) not in cal_cache:cal_cache[str(path)]=joblib.load(path)
  cal=cal_cache[str(path)];assert cal['activationDate']<=day['signalDate'];expected=cal['model'].predict(pred)
 else:expected=pred
 expected=np.clip(expected,0,1);ss=np.floor(100*expected+.5).astype(np.int32);assert ((ss>=0)&(ss<=100)).all();return ss,expected
# Cache only score/expected arrays; immutable saved model predictions are the sole model inputs.
for key,run in original.items():
 for day in run['days']:prediction_arrays[(key,day['signalDate'])]=prediction(key,day)
print('CACHED_FIXED_FIVE_POLICY_SCORES',len(prediction_arrays),flush=True)
def outcome(d,local):
 a,_=span(d);symbolindex=int(symbolIndices[a+local]);key=(d,symbolindex)
 if key in outcome_cache:return outcome_cache[key]
 o=get_outcome(d,int(local));idx=di[d];bars=np.asarray(raw[symbolindex,idx+1:idx+6]);sessions=calendar[idx+1:idx+6]
 barlist=[{'session':j,'date':date,'source':'naver-fchart',**{k:float(v) if np.isfinite(v) else None for k,v in zip(['open','high','low','close','volume'],row)}} for j,(date,row) in enumerate(zip(sessions,bars),1)]
 z=diagnose_five_session_outcomes(sessions,{date:dict(zip(['open','high','low','close','volume'],[float(v) if np.isfinite(v) else None for v in row])) for date,row in zip(sessions,bars)})
 known=z['status']=='known';cost=z['costSensitivity'][0];assert cost['roundTripBps']==30
 lower=z['models']['targetStop']['conservative'];upper=z['models']['targetStop']['optimistic']
 proxy={'known':known,'status':z['status'],'targetOnlyNet30bps':cost['targetOnly']['netReturn'],'targetStopNetLower30bps':cost['targetStop']['netReturnLower'],'targetStopNetUpper30bps':cost['targetStop']['netReturnUpper'],'T_safeConservative':lower['exitReason']=='target' if known else None,'T_safeOptimistic':upper['exitReason']=='target' if known else None,'sameBarAmbiguous':z['models']['targetStop']['sameDayAmbiguous'],'conservativeExitReason':lower['exitReason'],'optimisticExitReason':upper['exitReason']}
 assert known==o['strictLabelValid'];outcome_cache[key]=(o,barlist,proxy);return outcome_cache[key]
def run(key,tie):
 source=original[key] if key in original else baseline[key];recent=[];days=[]
 for old in source['days']:
  d=old['signalDate'];a,b=span(d);syms=symbolIndices[a:b];excluded={s for prev in recent[-20:] for s in prev};ii=[i for i in range(b-a) if int(syms[i]) not in excluded]
  if key in original:ss,expected=prediction_arrays[(key,d)]
  else:ss=np.asarray(sourceScores[a:b,6],dtype=np.int32);expected=None
  if key=='ATRbaseline':order=sorted(ii,key=lambda i:(float(X[a+i,0]),symbols[int(syms[i])]))
  else:order=sorted(ii,key=(lambda i:(-int(ss[i]),-float(expected[i]),-float(turnover[a+i]),symbols[int(syms[i])])) if tie else (lambda i:(-int(ss[i]),-float(turnover[a+i]),symbols[int(syms[i])])))
  picked=order[:3] if len(order)>=3 else [];recent.append([int(syms[i]) for i in picked]);assert not excluded.intersection(recent[-1])
  original_symbols=[p['symbol'] for p in old['picks']];new_symbols=[symbols[int(syms[i])] for i in picked]
  if not tie and original_symbols!=new_symbols:audit['originalRosterDifferences' if key in original else 'baselineRosterDifferences'].append([key,d])
  if key!='ATRbaseline':assert all(int(ss[order[i]])>=int(ss[order[i+1]]) for i in range(len(order)-1))
  topbin=int(ss[picked[0]]) if picked else None;bin_members=[i for i in ii if topbin is not None and int(ss[i])==topbin]
  equalfloat=sum(float(expected[i])==float(expected[picked[0]]) for i in bin_members) if expected is not None and picked else None
  day={**{k:v for k,v in old.items() if k not in ['picks','scoreDiagnostics']},'tieRule':'integer_then_same_unrounded_utility_then_turnover_ASCII' if tie else 'original_integer_then_turnover_ASCII','originalSelectedSymbols':original_symbols,'selectedSymbols':new_symbols,'changedVersusOriginalRoster':original_symbols!=new_symbols,'afterCooldownCount':len(ii),'pickedCount':len(picked),'picks':[],'tieDiagnostics':{'topIntegerBinCandidatesAfterOwnCooldown':len(bin_members),'topIntegerBinExactExpectedTies':equalfloat,'maximumIntegerScoreAfterOwnCooldown':topbin,'all3SameInteger':len(picked)==3 and len({int(ss[i]) for i in picked})==1,'eligibleIntegerBins':len(set(map(int,ss)))}}
  for rank,i in enumerate(picked,1):
   o,bars,proxy=outcome(d,i);sourceSignals={k:int(v) for k,v in zip(SCORE_KEYS,sourceScores[a+i])};p={'symbol':symbols[int(syms[i])],'currentMasterName':names[int(syms[i])],'selectionRank':rank,'sourceSignals':sourceSignals,'signals':{**sourceSignals,'overall_score':int(ss[i])},'expectedGoalUtility':float(expected[i]) if expected is not None else None,'averageTurnover20':float(turnover[a+i]),'dailyBars':bars,'outcome':o,'economicProxy':proxy}
   if not tie:
    oldp=old['picks'][rank-1]
    if p['signals']!=oldp['signals']:audit['originalIntegerDifferences'].append([key,d,p['symbol']])
    if key in original and p['expectedGoalUtility']!=oldp['expectedGoalUtility']:audit['originalExpectedDifferences'].append([key,d,p['symbol']])
    for k,v in o.items():
     if oldp['outcome'].get(k)!=v:audit['rawOutcomeDifferences'].append([key,d,p['symbol'],k])
   day['picks'].append(p)
  days.append(day)
 return {'name':key+('-utilityTie' if tie else '-original'),'sourcePolicy':key,'tieChanged':tie,'actualPublishedHistory':False,'cooldown':20,'initialState':'empty on '+dates[0],'days':days}
runs={}
for key in original:
 for tie in [False,True]:r=run(key,tie);runs[r['name']]=r
for key in baseline:r=run(key,False);runs[r['name']]=r
for k,v in audit.items():
 if isinstance(v,list):assert not v,(k,v[:3])
print('REPLAY_AND_ORIGINAL_PARITY_DONE',len(runs),'selected',sum(len(d['picks']) for r in runs.values() for d in r['days']),flush=True)
def metrics(run,scope):
 dd=[d for d in run['days'] if d['signalDate'] in set(scope)];pp=[p for d in dd for p in d['picks']];known=[p for p in pp if p['outcome']['strictLabelValid']];rawknown=[p for p in pp if p['outcome']['rawMarkValid']]
 def outcomes(vv):
  oo=[p['outcome'] for p in vv]
  if not oo:return {'known':0,'unknown':len(pp)}
  return {'known':len(oo),'unknown':len(pp)-len(oo),'touchRate':statistics.mean(o['touch'] for o in oo),'loss5Rate':statistics.mean(o['net5d']<=-.05 for o in oo),'anyNegativeD5Rate':statistics.mean(o['net5d']<0 for o in oo),'D1bullRate':statistics.mean(o['entryBullish'] for o in oo),'meanD5Net':statistics.mean(o['net5d'] for o in oo),'medianD5Net':statistics.median(o['net5d'] for o in oo),'meanMAE':statistics.mean(o['mae'] for o in oo),'worstD5Net':min(o['net5d'] for o in oo),'touchAndNonNegativeD5Rate':statistics.mean(o['touch'] and o['net5d']>=0 for o in oo)}
 ec=[p['economicProxy'] for p in known];econ={'known':len(ec),'unknown':len(pp)-len(ec)}
 if ec:econ.update({'T_safeConservativeRate':statistics.mean(e['T_safeConservative'] for e in ec),'T_safeOptimisticRate':statistics.mean(e['T_safeOptimistic'] for e in ec),'targetOnlyMeanNet30bps':statistics.mean(e['targetOnlyNet30bps'] for e in ec),'targetStopConservativeMeanNet30bps':statistics.mean(e['targetStopNetLower30bps'] for e in ec),'targetStopOptimisticMeanNet30bps':statistics.mean(e['targetStopNetUpper30bps'] for e in ec),'targetStopConservativeAnyNegativeRate':statistics.mean(e['targetStopNetLower30bps']<0 for e in ec),'targetStopOptimisticAnyNegativeRate':statistics.mean(e['targetStopNetUpper30bps']<0 for e in ec),'sameBarAmbiguousCount':sum(e['sameBarAmbiguous'] for e in ec)})
 return {'days':len(dd),'picks':len(pp),'all3Days':sum(d['pickedCount']==3 for d in dd),'all3ScoreAtLeast70Days':sum(len(d['picks'])==3 and all(p['signals']['overall_score']>=70 for p in d['picks']) for d in dd),'scoreMin':min(p['signals']['overall_score'] for p in pp),'scoreMax':max(p['signals']['overall_score'] for p in pp),'changedRosterDays':sum(d['changedVersusOriginalRoster'] for d in dd),'all3IntegerTiedDays':sum(d['tieDiagnostics']['all3SameInteger'] for d in dd),'topBinCandidateMean':statistics.mean(d['tieDiagnostics']['topIntegerBinCandidatesAfterOwnCooldown'] for d in dd),'topBinCandidateMax':max(d['tieDiagnostics']['topIntegerBinCandidatesAfterOwnCooldown'] for d in dd),'strict':outcomes(known),'rawMarks':outcomes(rawknown),'economicProxy':econ}
scopes={'all2023_2024':dates,**{'year'+y:[d for d in dates if d[:4]==y] for y in ['2023','2024']},**{y+'Q'+str(q):[d for d in dates if d[:4]==y and (int(d[5:7])-1)//3+1==q] for y in ['2023','2024'] for q in range(1,5)}}
results={s:{name:metrics(run,dd) for name,run in runs.items()} for s,dd in scopes.items()}
# Fixed paired circular block bootstrap, descriptive only; no winners chosen from it.
bootstrap={}
for scope in ['all2023_2024','year2023','year2024']:
 dd=scopes[scope];n=len(dd);rng=np.random.default_rng(42);starts=rng.integers(0,n,size=(1000,math.ceil(n/10)));indices=((starts[:,:,None]+np.arange(10)[None,None,:])%n).reshape(1000,-1)[:,:n];bootstrap[scope]={}
 for key in original:
  arrays=[]
  for suffix in ['-original','-utilityTie']:
   bydate={d['signalDate']:d for d in runs[key+suffix]['days']};aa=np.full((n,3,6),np.nan)
   for i,d in enumerate(dd):
    for j,p in enumerate(bydate[d]['picks']):
     o=p['outcome'];e=p['economicProxy']
     if o['strictLabelValid']:aa[i,j]=[o['touch'],o['net5d']<=-.05,o['net5d']<0,o['entryBullish'],o['net5d'],e['targetStopNetLower30bps']]
   arrays.append(aa)
  point=np.nanmean(arrays[1].reshape(-1,6),axis=0)-np.nanmean(arrays[0].reshape(-1,6),axis=0);samp=np.nanmean(arrays[1][indices].reshape(1000,-1,6),axis=1)-np.nanmean(arrays[0][indices].reshape(1000,-1,6),axis=1)
  bootstrap[scope][key]={k:{'difference':float(point[j]),'lower95':float(np.quantile(samp[:,j],.025)),'upper95':float(np.quantile(samp[:,j],.975))} for j,k in enumerate(['touchRate','loss5Rate','anyNegativeD5Rate','D1bullRate','meanD5Net','targetStopConservativeMeanNet30bps'])}
assert all(sha(p)==h for p,h in protected.items()),'Protected inputs changed'
report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protocolSha256':PLAN_SHA,'sourceSha256':sha(__file__),'researchOnly':True,'PRIMARYAlreadyObservedReusedDiagnostic':True,'newFits':0,'newModelPredictionCalls':0,'sameUnroundedExpectedUtilityOnlyWithinSamePublishedInteger':True,'results':results,'pairedCircular10Day1000DrawSeed42':bootstrap,'audit':audit,'protectedHashes':protected,'limitations':plan['researchLimitations']+['Paired intervals descriptive, conditional on earlier config selection, not multiplicity corrected','Native isotonic plateaus still tie even before rounding']}
(D/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False));(D/'ledger.json').write_text(json.dumps({'protocolSha256':PLAN_SHA,'actualPublishedHistory':False,'PRIMARYAlreadyObservedReusedDiagnostic':True,'policies':list(runs.values())},ensure_ascii=False,allow_nan=False))
for key in original:print('TIE_RESULT',key,json.dumps({s:results['all2023_2024'][key+s]['strict'] for s in ['-original','-utilityTie']}),flush=True)
print('INTEGER_TIE_ABLATION_DONE',D,flush=True)
