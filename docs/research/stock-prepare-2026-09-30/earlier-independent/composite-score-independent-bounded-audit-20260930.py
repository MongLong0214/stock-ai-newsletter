import collections,hashlib,json,math,pathlib,statistics
B=pathlib.Path('/tmp/composite-score-research-20260930');W=B/'bounded-objective-study'
def read(p):return json.loads(pathlib.Path(p).read_text())
own=read('/tmp/composite-score-independent-bounded-replay-20260930.json');priors=read('/tmp/composite-score-independent-prior-panels-20260930.json');published=read(W/'report.json');ia=read('/tmp/composite-score-independent-event-input-audit-20260930.json');dates=ia['signalDates'];counter=collections.Counter();errors={}
def error(k,v):
 counter['difference:'+k]+=1
 if len(errors.setdefault(k,[]))<10:errors[k].append(v)
def close(a,b,tol=1e-12):
 if isinstance(a,dict):return isinstance(b,dict) and set(a)==set(b) and all(close(v,b[k],tol) for k,v in a.items())
 if isinstance(a,list):return isinstance(b,list) and len(a)==len(b) and all(close(x,y,tol) for x,y in zip(a,b))
 return abs(a-b)<=tol if isinstance(a,float) and isinstance(b,(int,float)) and math.isfinite(b) else a==b
panels=read(W/'calibration-panel-prevalences.json')['panels'];assert len(panels)==423
for p in panels:
 o=priors['panels'][p['signalDate']];exp={'signalDate':o['signalDate'],'maturityDate':o['maturityDate'],'runtimeEligibleCount':o['counts']['eligible'],'strictLabelCount':o['counts']['strict'],'unknownStrictLabels':o['counts']['unknown'],'prevalence':o['prior'] if o['counts']['strict'] else None}
 if not close(exp,p):error('rawCalibrationPanel',[p['signalDate'],exp,p])
 counter['rawCalibrationPanels']+=1
if not close(priors['trainingPriors'],published['trainingPriors']):error('trainingPriors',published['trainingPriors'])
saved_shifts=read(W/'asof-prior-shifts.json');assert len(saved_shifts['days'])==261 and not saved_shifts['calendarGaps']
for p in saved_shifts['days']:
 d=p['closedAsOfSignalDate'];o=priors['windows'][d]
 if [q['signalDate'] for q in p['panels']]!=o['calibrationSignalDates'] or [q['maturityDate'] for q in p['panels']]!=o['calibrationMaturityDates'] or p['panelCount']!=20 or p['modelScope']!=o['sourceModel'] or p['maxIncludedMaturityDate']!=max(o['calibrationMaturityDates']) or not p['allIncludedLabelsMatureByAsOf'] or p['maxIncludedMaturityDate']>d:error('asofWindow',d)
 if not close(o['recentPriors'],p['equalDateRecentPrior']) or not close(priors['trainingPriors'][o['sourceModel']],p['equalDateTrainPrior']):error('asofPriors',d)
 counter['asof20Windows']+=1
saved_diag=read(W/'score-mass-and-ties.json');assert saved_diag['observedOnly'] and saved_diag['noAlternatePolicyPerformance']
if not close(own['diagnostics'],saved_diag['days']):
 for a,b in zip(own['diagnostics'],saved_diag['days']):
  if not close(a,b):error('scoreMassTies',[a['signalDate'],a,b])
counter['scoreMassDiagnostics']=len(own['diagnostics'])
metric_source=pathlib.Path('/tmp/composite-score-independent-target-utility-audit-20260930.py').read_text().split('\ndef metrics(pp,strict):')[1].split('\nresults={}')[0];env={'statistics':statistics};exec('def metrics(pp,strict):'+metric_source,env)
results={}
for scope in ['inner','outer']:
 ledger=read(W/(scope+'-ledger.json'));assert ledger['classifierFitsThisStudy']==0 and ledger['lambda']==.65
 policy=next(p for p in ledger['policies'] if p['name']=='boundedEventComposite');run=own['runs'][scope];assert len(run)==len(policy['days']);pts=[]
 for a,b in zip(run,policy['days']):
  d=a['signalDate'];active=a['modelActive'];assert b['signalDate']==d
  if [(p['symbol'],p['signals']['overall_score']) for p in a['picks']]!=[(p['symbol'],p['signals']['overall_score']) for p in b['picks']]:error('rosterIntegerRank',d)
  if b['modelActive']!=active or b['afterCooldownCount']!=a['afterCooldownCount'] or b['cooldown']!=20 or b['pickedCount']!=len(a['picks']) or b['scorableAfterCooldownCount']!=b['afterCooldownCount'] or b['unscorableExcludedObservedInputs']!=0:error('dayState',d)
  if active:
   if b['selectionMode']!='boundedEventComposite' or b['modelScope']!=('first150' if scope=='inner' else 'all235'):error('scoreMode',d)
   if not close(a['recentPriors'],b['priorShift']['equalDateRecentPrior']) or not close(a['logitShift'],b['priorShift']['logitShift']):error('dayPriorBinding',d)
   if not close(a['scoreMassDiagnostic'],b['scoreMassDiagnostic']):error('dayDiagnostic',d)
  elif b['scoreRawComposite'] if 'scoreRawComposite' in b else False:error('warmUsesModel',d)
  for p,q in zip(a['picks'],b['picks']):
   fields=['symbol','selectionRank','sourceSignals','signals','atoms','rawFactors','scoreRawComposite','outcome','dailyBars','D1open']
   if active:fields+=['probabilitiesRaw','probabilities','scoreBeforePriorShift','scoreRawBeforePriorShift','scoreRawPriorShiftSubtractive','scorePriorShiftSubtractive']
   for k in fields:
    pk={'scoreRawPriorShiftSubtractive':'scoreRawSubtractiveAfterPriorShift','scorePriorShiftSubtractive':'scoreSubtractiveAfterPriorShift'}.get(k,k)
    if not close(p[pk],q[k]):error('selectedBinding',[scope,d,p['symbol'],k,p[pk],q[k]])
   pts.append({'date':d,'symbol':p['symbol'],'score':p['signals']['overall_score'],'outcome':p['outcome']});counter['selectedInstances']+=1;counter['zeroVolumeInstances']+=p['outcome']['zeroVolumeFlag'];counter['missingBarInstances']+=p['outcome']['missingBarFlag']
  counter['policyDays']+=1
 splits={'inner80':dates[155:235]} if scope=='inner' else {'originalTrainDiagnostic':dates[235:315],'validationReused':dates[320:350],'testReused':dates[355:415],'allOriginal180':dates[235:415],'partialFreshSpotcheck':dates[415:]}
 for split,ds in splits.items():
  pp=[p for p in pts if p['date'] in ds];m=env['summarize'](pp,ds)
  for label,strict in [('strictPositiveVolume',True),('rawObservationalMarks',False)]:
   oo=[p['outcome'] for p in pp if p['outcome']['strictLabelValid' if strict else 'rawMarkValid']];m[label]['anyNegativeD5NetCount']=sum(o['net5d']<0 for o in oo);m[label]['anyNegativeD5NetRate']=statistics.mean(o['net5d']<0 for o in oo) if oo else None
  got=published['innerResults']['boundedEventComposite'] if scope=='inner' else published['outerResults'][split]['boundedEventComposite']
  if not close(m,got):error('aggregate',[scope,split,m,got])
  results[scope+':'+split]=m
 # Existing fair comparison rows remain byte/value-equivalent to already audited immutable source ledgers.
 prior=read(B/'balanced-event-study'/(scope+'-ledger.json'))['policies'];oldraw=read(B/'raw-composite-study/inner-ledger.json')['policies'] if scope=='inner' else prior
 compare={'unadjustedBalanced0.65':next(x for x in prior if x['name']==('lambda0.65' if scope=='inner' else 'balancedEventComposite')),'currentOverall':next(x for x in oldraw if x['name']=='currentOverall'),'ATRbaseline':next(x for x in oldraw if x['name']=='ATRbaseline')}
 compare['previousPriorCorrected0.65']=next(x for x in read(B/'prior-shift-study'/(scope+'-ledger.json'))['policies'] if x['name']=='priorShiftEventComposite')
 for name,original in compare.items():
  got=next(x for x in ledger['policies'] if x['name']==original['name'])
  if got!=original:error('baselineImmutable',[scope,name])
  counter['preservedComparisonPolicyDays']+=len(got['days'])
for path,h in published['protectedPriorHashes'].items():
 if hashlib.file_digest(open(path,'rb'),'sha256').hexdigest()!=h:error('protectedHash',path)
for path,h in published['sourceHashes'].items():
 if hashlib.file_digest(open(path,'rb'),'sha256').hexdigest()!=h:error('sourceHash',path)
for scope,h in published['savedModelHashes'].items():
 if hashlib.file_digest((B/'event-composite-study'/(scope+'-model.joblib')).open('rb'),'sha256').hexdigest()!=h:error('modelHash',scope)
if published['classifierFitsThisStudy']!=0 or published['panelCount']!=423:error('familyFitCount',published['classifierFitsThisStudy'])
chronology={'innerResultPersistedBeforeOuterLedger':(W/'inner-stage-results-before-outer.json').stat().st_mtime<=(W/'outer-ledger.json').stat().st_mtime,'classifiersRefit':published['classifierFitsThisStudy'],'asOfMaturityPanels':261,'noGrid':'Fixed ONE family, lambda .65 retained; source has no fit or policy family loop.'}
out=pathlib.Path('/tmp/composite-score-independent-bounded-audit-20260930.json');j={'scope':'Independent frozen ONE bounded favorable-objective score mapping audit; exact unchanged rolling20 mature priors/saved heads/penalty .65; 423 raw calibration panels, exact source priors/asof20 chronology, new continuous20 integer/turnover/ASCII selection, all1248 selected raw5-session marks, category/head/score input binding, score mass/ties and all aggregate metrics. Existing comparisons immutable; no refit/new policy.','planSha256':published['planSha256'],'counts':dict(counter),'differenceCounts':{k:v for k,v in counter.items() if k.startswith('difference:')},'differences':errors,'chronology':chronology,'results':results,'limitations':['The most recentTEST60 yields retrospective39.44% touch and27.22% loss5, but anynegative53.33% and VAL/all180 loss5 far exceed30%; no broad guarantee.','Loss5 is cost-inclusive D5net<=-5%; anynegative return separately measured.','Online priors use causally matured validation-period labels later, not a permanently frozen calibration; all periods reused diagnostics.','No guarantee raw HGB posterior calibration/classconditional invariance or recent20 prior as current prior.','No current-master, vintage/adjustment, slippage/fill, overlapping-horizon limitations are cured by correct code.','Favorable-objective score is a weighted index, not singleevent probability:1-pLoss5 means avoidD5net<=-5%, not no loss. Affine scaling preserves latent order; coarser integer bucket/cooldown changes actual selections. All3highscores remain empirical availability.']}
out.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'report':str(out),'counts':dict(counter),'differenceCounts':j['differenceCounts']}),flush=True)
if errors:raise SystemExit(1)
