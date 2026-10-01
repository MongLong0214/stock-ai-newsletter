"""Independent eight KIS FP model inputs and complete integer policy replay, no fitting."""
import ast,collections,hashlib,json,math,pathlib,statistics,time
import numpy as np
import joblib
E=pathlib.Path('/tmp/composite-score-experimental-20260930');F=E/'first-passage-study'
def read(p):return json.loads(pathlib.Path(p).read_text())
def sha(p):
    with pathlib.Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
info=read('/tmp/composite-score-independent-monthly-input-audit-20260930.json');calendar=info['calendar'];ci={d:i for i,d in enumerate(calendar)};dates=info['signalDates'];di={d:i for i,d in enumerate(dates)}
keys=read('/tmp/composite-score-independent-monthly-input-keys-20260930.json');z=np.load(E/'independent-kis-inputs.npz');X=z['X'];Y=z['Y'];off=z['offsets']
oldkeys=read('/tmp/composite-score-independent-event-input-keys-20260930.json');os=np.load('/tmp/composite-score-independent-balanced-source-20260930.npz');oi={tuple(k):i for i,k in enumerate(oldkeys)}
S=np.zeros((len(keys),7),dtype=np.int16);turn=np.full(len(keys),np.nan)
for i,k in enumerate(keys):
    if tuple(k) in oi:j=oi[tuple(k)];S[i]=os['signals'][j];turn[i]=os['turnover'][j]
needed={k[1] for k in keys};raw={};rawpath=pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson')
for line in rawpath.open():
    symbol,rows=json.loads(line)
    if symbol not in needed:continue
    book={}
    for r in rows:
        if r['source']!='kis':continue
        bar=tuple(r.get(k) for k in ['open','high','low','close','volume']);d=r['trade_date'];assert d not in book or book[d]==bar;book[d]=bar
    raw[symbol]=book
labs={}
def span(d):i=di[d];return int(off[i]),int(off[i+1])
def label(d):
    if d in labs:return labs[d]
    a,b=span(d);dd=calendar[ci[d]+1:ci[d]+6];rr=np.array([[raw.get(s,{}).get(day,(np.nan,)*5) for day in dd] for _,s in keys[a:b]],dtype=np.float64);p=rr[:,:,:4]
    valid=np.isfinite(p).all(axis=(1,2))&(p>0).all(axis=(1,2))&(p[:,:,1]>=p.max(axis=2)).all(axis=1)&(p[:,:,2]<=p.min(axis=2)).all(axis=1);strict=valid&np.isfinite(rr[:,:,4]).all(axis=1)&(rr[:,:,4]>0).all(axis=1)
    assert np.array_equal(strict,np.all(Y[a:b]>=0,axis=1)),(d,'old raw strict labels')
    assert np.all(p[strict]==np.floor(p[strict])) and np.max(p[strict])<1e9
    q=p[strict].astype(np.int64);en=q[:,0,0];n=len(q);reason=np.zeros(n,dtype=np.uint8);eday=np.zeros(n,dtype=np.uint8);amb=np.zeros(n,dtype=np.uint8);ep=np.zeros(n)
    for j in range(5):
        active=reason==0;o,h,l,c=q[:,j,:].T;gs=active&(20*o<=19*en);gt=active&~gs&(10*o>=11*en);mid=active&~gs&~gt;st=mid&(20*l<=19*en);tt=mid&~st&(10*h>=11*en);amb[mid&(20*l<=19*en)&(10*h>=11*en)]=1
        for hit,code,price in [(gs,3,o),(gt,1,en*1.1),(st,2,en*.95),(tt,1,en*1.1)]:reason[hit]=code;eday[hit]=j+1;ep[hit]=price[hit]
    horizon=reason==0;reason[horizon]=4;eday[horizon]=5;ep[horizon]=q[horizon,-1,3]
    ee=np.zeros((b-a,3),dtype=np.uint8);ee[strict]=np.column_stack([reason==1,q[:,0,3]>en,np.isin(reason,[2,3])|(horizon&(1000*q[:,-1,3]<1003*en))])
    safe=np.zeros(b-a,dtype=np.uint8);loss=np.zeros(b-a,dtype=np.uint8);aa=np.zeros(b-a,dtype=np.uint8);eeReason=np.zeros(b-a,dtype=np.uint8);day=np.zeros(b-a,dtype=np.uint8);net=np.full(b-a,np.nan)
    safe[strict]=ee[strict,0];loss[strict]=ee[strict,2];aa[strict]=amb;eeReason[strict]=reason;day[strict]=eday;net[strict]=ep/en-1-.003
    v={'strict':strict,'valid':valid,'events':ee,'safe':safe,'loss':loss,'amb':aa,'reason':eeReason,'day':day,'net':net,'bars':rr};labs[d]=v;return v
models={};model_results=[];table=np.array([(.8*((i>>2)&1)+.2*(i&1)+.65*(1-((i>>1)&1)))/(1+.65) for i in range(8)])
for path in sorted((F/'kis-models').glob('*.json')):
    m=read(path);dd=m['trainingDates'];c=m['config'];n=c['inputCount'];pp=[label(d) for d in dd];xx=np.concatenate([X[slice(*span(d)),:n][p['strict']] for d,p in zip(dd,pp)]);ee=np.concatenate([p['events'][p['strict']] for p in pp]);g=np.array([int(p['strict'].sum()) for p in pp],dtype=np.int32);w=np.concatenate([np.full(int(k),len(ee)/(len(dd)*int(k)),dtype=np.float64) for k in g]);v=table[4*ee[:,0]+2*ee[:,2]+ee[:,1]]
    digest=hashlib.sha256(xx.tobytes()+ee.tobytes()+g.tobytes()+w.tobytes()+v.tobytes()).hexdigest();assert digest==m['trainingInputSha256']
    assert m['queryCounts']==g.tolist() and m['rowCount']==len(v) and m['nativeMissingValues']==int(np.isnan(xx).sum())
    assert dd==dates[:len(dd)] and all(calendar[ci[d]+5]<m['activationDate'] for d in dd)
    bundle=joblib.load(path.with_suffix('.joblib'));assert sha(path.with_suffix('.joblib'))==m['joblibSha256']
    assert all(bundle['model'].get_params()[k]==v for k,v in m['parameters'].items()) and bundle['model'].n_iter_==100
    tree=hashlib.sha256(b''.join(it[0].nodes.tobytes() for it in bundle['model']._predictors)).hexdigest();assert tree==m['treeInfo']['structuredNodesSha256'];models[m['bundleId']]=bundle
    model_results.append({'bundle':m['bundleId'],'rows':len(v),'inputSha256':digest,'treeSha256':tree});print('KIS_FP_FULL_INPUT_EXACT',m['bundleId'],flush=True)
winner=read(F/'kis-winner-frozen-before-inner-outer.json')['winner']['config'];runs=[]
for path in sorted((F/'kis-training').glob('*-ledger.json')):runs.extend(('train',r,path) for r in read(path)['policies'])
for scope in ['inner','outer']:
    path=F/('kis-'+scope+'-ledger.json');runs.extend((scope,r,path) for r in read(path)['policies'])
K=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score','overall_score'];results=[];observations=0
for scope,run,path in runs:
    recent=[];strictcount=unknown=0
    for ordinal,day in enumerate(run['days']):
        d=day['signalDate'];a,b=span(d);syms=[s for _,s in keys[a:b]];flow=turn[a:b];assert np.isfinite(flow).all();excluded={s for rr in recent[-20:] for s in rr};eligible=[i for i,s in enumerate(syms) if s not in excluded]
        if scope=='train':config=read(path.with_name(path.name.replace('-ledger.json','-result.json')))['config'];active=ordinal>=85;prefix=80 if ordinal<110 else 105 if ordinal<135 else 130
        elif run['name']=='winnerFP':config=winner;active=ordinal>=155 if scope=='inner' else True;prefix=150 if scope=='inner' else 235
        else:active=False
        if active:
            mid=config['id']+'-prefix'+str(prefix);bundle=models[mid];pred=bundle['model'].predict(X[a:b,:config['inputCount']]);expected=np.clip(pred,0,1);score=np.floor(100*expected+.5).astype(np.int32);assert day['modelScope']==mid and bundle['activationDate']<=d
        else:score=S[a:b,6]
        assert day['modelActive']==active
        order=(lambda i:(float(X[a+i,0]),syms[i])) if run['name']=='ATRbaseline' else (lambda i:(-int(score[i]),-float(flow[i]),syms[i]));chosen=sorted(eligible,key=order)[:3] if len(eligible)>=3 else []
        assert len(chosen)==3 and [syms[i] for i in chosen]==[p['symbol'] for p in day['picks']];recent.append([syms[i] for i in chosen]);assert not excluded.intersection(recent[-1])
        assert day['afterCooldownCount']==len(eligible) and day['runtimeEligibleCount']==b-a
        z=label(d)
        for rank,(i,p) in enumerate(zip(chosen,day['picks']),1):
            assert p['selectionRank']==rank and p['signals']['overall_score']==int(score[i]) and p['sourceSignals']=={k:int(v) for k,v in zip(K,S[a+i])}
            assert all(p['signals'][k]==int(S[a+i,j]) for j,k in enumerate(K[:-1]))
            if active:assert p['nativeModelPrediction']==float(pred[i]) and p['expectedGoalUtility']==float(expected[i])
            o=p['outcome'];assert o['strictLabelValid']==bool(z['strict'][i]) and o['rawMarkValid']==bool(z['valid'][i]);strictcount+=bool(z['strict'][i]);unknown+=not bool(z['strict'][i])
            for bar,date,rr in zip(p['dailyBars'],calendar[ci[d]+1:ci[d]+6],z['bars'][i]):
                assert bar['date']==date
                if np.isfinite(rr).any():assert tuple(bar.get(k) for k in ['open','high','low','close','volume'])==tuple(float(v) if np.isfinite(v) else None for v in rr)
                else:assert bar.get('missing') is True
            if z['strict'][i]:
                assert o['T_safe']==bool(z['safe'][i]) and o['L0_FP']==bool(z['loss'][i]) and o['fpSameBarAmbiguous']==bool(z['amb'][i]);assert abs(o['fpNet30bps']-z['net'][i])<1e-12
                assert o['fpExitReason']==['target','stop','stop_gap','horizon_close'][int(z['reason'][i])-1] and o['fpExitSession']==int(z['day'][i])
                rr=z['bars'][i];entry=rr[0,0];assert o['touch']==bool((rr[:,1]>=entry*110/100).any()) and o['entryBullish']==bool(rr[0,3]>entry);assert o['net5d']==rr[-1,3]/entry-1-.003
            else:assert all(o[k] is None for k in ['T_safe','L0_FP','fpNet30bps','fpExitSession','fpExitReason','fpSameBarAmbiguous'])
            observations+=1
    results.append({'scope':scope,'policy':run['name'],'days':len(run['days']),'selected':3*len(run['days']),'strict':strictcount,'unknownRetained':unknown});print('KIS_FP_WHOLE_POLICY_EXACT',scope,run['name'],flush=True)
report={'scope':'Independent original KIS raw-price strict FP event oracle, all eight fitted input/query/date weights/hash/maturity/saved structures, actual complete integer ranking and own20 cooldown over two TRAIN and all inner/outer policies; no new tree fit','models':model_results,'policies':results,'selectedObservations':observations,'differences':[],'newFits':0,'productionChanges':0,'KISPeriodsRepeatedDiagnosticNotFreshOOS':True,'sourceTruthLimitation':'Conditional on frozen KIS input; actual fills and corporate-action/vintage market truth unproven','hashes':{str(p):sha(p) for p in [pathlib.Path(__file__),F/'kis_fp.py',F/'kis-input-freeze.json',F/'kis-winner-frozen-before-inner-outer.json',F/'kis-inner-ledger.json',F/'kis-outer-ledger.json',rawpath]}}
(E/'independent-kis-first-passage-audit.json').write_text(json.dumps(report,indent=2,allow_nan=False));print('COMPLETE_KIS_FP',observations,flush=True)
