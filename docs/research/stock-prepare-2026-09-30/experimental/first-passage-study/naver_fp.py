"""Two input ablations, original readonly observed cache and exact FP outcome helper."""
import argparse,ast,json,pathlib,hashlib,statistics,datetime,importlib.util,time,sys,math
import numpy as np
DIR=pathlib.Path(__file__).resolve().parent;OUT=DIR.parent;BASE=pathlib.Path('/tmp/composite-score-research-20260930')
sys.path.insert(0,str(DIR));import fp_models as core
sys.path.insert(0,str(OUT/'outcome-diagnostic'));from outcome_diagnostic import diagnose_five_session_outcomes
parser=argparse.ArgumentParser();parser.add_argument('--stage',choices=['train','primary'],default='train');args=parser.parse_args()
def sha(p):
    with pathlib.Path(p).open('rb') as h:return hashlib.file_digest(h,'sha256').hexdigest()
PLAN=DIR/'protocol.json';PLAN_HASH='84e91781bebc11aaf7e8b8255908c74bc424b92153683538bd310572f432e1c7'
assert sha(PLAN)==PLAN_HASH;protocol=json.loads(PLAN.read_text());assert protocol['configurations']==core.CONFIGS
CACHE=OUT/'naver-cache';manifest=json.loads((CACHE/'manifest.json').read_text())
assert sha(CACHE/'manifest.json')==protocol['NAVER']['cacheManifestSha256']
assert manifest['noFutureLabelsCalculated'] and not manifest['new2023_2024OutcomesRead']
for entry in manifest['files'].values():assert sha(entry['path'])==entry['sha256']
for path,h in manifest['sourceHashes'].items():assert sha(path)==h
assert sha(protocol['outcomeHelper']['path'])==protocol['outcomeHelper']['sha256']
calendar=manifest['calendarDates'];signals=manifest['signalDates'];symbols=manifest['symbols'];names=manifest['masterNames'];train=manifest['trainDates'];primary=manifest['primaryDates'];di={d:i for i,d in enumerate(calendar)};si={d:i for i,d in enumerate(signals)}
X=np.load(CACHE/'X50.npy',mmap_mode='r');sourceScores=np.load(CACHE/'sourceSignals7.npy',mmap_mode='r');turnover=np.load(CACHE/'turnover.npy',mmap_mode='r');symbolIndices=np.load(CACHE/'symbols.npy',mmap_mode='r');offsets=np.load(CACHE/'offsets.npy',mmap_mode='r');raw=np.load(CACHE/'rawBars.npy',mmap_mode='r')
FEATURE_NAMES=manifest['featureNames'];CATEGORIES=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score'];SCORE_KEYS=CATEGORIES+['overall_score'];RISK='FP'
sourcehashes={str(p):sha(p) for p in [PLAN,pathlib.Path(__file__),DIR/'fp_models.py',OUT/'fixed-models.py',OUT/'naver-research.py',CACHE/'manifest.json',pathlib.Path(protocol['outcomeHelper']['path'])]};sourcehashes.update({entry['path']:entry['sha256'] for entry in manifest['files'].values()})
f=DIR/'input-freeze.json'
if f.exists():assert json.loads(f.read_text())['sourceHashes']==sourcehashes
else:f.write_text(json.dumps({'frozenAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'beforeOwnFPModelFits':True,'primaryOutcomesUnreadForFP':True,'sourceHashes':sourcehashes},indent=2))
MODEL_DIR=DIR/'naver-models';PRED_DIR=DIR/'naver-predictions';TRAIN_DIR=DIR/'naver-training';LABEL_DIR=DIR/'naver-fp-labels'
for p in [MODEL_DIR,PRED_DIR,TRAIN_DIR,LABEL_DIR]:p.mkdir(exist_ok=True)
labels={};bundlecache={};predictioncache={};models={};allow_primary=False
provenance={'sourceHashes':sourcehashes,'vendor':'naver-fchart','riskDefinition':'L0_FP: conservative target10/stop5 first-passage net<0 after30bps','target':'(.8*T_safe+.2*B+.65*(1-L0_FP))/1.65','eventColumnNames':['T_safe','B','L0_FP'],'originalFloatLabelsUnchanged':True,'observedFeatureOrder':FEATURE_NAMES,'strictLabelsOnlyFit':True,'nativeNaNRetained':True,'unknownFutureNeverMasksSelection':True}

# Reuse function bodies only. No old parser, loader, fitter, ledger or result executes.
original_tree=ast.parse((OUT/'naver-research.py').read_text())
def reuse(names):
    nodes=[node for node in original_tree.body if isinstance(node,ast.FunctionDef) and node.name in names]
    assert {node.name for node in nodes}==set(names)
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(OUT/'naver-research.py')+'#readonly-functions','exec'),globals())
reuse(['span','label_panel','get_outcome','fit','predict','run_policy'])
original_label_panel=label_panel;original_get_outcome=get_outcome
def label_panel(d):
    p=original_label_panel(d)
    if 'fpNet' in p:return p
    assert d in train or allow_primary
    path=LABEL_DIR/(d+'.npz');a,b=span(d);idx=di[d];dates=calendar[idx+1:idx+6]
    if path.exists():
        with np.load(path,allow_pickle=False) as saved:
            strict=saved['strict'];assert np.array_equal(strict,p['strict'])
            safe=saved['safe'];net=saved['net'];loss=saved['loss'];amb=saved['ambiguous'];reason=saved['reason'];exitday=saved['exitday']
    else:
        start=time.monotonic();safe=np.zeros(b-a,dtype=np.uint8);loss=np.zeros(b-a,dtype=np.uint8);amb=np.zeros(b-a,dtype=np.uint8);reason=np.zeros(b-a,dtype=np.uint8);exitday=np.zeros(b-a,dtype=np.uint8);net=np.full(b-a,np.nan)
        for i in np.flatnonzero(p['strict']):
            bars={date:dict(zip(['open','high','low','close','volume'],map(float,row))) for date,row in zip(dates,raw[int(symbolIndices[a+i]),idx+1:idx+6])}
            z=diagnose_five_session_outcomes(dates,bars);assert z['status']=='known'
            lower=z['models']['targetStop']['conservative'];cost=z['costSensitivity'][0];assert cost['roundTripBps']==30
            safe[i]=lower['exitReason']=='target';net[i]=cost['targetStop']['netReturnLower'];loss[i]=cost['targetStop']['allNegativePossible'];amb[i]=z['models']['targetStop']['sameDayAmbiguous'];reason[i]=['target','stop','stop_gap','horizon_close'].index(lower['exitReason'])+1;exitday[i]=dates.index(lower['exitDate'])+1
        np.savez(path,strict=p['strict'],safe=safe,net=net,loss=loss,ambiguous=amb,reason=reason,exitday=exitday)
        if si[d]%50==0:print('FP_LABEL_PANEL',d,int(p['strict'].sum()),round(time.monotonic()-start,3),flush=True)
    p['originalEvents']=p['events'];p.update(fpSafe=safe,fpNet=net,fpLoss=loss,fpAmbiguous=amb,fpReason=reason,fpExitDay=exitday,events=np.column_stack([safe,p['bull'],loss]).astype(np.uint8))
    return p
def get_outcome(d,local):
    o=original_get_outcome(d,local);p=label_panel(d);strict=o['strictLabelValid']
    o.update({'T_safe':bool(p['fpSafe'][local]) if strict else None,'L0_FP':bool(p['fpLoss'][local]) if strict else None,'fpNet30bps':float(p['fpNet'][local]) if strict else None,'fpSameBarAmbiguous':bool(p['fpAmbiguous'][local]) if strict else None,'fpExitReason':['target','stop','stop_gap','horizon_close'][int(p['fpReason'][local])-1] if strict else None,'fpExitSession':int(p['fpExitDay'][local]) if strict else None})
    return o
raw_tree=ast.parse((BASE/'raw-composite-study/raw-research.py').read_text());nodes=[n for n in raw_tree.body if isinstance(n,ast.FunctionDef) and n.name in ['metrics','summarize']];exec(compile(ast.Module(body=nodes,type_ignores=[]),'original-float-metrics','exec'),globals());original_metrics=metrics
def metrics(pp,strict):
    m=original_metrics(pp,strict);known=[p for p in pp if p['outcome']['strictLabelValid' if strict else 'rawMarkValid']]
    if known:m.update(anyNegativeD5NetRate=statistics.mean(p['outcome']['net5d']<0 for p in known))
    fp=[p['outcome'] for p in pp if p['outcome']['strictLabelValid']]
    m['firstPassage']={'known':len(fp),'unknown':len(pp)-len(fp),'T_safeRate':statistics.mean(o['T_safe'] for o in fp) if fp else None,'L0_FP_Rate':statistics.mean(o['L0_FP'] for o in fp) if fp else None,'meanNet30bps':statistics.mean(o['fpNet30bps'] for o in fp) if fp else None,'sameBarAmbiguousCount':sum(o['fpSameBarAmbiguous'] for o in fp),'exitReasons':{r:sum(o['fpExitReason']==r for o in fp) for r in ['target','stop','stop_gap','horizon_close']}}
    return m
def summarize_extra(run,ds):
    result=summarize(run,ds);dd=[d for d in run['days'] if d['signalDate'] in set(ds)];vv=[p for d in dd for p in d['picks'] if p['outcome']['strictLabelValid'] and 'expectedGoalUtility' in p]
    if vv:
        actual=[core.target_value(p['modelConfig'],int(p['outcome']['T_safe']),int(p['outcome']['entryBullish']),int(p['outcome']['L0_FP'])) for p in vv]
        result['jointFPUtilityCalibration']={'strictPoints':len(vv),'meanPredicted':statistics.mean(p['expectedGoalUtility'] for p in vv),'meanActual':statistics.mean(actual),'MSE':statistics.mean((p['expectedGoalUtility']-y)**2 for p,y in zip(vv,actual))}
    result['tieDiagnostics']={'activeDays':sum(d['modelActive'] for d in dd),'integerVsRawTop3DifferentDays':sum(d.get('scoreDiagnostics',{}).get('top3IntegerVsRawDifferent',False) for d in dd),'all3IntegerTiedDays':sum(d.get('scoreDiagnostics',{}).get('top3IntegerAllTied',False) for d in dd)}
    return result
def choice_key(m,c):
    v=m['strictPositiveVolume'];fp=v['firstPassage'];assert fp['known']>0
    return (max(0,.40-fp['T_safeRate'])**2+max(0,fp['L0_FP_Rate']-.30)**2,-fp['meanNet30bps'],-v['meanNet5d'],-v['D1bullishRate'],c['inputCount'])
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False))
def ledger(path,runs):path.write_text(json.dumps({'actualPublishedHistory':False,'riskTarget':'FP','scoreMeaning':'Expected joint first-passage favorable utility; modeled exit proxy, not actual fills','originalFloatGoalMetricsSeparate':True,'sourceHashes':sourcehashes,'protocolSha256':PLAN_HASH,'policies':list(runs.values())},ensure_ascii=False,allow_nan=False))
winnerpath=DIR/'naver-winner-frozen-before-primary.json'
if args.stage=='train':
    entries=[]
    for config in core.CONFIGS:
        foldruns=[];foldresults=[]
        for f,fold in enumerate(protocol['NAVER']['folds']):
            n=fold['learnerPrefix'];ca,_=fold['calibrationInterval'];a,b=fold['assessmentInterval'];epoch='FP-TRAINfold'+str(f+1)
            bundle=fit(config,train[:n],train[ca],epoch)
            run=run_policy(config['id']+'-fold'+str(f+1),train[:b],{a:(bundle,None)});foldruns.append(run);foldresults.append(summarize_extra(run,train[a:b]));ledger(TRAIN_DIR/(config['id']+'-fold'+str(f+1)+'-ledger.json'),{'fold':run})
        days=[day for run,fold in zip(foldruns,protocol['NAVER']['folds']) for day in run['days'] if day['signalDate'] in set(train[slice(*fold['assessmentInterval'])])]
        result=summarize_extra({'name':config['id'],'days':days},[d['signalDate'] for d in days]);entry={'config':config,'foldAssessments':foldresults,'aggregate240AssessmentDays':result,'selectionKey':choice_key(result,config)};entries.append(entry);write(TRAIN_DIR/(config['id']+'-result.json'),entry);predictioncache.clear()
        print('FP_TRAIN_CONFIG_COMPLETE',config['id'],json.dumps(result['strictPositiveVolume']),flush=True)
    winner=min(entries,key=lambda e:e['selectionKey']);frozen={'frozenAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'onlyTRAIN2020_2022':True,'noPrimaryOutcomesUsed':True,'allConfigurationResults':entries,'winner':winner,'sourceHashes':sourcehashes,'protocolSha256':PLAN_HASH}
    if winnerpath.exists():old=json.loads(winnerpath.read_text());assert old['winner']==winner and old['allConfigurationResults']==entries
    else:write(winnerpath,frozen)
    print('FP_NAVER_WINNER_FROZEN',json.dumps(winner['config']),flush=True)
else:
    for path in [OUT/'naver/winners-frozen-before-primary.json',OUT/'naver-l0/winners-frozen-before-primary.json',winnerpath]:assert path.exists() and json.loads(path.read_text())['noPrimaryOutcomesUsed'],'All L5/L0/FP TRAIN winners must freeze before primary outcomes'
    frozen=json.loads(winnerpath.read_text());assert frozen['sourceHashes']==sourcehashes and frozen['protocolSha256']==PLAN_HASH;config=frozen['winner']['config'];allow_primary=True
    activationindices=[i for i,d in enumerate(primary) if i==0 or (d[:4],(int(d[5:7])-1)//3)!=(primary[i-1][:4],(int(primary[i-1][5:7])-1)//3)];assert len(activationindices)==8
    schedule={};epochs=[]
    for i in activationindices:
        asof=primary[i];end=di[asof]-5;window=calendar[end-504:end+1];assert len(window)==505 and all(d in si for d in window)
        learn=window[:460];gap=window[460:465];unused=window[465:];assert len(unused)==40 and calendar[di[unused[-1]]+5]==asof
        epoch='FP-'+asof;bundle=fit(config,learn,asof,epoch);schedule[i]=(bundle,None);epochs.append({'activationDate':asof,'all505ConsecutivePanels':window,'learner460':learn,'gap5':gap,'unusedCalibration40':unused,'modelDirectory':str(MODEL_DIR/epoch),'bundleId':bundle['bundleId'],'latestFitLabelMaturity':calendar[di[learn[-1]]+5],'quarterImmutable':True})
    runs={'winnerFP':run_policy('winnerFP',primary,schedule),'currentOverall':run_policy('currentOverall',primary),'ATRbaseline':run_policy('ATRbaseline',primary,mode='atr')};ledger(DIR/'naver-primary-ledger.json',runs)
    scopes={'all2023_2024':primary,**{'year'+y:[d for d in primary if d[:4]==y] for y in ['2023','2024']},**{y+'Q'+str(q):[d for d in primary if d[:4]==y and (int(d[5:7])-1)//3+1==q] for y in ['2023','2024'] for q in [1,2,3,4]}}
    results={s:{n:summarize_extra(run,ds) for n,run in runs.items()} for s,ds in scopes.items()}
    report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'riskTarget':'FP','scoreMeaning':'Expected joint first-passage favorable utility, not actual fills','winnerFrozenBeforePrimary':frozen,'primaryResults':results,'quarterlyEpochs':epochs,'models':models,'sourceHashes':sourcehashes,'originalFloatGoalLabelsUnchanged':True,'productMutations':0,'caveats':['Currentmaster/status and adjusted source vintage','Hypothesis informed by reused2025–26 failures','FP both-barrier same candle is conservative stop-first; exit proxies not fills','Primary quarterly refits use previously matured primary labels causally']};write(DIR/'naver-primary-report.json',report)
    for s in ['all2023_2024','year2023','year2024']:print('FP_PRIMARY_RESULT',s,json.dumps({n:r['strictPositiveVolume'] for n,r in results[s].items()}),flush=True)
assert all(sha(p)==h for p,h in sourcehashes.items())
