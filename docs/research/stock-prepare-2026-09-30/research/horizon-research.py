# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import json, pathlib, math, statistics, collections, hashlib, datetime
import numpy as np
from scipy.stats import rankdata, spearmanr

OUT=pathlib.Path('/tmp/composite-score-research-20260930');PLAN=OUT/'horizon-plan.txt'
SCORES=OUT/'current-signals.ndjson';MANIFEST=OUT/'current-signals-manifest.json'
PRIMARY=pathlib.Path('/tmp/upside-scored.ndjson');META=pathlib.Path('/private/tmp/stock-target-rebuilt-20260929/metadata.json')
FRESH=pathlib.Path('/tmp/stock-research-fresh-mature-20260930');RAW=FRESH/'input/prices.ndjson'
meta=json.loads(META.read_text());fm=json.loads((FRESH/'features/metadata.json').read_text());manifest=json.loads(MANIFEST.read_text())
runtime_eligibility={a['date']:set(a['runtimeEligibleSymbols']) for a in map(json.loads,(OUT/'horizon-runtime-eligibility.ndjson').open())}
eligibility_audit=json.loads((OUT/'horizon-runtime-eligibility-audit.json').read_text())
assert hashlib.file_digest(SCORES.open('rb'),'sha256').hexdigest()==manifest['output']['sha256']
historical=meta['evaluationDates'];dates=historical+fm['evaluationDates'];days=fm['tradingDays'];di={d:i for i,d in enumerate(days)}
assert len(historical)==180 and len(dates)==181 and dates[-1]=='2026-09-18'
splits={'train':historical[:80],'validation':historical[85:115],'test':historical[120:],'partialFreshSpotcheck':[dates[-1]]}
keys=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score','overall_score']
finite=lambda v:isinstance(v,(float,int)) and math.isfinite(v)
raw={}
for line in RAW.open():
    symbol,rr=json.loads(line);bars=[None]*len(days)
    for r in rr:
        if r['source']=='kis' and r['trade_date'] in di:
            idx=di[r['trade_date']];assert bars[idx] is None
            bars[idx]=tuple(r[k] for k in ['open','high','low','close','volume'])
    raw[symbol]=bars

def outcome(symbol,date):
    i=di[date];rr=raw.get(symbol,[])[i+1:i+6];complete=len(rr)==5 and all(r is not None for r in rr)
    valid=complete and all(all(finite(v) and v>0 for v in r[:4]) and r[1]>=max(r[0],r[2],r[3]) and r[2]<=min(r[0],r[1],r[3]) for r in rr)
    zero=any(r is not None and r[4]<=0 for r in rr);bull=rr[0][3]>rr[0][0] if rr and rr[0] is not None and rr[0][0]>0 else None
    result={'rawMarkValid':bool(valid),'zeroVolumeFlag':bool(zero),'missingBarFlag':not complete,'entryBullish':bull}
    if valid:
        entry=rr[0][0];net=rr[-1][3]/entry-1-.003;touch=max(r[1] for r in rr)>=entry*110/100
        result.update({'entry':entry,'gross5d':net+.003,'net5d':net,'touch':touch,'mae':min(0,min(r[2] for r in rr)/entry-1),'maxGainPercent':(max(r[1] for r in rr)/entry-1)*100,'touchAndPositiveNet':bool(touch and net>0),'bullishAndTouch':bool(bull and touch)})
    return result

scores_iter=iter(SCORES.open());rows={};point_count=0
for path,provenance in [(PRIMARY,'primary'),(FRESH/'scored.ndjson','fresh-mature')]:
    for line in path.open():
        date,pp=json.loads(line);points=[]
        for p in pp:
            current=json.loads(next(scores_iter));assert current['provenance']==provenance and current['date']==date and current['symbol']==p['symbol']
            ss=current['signals'];assert set(ss)==set(keys) and all(isinstance(v,int) and 0<=v<=100 for v in ss.values())
            points.append({'date':date,'symbol':p['symbol'],'eligible':p['symbol'] in runtime_eligibility[date],'sourceEligibleSnapshot':p['eligible'],'feature':p['feature'],'signals':ss,'oldSignalsSnapshot':p['signals'],'sourceLabel':p.get('label'),**outcome(p['symbol'],date)})
            point_count+=1
        rows[date]=points
assert next(scores_iter,None) is None and list(rows)==dates and point_count==239869
eligible={d:[p for p in pp if p['eligible']] for d,pp in rows.items()}
print('LOADED',point_count,'eligible',sum(map(len,eligible.values())),flush=True)

def metric(pp):
    valid=[p for p in pp if p['rawMarkValid']];rr=[p['net5d'] for p in valid];bull=[p['entryBullish'] for p in pp if p['entryBullish'] is not None]
    n=len(valid)
    return {'points':len(pp),'validD5MarkLabels':n,'missingD5Labels':len(pp)-n,'zeroVolumePoints':sum(p['zeroVolumeFlag'] for p in pp),'touchCount':sum(p['touch'] for p in valid),'touchRate':sum(p['touch'] for p in valid)/n if n else None,'D1bullishCount':sum(bull),'D1bullishRate':sum(bull)/len(bull) if bull else None,'touchAndPositiveNetCount':sum(p['touchAndPositiveNet'] for p in valid),'touchAndPositiveNetRate':sum(p['touchAndPositiveNet'] for p in valid)/n if n else None,'bullishAndTouchRate':sum(p['bullishAndTouch'] for p in valid)/n if n else None,'meanNet5d':statistics.mean(rr) if rr else None,'medianNet5d':statistics.median(rr) if rr else None,'positiveNetRate':sum(r>0 for r in rr)/n if n else None,'loss5Count':sum(r<=-.05 for r in rr),'loss5Rate':sum(r<=-.05 for r in rr)/n if n else None,'loss10Count':sum(r<=-.1 for r in rr),'loss10Rate':sum(r<=-.1 for r in rr)/n if n else None,'meanMAE':statistics.mean(p['mae'] for p in valid) if valid else None,'worstNet5d':min(rr) if rr else None}

def select(name):
    recent=[];daily=[];picks=[]
    for date in dates:
        excluded={s for ss in recent[-20:] for s in ss};pool=[p for p in eligible[date] if p['symbol'] not in excluded]
        ranked=sorted(pool,key=lambda p:(-p['signals']['overall_score'],-p['feature']['averageTurnover20'],p['symbol'])) if name=='currentOverallDescCooldown20' else sorted(pool,key=lambda p:(p['feature']['atrPercent14'],p['symbol']))
        chosen=ranked[:3] if len(ranked)>=3 else [];recent.append([p['symbol'] for p in chosen]);assert not excluded.intersection(p['symbol'] for p in chosen)
        cutoff=chosen[-1]['signals']['overall_score'] if chosen and name=='currentOverallDescCooldown20' else None
        tied=sum(p['signals']['overall_score']==cutoff for p in ranked) if cutoff is not None else None
        daily.append({'signalDate':date,'recommendationDateExpected':days[di[date]+1],'expectedD5date':days[di[date]+5],'cooldown':20,'commonEligibleCount':len(eligible[date]),'afterCooldownCount':len(pool),'pickedCount':len(chosen),'shortfallReason':None if chosen else 'fewerThanThreeCommonCandidatesAfterCooldown','cutoffScore':cutoff,'candidatesTiedAtCutoff':tied})
        for rank,p in enumerate(chosen,1):picks.append({**p,'selectionRank':rank})
    return {'name':name,'daily':daily,'picks':picks}

names=['currentOverallDescCooldown20','baselineV2Cooldown20'];continuous={name:select(name) for name in names}

def selection_metric(pp,dd):
    m=metric(pp);group=collections.defaultdict(list)
    for p in pp:group[p['date']].append(p)
    scores=[p['signals']['overall_score'] for p in pp]
    m.update({'days':len(dd),'full3Days':sum(d['pickedCount']==3 for d in dd),'picks':m['points'],'slotCoverage':len(pp)/(3*len(dd)) if dd else None,'minOverallScore':min(scores) if scores else None,'meanOverallScore':statistics.mean(scores) if scores else None,'maxOverallScore':max(scores) if scores else None,'all3TouchDays':sum(len(g)==3 and all(p.get('touch') for p in g) for g in group.values()),'all3BullishDays':sum(len(g)==3 and all(p['entryBullish'] for p in g) for g in group.values()),'all3PositiveNetDays':sum(len(g)==3 and all(p['rawMarkValid'] and p['net5d']>0 for p in g) for g in group.values()),'scoreAtLeast70Picks':sum(s>=70 for s in scores),'shortfallDays':[d['signalDate'] for d in dd if d['pickedCount']<3]})
    m['positiveVolumeOnly']=metric([p for p in pp if not p['zeroVolumeFlag']])
    m['extension']={'sma20DistanceAbove15PercentCount':sum(p['feature']['sma20DistancePercent'] is not None and p['feature']['sma20DistancePercent']>15 for p in pp),'rsiAbove70Count':sum(p['feature']['rsi14'] is not None and p['feature']['rsi14']>70 for p in pp),'negativeTrendSlope20Count':sum(p['feature']['trendSlope20'] is not None and p['feature']['trendSlope20']<0 for p in pp),'signalDayReturnAbove5PercentCount':sum(((1+p['feature']['gapFromPreviousClosePercent']/100)*p['feature']['close']/p['feature']['open']-1)>.05 for p in pp)}
    return m

ledger={'actualPublishedHistory':False,'scoreVersion':manifest['signalScoreVersion'],'scoreSourceCommit':manifest['sourceCommit'],'initialState':'empty on '+dates[0],'signalDates':dates,'partialFreshSignalDate':dates[-1],'masterNameSnapshotAt':meta['downloadedAt'],'tieContract':'published integer overall_score descending, averageTurnover20 descending, then symbol lexical','policies':[],'rawAudit':{'selectedInstances':0,'labelDifferences':[],'missingBarInstances':0,'zeroVolumeInstances':0}}
master_names={m['symbol']:m['name'] for m in meta['masters']}
for name,run in continuous.items():
    groups=collections.defaultdict(list)
    for p in run['picks']:groups[p['date']].append(p)
    policy={'name':name,'days':[]}
    for day in run['daily']:
        d={**day,'picks':[]};date=day['signalDate'];i=di[date]
        for p in groups[date]:
            rr=raw.get(p['symbol'],[])[i+1:i+6];label=p['sourceLabel'];ledger['rawAudit']['selectedInstances']+=1;ledger['rawAudit']['zeroVolumeInstances']+=p['zeroVolumeFlag'];ledger['rawAudit']['missingBarInstances']+=p['missingBarFlag']
            if p['rawMarkValid'] and (not label or label.get('status') not in ['hit','miss'] or abs(p['net5d']-(label['return5d']-.003))>1e-9 or abs(p['mae']-label['maxDrawdown'])>1e-9 or p['touch']!=label['touched'] or p['entry']!=label['entry'] or days[i+1]!=label['entryDate']):ledger['rawAudit']['labelDifferences'].append([name,date,p['symbol']])
            d['picks'].append({**p,'currentMasterName':master_names.get(p['symbol']),'recommendationDate':days[i+1],'expectedD5date':days[i+5],'D1open':rr[0][0] if rr and rr[0] else None,'dailyBars':[{'session':j,'date':days[i+j],'source':'kis',**dict(zip(['open','high','low','close','volume'],bar))} if bar else {'session':j,'date':days[i+j],'missing':True} for j,bar in enumerate(rr,1)]})
        policy['days'].append(d)
    ledger['policies'].append(policy)
baseline_old=json.loads(pathlib.Path('/tmp/upside-nonlinear-20260930/continuous-ledger.json').read_text());bb=next(p for p in baseline_old['policies'] if p['name']=='baselineV2Cooldown20');current_bb=ledger['policies'][1]
ledger['baselineOriginal180Differences']=[d['signalDate'] for d,old in zip(current_bb['days'][:180],bb['days']) if [p['symbol'] for p in d['picks']]!=[p['symbol'] for p in old['picks']]];assert not ledger['baselineOriginal180Differences']
report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'plan':PLAN.read_text(),'planSha256':hashlib.sha256(PLAN.read_bytes()).hexdigest(),'sourceScoreManifest':manifest,'runtimeEligibilityAudit':eligibility_audit,'attemptHistory':json.loads((OUT/'horizon-attempt-history.json').read_text()),'splits':{k:{'from':v[0],'through':v[-1],'days':len(v)} for k,v in splits.items()},'results':{},'pairedComparisons':{},'componentBins':{},'trainDiagnostics':{},'rawAudit':ledger['rawAudit'],'baselineOriginal180Differences':ledger['baselineOriginal180Differences'],'caveats':['Repeatedly reused historical splits are diagnostic, not pristine OOS','Static corrected score selection is simulated, not actual published history','All exported points were already filtered by active/status/OHLC/volume/price>=1000/turnover>=500m/RSI<=75 common gate; not a full KRX universe. Cannot measure rejected RSI/turnover/status opportunities without new feature export','Runtime eligibility adds preferred exclusions and strict signal-day10% cap to the export common-gate pool;3floating-boundary source metadata mismatches disclosed','Current master/status snapshot creates survivorship/universe hindsight bias','Daily raw D5 marks including zero-volume bars are observations, not guaranteed executable returns; positive-volume subset separately reported','Same stocks and overlapping holding windows mean pooled rows are not independent; within-date rates and correlations reported','No post-result threshold/weight/model tuning; formula proposals restricted to training evidence and primary sources']}
for split,ds in splits.items():
    report['results'][split]=[]
    for name,run in continuous.items():
        pp=[p for p in run['picks'] if p['date'] in ds];dd=[d for d in run['daily'] if d['signalDate'] in ds]
        r={'name':name,'summary':selection_metric(pp,dd)};report['results'][split].append(r);print('SELECTION',split,name,json.dumps(r['summary']),flush=True)
    a,b=[r['summary'] for r in report['results'][split]]
    common=set(d['signalDate'] for d in continuous[names[0]]['daily'] if d['signalDate'] in ds and d['pickedCount']==3)&set(d['signalDate'] for d in continuous[names[1]]['daily'] if d['signalDate'] in ds and d['pickedCount']==3)
    report['pairedComparisons'][split]={'pairedFullDays':len(common),'metrics':[{'name':name,'summary':selection_metric([p for p in continuous[name]['picks'] if p['date'] in common],[d for d in continuous[name]['daily'] if d['signalDate'] in common])} for name in names]}
(OUT/'horizon-ledger.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2));(OUT/'horizon-selection-summary.json').write_text(json.dumps({k:report[k] for k in ['splits','results','pairedComparisons','rawAudit','caveats']},ensure_ascii=False,indent=2))
print('SELECTION_READY',flush=True)

def frame(points):
    valid=np.array([p['rawMarkValid'] for p in points]);bull=np.array([p['entryBullish'] if p['entryBullish'] is not None else np.nan for p in points],dtype=float)
    return {'points':points,'score':np.array([[p['signals'][k] for k in keys] for p in points],dtype=float),'date':np.array([p['date'] for p in points]),'valid':valid,'zero':np.array([p['zeroVolumeFlag'] for p in points]),'bull':bull,'touch':np.array([p.get('touch',False) for p in points],dtype=float),'joint':np.array([p.get('touchAndPositiveNet',False) for p in points],dtype=float),'net':np.array([p.get('net5d',np.nan) for p in points]),'mae':np.array([p.get('mae',np.nan) for p in points])}

def masked(f,mask):
    valid=mask&f['valid'];nn=int(valid.sum());bullmask=mask&np.isfinite(f['bull']);rr=f['net'][valid]
    m={'points':int(mask.sum()),'validD5MarkLabels':nn,'missingD5Labels':int(mask.sum())-nn,'zeroVolumePoints':int((mask&f['zero']).sum()),'touchCount':int(f['touch'][valid].sum()),'touchRate':float(f['touch'][valid].mean()) if nn else None,'D1bullishRate':float(f['bull'][bullmask].mean()) if bullmask.any() else None,'touchAndPositiveNetRate':float(f['joint'][valid].mean()) if nn else None,'meanNet5d':float(rr.mean()) if nn else None,'medianNet5d':float(np.median(rr)) if nn else None,'loss5Rate':float((rr<=-.05).mean()) if nn else None,'loss10Rate':float((rr<=-.1).mean()) if nn else None,'meanMAE':float(f['mae'][valid].mean()) if nn else None}
    if nn:
        dd=f['date'][valid];bydate=[]
        for d in np.unique(dd):
            mm=valid&(f['date']==d);bydate.append({'touchRate':float(f['touch'][mm].mean()),'meanNet5d':float(f['net'][mm].mean()),'loss5Rate':float((f['net'][mm]<=-.05).mean()),'loss10Rate':float((f['net'][mm]<=-.1).mean())})
        m['dateBalanced']={'coveredDates':len(bydate),**{k:statistics.mean(x[k] for x in bydate) for k in bydate[0]}}
    else:m['dateBalanced']={'coveredDates':0}
    return m

for split,ds in splits.items():
    report['componentBins'][split]={}
    for pool_name,pool in [('allExportedCommonGatePoints',rows),('runtimeTargetEligible',eligible)]:
        ff=frame([p for d in ds for p in pool[d]]);size=len(ff['points']);bins={}
        for ki,key in enumerate(keys):
            bins[key]=[]
            for low in range(0,100,10):
                high=101 if low==90 else low+10;mask=(ff['score'][:,ki]>=low)&(ff['score'][:,ki]<high)
                b={'from':low,'throughExclusive':high,**masked(ff,mask)};b['positiveVolumeOnly']=masked(ff,mask&~ff['zero']);bins[key].append(b)
        report['componentBins'][split][pool_name]={'poolSummary':masked(ff,np.ones(size,dtype=bool)),'bins':bins}
    print('BINS',split,flush=True)

tt=frame([p for d in splits['train'] for p in eligible[d]]);xx=tt['score'][:,:6]
pearson=np.corrcoef(xx,rowvar=False);spearman=np.corrcoef(np.apply_along_axis(rankdata,0,xx),rowvar=False)
within=np.empty_like(xx)
for d in splits['train']:
    mask=tt['date']==d
    for k in range(6):within[mask,k]=rankdata(xx[mask,k],method='average')/int(mask.sum())
within_corr=np.corrcoef(within,rowvar=False);eigen=np.linalg.eigvalsh(pearson);pp=eigen.clip(0)/eigen.clip(0).sum();effective_rank=float(np.exp(-sum(p*math.log(p) for p in pp if p>0)))
diagnostics={'scope':'TRAIN common eligible only','categoryKeys':keys[:6],'pearson':pearson.tolist(),'spearman':spearman.tolist(),'withinDateRankCorrelation':within_corr.tolist(),'correlationEigenvalues':eigen.tolist(),'effectiveRankEntropy':effective_rank,'categorySaturation':{},'perDateOrdinalAssociations':{},'rawDirectionAndSaturation':{},'sharedAtoms':{'position52w':['pattern_score','sentiment_score'],'bullishCandle':['momentum_score','pattern_score'],'consecutiveUpDays':['momentum_score','sentiment_score'],'trendSlope20':['trend_score via signed R2','sentiment_score directly'],'close and moving averages':['trend_score SMA20/SMA60distance','pattern_score SMA20/SMA60cross','pattern_score prior60closehigh'],'volume':['volume_score volumePercentile60','volume_score volumeRatio20','volume_score normalizedOBVslope']},'sharedAtomNominalOverallWeights':{'position52w':.20/4+.10/3,'consecutiveUpDays':.15/4+.10/3,'bullishCandle':.15/4+.20/4},'note':'Nominal input weights only; clamps/rounding and different scales mean these are not empirical return effects.'}
for ki,key in enumerate(keys):
    values=tt['score'][:,ki];diagnostics['categorySaturation'][key]={'zeroCount':int((values==0).sum()),'hundredCount':int((values==100).sum()),'min':float(values.min()),'median':float(np.median(values)),'max':float(values.max())}
    associations={}
    for outcome_name in ['touch','bull','net']:
        rr=[]
        for d in splits['train']:
            mask=(tt['date']==d)&(tt['valid'] if outcome_name!='bull' else np.isfinite(tt['bull']))
            a=values[mask];b=tt[outcome_name][mask]
            if len(a)>=3 and np.unique(a).size>1 and np.unique(b).size>1:rr.append(float(spearmanr(a,b).statistic))
        associations[outcome_name]={'dates':len(rr),'meanDailySpearman':statistics.mean(rr) if rr else None,'medianDailySpearman':statistics.median(rr) if rr else None,'positiveAssociationDates':sum(v>0 for v in rr)}
    diagnostics['perDateOrdinalAssociations'][key]=associations

tp=tt['points'];dist=np.array([p['feature']['distanceFromHigh60'] for p in tp],dtype=float);rsi=np.array([p['feature']['rsi14'] for p in tp],dtype=float);atr=np.array([p['feature']['atrPercent14'] for p in tp],dtype=float)
diagnostics['rawDirectionAndSaturation']['distanceFromHigh60']={'definition':'current close / previous60-session max close minus1, percent; current close excluded from max, so positive breakouts are possible','negativeCount':int((dist<0).sum()),'zeroCount':int((dist==0).sum()),'positiveCount':int((dist>0).sum()),'min':float(np.nanmin(dist)),'max':float(np.nanmax(dist)),'clampZeroAtOrBelowMinus5Count':int((dist<=-5).sum()),'clamp100AtOrAbovePlus5Count':int((dist>=5).sum())}
diagnostics['rawDirectionAndSaturation']['RSI']={'min':float(np.nanmin(rsi)),'max':float(np.nanmax(rsi)),'above70Count':int((rsi>70).sum()),'definition':'momentum atom equals RSI; common eligibility RSImax75 truncates high tail'}
diagnostics['rawDirectionAndSaturation']['ATR']={'min':float(np.nanmin(atr)),'median':float(np.nanmedian(atr)),'max':float(np.nanmax(atr)),'below3Count':int((atr<3).sum()),'above3Count':int((atr>3).sum()),'atOrAbove8Count':int((atr>=8).sum()),'definition':'volatility_score=round(clamp(100-abs(ATRpercent-3)*20)); centered3 preference arbitrary, not trained evidence'}
diagnostics['rawDirectionAndSaturation']['negativeTrend']={'points':sum(p['feature']['trendSlope20']<0 for p in tp),'overallAtLeast70Count':sum(p['feature']['trendSlope20']<0 and p['signals']['overall_score']>=70 for p in tp),'positiveSMADistanceAbove15Count':sum(p['feature']['sma20DistancePercent']>15 for p in tp)}
diagnostics['duplicateAtomDirectionExamples']={'bullishCandleTrueVsFalseNominalOverallPointDifference':.15/4*(65-35)+.20/4*(70-30),'samePositionInputNominalOverallWeight':.20/4+.10/3,'oneExtraUpDayBeforeClampNominalOverallPointDifference':10*(.15/4+.10/3)}
report['trainDiagnostics']=diagnostics
report['sourceHashes']={str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [PLAN,SCORES,MANIFEST,PRIMARY,META,FRESH/'scored.ndjson',FRESH/'features/metadata.json',RAW,OUT/'signals-main.ts',OUT/'horizon-runtime-eligibility.ndjson',OUT/'horizon-runtime-eligibility-audit.json',OUT/'horizon-runtime-eligibility.ts',pathlib.Path(__file__)]}
ledger['sourceHashes']=report['sourceHashes'];ledger['planSha256']=report['planSha256']
(OUT/'horizon-ledger.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2));(OUT/'horizon-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));(OUT/'horizon-summary.json').write_text(json.dumps({k:v for k,v in report.items() if k not in ['plan','componentBins']},ensure_ascii=False,indent=2));(OUT/'horizon-component-bins.json').write_text(json.dumps(report['componentBins'],ensure_ascii=False,indent=2));(OUT/'horizon-fresh-selections.json').write_text(json.dumps({'actualPublishedHistory':False,'partialFreshHoldoutOnly':True,'policies':[{'name':p['name'],'day':p['days'][-1]} for p in ledger['policies']]},ensure_ascii=False,indent=2))
print('DIAGNOSTICS',json.dumps(diagnostics),flush=True);print('AUDIT',json.dumps(ledger['rawAudit']),flush=True)
