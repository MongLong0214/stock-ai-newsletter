# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1", "lightgbm==4.7.0"]
# ///
"""Independent integer portfolio replay and selected raw OHLC verification."""
import json,pathlib,hashlib,math,statistics,sys,collections
import numpy as np
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor
from lightgbm import LGBMRanker
E=pathlib.Path('/tmp/composite-score-experimental-20260930')
def sha(path):
    with pathlib.Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
info=json.loads(pathlib.Path('/tmp/composite-score-independent-monthly-input-audit-20260930.json').read_text())
calendar=info['calendar'];ci={d:i for i,d in enumerate(calendar)};dates=info['signalDates'];pos={d:i for i,d in enumerate(dates)}
keys=json.loads(pathlib.Path('/tmp/composite-score-independent-monthly-input-keys-20260930.json').read_text())
z=np.load(E/'independent-kis-inputs.npz');X=z['X'];Y=z['Y'];offsets=z['offsets']
oldkeys=json.loads(pathlib.Path('/tmp/composite-score-independent-event-input-keys-20260930.json').read_text())
old=np.load('/tmp/composite-score-independent-balanced-source-20260930.npz');ss=old['signals'];tv=old['turnover'];oldindex={tuple(k):i for i,k in enumerate(oldkeys)}
signals=np.zeros((len(keys),7),dtype=np.int16);turnover=np.full(len(keys),np.nan)
for i,k in enumerate(keys):
    j=oldindex.get(tuple(k))
    if j is not None:signals[i]=ss[j];turnover[i]=tv[j]
categories=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score','overall_score']
cases=[];needed=set();files=[]
for f in sorted((E/'kis-training-configs').glob('*-ledger.json')):
    # Each ledger is written after its result and before next fitting begins.
    data=json.loads(f.read_text());cases.append(('train',data['policies'][0],f));files.append(f)
for scope in ['inner','outer']:
    f=E/('kis-'+scope+'-ledger.json')
    if not f.exists():continue
    data=json.loads(f.read_text());files.append(f)
    cases.extend((scope,r,f) for r in data['policies'] if r['name']!='staticBoundedComposite')
for scope,run,f in cases:
    needed.update(p['symbol'] for d in run['days'] for p in d['picks'])
raw=collections.defaultdict(dict);rawpath=pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson')
for line in rawpath.open():
    symbol,rr=json.loads(line)
    if symbol not in needed:continue
    for r in rr:
        if r['source']!='kis':continue
        d=r['trade_date'];bar=tuple(r.get(k) for k in ['open','high','low','close','volume'])
        assert d not in raw[symbol] or raw[symbol][d]==bar
        raw[symbol][d]=bar
errors=[];models={};cals={};results=[]
def check(condition,key,details=None):
    if not condition:errors.append({'check':key,'details':details})
def getmodel(key):
    if key not in models:models[key]=joblib.load(E/'kis-models'/(key+'.joblib'))
    return models[key]
def getcal(key):
    if key not in cals:cals[key]=joblib.load(E/'kis-calibrators'/(key+'.joblib'))
    return cals[key]
def observed(symbol,d):
    dd=calendar[ci[d]+1:ci[d]+6];bb=[raw[symbol].get(day) for day in dd]
    complete=len(bb)==5 and all(b is not None for b in bb)
    finite=lambda v:isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
    valid=complete and all(all(finite(v) and v>0 for v in b[:4]) and b[1]>=max(b[0],b[2],b[3]) and b[2]<=min(b[0],b[1],b[3]) for b in bb)
    strict=valid and all(finite(b[4]) and b[4]>0 for b in bb)
    result={'strict':strict,'raw':valid,'missing':not complete,'zero':any(b is not None and (not finite(b[4]) or b[4]<=0) for b in bb)}
    if valid:
        entry=bb[0][0];gross=bb[4][3]/entry-1;net=gross-.003;t=any(b[1]>=entry*110/100 for b in bb)
        result.update(T=t,B=bb[0][3]>entry,net=net,L5=net<=-.05,L0=net<0,mae=min(0,min(b[2] for b in bb)/entry-1),proxy=(.10 if t else gross)-.003)
    return result,dd,bb
for scope,run,f in cases:
    own=[];selected=[];activeDays=0;unknown=0
    for ordinal,day in enumerate(run['days']):
        d=day['signalDate'];i=pos[d];a,b=map(int,offsets[i:i+2]);xx=X[a:b];symbols=[s for _,s in keys[a:b]]
        source=signals[a:b];flow=turnover[a:b];assert np.isfinite(flow).all()
        excluded=set(s for panel in own[-20:] for s in panel)
        ii=[j for j,s in enumerate(symbols) if s not in excluded]
        if scope=='train':
            c=json.loads(f.with_name(f.name.replace('-ledger.json','-result.json')).read_text())['config'];active=ordinal>=(85 if c['family']=='A' else 110)
            n=80 if ordinal<110 else 105 if ordinal<135 else 130
            modelkey=c['id']+'-prefix'+str(n) if active else None
            calkey=c['id']+('-train-cal20' if ordinal<135 else '-train-cal40') if active and c['family']=='B' else None
        elif run['name'].startswith('winner'):
            chosen=json.loads((E/'kis-winners-frozen.json').read_text())['winners'][run['name'][-1]]['config']
            active=ordinal>=155 if scope=='inner' else True;n=150 if scope=='inner' else 235
            modelkey=chosen['id']+'-prefix'+str(n) if active else None
            calkey=chosen['id']+('-inner-cal55' if scope=='inner' else '-outer-cal125') if active and chosen['family']=='B' else None
        else:active=False;modelkey=calkey=None
        check(day['modelActive']==active,[scope,run['name'],d,'active schedule'])
        check(day['modelScope']==modelkey,[scope,run['name'],d,'model schedule'])
        check(day['calibratorId']==calkey,[scope,run['name'],d,'calibrator schedule'])
        if active:
            activeDays+=1;m=getmodel(modelkey);pred=m['model'].predict(xx[:,:m['config']['inputCount']]);expected=np.clip(pred if calkey is None else getcal(calkey)['model'].predict(pred),0,1)
            score=np.floor(100*expected+.5).astype(np.int32)
            check(all(calendar[ci[q]+5]<d for q in m['trainingDates']),[scope,run['name'],d,'learner label maturity'])
            if calkey:check(all(calendar[ci[q]+5]<d for q in getcal(calkey)['OOFDates']),[scope,run['name'],d,'calibration label maturity'])
        else:score=source[:,6];expected=None
        ranked=sorted(ii,key=(lambda j:(xx[j,0],symbols[j])) if run['name']=='ATRbaseline' else lambda j:(-int(score[j]),-float(flow[j]),symbols[j]))
        selectedidx=ranked[:3] if len(ranked)>=3 else [];roster=[symbols[j] for j in selectedidx];own.append(roster)
        reported=[p['symbol'] for p in day['picks']]
        check(roster==reported,[scope,run['name'],d,'integer roster'],{'expected':roster,'actual':reported})
        check(day['afterCooldownCount']==len(ii) and day['runtimeEligibleCount']==len(xx),[scope,run['name'],d,'pool counts'])
        check(day['unscorableExcludedObservedInputs']==0,[scope,run['name'],d,'native missing filter'])
        check(day['recommendationDateExpected']==calendar[ci[d]+1] and day['expectedD5date']==calendar[ci[d]+5],[scope,run['name'],d,'actual calendar'])
        for rank,(j,p) in enumerate(zip(selectedidx,day['picks']),1):
            check(p['selectionRank']==rank and p['signals']['overall_score']==int(score[j]),[scope,run['name'],d,p['symbol'],'published score/rank'])
            check(all(p['sourceSignals'][k]==int(source[j,kidx]) for kidx,k in enumerate(categories)),[scope,run['name'],d,p['symbol'],'source seven scores'])
            check(all(p['signals'][k]==int(source[j,kidx]) for kidx,k in enumerate(categories[:6])),[scope,run['name'],d,p['symbol'],'six categories'])
            o,dd,bb=observed(p['symbol'],d);reportedOutcome=p['outcome'];unknown+=not o['strict']
            check(o['strict']==reportedOutcome['strictLabelValid'] and o['raw']==reportedOutcome['rawMarkValid'],[scope,run['name'],d,p['symbol'],'raw availability'])
            check(o['missing']==reportedOutcome['missingBarFlag'] and o['zero']==reportedOutcome['zeroVolumeFlag'],[scope,run['name'],d,p['symbol'],'unknown reason'])
            for k,bar,session in zip(dd,bb,p['dailyBars']):
                check(session['date']==k,[scope,run['name'],d,p['symbol'],'bar calendar'])
                check((bar is None and session.get('missing')) or (bar is not None and tuple(session.get(f) for f in ['open','high','low','close','volume'])==bar),[scope,run['name'],d,p['symbol'],'raw OHLCV'])
            if o['raw']:
                fields={'touch':'T','entryBullish':'B','net5d':'net','mae':'mae','targetNetProxy':'proxy'}
                for k,v in fields.items():check(reportedOutcome[k]==o[v],[scope,run['name'],d,p['symbol'],k])
            selected.append((d,int(score[j]),o))
    assessment=json.loads(f.with_name(f.name.replace('-ledger.json','-result.json')).read_text())['assessmentDates'] if scope=='train' else None
    vv=[o for d,s,o in selected if o['strict'] and (assessment is None or d in assessment)]
    summary={'scope':scope,'policy':run['name'],'days':len(run['days']),'activeDays':activeDays,'selections':len(selected),'unknownRetained':unknown,'strictMetricSelections':len(vv)}
    if vv:
        summary.update(touch=sum(o['T'] for o in vv),loss5=sum(o['L5'] for o in vv),anyNegative=sum(o['L0'] for o in vv),bull=sum(o['B'] for o in vv),meanD5=statistics.mean(o['net'] for o in vv),meanProxy=statistics.mean(o['proxy'] for o in vv),meanMAE=statistics.mean(o['mae'] for o in vv))
    if scope=='train':
        original=json.loads(f.with_name(f.name.replace('-ledger.json','-result.json')).read_text())['assessment']['strictPositiveVolume']
        for k,v in [('labels','strictMetricSelections'),('touchCount','touch'),('loss5Count','loss5'),('anyNegativeD5NetCount','anyNegative'),('D1bullishCount','bull'),('meanNet5d','meanD5'),('meanTargetNetProxy','meanProxy'),('meanMAE','meanMAE')]:check(original[k]==summary[v],[scope,run['name'],'assessment '+k])
    results.append(summary);print('AUDITED',json.dumps(summary),flush=True)
report={'scope':'Independent available KIS policy replays only; no configuration choice or future NAVER data','sourceHashes':{str(f):sha(f) for f in [pathlib.Path(__file__),rawpath,E/'kis-research.py',E/'kis-protocol.json']+files},'results':results,'availableTrainConfigs':sum(scope=='train' for scope,r,f in cases),'availableLaterPolicies':sum(scope!='train' for scope,r,f in cases),'differences':errors,'newNaver2023_2024LabelsRead':False,'productionChanged':False}
(E/'independent-kis-policy-audit.json').write_text(json.dumps(report,indent=2,allow_nan=False))
print('DIFFERENCES',len(errors),flush=True);assert not errors
