# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3"]
# ///
"""Only changes own cooldown to 5; reuses fixed models' saved all-universe margins."""
import argparse,collections,datetime,hashlib,json,math,pathlib,statistics,time
import numpy as np
ROOT=pathlib.Path('/tmp/composite-score-experimental-20260930')
OUT=ROOT/'cooldown-ablation'
BASE=pathlib.Path('/tmp/composite-score-research-20260930')
FRESH=pathlib.Path('/tmp/stock-research-fresh-mature-20260930')
PLAN=OUT/'protocol.json'
PLAN_HASH='084f73c9ef5f4729c86b52478efe99dce86f97932f948d54bc39dc5bb039a235'
CATS=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score','overall_score']
BIND={}
def sha(p):
    with pathlib.Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def bind(p):
    p=pathlib.Path(p);h=sha(p)
    if str(p) in BIND:assert BIND[str(p)]==h,('Source changed',p)
    BIND[str(p)]=h;return h
def read(p):bind(p);return json.loads(pathlib.Path(p).read_text())
def write(p,value):
    p=pathlib.Path(p)
    assert not p.exists(),('Never overwrite an existing completed artifact',p)
    p.write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
assert bind(PLAN)==PLAN_HASH
protocol=read(PLAN)
for p,h in protocol['sourceHashesAtFreeze'].items():assert bind(p)==h,(p,'Frozen source binding')

def replay_days(ds,universes,score_provider,cd):
    """Every signal panel, including gaps/shortfalls, advances the policy's own state."""
    assert cd in [5,20] and ds==sorted(ds) and len(set(ds))==len(ds)
    recent=[];out=[]
    for d in ds:
        u=universes[d];scores,expected,margin,activation=score_provider(d,u)
        assert len(scores)==len(u['symbols']) and np.issubdtype(scores.dtype,np.integer)
        excluded={s for q in recent[-cd:] for s in q}
        ii=[i for i,s in enumerate(u['symbols']) if s not in excluded]
        rank=lambda i:(-int(scores[i]),-float(u['turnover'][i]),u['symbols'][i])
        chosen=sorted(ii,key=rank)[:3] if len(ii)>=3 else []
        ss=[u['symbols'][i] for i in chosen];assert len(set(ss))==len(ss) and not excluded.intersection(ss)
        recent.append(ss)
        raw_top=sorted(ii,key=lambda i:(-float(expected[i]),-float(u['turnover'][i]),u['symbols'][i]))[:3] if expected is not None else None
        out.append({'signalDate':d,'cooldown':cd,'chosenIndices':chosen,'symbols':ss,'score':[int(scores[i]) for i in chosen],'expected':[float(expected[i]) for i in chosen] if expected is not None else None,'margin':[float(margin[i]) for i in chosen] if margin is not None else None,'afterCooldownCount':len(ii),'active':activation,'top3AllIntegerTied':len(chosen)==3 and len(set(int(scores[i]) for i in chosen))==1,'integerVsRawDifferent':chosen!=raw_top if raw_top is not None else None,'topIntegerTieCount':sum(int(scores[i])==int(scores[chosen[0]]) for i in ii) if chosen else 0,'rawTopSymbols':[u['symbols'][i] for i in raw_top] if raw_top is not None else None})
    return out

def selftest():
    ds=[f'2026-01-{i:02d}' for i in range(1,9)]
    sym=['A','B','C','D','E','F'];universes={d:{'symbols':sym,'turnover':np.array([1,1,1,1,1,1])} for d in ds}
    def provider(d,u):return np.array([100,99,98,97,96,95],dtype=np.int32),None,None,None
    r=replay_days(ds,universes,provider,5)
    assert r[0]['symbols']==['A','B','C'] and r[1]['symbols']==['D','E','F']
    assert all(r[i]['symbols']==[] for i in range(2,6))
    assert r[6]['symbols']==['A','B','C'] and r[7]['symbols']==['D','E','F']
    # Calendar gaps do not remove signal panels or advance by calendar days.
    sparse=['2026-01-01','2026-01-10','2026-02-10','2026-03-10','2026-04-10','2026-05-10','2026-06-10']
    rr=replay_days(sparse,{d:universes[ds[0]] for d in sparse},provider,5)
    assert [d['symbols'] for d in rr]==[d['symbols'] for d in r[:7]]
    # Equal integers use turnover then ASCII, never latent expected values.
    def tied(d,u):return np.array([50]*6,dtype=np.int32),np.array([.506,.505,.504,.503,.502,.501]),np.zeros(6),None
    t=replay_days(ds[:1],{ds[0]:{'symbols':list(reversed(sym)),'turnover':np.array([1,2,2,3,3,3])}},tied,5)[0]
    assert t['symbols']==['A','B','C'] and t['integerVsRawDifferent'] is True
    # Fewer than 3 eligible produces explicit no-pick day, no forced top-up.
    empty=replay_days(ds[:1],{ds[0]:{'symbols':['A','B'],'turnover':np.array([1.,2.])}},lambda d,u:(np.array([50,50],dtype=np.int32),None,None,None),5)
    assert empty[0]['symbols']==[]
    return {'checks':['own CD5 excludes five previous signal panels','shortfalls advance own state','calendar gaps do not compress or add panels','integer/turnover/ASCII ties','under-three fail closed'],'differences':[]}

def load_universe():
    fm=read(FRESH/'features/metadata.json');meta=read('/private/tmp/stock-target-rebuilt-20260929/metadata.json');em=read(BASE/'earlier-training/manifest.json')
    days=fm['tradingDays'];early=list(em['perDate']);original=meta['evaluationDates'];outer=original+fm['evaluationDates'];ci={d:i for i,d in enumerate(days)}
    assert len(early)==235 and len(outer)==181
    def gate(p):
        bind(p);g={}
        for line in pathlib.Path(p).open():
            r=json.loads(line)
            if 'runtimeEligibleSymbols' in r:g[r['date']]=set(r['runtimeEligibleSymbols'])
            elif 'symbols' in r:g[r['date']]=set(r['symbols'])
            else:
                g.setdefault(r['date'],set())
                if r['eligible']:g[r['date']].add(r['symbol'])
        return g
    gates={**gate(BASE/'earlier-training/earlier-runtime-eligibility.ndjson'),**gate(BASE/'horizon-runtime-eligibility.ndjson')}
    u={d:{'symbols':[],'turnover':[],'sourceScores':[]} for d in early+outer}
    def add(d,p,ss):
        s=p['symbol']
        if s not in gates[d]:return
        u[d]['symbols'].append(s);u[d]['turnover'].append(p['feature']['averageTurnover20']);u[d]['sourceScores'].append([ss[k] for k in CATS])
    wp=BASE/'earlier-training/earlier-wide.ndjson';bind(wp)
    for line in wp.open():
        p=json.loads(line);add(p['date'],p,p['signals'])
    sp=BASE/'current-signals.ndjson';bind(sp)
    with sp.open() as f:
        it=iter(f)
        for pp in [pathlib.Path('/tmp/upside-scored.ndjson'),FRESH/'scored.ndjson']:
            bind(pp)
            for line in pp.open():
                d,rr=json.loads(line)
                for p in rr:
                    ss=json.loads(next(it));assert ss['date']==d and ss['symbol']==p['symbol'];add(d,p,ss['signals'])
        assert next(it,None) is None
    for d,r in u.items():
        assert len(r['symbols'])==len(set(r['symbols'])) and set(r['symbols'])==gates[d]
        r['turnover']=np.array(r['turnover'],dtype=np.float64);r['sourceScores']=np.array(r['sourceScores'],dtype=np.int32)
    rawp=FRESH/'input/prices.ndjson';bind(rawp)
    raw={};names={r['symbol']:r['name'] for r in meta['masters']}
    for line in rawp.open():
        s,rr=json.loads(line);bars=np.full((len(days),5),np.nan,dtype=np.float64)
        for r in rr:
            if r['source']=='kis' and r['trade_date'] in ci:
                j=ci[r['trade_date']];assert np.isnan(bars[j]).all();bars[j]=[r[k] for k in ['open','high','low','close','volume']]
        raw[s]=bars
    return u,raw,days,ci,early,original,outer,names

def outcome(raw,s,d,ci,days):
    i=ci[d];rr=raw.get(s,np.empty((0,5)))[i+1:i+6]
    complete=len(rr)==5 and bool(np.isfinite(rr).all(axis=1).all())
    # Missing volume is distinct from missing bar, but source dataset has numeric values.
    bar_present=np.isfinite(rr[:,:4]).any(axis=1) if len(rr) else np.array([])
    missing=len(rr)!=5 or not bool(bar_present.all())
    price_valid=len(rr)==5 and bool(np.isfinite(rr[:,:4]).all() and (rr[:,:4]>0).all() and (rr[:,1]>=np.max(rr[:,:4],axis=1)).all() and (rr[:,2]<=np.min(rr[:,:4],axis=1)).all())
    posvol=len(rr)==5 and bool(np.isfinite(rr[:,4]).all() and (rr[:,4]>0).all())
    zero=bool(any(bar_present[j] and (not math.isfinite(float(rr[j,4])) or rr[j,4]<=0) for j in range(len(rr))))
    bull=bool(rr[0,3]>rr[0,0]) if len(rr) and bar_present[0] and math.isfinite(float(rr[0,0])) and rr[0,0]>0 else None
    o={'rawMarkValid':price_valid,'strictLabelValid':price_valid and posvol,'zeroVolumeFlag':zero,'missingBarFlag':missing,'entryBullish':bull}
    if price_valid:
        entry=float(rr[0,0]);gross=float(rr[-1,3]/entry-1);net=gross-.003;touch=bool(np.max(rr[:,1])>=entry*110/100);proxy=(.10 if touch else gross)-.003
        first=next((j+1 for j,r in enumerate(rr) if r[1]>=entry*110/100),None)
        o.update({'entry':entry,'gross5d':gross,'net5d':net,'touch':touch,'mae':float(min(0,np.min(rr[:,2])/entry-1)),'maxGainPercent':float((np.max(rr[:,1])/entry-1)*100),'targetNetProxy':proxy,'rawTargetUtilityProxy':proxy+.025*int(bull)-max(0,-proxy),'utility':proxy+.025*int(bull)-max(0,-proxy) if price_valid and posvol else None,'targetFirstTouchSession':first,'touchAndPositiveD5Net':touch and net>0})
    else:o['utility']=None
    return o

def metrics(dd,ci):
    pp=[p for d in dd for p in d['picks']];vv=[p for p in pp if p['outcome']['strictLabelValid']];o=[p['outcome'] for p in vv]
    scores=[p['score'] for p in pp]
    syms=collections.Counter(p['symbol'] for p in pp);pairs=[(p['symbol'],p['recommendationDate']) for p in pp]
    overlaps=[];prior={}
    for d in dd:
        for p in d['picks']:
            s=p['symbol'];i=ci[p['recommendationDate']]
            if s in prior and i<=prior[s]+4:overlaps.append([s,p['recommendationDate']])
            prior[s]=i
    result={'days':len(dd),'picks':len(pp),'full3Days':sum(len(d['picks'])==3 for d in dd),'strictLabels':len(vv),'unknownLabels':len(pp)-len(vv),'all3ScoreAtLeast70Days':sum(len(d['picks'])==3 and all(p['score']>=70 for p in d['picks']) for d in dd),'scoreMin':min(scores) if scores else None,'scoreMean':statistics.mean(scores) if scores else None,'scoreMax':max(scores) if scores else None,'all3IntegerTiedDays':sum(d['top3AllIntegerTied'] for d in dd),'integerVsRawDifferentDays':sum(d['integerVsRawDifferent'] is True for d in dd),'uniqueSymbolEntryPairs':len(set(pairs)),'duplicateSymbolEntryPairs':len(pairs)-len(set(pairs)),'uniqueTickers':len(syms),'tickerRepeatedInstances':sum(n-1 for n in syms.values()),'tickersRepeated':sum(n>1 for n in syms.values()),'topTickerRepeatCounts':syms.most_common(10),'sameTickerOverlapping5SessionPositions':len(overlaps),'overlapInstances':overlaps}
    if o:
        result.update({'touchRate':statistics.mean(x['touch'] for x in o),'L0Rate':statistics.mean(x['net5d']<0 for x in o),'L5Rate':statistics.mean(x['net5d']<=-.05 for x in o),'D1bullishRate':statistics.mean(x['entryBullish'] for x in o),'meanNet5d':statistics.mean(x['net5d'] for x in o),'medianNet5d':statistics.median(x['net5d'] for x in o),'meanTargetNetProxy':statistics.mean(x['targetNetProxy'] for x in o),'meanMAE':statistics.mean(x['mae'] for x in o),'touchAndNegativeD5NetCount':sum(x['touch'] and x['net5d']<0 for x in o)})
    return result

def bootstrap(dd):
    keys=['touch','L0','L5','B','net','proxy'];daily=[]
    for d in dd:
        o=[p['outcome'] for p in d['picks'] if p['outcome']['strictLabelValid']]
        daily.append([len(o)]+[sum(f(x) for x in o) for f in [lambda x:x['touch'],lambda x:x['net5d']<0,lambda x:x['net5d']<=-.05,lambda x:x['entryBullish'],lambda x:x['net5d'],lambda x:x['targetNetProxy']]])
    a=np.array(daily,dtype=np.float64);rng=np.random.default_rng(42);out=[];n=len(dd)
    for _ in range(1000):
        starts=rng.integers(0,n,size=math.ceil(n/10));idx=np.concatenate([(s+np.arange(10))%n for s in starts])[:n];v=a[idx].sum(axis=0)
        if v[0]>0:out.append(v[1:]/v[0])
    q=np.quantile(np.array(out),[.025,.975],axis=0)
    return {'replicates':1000,'seed':42,'circularDateBlockLength':10,'intervals95':{k:[float(q[0,j]),float(q[1,j])] for j,k in enumerate(keys)},'interpretation':'Descriptive, dependent/reused diagnostics, not a pristine out-of-sample confidence statement'}

def run(tag):
    # A family may complete before the other: source output is read only after all files exist.
    prefix='kis-l0' if tag=='L0' else 'kis'
    frozen=read(ROOT/(prefix+'-winners-frozen.json'));winner=frozen['winners']
    ledgers={scope:read(ROOT/(prefix+'-'+scope+'-ledger.json')) for scope in ['inner','outer']}
    training={f:read(ROOT/(prefix+'-training-configs')/(entry['config']['id']+'-ledger.json')) for f,entry in winner.items()}
    u,raw,days,ci,early,original,outer,names=load_universe()
    audit={'CD20Differences':[],'selectedOutcomeDifferences':[],'selectedIntegerDifferences':[],'maturityViolations':[],'selectedInstances':0,'modelFits':0,'calibratorFits':0,'modelPredictions':0,'predictionsLoaded':0,'sourceScorePreservationDifferences':[]}
    raw_out={};cal_cache={};prediction_hashes={};results={};runs=[]
    assessment=early[110:130]+early[135:150]
    scopes={'TRAIN35':('train',early[:150],assessment),'inner80':('inner',early,early[155:]),'outer180':('outer',outer,original)}
    outer_splits={'originalTrainReused':original[:80],'validationReused':original[85:115],'test60Reused':original[120:],'allOriginal180':original,'freshOneDay':[outer[-1]]}
    for scope,(source_scope,ds,evalds) in scopes.items():
        policies={p['name']:p for p in ledgers[source_scope]['policies']} if source_scope!='train' else None
        for family in ['A','B','currentOverall']:
            name=tag+'-'+family
            if family=='currentOverall':
                if source_scope=='train':owner=None
                else:owner=policies[family]
            elif source_scope=='train':owner=training[family]['policies'][0]
            else:owner=policies['winner'+family]
            timeline={d['signalDate']:d for d in owner['days']} if owner else {}
            config=winner[family]['config'] if family!='currentOverall' else None
            def provider(d,universe):
                od=timeline.get(d);active=od and od['modelActive']
                if not active:return universe['sourceScores'][:,-1],None,None,None
                mid=od['modelScope'];mp=ROOT/(prefix+'-models')/(mid+'.json');m=read(mp)
                assert m['config']==config and m['activationDate']<=d
                if m['provenance']['latestTrainingLabelMaturity']>=d:audit['maturityViolations'].append([name,d,mid])
                pp=ROOT/(prefix+'-predictions')/(mid+'-'+d+'.npy');prediction_hashes[str(pp)]=bind(pp);v=np.load(pp,allow_pickle=False);audit['predictionsLoaded']+=1
                assert len(v)==len(universe['symbols']) and np.isfinite(v).all()
                if family=='A':expected=np.clip(v,0,1)
                else:
                    cid=od['calibratorId']
                    if cid not in cal_cache:cal_cache[cid]=read(ROOT/(prefix+'-calibrators')/(cid+'.json'))
                    c=cal_cache[cid];assert c['activationDate']<=d and all(days[ci[x]+5]<c['activationDate'] for x in c['OOFDates'])
                    expected=np.clip(np.interp(v,c['xThresholds'],c['expectedUtilityThresholds']),0,1)
                scores=np.floor(100*expected+.5).astype(np.int32)
                return scores,expected,v,{'modelId':mid,'calibratorId':od['calibratorId'],'modelConfig':config}
            for cd in [20,5]:
                dd=replay_days(ds,u,provider,cd)
                for d in dd:
                    picks=[]
                    for j,i in enumerate(d.pop('chosenIndices')):
                        s=u[d['signalDate']]['symbols'][i];key=(s,d['signalDate'])
                        if key not in raw_out:raw_out[key]=outcome(raw,s,d['signalDate'],ci,days)
                        o=raw_out[key];start=ci[d['signalDate']]
                        bars=[]
                        for k in range(1,6):
                            b=raw.get(s,np.empty((0,5)))[start+k] if s in raw and start+k<len(days) else None
                            bars.append({'date':days[start+k],'session':k,'source':'kis',**dict(zip(['open','high','low','close','volume'],[float(x) if math.isfinite(float(x)) else None for x in b]))} if b is not None and np.isfinite(b[:4]).any() else {'date':days[start+k],'session':k,'missing':True})
                        picks.append({'symbol':s,'currentMasterName':names.get(s),'recommendationDate':days[start+1],'expectedD5date':days[start+5],'score':d['score'][j],'expected':d['expected'][j] if d['expected'] is not None else None,'margin':d['margin'][j] if d['margin'] is not None else None,'sourceScores':dict(zip(CATS,map(int,u[d['signalDate']]['sourceScores'][i]))),'averageTurnover20':float(u[d['signalDate']]['turnover'][i]),'outcome':o,'dailyBars':bars})
                        audit['selectedInstances']+=1
                    d['picks']=picks
                    if cd==20 and owner:
                        od=timeline[d['signalDate']];op=od['picks']
                        if d['symbols']!=[p['symbol'] for p in op]:audit['CD20Differences'].append([scope,name,d['signalDate'],'symbols'])
                        if d['score']!=[p['signals']['overall_score'] for p in op]:audit['CD20Differences'].append([scope,name,d['signalDate'],'integers'])
                        for p,q in zip(picks,op):
                            if p['sourceScores']!=q['sourceSignals']:audit['sourceScorePreservationDifferences'].append([scope,name,d['signalDate'],p['symbol']])
                            if p['outcome']!=q['outcome']:audit['selectedOutcomeDifferences'].append([scope,name,d['signalDate'],p['symbol']])
                    if d['active']:
                        for p in picks:
                            if p['score']!=math.floor(100*p['expected']+.5):audit['selectedIntegerDifferences'].append([scope,name,d['signalDate'],p['symbol']])
                run={'name':name+'-CD'+str(cd),'scope':scope,'cooldown':cd,'initialState':'empty on '+ds[0],'days':dd};runs.append(run)
                if scope=='outer180':splitmap=outer_splits
                else:splitmap={scope:evalds}
                for split,dates in splitmap.items():
                    selected=[d for d in dd if d['signalDate'] in set(dates)]
                    results.setdefault(split,{})[run['name']]={**metrics(selected,ci),'bootstrap':bootstrap(selected)}
    assert not any(audit[k] for k in ['CD20Differences','selectedOutcomeDifferences','selectedIntegerDifferences','maturityViolations','sourceScorePreservationDifferences']),audit
    unchanged=[]
    for p,h in BIND.items():
        if sha(p)!=h:unchanged.append(p)
    assert not unchanged,unchanged
    report={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protocolSha256':PLAN_HASH,'riskModelFamily':tag,'fixedConfigByFamily':{f:e['config'] for f,e in winner.items()},'results':results,'audit':audit,'sourceHashes':BIND,'caveats':protocol['restrictions'],'noDeployment':True}
    write(OUT/(tag+'-ledger.json'),{'policies':runs,'actualPublishedHistory':False,'protocolSha256':PLAN_HASH})
    write(OUT/(tag+'-report.json'),report)
    print('DONE',tag,json.dumps(audit),flush=True)
    for split,v in results.items():print('RESULT',split,json.dumps({k:{m:r.get(m) for m in ['touchRate','L0Rate','L5Rate','D1bullishRate','meanNet5d','meanTargetNetProxy','all3ScoreAtLeast70Days','uniqueTickers','tickerRepeatedInstances']} for k,r in v.items()}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--selftest',action='store_true');p.add_argument('--tag',choices=['L0','L5']);a=p.parse_args()
    if a.selftest:
        t=selftest();write(OUT/'replay-selftest-final.json',t);print(json.dumps(t))
    else:assert a.tag;run(a.tag)
