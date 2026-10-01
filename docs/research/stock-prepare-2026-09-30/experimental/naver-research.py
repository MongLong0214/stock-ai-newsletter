# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1", "lightgbm==4.7.0"]
# ///
"""Fixed NAVER TRAIN-fold selection then causal quarterly primary evaluation."""
import argparse,json,pathlib,hashlib,math,statistics,datetime,importlib.util,time,collections
import numpy as np
OUT=pathlib.Path('/tmp/composite-score-experimental-20260930');BASE=pathlib.Path('/tmp/composite-score-research-20260930')
parser=argparse.ArgumentParser();parser.add_argument('--risk',choices=['L5','L0'],required=True);parser.add_argument('--stage',choices=['train','primary','all'],default='all');args=parser.parse_args()
RISK=args.risk;SUFFIX='naver' if RISK=='L5' else 'naver-l0';DIR=OUT/SUFFIX;DIR.mkdir(exist_ok=True)
PLAN=OUT/(SUFFIX+'-protocol.json');HASHES={'L5':'377ed12d88de69989043bd7ef21b4b057a44c2fbab90ba19f4f679189e69033c','L0':'c32a1fe438427e9df67b2ab22dbaae1538912adcb4c164e704e01303652524c4'}
def sha(p):
    with pathlib.Path(p).open('rb') as h:return hashlib.file_digest(h,'sha256').hexdigest()
assert sha(PLAN)==HASHES[RISK];protocol=json.loads(PLAN.read_text())
corepath=OUT/('fixed-models.py' if RISK=='L5' else 'fixed-models-l0.py');ms=importlib.util.spec_from_file_location('core',corepath);core=importlib.util.module_from_spec(ms);ms.loader.exec_module(core)
CACHE=OUT/'naver-cache';manifest=json.loads((CACHE/'manifest.json').read_text())
assert manifest['completedAtUTC'] and manifest['source']=='naver-fchart' and manifest['noFutureLabelsCalculated'] and not manifest['new2023_2024OutcomesRead']
observed_audits=[OUT/'naver-ts-observed/source-parity-causality-audit.json',OUT/'naver-ts-observed/compact-integrity-audit.json']
for path in observed_audits:assert json.loads(path.read_text())['passed'],'Actual TS observed exporter audit must complete before fitting'
for entry in manifest['files'].values():assert sha(entry['path'])==entry['sha256']
for path,h in manifest['sourceHashes'].items():assert sha(path)==h
calendar=manifest['calendarDates'];signals=manifest['signalDates'];symbols=manifest['symbols'];di={d:i for i,d in enumerate(calendar)};si={d:i for i,d in enumerate(signals)}
names=manifest['masterNames'];assert len(names)==len(symbols)
train=manifest['trainDates'];primary=manifest['primaryDates'];assert train+primary==signals and len(train)>=680
assert calendar==sorted(set(calendar)) and signals==sorted(set(signals)) and symbols==sorted(set(symbols))
assert all(di[d]>=319 for d in signals)
X=np.load(CACHE/'X50.npy',mmap_mode='r');sourceScores=np.load(CACHE/'sourceSignals7.npy',mmap_mode='r');turnover=np.load(CACHE/'turnover.npy',mmap_mode='r');symbolIndices=np.load(CACHE/'symbols.npy',mmap_mode='r');offsets=np.load(CACHE/'offsets.npy',mmap_mode='r');raw=np.load(CACHE/'rawBars.npy',mmap_mode='r')
assert X.shape==(manifest['rowCount'],50) and sourceScores.shape==(len(X),7) and len(offsets)==len(signals)+1 and offsets[-1]==len(X)
assert np.all(np.diff(offsets)>0) and np.isfinite(turnover).all()
CATEGORIES=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score'];SCORE_KEYS=CATEGORIES+['overall_score'];FEATURE_NAMES=manifest['featureNames'];assert FEATURE_NAMES==protocol['shared']['inputAblations']['expanded50']
sourcehashes={str(p):sha(p) for p in [PLAN,pathlib.Path(__file__),corepath,CACHE/'manifest.json',OUT/'naver-cache.py']+observed_audits};sourcehashes.update({entry['path']:entry['sha256'] for entry in manifest['files'].values()})
freeze=DIR/'input-freeze.json'
if freeze.exists():assert json.loads(freeze.read_text())['sourceHashes']==sourcehashes
else:freeze.write_text(json.dumps({'frozenAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'beforeModelFits':True,'noNewPrimaryOutcomesInspected':True,'sourceHashes':sourcehashes},indent=2))
MODEL_DIR=DIR/'models';CAL_DIR=DIR/'calibrators';PRED_DIR=DIR/'predictions';TRAIN_DIR=DIR/'training-configs'
for p in [MODEL_DIR,CAL_DIR,PRED_DIR,TRAIN_DIR]:p.mkdir(exist_ok=True)
labels={};bundlecache={};predictioncache={};models={};calibrators={};allow_primary=False
def span(d):i=si[d];return int(offsets[i]),int(offsets[i+1])
def label_panel(d):
    if d in labels:return labels[d]
    assert d in train or allow_primary,'Primary outcome read before TRAIN winner frozen'
    a,b=span(d);idx=di[d];assert idx+5<len(calendar)
    rr=np.asarray(raw[symbolIndices[a:b],idx+1:idx+6,:]);assert rr.shape==(b-a,5,5)
    prices=rr[:,:,:4];present=np.isfinite(rr).any(axis=2);complete=present.all(axis=1)
    valid=np.isfinite(prices).all(axis=(1,2)) & (prices>0).all(axis=(1,2)) & (prices[:,:,1]>=prices.max(axis=2)).all(axis=1) & (prices[:,:,2]<=prices.min(axis=2)).all(axis=1)
    vol=np.isfinite(rr[:,:,4]).all(axis=1) & (rr[:,:,4]>0).all(axis=1);strict=valid&vol
    zero=((~np.isfinite(rr[:,:,4]) | (rr[:,:,4]<=0)) & present).any(axis=1)
    entry=rr[:,0,0];gross=np.divide(rr[:,-1,3],entry,out=np.full(b-a,np.nan),where=np.isfinite(entry)&(entry>0))-1;net=gross-.003
    touch=(rr[:,:,1]>=entry[:,None]*110/100).any(axis=1)&valid;bull=rr[:,0,3]>rr[:,0,0]
    mae=np.minimum(0,np.min(rr[:,:,2],axis=1)/entry-1);maxgain=(np.max(rr[:,:,1],axis=1)/entry-1)*100;target=np.where(touch,.10,gross)-.003
    for v in [gross,net,mae,maxgain,target]:v[~valid]=np.nan
    event=np.column_stack([touch,bull,net<=-.05 if RISK=='L5' else net<0]).astype(np.uint8)
    labels[d]={'strict':strict,'rawValid':valid,'zero':zero,'missing':~complete,'gross':gross,'net':net,'touch':touch,'bull':bull,'mae':mae,'maxgain':maxgain,'target':target,'events':event}
    return labels[d]
def get_outcome(d,local):
    p=label_panel(d);strict=bool(p['strict'][local]);valid=bool(p['rawValid'][local]);a,_=span(d);bar=raw[int(symbolIndices[a+local]),di[d]+1:di[d]+6]
    entry_known=bool(np.isfinite(bar[0,[0,3]]).all() and bar[0,0]>0)
    o={'rawMarkValid':valid,'strictLabelValid':strict,'zeroVolumeFlag':bool(p['zero'][local]),'missingBarFlag':bool(p['missing'][local]),'entryBullish':bool(p['bull'][local]) if entry_known else None,'utility':None}
    if valid:
        touch=bool(p['touch'][local]);gross=float(p['gross'][local]);net=float(p['net'][local]);target=float(p['target'][local]);u=target+.025*int(o['entryBullish'])-max(0,-target)
        o.update({'entry':float(bar[0,0]),'gross5d':gross,'net5d':net,'touch':touch,'mae':float(p['mae'][local]),'maxGainPercent':float(p['maxgain'][local]),'targetNetProxy':target,'rawTargetUtilityProxy':u,'utility':u if strict else None,'targetFirstTouchSession':next((j for j,r in enumerate(bar,1) if r[1]>=bar[0,0]*110/100),None),'touchAndPositiveD5Net':touch and net>0})
    return o
provenance={'sourceHashes':sourcehashes,'vendor':'naver-fchart','riskDefinition':'netD5<=-.05' if RISK=='L5' else 'netD5<0','observedFeatureOrder':FEATURE_NAMES,'modelRowsDateContiguous':True,'strictLabelsOnlyFit':True,'nativeNaNRetained':True,'unknownFutureNeverMasksSelection':True}
def fit(config,dates,activation,epoch):
    key=(config['id'],epoch)
    if key in bundlecache:return bundlecache[key]
    assert dates==sorted(set(dates)) and all(calendar[di[d]+5]<=activation for d in dates)
    panels=[label_panel(d) for d in dates];counts=[int(p['strict'].sum()) for p in panels];assert len(dates)==len(counts) and min(counts)>0,'No compression of empty training panels'
    xx=np.concatenate([X[slice(*span(d)),:config['inputCount']][p['strict']] for d,p in zip(dates,panels)]);ee=np.concatenate([p['events'][p['strict']] for p in panels])
    assert sum(counts)==len(xx);maturity=calendar[di[dates[-1]]+5]
    witness=[{'date':d,'rows':n,'firstSymbol':symbols[int(symbolIndices[span(d)[0]+int(np.flatnonzero(p['strict'])[0])])],'lastSymbol':symbols[int(symbolIndices[span(d)[0]+int(np.flatnonzero(p['strict'])[-1])])]} for d,p,n in zip(dates,panels,counts)]
    pp={**provenance,'epoch':epoch,'latestTrainingLabelMaturity':maturity,'availableClosedAsOf':activation,'queryFirstLastWitness':witness}
    bundle,meta=core.fit_bundle(config,dates,activation,xx,ee,counts,MODEL_DIR/epoch,pp);bundlecache[key]=bundle;models[epoch+'/'+bundle['bundleId']]=meta;return bundle
def predict(bundle,d):
    epoch=bundle['provenance']['epoch'];key=(epoch,bundle['bundleId'],d)
    if key not in predictioncache:
        directory=PRED_DIR/epoch;directory.mkdir(exist_ok=True);path=directory/(bundle['bundleId']+'-'+d+'.npy')
        if path.exists():v=np.load(path,allow_pickle=False)
        else:
            v=bundle['model'].predict(X[slice(*span(d)),:bundle['config']['inputCount']]);np.save(path,v,allow_pickle=False)
        assert len(v)==span(d)[1]-span(d)[0] and np.isfinite(v).all();predictioncache[key]=v
    return predictioncache[key]
def calibrate(config,bundle,dates,activation,epoch):
    assert config['family']=='B' and dates==sorted(set(dates)) and all(calendar[di[d]+5]<=activation for d in dates)
    assert all(d>bundle['trainingDates'][-1] for d in dates)
    pp=[label_panel(d) for d in dates];counts=[int(p['strict'].sum()) for p in pp];assert min(counts)>0
    margins=[predict(bundle,d)[p['strict']] for d,p in zip(dates,pp)];ee=[p['events'][p['strict']] for p in pp]
    key=config['id']+'-'+epoch+'-cal40';cal,meta=core.fit_calibrator(config,dates,margins,ee,counts,CAL_DIR/epoch,key,activation,{**provenance,'epoch':epoch,'sameLearnerBundle':bundle['bundleId'],'sameLearnerTrainingDates':bundle['trainingDates'],'allPredictionDatesStrictlyAfterFitLastDate':True,'latestCalibrationLabelMaturity':calendar[di[dates[-1]]+5]})
    calibrators[key]=meta;return cal
def run_policy(name,dates,schedule=None,mode='overall'):
    recent=[];daily=[];bundle=None;cal=None
    for index,d in enumerate(dates):
        if schedule and index in schedule:bundle,cal=schedule[index]
        a,b=span(d);n=b-a;all_indices=np.arange(n,dtype=np.int32);syms=symbolIndices[a:b];excluded={s for vv in recent[-20:] for s in vv};ii=[i for i in all_indices if int(syms[i]) not in excluded]
        if bundle:pred=predict(bundle,d);ss,expected=core.scores(bundle['config'],pred,cal)
        else:pred=expected=None;ss=np.array(sourceScores[a:b,6],dtype=np.int32)
        ranked=sorted(ii,key=(lambda i:(float(X[a+i,0]),symbols[int(syms[i])])) if mode=='atr' else (lambda i:(-int(ss[i]),-float(turnover[a+i]),symbols[int(syms[i])])))
        chosen=ranked[:3] if len(ranked)>=3 else [];recent.append([int(syms[i]) for i in chosen]);assert not excluded.intersection(recent[-1])
        day={'signalDate':d,'recommendationDateExpected':calendar[di[d]+1],'expectedD5date':calendar[di[d]+5],'cooldown':20,'modelActive':bundle is not None,'modelScope':bundle['bundleId'] if bundle else None,'modelEpoch':bundle['provenance']['epoch'] if bundle else None,'calibratorId':cal['calibratorId'] if cal else None,'selectionMode':'directGoalUtilityRegressor' if bundle and bundle['config']['family']=='A' else 'LambdaMARTTemporalIsotonicGoalUtility' if bundle else 'ATRascending' if mode=='atr' else 'currentOriginalOverall','runtimeEligibleCount':n,'afterCooldownCount':len(ii),'scorableAfterCooldownCount':len(ii),'unscorableExcludedObservedInputs':0,'pickedCount':len(chosen),'shortfallStage':None if chosen else 'runtimeEligibleAfterCooldownBelow3','picks':[]}
        if bundle:
            rawtop=sorted(ii,key=lambda i:(-float(expected[i]),-float(turnover[a+i]),symbols[int(syms[i])]))[:3]
            day['scoreDiagnostics']={'eligibleScore0Count':int((ss==0).sum()),'eligibleScore100Count':int((ss==100).sum()),'eligibleScoreMax':int(ss.max()),'eligibleScoreMin':int(ss.min()),'eligibleAllScoreMax0':bool(ss.max()==0),'top3IntegerVsRawDifferent':chosen!=rawtop,'top3RawSymbols':[symbols[int(syms[i])] for i in rawtop],'top3IntegerAllTied':len(chosen)==3 and len(set(int(ss[i]) for i in chosen))==1,'topIntegerTieCount':sum(int(ss[i])==int(ss[chosen[0]]) for i in ii) if chosen else 0}
        for rank,i in enumerate(chosen,1):
            symbol=symbols[int(syms[i])];bar=raw[int(syms[i]),di[d]+1:di[d]+6];values=X[a+i];source={k:int(v) for k,v in zip(SCORE_KEYS,sourceScores[a+i])}
            o=get_outcome(d,int(i));dailybars=[]
            for session,r in enumerate(bar,1):
                dailybars.append({'session':session,'date':calendar[di[d]+session],'source':'naver-fchart',**{k:float(v) if np.isfinite(v) else None for k,v in zip(['open','high','low','close','volume'],r)}})
            p={'date':d,'symbol':symbol,'currentMasterName':names[int(syms[i])],'source':'naver-fchart','sourceSignals':source,'signals':{**source,'overall_score':int(ss[i])},'sourceLabel':None,'sourceEligibleSnapshot':True,'outcome':o,'selectionRank':rank,'rawFactors':{k:float(v) if np.isfinite(v) else None for k,v in zip(FEATURE_NAMES,values)},'feature':{'atrPercent14':float(values[0]),'averageTurnover20':float(turnover[a+i])},'recommendationDate':calendar[di[d]+1],'expectedD5date':calendar[di[d]+5],'D1open':float(bar[0,0]) if np.isfinite(bar[0,0]) else None,'dailyBars':dailybars}
            if bundle:p.update({'expectedGoalUtility':float(expected[i]),'nativeModelPrediction':float(pred[i]),'modelConfig':bundle['config'],'modelEpoch':bundle['provenance']['epoch'],'calibratorId':cal['calibratorId'] if cal else None})
            day['picks'].append(p)
        daily.append(day)
    return {'name':name,'riskTarget':RISK,'actualPublishedHistory':False,'initialState':'empty on '+dates[0],'days':daily}
old_source=(BASE/'raw-composite-study/raw-research.py').read_text();metric_code='def metrics('+old_source.split('\ndef metrics(')[1].split('\ninner_results=')[0];exec(compile(metric_code,'frozen-metrics','exec'),globals());oldmetrics=metrics
def metrics(pp,strict):
    m=oldmetrics(pp,strict);vv=[p for p in pp if p['outcome']['strictLabelValid' if strict else 'rawMarkValid']]
    if vv:m.update({'anyNegativeD5NetCount':sum(p['outcome']['net5d']<0 for p in vv),'anyNegativeD5NetRate':statistics.mean(p['outcome']['net5d']<0 for p in vv),'touchAndNonNegativeD5Count':sum(p['outcome']['touch'] and p['outcome']['net5d']>=0 for p in vv),'touchAndNonNegativeD5Rate':statistics.mean(p['outcome']['touch'] and p['outcome']['net5d']>=0 for p in vv),'touchAndNegativeD5Count':sum(p['outcome']['touch'] and p['outcome']['net5d']<0 for p in vv),'touchAndNegativeD5Rate':statistics.mean(p['outcome']['touch'] and p['outcome']['net5d']<0 for p in vv),'T_x_Risk_JointCounts':{str(t)+'_'+str(l):sum(int(p['outcome']['touch'])==t and int(p['outcome']['net5d']<=-.05 if RISK=='L5' else p['outcome']['net5d']<0)==l for p in vv) for t in [0,1] for l in [0,1]}})
    return m
def summarize_extra(run,ds):
    result=summarize(run,ds);dd=[d for d in run['days'] if d['signalDate'] in set(ds)];pp=[p for d in dd for p in d['picks']];vv=[p for p in pp if p['outcome']['strictLabelValid'] and 'expectedGoalUtility' in p]
    bins=[]
    def actual(p):
        o=p['outcome'];return core.target_value(p['modelConfig'],int(o['touch']),int(o['entryBullish']),int(o['net5d']<=-.05 if RISK=='L5' else o['net5d']<0))
    for j in range(10):
        bb=[p for p in vv if j/10<=p['expectedGoalUtility']<(j+1)/10 or j==9 and p['expectedGoalUtility']==1]
        bins.append({'from':j/10,'through':(j+1)/10,'points':len(bb),'meanPredictedUtility':statistics.mean(p['expectedGoalUtility'] for p in bb) if bb else None,'meanActualUtility':statistics.mean(actual(p) for p in bb) if bb else None,'outcomes':metrics(bb,True)})
    result['selectedUtilityCalibrationBins']=bins;result['tieDiagnostics']={'activeDays':sum(d['modelActive'] for d in dd),'integerVsRawTop3DifferentDays':sum(d.get('scoreDiagnostics',{}).get('top3IntegerVsRawDifferent',False) for d in dd),'all3IntegerTiedDays':sum(d.get('scoreDiagnostics',{}).get('top3IntegerAllTied',False) for d in dd),'eligibleAllScoreMax0Days':sum(d.get('scoreDiagnostics',{}).get('eligibleAllScoreMax0',False) for d in dd)}
    if vv:result['expectedUtilityCalibration']={'strictPoints':len(vv),'meanPredicted':statistics.mean(p['expectedGoalUtility'] for p in vv),'meanActual':statistics.mean(actual(p) for p in vv),'MSE':statistics.mean((p['expectedGoalUtility']-actual(p))**2 for p in vv)}
    return result
def choice_key(m,c):
    v=m['strictPositiveVolume'];loss=v['loss5Rate'] if RISK=='L5' else v['anyNegativeD5NetRate']
    return (max(0,.40-v['touchRate'])**2+max(0,loss-.30)**2,-v['meanNet5d'],-v['meanTargetNetProxy'],-v['D1bullishRate'],0 if c['complexity']=='small' else 1,c['lambda'],c['inputCount'])
def write(path,x):path.write_text(json.dumps(x,ensure_ascii=False,indent=2,allow_nan=False))
def ledger(path,runs):path.write_text(json.dumps({'actualPublishedHistory':False,'riskTarget':RISK,'scoreMeaning':'Expected bounded favorable-outcome utility index, NOT single-event probability or percentile','sourceHashes':sourcehashes,'protocolSha256':HASHES[RISK],'currentMasterSurvivorshipBias':True,'policies':list(runs.values())},ensure_ascii=False,allow_nan=False))
winnerpath=DIR/'winners-frozen-before-primary.json'
if args.stage in ['train','all']:
    entries=[]
    for config in core.CONFIGS:
        foldruns=[];foldresults=[]
        for f,fold in enumerate(protocol['TRAINfolds']):
            n=fold['learnerPrefix'];ca,cb=fold['calibrationInterval'];a,b=fold['assessmentInterval'];epoch='TRAINfold'+str(f+1)
            bundle=fit(config,train[:n],train[ca],epoch);cal=calibrate(config,bundle,train[ca:cb],train[a],epoch) if config['family']=='B' else None
            run=run_policy(config['id']+'-fold'+str(f+1),train[:b],{a:(bundle,cal)});foldruns.append(run);foldresults.append(summarize_extra(run,train[a:b]));ledger(TRAIN_DIR/(config['id']+'-fold'+str(f+1)+'-ledger.json'),{'fold':run})
        assessmentdays=[day for run,fold in zip(foldruns,protocol['TRAINfolds']) for day in run['days'] if day['signalDate'] in set(train[slice(*fold['assessmentInterval'])])]
        aggregate={'name':config['id'],'days':assessmentdays};dates=[d['signalDate'] for d in assessmentdays];result=summarize_extra(aggregate,dates);key=choice_key(result,config)
        entry={'config':config,'foldAssessments':foldresults,'aggregate240AssessmentDays':result,'selectionKey':key};entries.append(entry);write(TRAIN_DIR/(config['id']+'-result.json'),entry)
        print('TRAIN_CONFIG_COMPLETE',config['id'],json.dumps({k:result['strictPositiveVolume'][k] for k in ['touchRate','loss5Rate','anyNegativeD5NetRate','meanNet5d']}),'objective',key[0],flush=True);predictioncache.clear()
    winners={f:min((e for e in entries if e['config']['family']==f),key=lambda e:e['selectionKey']) for f in ['A','B']}
    frozen={'frozenAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'allConfigurationResults':entries,'winners':winners,'noPrimaryOutcomesUsed':True,'onlyTRAIN2020_2022':True,'sourceHashes':sourcehashes,'protocolSha256':HASHES[RISK]}
    if winnerpath.exists():old=json.loads(winnerpath.read_text());assert old['winners']==winners and old['allConfigurationResults']==entries
    else:write(winnerpath,frozen)
    print('NAVER_TWO_WINNERS_FROZEN_BEFORE_PRIMARY',json.dumps({f:e['config'] for f,e in winners.items()}),flush=True)
    write(DIR/'train-results.json',frozen)
if args.stage in ['primary','all']:
    other=OUT/('naver-l0' if RISK=='L5' else 'naver')/'winners-frozen-before-primary.json'
    assert other.exists() and json.loads(other.read_text())['noPrimaryOutcomesUsed'],'BOTH L5 and L0 TRAIN winner files must exist before either primary evaluation'
    assert winnerpath.exists();frozen=json.loads(winnerpath.read_text());assert frozen['noPrimaryOutcomesUsed'] and frozen['sourceHashes']==sourcehashes and frozen['protocolSha256']==HASHES[RISK]
    winners=frozen['winners'];allow_primary=True
    # Full chronological quarter state, immutable model within each quarter, no retuning.
    activationindices=[i for i,d in enumerate(primary) if i==0 or d[:4]+'-Q'+str((int(d[5:7])-1)//3)!=primary[i-1][:4]+'-Q'+str((int(primary[i-1][5:7])-1)//3)]
    assert len(activationindices)==8 and all(int(primary[i][5:7]) in [1,4,7,10] for i in activationindices)
    runs={};epochs=[]
    for f,entry in winners.items():
        config=entry['config'];schedule={}
        for i in activationindices:
            asof=primary[i];end=di[asof]-5;window=calendar[end-504:end+1];assert len(window)==505 and all(d in si for d in window)
            learn=window[:460];gap=window[460:465];caldates=window[465:];assert len(caldates)==40
            assert calendar[di[caldates[-1]]+5]==asof and all(calendar[di[d]+5]<=asof for d in window)
            epoch=asof;bundle=fit(config,learn,asof,epoch);cal=calibrate(config,bundle,caldates,asof,epoch) if f=='B' else None
            schedule[i]=(bundle,cal);epochs.append({'family':f,'activationDate':asof,'all505ConsecutivePanels':window,'learner460':learn,'gap5':gap,'calibration40':caldates,'latestLabelMaturity':asof,'modelDirectory':str(MODEL_DIR/epoch),'bundleId':bundle['bundleId'],'calibratorId':cal['calibratorId'] if cal else None,'quarterImmutable':True})
        name='winner'+f;runs[name]=run_policy(name,primary,schedule)
    for name,mode in [('currentOverall','overall'),('ATRbaseline','atr')]:runs[name]=run_policy(name,primary,mode=mode)
    ledger(DIR/'primary-ledger.json',runs)
    scopes={'all2023_2024':primary,**{'year'+y:[d for d in primary if d[:4]==y] for y in ['2023','2024']},**{y+'Q'+str(q):[d for d in primary if d[:4]==y and (int(d[5:7])-1)//3+1==q] for y in ['2023','2024'] for q in [1,2,3,4]}}
    results={s:{n:summarize_extra(run,ds) for n,run in runs.items()} for s,ds in scopes.items()};regimes={}
    for boundary,name in [(50,'breadthBelow50Percent'),(0,'kospiReturn20Below0')]:
        column=17 if boundary==50 else 16
        for lower in [True,False]:
            ds=[d for d in primary if (float(X[span(d)[0],column])<boundary)==lower];regimes[name+str(lower)]={n:summarize_extra(run,ds) for n,run in runs.items()}
    audit={'selectedInstances':0,'categoryDifferences':[],'integerDifferences':[],'unknownFutureRetained':[],'coverageShortfallDays':[],'maturityViolations':[]}
    for n,run in runs.items():
        for day in run['days']:
            if day['pickedCount']!=3:audit['coverageShortfallDays'].append([n,day['signalDate']])
            for p in day['picks']:
                key=[n,day['signalDate'],p['symbol']];audit['selectedInstances']+=1
                if any(p['signals'][k]!=p['sourceSignals'][k] for k in CATEGORIES):audit['categoryDifferences'].append(key)
                if day['modelActive']:
                    if p['signals']['overall_score']!=int(math.floor(100*p['expectedGoalUtility']+.5)):audit['integerDifferences'].append(key)
                    fitmeta=models[day['modelEpoch']+'/'+day['modelScope']]
                    if fitmeta['provenance']['latestTrainingLabelMaturity']>day['signalDate']:audit['maturityViolations'].append(key)
                if not p['outcome']['strictLabelValid']:audit['unknownFutureRetained'].append({'selection':key,'zeroVolume':p['outcome']['zeroVolumeFlag'],'missingBar':p['outcome']['missingBarFlag']})
    assert not any(audit[k] for k in ['categoryDifferences','integerDifferences','maturityViolations'])
    report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'riskTarget':RISK,'trainingWinnersFrozen':frozen,'primaryResults':results,'naturalBoundaryRegimes':regimes,'quarterlyEpochs':epochs,'models':models,'calibrators':calibrators,'selectedAudit':audit,'sourceHashes':sourcehashes,'promotion':'Research only; no product writes or guaranteed40/30 performance','caveats':['Newvendor2023–24 but designs informed by known2025–26; not pristine research OOS','Currentmaster/status/adjustedvintage andvolume distortions bias historical returns','Quarterly uses previously matured primary labels causally, explicitly prequential','505panels/460fit/40calibration fixed hypothesis not literature-provenKRXoptimum','Index represents expected composite favorableutility, not touchprobability','Daily-high10% target-only exit is assumed proxy, not confirmedfill','RiskL5threshold andANYnegative are separately disclosed','Strictunknownexcludedonlytrain/calibration/metrics butselectedrosterskept','Repeatedstocks/overlapping5day outcomes andconfigurationsearch require caution']}
    write(DIR/'primary-report.json',report);write(DIR/'selected-audit.json',audit);write(DIR/'quarterly-models.json',epochs)
    for s in ['all2023_2024','year2023','year2024']:print('PRIMARY_RESULT',s,json.dumps({n:r['strictPositiveVolume'] for n,r in results[s].items()}),flush=True)
    assert all(sha(p)==h for p,h in sourcehashes.items()),'Frozenobservedsource ormodelsource changed'
    print('NAVER_RESEARCH_DONE',RISK,DIR,flush=True)
