"""Independent selected-row, calendar, frozen input and policy checks; no new fit."""
import json,pathlib,hashlib,math,sys,datetime
import numpy as np
import joblib
DIR=pathlib.Path(__file__).resolve().parent;OUT=DIR.parent
sys.path.insert(0,str(OUT/'outcome-diagnostic'));from outcome_diagnostic import diagnose_five_session_outcomes

def sha(p):
    with pathlib.Path(p).open('rb') as h:return hashlib.file_digest(h,'sha256').hexdigest()
manifest=json.loads((OUT/'naver-cache/manifest.json').read_text());winner=json.loads((DIR/'naver-winner-frozen-before-primary.json').read_text());ledger=json.loads((DIR/'naver-primary-ledger.json').read_text());report=json.loads((DIR/'naver-primary-report.json').read_text())
assert winner['noPrimaryOutcomesUsed'] and ledger['sourceHashes']==winner['sourceHashes']==report['sourceHashes']
assert all(sha(p)==h for p,h in winner['sourceHashes'].items())
X=np.load(OUT/'naver-cache/X50.npy',mmap_mode='r');scores=np.load(OUT/'naver-cache/sourceSignals7.npy',mmap_mode='r');turn=np.load(OUT/'naver-cache/turnover.npy',mmap_mode='r');symbols=np.load(OUT/'naver-cache/symbols.npy',mmap_mode='r');offsets=np.load(OUT/'naver-cache/offsets.npy',mmap_mode='r');raw=np.load(OUT/'naver-cache/rawBars.npy',mmap_mode='r')
calendar=manifest['calendarDates'];sd=manifest['signalDates'];sy=manifest['symbols'];di={d:i for i,d in enumerate(calendar)};si={d:i for i,d in enumerate(sd)};symi={s:i for i,s in enumerate(sy)};keys=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score','overall_score'];bundles={}
audit={'selectedInstances':0,'strictInstances':0,'unknownInstances':0,'sixCategoryDifferences':0,'sourceRowDifferences':0,'dailyBarDifferences':0,'integerScoreDifferences':0,'modelPredictionDifferences':0,'integerSelectionDifferences':0,'cooldownViolations':0,'labelMaturityViolations':0,'FPHelperDifferences':0,'originalFloatingOutcomeDifferences':0,'shortfallDays':0,'tieDiagnostics':{}}
for run in ledger['policies']:
    recent=[];tied=disagree=active=0
    assert len(run['days'])==489 and [d['signalDate'] for d in run['days']]==manifest['primaryDates']
    for day in run['days']:
        d=day['signalDate'];i=si[d];a,b=int(offsets[i]),int(offsets[i+1]);index=di[d];excluded={s for v in recent[-20:] for s in v};eligible=[j for j in range(a,b) if int(symbols[j]) not in excluded]
        expected=None
        if day['modelActive']:
            active+=1;epoch=day['modelEpoch'];key=day['modelScope'];mk=epoch+'/'+key
            if mk not in bundles:
                meta=report['models'][mk];assert sha(meta['joblibPath'])==meta['joblibSha256'];bundles[mk]=joblib.load(meta['joblibPath']);assert meta['eventColumnNames']==['T_safe','B','L0_FP'] and meta['config']==winner['winner']['config']
            bundle=bundles[mk];meta=report['models'][mk];assert meta['provenance']['latestTrainingLabelMaturity']<=d
            prediction=np.load(DIR/'naver-predictions'/epoch/(key+'-'+d+'.npy'));expected=np.clip(prediction,0,1);ss=np.floor(100*expected+.5).astype(np.int32)
            ranked=sorted(eligible,key=lambda j:(-int(ss[j-a]),-float(turn[j]),sy[int(symbols[j])]))[:3]
            rawrank=sorted(eligible,key=lambda j:(-float(expected[j-a]),-float(turn[j]),sy[int(symbols[j])]))[:3]
            disagree+=ranked!=rawrank;tied+=len(set(int(ss[j-a]) for j in ranked))==1
            audit['labelMaturityViolations']+=meta['provenance']['latestTrainingLabelMaturity']>d
        elif run['name']=='ATRbaseline':
            ss=np.asarray(scores[a:b,6]);ranked=sorted(eligible,key=lambda j:(float(X[j,0]),sy[int(symbols[j])]))[:3]
        else:
            ss=np.asarray(scores[a:b,6]);ranked=sorted(eligible,key=lambda j:(-int(ss[j-a]),-float(turn[j]),sy[int(symbols[j])]))[:3]
        selected=[symi[p['symbol']] for p in day['picks']];want=[int(symbols[j]) for j in ranked]
        audit['integerSelectionDifferences']+=selected!=want;audit['shortfallDays']+=len(selected)!=3;audit['cooldownViolations']+=bool(excluded.intersection(selected));recent.append(selected)
        for p,j in zip(day['picks'],ranked):
            audit['selectedInstances']+=1;o=p['outcome'];vals=raw[int(symbols[j]),index+1:index+6];dates=calendar[index+1:index+6];source={k:int(v) for k,v in zip(keys,scores[j])};audit['sourceRowDifferences']+=source!=p['sourceSignals'];audit['sixCategoryDifferences']+=any(p['signals'][k]!=source[k] for k in keys[:6]);audit['integerScoreDifferences']+=p['signals']['overall_score']!=int(ss[j-a])
            if expected is not None:
                actual=float(bundle['model'].predict(X[j:j+1,:winner['winner']['config']['inputCount']])[0]);audit['modelPredictionDifferences']+=actual!=p['nativeModelPrediction'] or float(expected[j-a])!=p['expectedGoalUtility']
            barsp={r['date']:{k:r[k] for k in ['open','high','low','close','volume']} for r in p['dailyBars']};bars={date:{k:float(v) if np.isfinite(v) else None for k,v in zip(['open','high','low','close','volume'],row)} for date,row in zip(dates,vals)};audit['dailyBarDifferences']+=barsp!=bars
            prices=vals[:,:4];valid=bool(np.isfinite(prices).all() and (prices>0).all() and (prices[:,1]>=prices.max(axis=1)).all() and (prices[:,2]<=prices.min(axis=1)).all());strict=valid and bool(np.isfinite(vals[:,4]).all() and (vals[:,4]>0).all());assert valid==o['rawMarkValid'] and strict==o['strictLabelValid']
            if valid:
                entry=float(vals[0,0]);net=float(vals[-1,3]/entry-1-.003);touch=bool((vals[:,1]>=entry*110/100).any());audit['originalFloatingOutcomeDifferences']+=net!=o['net5d'] or touch!=o['touch']
            if strict:
                audit['strictInstances']+=1;z=diagnose_five_session_outcomes(dates,bars);lower=z['models']['targetStop']['conservative'];cost=z['costSensitivity'][0];audit['FPHelperDifferences']+=o['T_safe']!=(lower['exitReason']=='target') or o['L0_FP']!=cost['targetStop']['allNegativePossible'] or o['fpNet30bps']!=cost['targetStop']['netReturnLower'] or o['fpSameBarAmbiguous']!=z['models']['targetStop']['sameDayAmbiguous'] or o['fpExitReason']!=lower['exitReason'] or o['fpExitSession']!=dates.index(lower['exitDate'])+1
            else:
                audit['unknownInstances']+=1;assert all(o[k] is None for k in ['T_safe','L0_FP','fpNet30bps','fpSameBarAmbiguous','fpExitReason','fpExitSession'])
    actual={'activeDays':active,'integerVsRawTop3DifferentDays':disagree,'all3IntegerTiedDays':tied};audit['tieDiagnostics'][run['name']]=actual;assert report['primaryResults']['all2023_2024'][run['name']]['tieDiagnostics']==actual
assert audit['selectedInstances']==4401 and audit['strictInstances']+audit['unknownInstances']==4401
for k,v in audit.items():
    if k.endswith(('Differences','Violations')):assert v==0,(k,v)
audit.update(passed=True,generatedAtUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),ledgerSha256=sha(DIR/'naver-primary-ledger.json'),auditSourceSha256=sha(__file__),winnerSha256=sha(DIR/'naver-winner-frozen-before-primary.json'),productMutations=0)
(DIR/'naver-primary-selected-audit.json').write_text(json.dumps(audit,indent=2));print(json.dumps(audit,indent=2))
