"""Two frozen FP input ablations on reused KIS dates; no pristine OOS claim."""
import pathlib,json,hashlib,datetime,ast,sys,math,statistics,time
import numpy as np
DIR=pathlib.Path(__file__).resolve().parent;ROOT=DIR.parent;BASE=pathlib.Path('/tmp/composite-score-research-20260930');sys.path.insert(0,str(DIR));import fp_models as core
sys.path.insert(0,str(ROOT/'outcome-diagnostic'));from outcome_diagnostic import diagnose_five_session_outcomes

def sha(p):
    with pathlib.Path(p).open('rb') as h:return hashlib.file_digest(h,'sha256').hexdigest()
PLAN=DIR/'protocol.json';PLAN_HASH='84e91781bebc11aaf7e8b8255908c74bc424b92153683538bd310572f432e1c7';assert sha(PLAN)==PLAN_HASH;protocol=json.loads(PLAN.read_text());assert protocol['configurations']==core.CONFIGS
assert sha(protocol['KISoptional']['parentProtocol'])==protocol['KISoptional']['parentProtocolSha256']
featurespec=json.loads((ROOT/'featurespec.json').read_text());featuremanifest=json.loads((ROOT/'manifest.json').read_text());featureaudit=json.loads((ROOT/'audit.json').read_text())
assert sha(ROOT/'extra-features.ndjson')=='5c953745cef23f54ac619d2b80ce12b559436fce7f7e43ac30550f4c8f7579a2'
for name in ['featurespec.json','audit.json']:assert sha(ROOT/name)==featuremanifest['outputs'][name]['sha256']
assert sha(featuremanifest['module']['path'])==featuremanifest['module']['sha256']
for key in ['original18AtomDifferences','membershipDifferences','currentOhlcvDifferences','sourceSignalCategoryMutationCount','futureSuffix32InputDifferences','olderThan320Prefix32InputDifferences']:assert featureaudit[key]==0
start=time.monotonic()
# Execute only the prior readonly original18/actualTS gate/raw loader prefix.
event=BASE/'event-composite-study/event-research.py';prefix=event.read_text().split('\nFEATURE_NAMES=')[0]
prefix=prefix.replace("OUT=BASE/'event-composite-study'","OUT=pathlib.Path('/tmp/composite-score-experimental-20260930/first-passage-study')").replace("'event-plan.txt'","'protocol.json'").replace('eef81c7d88c58ffc52545d4d4e1d734e1bef35ef7d61dd82e9cf20a7bd9c7ea5',PLAN_HASH)
exec(compile(prefix,str(event)+'#readonly-source-prefix','exec'),globals())
assert OUT.resolve()==DIR and len(rows)==416
FEATURE_NAMES=featurespec['featureNames'];assert len(FEATURE_NAMES)==50
order={d:{p['symbol']:i for i,p in enumerate(pp)} for d,pp in rows.items()};X={d:np.full((len(pp),50),np.nan) for d,pp in rows.items()};seen={d:np.zeros(len(pp),bool) for d,pp in rows.items()};joined=extras=0
for line in (ROOT/'extra-features.ndjson').open():
    r=json.loads(line);d=r['date']
    if d not in rows:extras+=1;continue
    i=order[d][r['symbol']];p=rows[d][i];assert not seen[d][i] and r['runtimeEligible'];xx=np.array([v if finite(v) else np.nan for v in r['originalInputs18']+r['extraInputs32']]);assert np.array_equal(xx[:18],np.array([v if finite(v) else np.nan for v in p['atoms']]),equal_nan=True) and r['sourceSignals']==p['sourceSignals'];X[d][i]=xx;seen[d][i]=True;joined+=1
assert joined==501213 and extras==7802 and all(v.all() for v in seen.values());del order,seen
paths=[PLAN,pathlib.Path(__file__),DIR/'fp_models.py',DIR/'naver_fp.py',ROOT/'fixed-models.py',ROOT/'kis-research.py',ROOT/'extra-features.ndjson',ROOT/'featurespec.json',ROOT/'manifest.json',ROOT/'audit.json',ROOT/'extra_features.py',pathlib.Path(protocol['outcomeHelper']['path']),event,loader,EARLY/'earlier-wide.ndjson',EARLY/'earlier-context.ndjson',EARLY/'manifest.json',EARLY_GATE,EARLY_GATE_AUDIT,BASE/'technical-context.ndjson',BASE/'current-signals.ndjson',BASE/'current-signals-manifest.json',BASE/'horizon-runtime-eligibility.ndjson',pathlib.Path('/tmp/upside-scored.ndjson'),META,FRESH/'scored.ndjson',FRESH/'features/metadata.json',RAW]
input_freeze={str(p):sha(p) for p in paths};freeze=DIR/'kis-input-freeze.json'
if freeze.exists():assert json.loads(freeze.read_text())['sourceHashes']==input_freeze
else:freeze.write_text(json.dumps({'frozenAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'beforeOwnKISFPFit':True,'KISAlreadyReusedNotExternalOOS':True,'sourceHashes':input_freeze},indent=2))
assert sha(protocol['outcomeHelper']['path'])==protocol['outcomeHelper']['sha256']
strict={};events={};labelled=set();original_outcome=outcome
def add_fp(d):
    if d in labelled:return
    ee=[];mask=[];idx=di[d];dates=days[idx+1:idx+6]
    for p in rows[d]:
        o=p.setdefault('outcome',original_outcome(p['symbol'],d));valid=o['strictLabelValid'];mask.append(valid)
        if valid:
            bars={date:dict(zip(['open','high','low','close','volume'],r)) for date,r in zip(dates,raw[p['symbol']][idx+1:idx+6])};z=diagnose_five_session_outcomes(dates,bars);assert z['status']=='known';lower=z['models']['targetStop']['conservative'];cost=z['costSensitivity'][0];assert cost['roundTripBps']==30;o.update(T_safe=lower['exitReason']=='target',L0_FP=cost['targetStop']['allNegativePossible'],fpNet30bps=cost['targetStop']['netReturnLower'],fpSameBarAmbiguous=z['models']['targetStop']['sameDayAmbiguous'],fpExitReason=lower['exitReason'],fpExitSession=dates.index(lower['exitDate'])+1)
        else:o.update({k:None for k in ['T_safe','L0_FP','fpNet30bps','fpSameBarAmbiguous','fpExitReason','fpExitSession']})
        ee.append([int(bool(o['T_safe'])),int(bool(o['entryBullish'])),int(bool(o['L0_FP']))])
    strict[d]=np.asarray(mask,bool);events[d]=np.asarray(ee,np.uint8);assert strict[d].any();labelled.add(d)
MODEL_DIR=DIR/'kis-models';PRED_DIR=DIR/'kis-predictions';TRAIN_DIR=DIR/'kis-training'
for p in [MODEL_DIR,PRED_DIR,TRAIN_DIR]:p.mkdir(exist_ok=True)
provenance={'sourceHashes':input_freeze,'vendor':'kis','target':'(.8*T_safe+.2*B+.65*(1-L0_FP))/1.65','eventColumnNames':['T_safe','B','L0_FP'],'observedInputOrder':FEATURE_NAMES,'strictTrainingLabelOnly':True,'unknownFutureDoesNotFilterSelection':True,'allSourceSixCategoriesPreserved':True,'KISAlreadyReusedNotExternalOOS':True}
bundle_cache={};prediction_cache={};model_metadata={}
kis_tree=ast.parse((ROOT/'kis-research.py').read_text());fnames=['get_bundle','predict','raw_bars','run_policy'];nodes=[n for n in kis_tree.body if isinstance(n,ast.FunctionDef) and n.name in fnames];assert len(nodes)==4;exec(compile(ast.Module(body=nodes,type_ignores=[]),'readonly-kis-functions','exec'),globals());original_get_bundle=get_bundle;original_run_policy=run_policy

def get_bundle(config,n,activation):
    for d in early_dates[:n]:add_fp(d)
    return original_get_bundle(config,n,activation)
def run_policy(name,ds,schedule=None,mode='overall'):
    for d in ds:add_fp(d)
    return original_run_policy(name,ds,schedule,mode)
raw_tree=ast.parse(loader_source);nodes=[n for n in raw_tree.body if isinstance(n,ast.FunctionDef) and n.name in ['metrics','summarize']];exec(compile(ast.Module(body=nodes,type_ignores=[]),'readonly-original-metrics','exec'),globals());original_metrics=metrics
fp_tree=ast.parse((DIR/'naver_fp.py').read_text());nodes=[n for n in fp_tree.body if isinstance(n,ast.FunctionDef) and n.name in ['metrics','summarize_extra','choice_key']];exec(compile(ast.Module(body=nodes,type_ignores=[]),'readonly-FP-metrics','exec'),globals())

def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False))
def ledger(path,runs):path.write_text(json.dumps({'actualPublishedHistory':False,'KISAlreadyReusedNotExternalOOS':True,'scoreMeaning':'Expected joint first-passage favorable utility, modeled exit proxy not fills','sourceHashes':input_freeze,'protocolSha256':PLAN_HASH,'policies':list(runs.values())},ensure_ascii=False,allow_nan=False))
print('KIS_FP_SOURCE_JOIN_DONE',joined,'loadWallSec',time.monotonic()-start,flush=True)
assessment_dates=early_dates[110:130]+early_dates[135:150];entries=[]
for config in core.CONFIGS:
    bundle80=get_bundle(config,80,early_dates[85]);bundle105=get_bundle(config,105,early_dates[110]);bundle130=get_bundle(config,130,early_dates[135]);run=run_policy(config['id'],early_dates[:150],{85:(bundle80,None),110:(bundle105,None),135:(bundle130,None)});result=summarize_extra(run,assessment_dates);entry={'config':config,'assessmentDates':assessment_dates,'assessment':result,'selectionKey':choice_key(result,config)};entries.append(entry);ledger(TRAIN_DIR/(config['id']+'-ledger.json'),{'train':run});write(TRAIN_DIR/(config['id']+'-result.json'),entry);prediction_cache.clear();print('KIS_FP_TRAIN_CONFIG_DONE',config['id'],json.dumps(result['strictPositiveVolume']),flush=True)
winner=min(entries,key=lambda e:e['selectionKey']);winnerpath=DIR/'kis-winner-frozen-before-inner-outer.json';frozen={'frozenAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'selectionOnlyTRAINFirst150':True,'innerOuterNotUsedForChoice':True,'allTwoConfigurationResults':entries,'winner':winner,'sourceHashes':input_freeze,'protocolSha256':PLAN_HASH,'KISAlreadyReusedNotExternalOOS':True}
if winnerpath.exists():assert json.loads(winnerpath.read_text())['winner']==winner
else:write(winnerpath,frozen)
config=winner['config'];inner_bundle=get_bundle(config,150,early_dates[155]);inner={'winnerFP':run_policy('winnerFP',early_dates,{155:(inner_bundle,None)}),'currentOverall':run_policy('currentOverall',early_dates),'ATRbaseline':run_policy('ATRbaseline',early_dates,mode='atr')};inner_results={n:summarize_extra(run,early_dates[155:]) for n,run in inner.items()};ledger(DIR/'kis-inner-ledger.json',inner)
outer_bundle=get_bundle(config,235,outer_dates[0]);outer={'winnerFP':run_policy('winnerFP',outer_dates,{0:(outer_bundle,None)}),'currentOverall':run_policy('currentOverall',outer_dates),'ATRbaseline':run_policy('ATRbaseline',outer_dates,mode='atr')};ledger(DIR/'kis-outer-ledger.json',outer)
splits={'originalTrainDiagnostic':original_dates[:80],'validationReused':original_dates[85:115],'testReused':original_dates[120:],'allOriginal180':original_dates,'partialFreshSpotcheck':[outer_dates[-1]]};outer_results={s:{n:summarize_extra(run,ds) for n,run in outer.items()} for s,ds in splits.items()}
audit={'selectedInstances':0,'originalFloatingOutcomeDifferences':0,'sixCategoryDifferences':0,'integerScoreDifferences':0,'maturityViolations':0,'unknownSelected':0,'threeStockShortfallDays':0}
for scope,runs in [('inner',inner),('outer',outer)]:
    for n,run in runs.items():
        for day in run['days']:
            audit['threeStockShortfallDays']+=day['pickedCount']!=3
            for p in day['picks']:
                audit['selectedInstances']+=1;old=original_outcome(p['symbol'],day['signalDate']);audit['originalFloatingOutcomeDifferences']+=any(p['outcome'][k]!=v for k,v in old.items());audit['sixCategoryDifferences']+=any(p['signals'][k]!=p['sourceSignals'][k] for k in CATEGORIES);audit['unknownSelected']+=not p['outcome']['strictLabelValid']
                if day['modelActive']:
                    audit['integerScoreDifferences']+=p['signals']['overall_score']!=int(math.floor(100*p['expectedGoalUtility']+.5));audit['maturityViolations']+=model_metadata[day['modelScope']]['provenance']['latestTrainingLabelMaturity']>=day['signalDate']
assert not any(audit[k] for k in ['originalFloatingOutcomeDifferences','sixCategoryDifferences','integerScoreDifferences','maturityViolations'])
old_outer=json.loads((ROOT/'kis-outer-ledger.json').read_text());old_inner=json.loads((ROOT/'kis-inner-ledger.json').read_text());audit['baselineRosterDifferences']=0
for current,prior in [(outer,old_outer),(inner,old_inner)]:
    for n in ['currentOverall','ATRbaseline']:
        old=next(run for run in prior['policies'] if run['name']==n);audit['baselineRosterDifferences']+=[[p['symbol'] for p in day['picks']] for day in current[n]['days']]!=[[p['symbol'] for p in day['picks']] for day in old['days']]
assert audit['baselineRosterDifferences']==0 and all(sha(p)==h for p,h in input_freeze.items()) and all(sha(p)==h for p,h in protected.items())
report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protocolSha256':PLAN_HASH,'sourceHashes':input_freeze,'winnerFrozenBeforeInnerOuter':frozen,'innerResults':inner_results,'outerResults':outer_results,'models':model_metadata,'selectedAudit':audit,'wallSeconds':time.monotonic()-start,'originalFloatingGoalLabelsUnchanged':True,'productMutations':0,'caveats':['Already reused KIS2025–26 periods; not external OOS','Currentmaster/currentadjusted source vintage and abbreviated earlier warmup','FP conservative exit proxy is not actual fills; rawT/D5 goals shown separately','NAVER frozen configuration and outcomes not retuned by KIS bridge']};write(DIR/'kis-report.json',report)
print('KIS_FP_DONE',json.dumps({'winner':config,'inner':{n:r['strictPositiveVolume'] for n,r in inner_results.items()},'original180':{n:r['strictPositiveVolume'] for n,r in outer_results['allOriginal180'].items()},'audit':audit,'wallSeconds':report['wallSeconds']}),flush=True)
