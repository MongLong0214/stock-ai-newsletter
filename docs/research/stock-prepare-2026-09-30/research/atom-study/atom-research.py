# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import json, pathlib, math, statistics, collections, hashlib, datetime
import numpy as np
from scipy.stats import rankdata

BASE=pathlib.Path('/tmp/composite-score-research-20260930');OUT=BASE/'atom-study';PLAN=OUT/'atom-plan.txt'
WIDE=BASE/'wide-training.ndjson';CONTEXT=BASE/'technical-context.ndjson';RAW=pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson')
meta=json.loads(pathlib.Path('/tmp/stock-target-rebuilt-20260929/metadata.json').read_text());dates=meta['evaluationDates'][:80];date_set=set(dates);date_index={d:i for i,d in enumerate(dates)}
fm=json.loads(pathlib.Path('/tmp/stock-research-fresh-mature-20260930/features/metadata.json').read_text());days=fm['tradingDays'];di={d:i for i,d in enumerate(days)}
assert len(dates)==80 and days[di[dates[-1]]+5]=='2026-04-29'
runtime={p['date']:set(p['runtimeEligibleSymbols']) for p in map(json.loads,(BASE/'horizon-runtime-eligibility.ndjson').open()) if p['date'] in date_set}
context={}
for line in CONTEXT.open():
    p=json.loads(line)
    if p['date'] in date_set:context[(p['date'],p['symbol'])]=p['context']
raw={};first_label=days[di[dates[0]]+1];last_label=days[di[dates[-1]]+5]
for line in RAW.open():
    symbol,rr=json.loads(line)
    raw[symbol]={r['trade_date']:r for r in rr if r['source']=='kis' and first_label<=r['trade_date']<=last_label}
atoms=['rsi14','signalIntradayReturnPercent','signalCloseCloseReturnPercent','atrPercent14','sma20DistancePercent','sma60DistancePercent','return5Percent','return20Percent','return60Percent','relativeReturn20PercentagePoints','closeLocation','upperWickRatio','chaikinMoneyFlow21','distanceFromPriorHigh20Percent','bollingerWidth20Percent','realizedVolatility20Percent']
targets=['utility','touch','touchAndPositiveNet','D1bullish','net5d','loss5','loss10']
finite=lambda v:isinstance(v,(int,float)) and math.isfinite(v)
records=[];coverage=collections.Counter();source_label_discrepancies=[]
for line in WIDE.open():
    p=json.loads(line);d=p['date'];assert d in date_set;coverage['wideRows']+=1
    if not p['flags']['preCommonPool']:continue
    coverage['preCommonRows']+=1;f=p['feature'];c=context.get((d,p['symbol']));assert c is not None
    intraday=(f['close']/f['open']-1)*100 if finite(f['open']) and f['open']>0 else None
    closeclose=((1+f['gapFromPreviousClosePercent']/100)*(f['close']/f['open'])-1)*100 if intraday is not None and finite(f['gapFromPreviousClosePercent']) else None
    sma60=(f['close']/f['sma60']-1)*100 if finite(f['sma60']) and f['sma60']>0 else None
    values=[f['rsi14'],intraday,closeclose,f['atrPercent14'],f['sma20DistancePercent'],sma60,*[c[k] for k in atoms[6:]]]
    window=days[di[d]+1:di[d]+6];rr=[raw.get(p['symbol'],{}).get(w) for w in window]
    complete=len(rr)==5 and all(r is not None for r in rr)
    rawvalid=complete and all(all(finite(r[k]) and r[k]>0 for k in ['open','high','low','close']) and r['high']>=max(r['open'],r['low'],r['close']) and r['low']<=min(r['open'],r['high'],r['close']) for r in rr)
    zero=any(r is not None and r['volume']<=0 for r in rr);valid=rawvalid and not zero
    eligible=p['symbol'] in runtime[d];coverage['runtimeEligibleRows']+=eligible
    ys=[np.nan]*len(targets);mae=np.nan
    if valid:
        entry=rr[0]['open'];net=rr[-1]['close']/entry-1-.003;touch=any(r['high']>=entry*110/100 for r in rr);bull=rr[0]['close']>entry;mae=min(0,min(r['low'] for r in rr)/entry-1)
        utility=net+.10*int(touch and net>0)+.025*int(bull)-max(0,-net)-.5*max(0,-mae-.05)
        ys=[utility,int(touch),int(touch and net>0),int(bull),net,int(net<=-.05),int(net<=-.1)]
        label=p['label']
        if label['status'] not in ['hit','miss'] or abs(net-(label['return5d']-.003))>1e-9 or abs(mae-label['maxDrawdown'])>1e-9 or touch!=label['touched'] or bull!=label['entryBullish']:source_label_discrepancies.append([d,p['symbol']])
    coverage['strictValidLabels']+=valid;coverage['strictMissingLabels']+=not valid;coverage['zeroVolumeRows']+=zero
    records.append({'date':d,'dateIndex':date_index[d],'symbol':p['symbol'],'eligible':eligible,'valid':bool(valid),'zero':bool(zero),'rawMarkValid':bool(rawvalid),'x':[v if finite(v) else np.nan for v in values],'y':ys,'overall':p['signals']['overall_score'],'mae':mae})
assert len(records)==190290 and coverage['runtimeEligibleRows']==107573
assert not source_label_discrepancies
print('LOADED',dict(coverage),flush=True)
xx=np.array([r['x'] for r in records]);yy=np.array([r['y'] for r in records]);dd=np.array([r['dateIndex'] for r in records]);valid=np.array([r['valid'] for r in records]);zero=np.array([r['zero'] for r in records]);ee=np.array([r['eligible'] for r in records]);overall=np.array([r['overall'] for r in records]);mae=np.array([r['mae'] for r in records])
pools={'widePreCommonPool':np.ones(len(records),dtype=bool),'runtimeTargetEligible':ee};blocks=[{'index':i,'from':dates[i*20],'through':dates[(i+1)*20-1],'dates':dates[i*20:(i+1)*20]} for i in range(4)]

def corr(a,b):
    sa=np.std(a);sb=np.std(b)
    return float(np.corrcoef(a,b)[0,1]) if len(a)>=3 and sa>1e-10 and sb>1e-10 else None

daily=[]
for pool,maskpool in pools.items():
    for j,atom in enumerate(atoms):
        for day in range(80):
            mask=maskpool&valid&(dd==day)&np.isfinite(xx[:,j]);controls=[k for k in [3,2] if k!=j]
            for k in controls:mask &= np.isfinite(xx[:,k])
            n=int(mask.sum())
            if n<5:continue
            fx=rankdata(xx[mask,j]);fy=np.column_stack([rankdata(yy[mask,k]) for k in range(len(targets))]);z=np.column_stack([np.ones(n),*[rankdata(xx[mask,k]) for k in controls],rankdata(overall[mask])])
            fx_res=fx-z@np.linalg.lstsq(z,fx,rcond=None)[0];fy_res=fy-z@np.linalg.lstsq(z,fy,rcond=None)[0]
            values={target:{'spearman':corr(fx,fy[:,k]),'partialRankCorrelation':corr(fx_res,fy_res[:,k])} for k,target in enumerate(targets)}
            daily.append({'pool':pool,'atom':atom,'date':dates[day],'block':day//20,'points':n,'controls':[atoms[k] for k in controls]+['currentOverallScore'],'correlations':values})
    print('ASSOCIATIONS',pool,flush=True)

associations={}
for pool in pools:
    associations[pool]={}
    for atom in atoms:
        result={}
        for target in targets:
            result[target]={}
            for method in ['spearman','partialRankCorrelation']:
                bb=[]
                for block in range(4):
                    rr=[d['correlations'][target][method] for d in daily if d['pool']==pool and d['atom']==atom and d['block']==block and d['correlations'][target][method] is not None]
                    bb.append({'block':block,'dates':len(rr),'meanDailyCorrelation':statistics.mean(rr) if rr else None,'medianDailyCorrelation':statistics.median(rr) if rr else None,'positiveDates':sum(r>0 for r in rr),'negativeDates':sum(r<0 for r in rr)})
                result[target][method]=bb
        u=[b['meanDailyCorrelation'] for b in result['utility']['partialRankCorrelation']];t=[b['meanDailyCorrelation'] for b in result['touchAndPositiveNet']['partialRankCorrelation']];loss=[b['meanDailyCorrelation'] for b in result['loss5']['partialRankCorrelation']]
        direction=1 if all(v is not None and v>0 for v in u) else -1 if all(v is not None and v<0 for v in u) else 0
        result['stability']={'partialUtilitySameSignAll4':direction,'partialTouchPositiveAlignedAll4':bool(direction and all(v is not None and direction*v>0 for v in t)),'partialLoss5OppositeAll4':bool(direction and all(v is not None and direction*v<0 for v in loss)),'note':'Descriptive direction only; no causal effect/policy success claim.'}
        associations[pool][atom]=result

def binstats(mask):
    vv=mask&valid;nn=int(vv.sum());net=yy[vv,4];bydate=[]
    for day in range(80):
        md=vv&(dd==day)
        if md.any():bydate.append({target:float(yy[md,k].mean()) for k,target in enumerate(targets)})
    return {'points':int(mask.sum()),'validLabels':nn,'missingLabels':int(mask.sum())-nn,'zeroVolumePoints':int((mask&zero).sum()),'touchRate':float(yy[vv,1].mean()) if nn else None,'touchAndPositiveNetRate':float(yy[vv,2].mean()) if nn else None,'D1bullishRate':float(yy[vv,3].mean()) if nn else None,'meanNet5d':float(net.mean()) if nn else None,'medianNet5d':float(np.median(net)) if nn else None,'loss5Rate':float(yy[vv,5].mean()) if nn else None,'loss10Rate':float(yy[vv,6].mean()) if nn else None,'meanMAE':float(mae[vv].mean()) if nn else None,'dateBalanced':{'coveredDates':len(bydate),**({target:statistics.mean(r[target] for r in bydate) for target in targets} if bydate else {})}}

bins={};quintiles={}
for j,atom in enumerate(atoms):
    values=xx[np.isfinite(xx[:,j]),j];bounds=np.quantile(values,[0,.2,.4,.6,.8,1]);quintiles[atom]=bounds.tolist()
    bins[atom]={}
    definitions=[('fixedTrainFeatureQuintiles',bounds)]
    if atom=='rsi14':definitions.append(('predeclaredRSIZones',np.array([0,30,50,70,75,100.])))
    if atom=='signalCloseCloseReturnPercent':definitions.append(('predeclaredSignalReturnZones',np.array([-np.inf,-5,0,5,10,np.inf])))
    for name,bounds in definitions:
        output={}
        for pool,pm in pools.items():
            entries=[]
            for b in range(len(bounds)-1):
                lo,hi=bounds[b:b+2];mask=pm&np.isfinite(xx[:,j])&(xx[:,j]>=lo)&((xx[:,j]<=hi) if b==len(bounds)-2 else (xx[:,j]<hi))
                entry={'from':float(lo) if np.isfinite(lo) else None,'through':float(hi) if np.isfinite(hi) else None,'upperInclusive':b==len(bounds)-2,'allTrain':binstats(mask),'blocks':[{'block':i,**binstats(mask&(dd//20==i))} for i in range(4)]};entries.append(entry)
            output[pool]=entries
        bins[atom][name]=output
    print('BINS',atom,flush=True)

ceilings={}
for pool,pm in pools.items():
    perdate=[]
    for day in range(80):
        mm=pm&(dd==day);vv=mm&valid
        touch=vv&(yy[:,1]==1);positive=vv&(yy[:,2]==1);bull=positive&(yy[:,3]==1);safety=bull&(mae>-.05)
        perdate.append({'date':dates[day],'block':day//20,'points':int(mm.sum()),'strictValidLabels':int(vv.sum()),'missingLabels':int(mm.sum()-vv.sum()),'touchCount':int(touch.sum()),'touchPositiveNetCount':int(positive.sum()),'touchPositiveBullishCount':int(bull.sum()),'touchPositiveBullishMAEAboveMinus5Count':int(safety.sum())})
    ceilings[pool]={'interpretation':'Hindsight available-event counts, without cooldown; not a selectable forecast/oracle strategy or executable profit proof','days':perdate,'summary':{'points':int(pm.sum()),'validLabels':int((pm&valid).sum()),'missingLabels':int((pm&~valid).sum()),'atLeast3Days':{key:sum(d[key]>=3 for d in perdate) for key in ['touchCount','touchPositiveNetCount','touchPositiveBullishCount','touchPositiveBullishMAEAboveMinus5Count']},'minimumDailyCounts':{key:min(d[key] for d in perdate) for key in ['touchCount','touchPositiveNetCount','touchPositiveBullishCount','touchPositiveBullishMAEAboveMinus5Count']}}}

redundancy={}
for pool,pm in pools.items():
    mask=pm&np.all(np.isfinite(xx),axis=1);matrix=xx[mask];rank=np.column_stack([rankdata(matrix[:,j]) for j in range(len(atoms))]);within=np.empty_like(rank);dates_here=dd[mask]
    for day in range(80):
        m=dates_here==day
        for j in range(len(atoms)):within[m,j]=rankdata(matrix[m,j])/int(m.sum())
    redundancy[pool]={'completeAtomPoints':int(mask.sum()),'spearman':np.corrcoef(rank,rowvar=False).tolist(),'withinDateRankCorrelation':np.corrcoef(within,rowvar=False).tolist()}
report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'plan':PLAN.read_text(),'planSha256':hashlib.sha256(PLAN.read_bytes()).hexdigest(),'trainingSignalFrom':dates[0],'trainingSignalThrough':dates[-1],'lastLabelMaturity':last_label,'atomNames':atoms,'targetNames':targets,'blocks':blocks,'coverage':dict(coverage),'featureCoverage':{atom:{'finitePoints':int(np.isfinite(xx[:,j]).sum()),'missingPoints':int((~np.isfinite(xx[:,j])).sum())} for j,atom in enumerate(atoms)},'associations':associations,'redundancy':redundancy,'featureOnlyQuintileBounds':quintiles,'opportunityCeilings':ceilings,'labelRawAudit':{'strictValidComparisons':int(valid.sum()),'sourceLabelDifferences':source_label_discrepancies},'caveats':['Training-only descriptive analysis, no new family fit or score weights/ranking policy','Same training dates seen in other studies, not pristine OOS','Partial rank association beyond fixed controls is not a causal effect or demonstrated forward predictive improvement','Wide preCommonPool includes varying liquidity/RSI/status exposures; point-in-time universe/current-master bias remains','Quintilebins are feature-distribution descriptions only, not trading thresholds or output score rescaling','Opportunity counts use future outcomes and omit cooldown, strictly a loose hindsight ceiling','Strict missing labels including futurezero-volume retained in counts; no simulated choices filter on future outcomes']}
report['sourceHashes']={str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [PLAN,WIDE,CONTEXT,RAW,BASE/'wide-training-manifest.json',BASE/'technical-context-manifest.json',BASE/'context-wide-audit.json',BASE/'horizon-runtime-eligibility.ndjson',pathlib.Path(__file__)]}
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));(OUT/'summary.json').write_text(json.dumps({k:v for k,v in report.items() if k not in ['plan','redundancy']},ensure_ascii=False,indent=2));(OUT/'daily-associations.json').write_text(json.dumps(daily,ensure_ascii=False,indent=2));(OUT/'bins.json').write_text(json.dumps(bins,ensure_ascii=False,indent=2));(OUT/'opportunity-ceilings.json').write_text(json.dumps(ceilings,ensure_ascii=False,indent=2))
print('CEILINGS',json.dumps({k:v['summary'] for k,v in ceilings.items()}),flush=True);print('STABILITY',json.dumps({p:{a:associations[p][a]['stability'] for a in atoms} for p in pools}),flush=True)
