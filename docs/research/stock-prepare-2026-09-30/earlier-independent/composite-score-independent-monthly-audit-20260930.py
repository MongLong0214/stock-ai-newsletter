import collections,hashlib,json,math,pathlib,statistics
B=pathlib.Path('/tmp/composite-score-research-20260930');W=B/'monthly-adaptive-study'
def read(p):return json.loads(pathlib.Path(p).read_text())
own=read('/tmp/composite-score-independent-monthly-replay-20260930.json');priors=read('/tmp/composite-score-independent-prior-panels-20260930.json');published=read(W/'report.json');ia=read('/tmp/composite-score-independent-event-input-audit-20260930.json');dates=ia['signalDates'];counter=collections.Counter();errors={}
def error(k,v):
 counter['difference:'+k]+=1
 if len(errors.setdefault(k,[]))<8:errors[k].append(v)
def close(a,b,tol=1e-12):
 if isinstance(a,dict):return isinstance(b,dict) and set(a)==set(b) and all(close(v,b[k],tol) for k,v in a.items())
 if isinstance(a,list):return isinstance(b,list) and len(a)==len(b) and all(close(x,y,tol) for x,y in zip(a,b))
 return abs(a-b)<=tol if isinstance(a,float) and isinstance(b,(int,float)) and math.isfinite(b) else a==b
shiftfile=read(W/'daily-bundle-priors.json');assert shiftfile['bundleCount']==15 and len(shiftfile['days'])==261
for a,b in zip(own['dailyBundlePriors'],shiftfile['days']):
 d=a['signalDate'];z=priors['windows'][d]
 for k,v in a.items():
  if not close(v,b[k]):error('dailyBundlePriorBinding',[d,k,v,b[k]])
 if [p['signalDate'] for p in b['panels']]!=z['calibrationSignalDates'] or [p['maturityDate'] for p in b['panels']]!=z['calibrationMaturityDates'] or b['maxCalibrationMaturity']!=max(z['calibrationMaturityDates']) or b['maxCalibrationMaturity']>d or b['latestTrainingLabelMaturity']>d or b['activationClosedAsOf']>d:error('asofWindow',d)
 counter['asof20Windows']+=1
saved_diag=read(W/'score-mass-and-ties.json');assert saved_diag['observedOnly'] and saved_diag['noAlternatePolicyOutcomes']
for a,b in zip(own['diagnostics'],saved_diag['days']):
 if not close(a,b):error('scoreMassTies',[a['signalDate'],a,b])
counter['scoreMassDiagnostics']=len(own['diagnostics']);assert len(saved_diag['days'])==261
metric_source=pathlib.Path('/tmp/composite-score-independent-target-utility-audit-20260930.py').read_text().split('\ndef metrics(pp,strict):')[1].split('\nresults={}')[0];env={'statistics':statistics};exec('def metrics(pp,strict):'+metric_source,env)
results={}
for scope in ['inner','outer']:
 ledger=read(W/(scope+'-ledger.json'));assert ledger['family']=='monthlyRolling150CausalAdaptiveBoundedIndex' and ledger['rollingMaturePreviousValidationLabelsAllowedForLaterPrequentialTraining'] and not ledger['actualPublishedHistory']
 policy=next(p for p in ledger['policies'] if p['name']=='monthlyAdaptiveComposite');run=own['runs'][scope];assert len(run)==len(policy['days']);pts=[]
 for a,b in zip(run,policy['days']):
  d=a['signalDate'];active=a['modelActive'];assert b['signalDate']==d
  if [(p['symbol'],p['signals']['overall_score']) for p in a['picks']]!=[(p['symbol'],p['signals']['overall_score']) for p in b['picks']]:error('rosterIntegerRank',d)
  for k in ['modelActive','modelBundleId','afterCooldownCount','runtimeEligibleCount','recommendationDateExpected','expectedD5date']:
   if b[k]!=a[k]:error('dayState',[d,k,a[k],b[k]])
  if b['cooldown']!=20 or b['pickedCount']!=len(a['picks']) or b['scorableAfterCooldownCount']!=b['afterCooldownCount'] or b['unscorableExcludedObservedInputs']!=0:error('observedOnlyEligibility',d)
  if active:
   if b['selectionMode']!='monthlyAdaptiveBoundedComposite' or b['modelScope']!=scope:error('scoreMode',d)
   for k,v in a['priorShift'].items():
    if not close(v,b['priorShift'][k]):error('dayPriorBinding',[d,k,v,b['priorShift'][k]])
   if not close(a['scoreMassDiagnostic'],b['scoreMassDiagnostic']):error('dayDiagnostic',d)
  for p,q in zip(a['picks'],b['picks']):
   fields=['symbol','selectionRank','sourceSignals','signals','atoms','rawFactors','scoreRawComposite','outcome','dailyBars','D1open']
   if active:fields+=['probabilitiesRaw','probabilities','bundleId']
   for k in fields:
    if not close(p[k],q[k]):error('selectedBinding',[scope,d,p['symbol'],k,p[k],q[k]])
   pts.append({'date':d,'symbol':p['symbol'],'score':p['signals']['overall_score'],'outcome':p['outcome']});counter['selectedInstances']+=1;counter['zeroVolumeInstances']+=p['outcome']['zeroVolumeFlag'];counter['missingBarInstances']+=p['outcome']['missingBarFlag']
  counter['policyDays']+=1
 splits={'inner80':dates[155:235]} if scope=='inner' else {'originalTrainDiagnostic':dates[235:315],'validationReused':dates[320:350],'testReused':dates[355:415],'allOriginal180':dates[235:415],'partialFreshSpotcheck':dates[415:]}
 for split,ds in splits.items():
  pp=[p for p in pts if p['date'] in ds];m=env['summarize'](pp,ds)
  for label,strict in [('strictPositiveVolume',True),('rawObservationalMarks',False)]:
   oo=[p['outcome'] for p in pp if p['outcome']['strictLabelValid' if strict else 'rawMarkValid']];m[label]['anyNegativeD5NetCount']=sum(o['net5d']<0 for o in oo);m[label]['anyNegativeD5NetRate']=statistics.mean(o['net5d']<0 for o in oo) if oo else None
  got=published['innerResults']['monthlyAdaptiveComposite'] if scope=='inner' else published['outerResults'][split]['monthlyAdaptiveComposite']
  if not close(m,got):error('aggregate',[scope,split,m,got])
  results[scope+':'+split]=m
 previous={p['name']:p for p in read(B/'bounded-objective-study'/(scope+'-ledger.json'))['policies']}
 for q in ledger['policies']:
  if q['name']=='monthlyAdaptiveComposite':continue
  if q!=previous[q['name']]:error('baselineImmutable',[scope,q['name']])
  counter['preservedComparisonPolicyDays']+=len(q['days'])
for path,h in published['protectedPriorHashes'].items():
 if hashlib.file_digest(open(path,'rb'),'sha256').hexdigest()!=h:error('protectedHash',path)
for path,h in published['sourceHashes'].items():
 if hashlib.file_digest(open(path,'rb'),'sha256').hexdigest()!=h:error('sourceHash',path)
models=read('/tmp/composite-score-independent-monthly-model-audit-20260930.json')
if models['partial'] or models['differenceCounts'] or models['counts']['bundles']!=15 or models['counts']['trees']!=4500:error('incompleteModelAudit',models['counts'])
if published['classifierFits']!=45 or published['bundleCount']!=15 or published['familyCount']!=1:error('familyFitCount',[published['classifierFits'],published['bundleCount'],published['familyCount']])
initial_log=(W/'run-initial-completed-inner-fit.log').read_text().splitlines();resume_log=(W/'run-resume.log').read_text().splitlines()
initial_fits=sum(x.startswith('FIT_HEAD_DONE ') for x in initial_log);resumed_fits=sum(x.startswith('FIT_HEAD_DONE ') for x in resume_log);exact_loads=sum(x.startswith('LOAD_EXACT_SAVED_BUNDLE ') for x in resume_log)
if (initial_fits,resumed_fits,exact_loads)!=(15,30,5):error('executionFitHistory',[initial_fits,resumed_fits,exact_loads])
chronology={'innerResultPersistedBeforeOuterLedger':(W/'inner-stage-results-before-outer.json').stat().st_mtime<=(W/'outer-ledger.json').stat().st_mtime,'classifierFitsResearchOwner':45,'independentFixedExactRefitHeads':45,'trainingAndRecentPriorsAsOfPanels':261,'noGrid':'ONE frozen window150/monthly schedule and unchanged3heads; no chosen threshold/model based on replay.','initialComparatorNameKeyErrorPreserved':any("KeyError: 'previousPriorCorrected0.65'" in x for x in initial_log),'initialFits':initial_fits,'resumeFits':resumed_fits,'resumeExactSavedBundleLoads':exact_loads,'initialExecutedSourceSha256':hashlib.file_digest((W/'monthly-research-executed-initial.py').open('rb'),'sha256').hexdigest(),'resumedExecutedSourceSha256':hashlib.file_digest((W/'monthly-research.py').open('rb'),'sha256').hexdigest(),'executionRepairScope':'Direct source diff reviewed: comparator actual saved policy name mapping plus provenance-checked load-only resume. Frozen fit inputs, targets, parameters, score and ranking unchanged.'}
out=pathlib.Path('/tmp/composite-score-independent-monthly-audit-20260930.json');j={'scope':'Independent frozen ONE monthly150 adaptive head family. Full own raw423panels, all15 exact refit bundles/45heads/4500trees, fresh bundle date-balanced priors, asof20 calibration, continuous20 authoritative integer/turnover/ASCII rankings, all1248 selected raw5-session outcomes, six categories/head/score input binding and aggregates. Existing comparisons immutable; no new hyperparameter/model family.','planSha256':published['planSha256'],'counts':dict(counter),'differenceCounts':{k:v for k,v in counter.items() if k.startswith('difference:')},'differences':errors,'chronology':chronology,'results':results,'limitations':['Rolling past matured validation/test labels may train later bundles causally: this is adaptive prequential reused research, not a fixed pristine holdout.','Loss5 is cost-inclusive D5net<=-5%, not every negative return; anynegative separately reported.','Recent20 odds correction assumes changing priors with sufficiently stable classconditional likelihoods/calibrated source probabilities; actual concept drift may violate it.','Current-master/status survival, raw-price vintage/adjustment, fixed costs vs fills and overlapping-horizon dependence remain.','The bounded score is a weighted favorable-objective index, not touch probability; high score availability and actual performance must be reported without inflation.','No production/TS model portability or E2E publishing check was performed by this research-only independent audit.']}
out.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'report':str(out),'counts':dict(counter),'differenceCounts':j['differenceCounts']}),flush=True)
if errors:raise SystemExit(1)
