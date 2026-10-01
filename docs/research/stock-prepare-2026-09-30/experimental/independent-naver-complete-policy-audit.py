"""Independent completed primary integer ranking, own cooldown, raw outcomes and aggregate audit."""
import collections,datetime,json,pathlib,statistics,time
import numpy as np
import joblib
from independent_naver_common import *
K=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score','overall_score']
studies={'L5':(E/'naver/primary-ledger.json',E/'naver/primary-report.json',E/'naver/models',E/'naver/calibrators',winnerfiles[0]),'L0':(E/'naver-l0/primary-ledger.json',E/'naver-l0/primary-report.json',E/'naver-l0/models',E/'naver-l0/calibrators',winnerfiles[1]),'FP':(F/'naver-primary-ledger.json',F/'naver-primary-report.json',F/'naver-models',None,winnerfiles[2])}
assert all(read(p)['noPrimaryOutcomesUsed'] for p in winnerfiles)
results=[];source_checks={};modelcache={};calcache={};nativePanels=0;observations=0;allScopeChecks=0;started=time.monotonic()
def close(a,b,key):
    assert (a is None and b is None) or (a is not None and b is not None and abs(a-b)<1e-12),(key,a,b)
for risk,(lp,rp,md,cd,wp) in studies.items():
    ledger=read(lp);report=read(rp);frozen=read(wp);assert ledger['actualPublishedHistory'] is False
    configs={'winnerFP':frozen['winner']['config']} if risk=='FP' else {name:frozen['winners'][name[-1]]['config'] for name in ['winnerA','winnerB']}
    for pol in ledger['policies']:
        assert [day['signalDate'] for day in pol['days']]==primary and pol['initialState']=='empty on '+primary[0]
        recent=[];selected=[];strict_count=0;unknown_count=0;negative=0;loss5=0;touch_count=0;bull_count=0;netvalues=[];fingerprints=[]
        for day in pol['days']:
            d=day['signalDate'];a,b=span(d);ssym=sym[a:b];excluded={v for rr in recent[-20:] for v in rr};eligible=[i for i,v in enumerate(ssym) if int(v) not in excluded]
            active=pol['name'] in configs;pred=expect=None
            if active:
                config=configs[pol['name']];asof=next(q for q in reversed(primary[:primary.index(d)+1]) if q[:4]==d[:4] and (int(q[5:7])-1)//3==(int(d[5:7])-1)//3 and (primary.index(q)==0 or primary[primary.index(q)-1][:4]!=q[:4] or (int(primary[primary.index(q)-1][5:7])-1)//3!=(int(q[5:7])-1)//3))
                epoch=('FP-' if risk=='FP' else '')+asof;bid=config['id']+'-prefix460';key=(risk,epoch,bid)
                if key not in modelcache:modelcache[key]=joblib.load(md/epoch/(bid+'.joblib'))
                bundle=modelcache[key];assert bundle['trainingDates']==window(asof)[:460] and bundle['activationDate']==asof and calendar[ci[bundle['trainingDates'][-1]]+5]<=d
                pred=bundle['model'].predict(X[a:b,:config['inputCount']]);nativePanels+=1
                if config['family']=='B':
                    cid=config['id']+'-'+epoch+'-cal40';ck=(risk,epoch,cid)
                    if ck not in calcache:calcache[ck]=joblib.load(cd/epoch/(cid+'.joblib'))
                    cal=calcache[ck];assert cal['OOFDates']==window(asof)[465:] and calendar[ci[cal['OOFDates'][-1]]+5]<=d
                    expect=cal['model'].predict(pred)
                else:expect=pred
                expect=np.clip(expect,0,1);scores=np.floor(100*expect+.5).astype(np.int32)
                assert day['modelEpoch']==epoch and day['modelScope']==bid
            else:scores=S[a:b,6]
            keyfunc=(lambda i:(float(X[a+i,0]),syms[int(ssym[i])])) if pol['name']=='ATRbaseline' else (lambda i:(-int(scores[i]),-float(turn[a+i]),syms[int(ssym[i])]))
            chosen=sorted(eligible,key=keyfunc)[:3] if len(eligible)>=3 else []
            assert len(chosen)==3 and day['pickedCount']==3 and day['cooldown']==20
            assert day['runtimeEligibleCount']==b-a and day['afterCooldownCount']==len(eligible)
            assert [syms[int(ssym[i])] for i in chosen]==[p['symbol'] for p in day['picks']],(risk,pol['name'],d,'exact own-state roster')
            recent.append([int(ssym[i]) for i in chosen]);assert not excluded.intersection(recent[-1])
            z=label(d);horizon=calendar[ci[d]+1:ci[d]+6];assert day['recommendationDateExpected']==horizon[0] and day['expectedD5date']==horizon[-1]
            for rank,(i,p) in enumerate(zip(chosen,day['picks']),1):
                assert p['selectionRank']==rank and p['signals']['overall_score']==int(scores[i])
                assert p['sourceSignals']=={k:int(v) for k,v in zip(K,S[a+i])}
                assert all(p['signals'][k]==int(S[a+i,j]) for j,k in enumerate(K[:-1]))
                assert p['feature']['averageTurnover20']==float(turn[a+i]) and p['feature']['atrPercent14']==float(X[a+i,0])
                if active:assert p['nativeModelPrediction']==float(pred[i]) and p['expectedGoalUtility']==float(expect[i]) and p['modelConfig']==config
                bars=raw[int(ssym[i]),ci[d]+1:ci[d]+6,:]
                assert [r['date'] for r in p['dailyBars']]==horizon
                for r,date,actual in zip(p['dailyBars'],horizon,bars):
                    assert r['source']=='naver-fchart'
                    for k,value in zip(['open','high','low','close','volume'],actual):assert r[k]==(float(value) if np.isfinite(value) else None),(risk,d,p['symbol'],date,k)
                    sk=(p['symbol'],date);sv=tuple(float(v) if np.isfinite(v) else None for v in actual)
                    if sk in source_checks:assert source_checks[sk]==sv
                    source_checks[sk]=sv
                o=p['outcome'];assert o['strictLabelValid']==bool(z['strict'][i]) and o['rawMarkValid']==bool(z['valid'][i]) and o['zeroVolumeFlag']==bool(z['zero'][i]) and o['missingBarFlag']==bool(z['missing'][i])
                if z['valid'][i]:
                    assert o['touch']==bool(z['touch'][i]) and o['entryBullish']==bool(z['bull'][i]);assert o['touchAndPositiveD5Net']==bool(z['touch'][i] and z['net'][i]>0)
                    for k,value in [('gross5d',z['gross'][i]),('net5d',z['net'][i]),('mae',z['mae'][i]),('targetNetProxy',z['target'][i]),('maxGainPercent',z['maxgain'][i])]:close(o[k],float(value),(risk,d,p['symbol'],k))
                if risk=='FP':
                    for k,value in [('T_safe',bool(z['fpSafe'][i])),('L0_FP',bool(z['fpLoss'][i])),('fpSameBarAmbiguous',bool(z['fpAmb'][i]))]:assert o[k]==(value if z['strict'][i] else None),(risk,d,p['symbol'],k)
                    close(o['fpNet30bps'],float(z['fpNet'][i]) if z['strict'][i] else None,'fpNet')
                    assert o['fpExitSession']==(int(z['fpDay'][i]) if z['strict'][i] else None)
                    assert o['fpExitReason']==(['target','stop','stop_gap','horizon_close'][int(z['fpReason'][i])-1] if z['strict'][i] else None)
                selected.append((d,i,p));observations+=1
                if z['strict'][i]:strict_count+=1;negative+=z['net'][i]<0;loss5+=z['net'][i]<=-.05;touch_count+=z['touch'][i];bull_count+=z['bull'][i];netvalues.append(float(z['net'][i]))
                else:unknown_count+=1
            fingerprints.append({'signalDate':d,'symbols':[p['symbol'] for p in day['picks']],'integerScores':[p['signals']['overall_score'] for p in day['picks']]})
        for scope,policies in report['primaryResults'].items():
            chosen_scope=[(d,i,p) for d,i,p in selected if scope=='all2023_2024' or scope.startswith('year') and d[:4]==scope[4:] or 'Q' in scope and d[:4]==scope[:4] and (int(d[5:7])-1)//3+1==int(scope[-1])]
            valid_scope=[(d,i,p) for d,i,p in chosen_scope if label(d)['strict'][i]];v=policies[pol['name']]['strictPositiveVolume'];assert len(valid_scope)==v['labels']
            for k,val in [('touchRate',statistics.mean(bool(label(d)['touch'][i]) for d,i,p in valid_scope)),('loss5Rate',statistics.mean(bool(label(d)['net'][i]<=-.05) for d,i,p in valid_scope)),('anyNegativeD5NetRate',statistics.mean(bool(label(d)['net'][i]<0) for d,i,p in valid_scope)),('D1bullishRate',statistics.mean(bool(label(d)['bull'][i]) for d,i,p in valid_scope)),('meanNet5d',statistics.mean(float(label(d)['net'][i]) for d,i,p in valid_scope))]:close(v[k],val,(risk,scope,pol['name'],k));allScopeChecks+=1
            if risk=='FP':
                fp=v['firstPassage']
                for k,val in [('T_safeRate',statistics.mean(bool(label(d)['fpSafe'][i]) for d,i,p in valid_scope)),('L0_FP_Rate',statistics.mean(bool(label(d)['fpLoss'][i]) for d,i,p in valid_scope)),('meanNet30bps',statistics.mean(float(label(d)['fpNet'][i]) for d,i,p in valid_scope))]:close(fp[k],val,(risk,scope,pol['name'],k));allScopeChecks+=1
        results.append({'risk':risk,'policy':pol['name'],'days':len(primary),'selected':len(selected),'strict':strict_count,'unknownRetained':unknown_count,'touchCount':int(touch_count),'L5Count':int(loss5),'L0Count':int(negative),'D1BullCount':int(bull_count),'meanD5Net':statistics.mean(netvalues),'exactIntegerRoster':fingerprints});print('PRIMARY_FULL_POLICY_EXACT',risk,pol['name'],strict_count,unknown_count,flush=True)

# All selected copied candles are independently matched to original vendor rows.
found=set();wanted_symbols={s for s,d in source_checks};raw_source=E/'naver-history/prices.ndjson'
for line in raw_source.open():
    symbol=json.loads(line[1:line.index(',')])
    if symbol not in wanted_symbols:continue
    symbol,rows=json.loads(line)
    for r in rows:
        key=(symbol,r['trade_date'])
        if key not in source_checks:continue
        assert r['source']=='naver-fchart' and tuple(r[k] for k in ['open','high','low','close','volume'])==source_checks[key],('original raw vendor row',key)
        assert key not in found;found.add(key)
assert found==set(source_checks)
result={'scope':'All11 completed primary policy ledgers, five unique learned winners plus duplicated baseline ledgers; independent entire eligible-panel predictions, actual integer top3 and continuous own20 state, all selected raw OHLCV/outcomes and all33scope aggregation groups','primaryDays':len(primary),'policyCount':len(results),'selectedObservationsIncludingDuplicatedBaselines':observations,'entireEligiblePredictionPanels':nativePanels,'aggregateNumericalChecks':allScopeChecks,'independentOriginalRawVendorSelectedBarKeys':len(found),'differences':[],'policies':results,'seconds':time.monotonic()-started,'newPrimaryLabelsReadOnlyAfterAllFiveWinnersFrozen':True,'fits':0,'productionChanges':0,'sourceTruthLimitation':'Conditional on frozen NAVER source, not actual fills, historical master/adjustment vintage or KIS transfer proof','hashes':{str(p):sha(p) for p in [pathlib.Path(__file__),E/'independent_naver_common.py',*winnerfiles,*[r[0] for r in studies.values()],raw_source]}}
(E/'independent-naver-complete-policy-audit.json').write_text(json.dumps(result,indent=2,allow_nan=False));print('COMPLETE_PRIMARY',observations,len(found),flush=True)
