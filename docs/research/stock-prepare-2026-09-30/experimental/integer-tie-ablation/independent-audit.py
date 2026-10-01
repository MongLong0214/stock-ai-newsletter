"""Whole cached utility -> integer ranking -> own20 state independent audit; no fit/model predict."""
import pathlib,json,hashlib,statistics
import numpy as np
import joblib
E=pathlib.Path('/tmp/composite-score-experimental-20260930');D=E/'integer-tie-ablation';C=E/'naver-cache'
def read(p):return json.loads(pathlib.Path(p).read_text())
def sha(p):
    with pathlib.Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
m=read(C/'manifest.json');days=m['primaryDates'];dates=m['signalDates'];di={d:i for i,d in enumerate(dates)};symbols=m['symbols']
off=np.load(C/'offsets.npy',mmap_mode='r');si=np.load(C/'symbols.npy',mmap_mode='r');flow=np.load(C/'turnover.npy',mmap_mode='r');X=np.load(C/'X50.npy',mmap_mode='r');S=np.load(C/'sourceSignals7.npy',mmap_mode='r');raw=np.load(C/'rawBars.npy',mmap_mode='r');ci={d:i for i,d in enumerate(m['calendarDates'])}
rep=read(D/'report.json');ledger=read(D/'ledger.json');original={};locations={}
for risk,folder,path in [('L5',E/'naver',E/'naver/primary-ledger.json'),('L0',E/'naver-l0',E/'naver-l0/primary-ledger.json'),('FP',E/'first-passage-study',E/'first-passage-study/naver-primary-ledger.json')]:
    for r in read(path)['policies']:
        if r['name'].startswith('winner'):
            key=risk+'-'+('A' if r['name'] in ['winnerA','winnerFP'] else 'B');original[key]={d['signalDate']:d for d in r['days']};locations[key]=(risk,folder)
        elif r['name'] not in original:original[r['name']]={d['signalDate']:d for d in r['days']}
assert all(sha(p)==h for p,h in rep['protectedHashes'].items());predictions={};calibrators={};stale=[];audit=[];count=0;keys=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score','overall_score']
for r in ledger['policies']:
    key=r['sourcePolicy'];recent=[];strictp=[];scores=[];changed=0
    assert [d['signalDate'] for d in r['days']]==days
    for d in r['days']:
        day=d['signalDate'];j=di[day];a,b=int(off[j]),int(off[j+1]);sym=si[a:b];orig=original[key][day]
        if key in locations:
            k=(key,day)
            if k not in predictions:
                risk,folder=locations[key];path=folder/('naver-predictions' if risk=='FP' else 'predictions')/orig['modelEpoch']/(orig['modelScope']+'-'+day+'.npy');vv=np.load(path,allow_pickle=False)
                if orig['calibratorId']:
                    path=folder/'calibrators'/orig['modelEpoch']/(orig['calibratorId']+'.joblib')
                    if str(path) not in calibrators:calibrators[str(path)]=joblib.load(path)
                    z=calibrators[str(path)];assert z['activationDate']<=day
                    vv=np.interp(vv,z['model'].X_thresholds_,z['model'].y_thresholds_)
                vv=np.clip(vv,0,1);assert len(vv)==b-a and np.isfinite(vv).all();ss=np.floor(100*vv+.5).astype(np.int32);predictions[k]=(ss,vv)
            ss,vv=predictions[k]
        else:ss=S[a:b,6];vv=None
        excluded={s for old in recent[-20:] for s in old};eligible=[i for i,s in enumerate(sym) if int(s) not in excluded]
        if key=='ATRbaseline':order=sorted(eligible,key=lambda i:(float(X[a+i,0]),symbols[int(sym[i])]))
        elif r['tieChanged']:order=sorted(eligible,key=lambda i:(-int(ss[i]),-float(vv[i]),-float(flow[a+i]),symbols[int(sym[i])]))
        else:order=sorted(eligible,key=lambda i:(-int(ss[i]),-float(flow[a+i]),symbols[int(sym[i])]))
        chosen=order[:3] if len(order)>=3 else [];picked=[symbols[int(sym[i])] for i in chosen]
        assert picked==d['selectedSymbols']==[p['symbol'] for p in d['picks']];recent.append([int(sym[i]) for i in chosen]);assert not excluded.intersection(recent[-1])
        assert d['afterCooldownCount']==len(eligible) and d['runtimeEligibleCount']==b-a
        if d.get('scorableAfterCooldownCount')!=len(eligible):stale.append({'policy':r['name'],'date':day,'inheritedOldScorable':d.get('scorableAfterCooldownCount'),'actualScorable':len(eligible)})
        oldnames=[p['symbol'] for p in orig['picks']];assert d['originalSelectedSymbols']==oldnames and d['changedVersusOriginalRoster']==(oldnames!=picked);changed+=oldnames!=picked
        if not r['tieChanged']:assert picked==oldnames
        if key!='ATRbaseline':assert all(int(ss[order[i]])>=int(ss[order[i+1]]) for i in range(len(order)-1))
        for rank,(i,p) in enumerate(zip(chosen,d['picks']),1):
            assert p['selectionRank']==rank and p['averageTurnover20']==float(flow[a+i]);assert p['signals']=={**{k:int(v) for k,v in zip(keys,S[a+i])},'overall_score':int(ss[i])}
            assert p['expectedGoalUtility']==(float(vv[i]) if vv is not None else None)
            bar=raw[int(sym[i]),ci[day]+1:ci[day]+6]
            for br,dt,z in zip(p['dailyBars'],m['calendarDates'][ci[day]+1:ci[day]+6],bar):
                assert br['date']==dt and tuple(br[k] for k in ['open','high','low','close','volume'])==tuple(float(v) if np.isfinite(v) else None for v in z)
            price=bar[:,:4];strict=np.isfinite(bar).all() and (bar>0).all() and (price[:,1]>=price.max(axis=1)).all() and (price[:,2]<=price.min(axis=1)).all();assert p['outcome']['strictLabelValid']==bool(strict)
            if strict:
                en=bar[0,0];o=p['outcome'];assert o['net5d']==bar[-1,3]/en-1-.003 and o['touch']==bool((bar[:,1]>=en*110/100).any()) and o['entryBullish']==bool(bar[0,3]>en);strictp.append(p)
            scores.append(int(ss[i]));count+=1
    reported=rep['results']['all2023_2024'][r['name']];assert reported['changedRosterDays']==changed and reported['strict']['known']==len(strictp) and reported['scoreMin']==min(scores) and reported['scoreMax']==max(scores)
    for metric,f in [('touchRate',lambda p:p['outcome']['touch']),('loss5Rate',lambda p:p['outcome']['net5d']<=-.05),('anyNegativeD5Rate',lambda p:p['outcome']['net5d']<0),('D1bullRate',lambda p:p['outcome']['entryBullish']),('meanD5Net',lambda p:p['outcome']['net5d'])]:assert reported['strict'][metric]==statistics.mean(map(f,strictp))
    audit.append({'policy':r['name'],'days':len(r['days']),'selected':len(scores),'strict':len(strictp),'changedRosters':changed})
assert all(sha(p)==h for p,h in rep['protectedHashes'].items())
result={'scope':'Exact immutable cache->same calibrator->integer->same-bin utility tie/own20/all selected raw bars and strict whole metrics; independent np.interp calibration, no fit/model prediction','policies':audit,'selectedObservations':count,'cachedPredictionPanels':len(predictions),'selectionScoreMathRawDifferences':[],'reportMetadataFinding':{'staleInheritedScorableAfterCooldownCount':len(stale),'witnesses':stale[:5],'selectionOrPerformanceEffect':0},'sourceSha256':sha(D/'run.py'),'reportSha256':sha(D/'report.json'),'ledgerSha256':sha(D/'ledger.json'),'protocolSha256':sha(D/'protocol.json'),'newFits':0,'newModelPredictCalls':0,'PRIMARYReusedDiagnostic':True}
(D/'independent-audit.json').write_text(json.dumps(result,indent=2,allow_nan=False));print('COMPLETE_TIE_AUDIT',count,len(stale),flush=True)
