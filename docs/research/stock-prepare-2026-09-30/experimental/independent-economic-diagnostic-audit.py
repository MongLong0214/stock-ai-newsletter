"""Independent arithmetic and OHLC first-passage oracle; no model/selector execution."""
import collections,hashlib,json,math,pathlib,statistics
from decimal import Decimal,localcontext
E=pathlib.Path('/tmp/composite-score-experimental-20260930');H=E/'outcome-diagnostic/kis-l0-actual'
def read(p):return json.loads(p.read_text())
def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
records=read(H/'selected-tickers-and-outcomes.json')['records'];report=read(H/'compact-summary.json')
paths={('L0','inner'):E/'kis-l0-inner-ledger.json',('L0','outer'):E/'kis-l0-outer-ledger.json',('L5','inner'):E/'kis-inner-ledger.json',('L5','outer'):E/'kis-outer-ledger.json'}
calendar=read(pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/metadata.json'))['tradingDays'];ci={d:i for i,d in enumerate(calendar)}
lookup={}
for (study,partition),path in paths.items():
    for pol in read(path)['policies']:
        for day in pol['days']:
            for pick in day['picks']:
                key=(study,partition,pol['name'],day['signalDate'],pick['symbol'])
                assert key not in lookup;lookup[key]=pick
assert len(lookup)==len(records)
checks=0;models=collections.Counter();witnesses={};oracle={}
def equal(a,b,context):
    global checks
    checks+=1
    assert a==b,(context,a,b)
def out(reason,date,price,entry):return {'exitReason':reason,'exitDate':date,'exitPrice':float(price),'grossReturn':float(price/entry-1)}
def valid(row):
    v=[row.get(k) for k in ['open','high','low','close']]
    return not row.get('missing') and all(isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x) and x>0 for x in v) and v[1]>=max(v) and v[2]<=min(v)
def positive_volume(row):
    v=row.get('volume');return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) and v>0
for r in records:
    key=(r['study'],r['partition'],r['policy'],r['signalDate'],r['symbol']);p=lookup[key];d=r['diagnostic']
    dates=calendar[ci[r['signalDate']]+1:ci[r['signalDate']]+6];bars=p['dailyBars']
    equal([b['date'] for b in bars],dates,(key,'calendar'))
    equal(d['sessionDates'],dates,(key,'diagnosticCalendar'))
    equal(r['recommendationDate'],dates[0],(key,'D1'));equal(r['D5Date'],dates[-1],(key,'D5'))
    raw_valid=all(valid(b) for b in bars);strict=raw_valid and all(positive_volume(b) for b in bars)
    equal(d['rawMarkStatus']=='known',raw_valid,(key,'rawCoverage'));equal(d['strictAll5PositiveOhlcv'],strict,(key,'strictCoverage'))
    if not raw_valid:
        equal(d['raw'],dict.fromkeys(['targetTouch10','day1Bullish','grossD5','full5Mae']),(key,'rawUnknown'))
        models['missingOrInvalid']+=1;oracle[key]={'strict':False};continue
    with localcontext() as ctx:
        ctx.prec=50
        rb=[{k:Decimal(str(b[k])) for k in ['open','high','low','close']} for b in bars]
        entry=rb[0]['open'];target=entry*Decimal('1.10');stop=entry*Decimal('.95');gross=rb[-1]['close']/entry-1
        touch=any(b['high']>=target for b in rb);bull=rb[0]['close']>entry;mae=min(b['low'] for b in rb)/entry-1
        equal(d['entryOpen'],float(entry),(key,'entry'))
        equal(d['raw'],{'targetTouch10':touch,'day1Bullish':bull,'grossD5':float(gross),'full5Mae':float(mae)},(key,'rawMetrics'))
        if not strict:
            models['zeroOrInvalidVolume']+=1;oracle[key]={'strict':False}
            witnesses.setdefault('zeroVolume',r);continue
        first=next((j for j,b in enumerate(rb) if b['high']>=target),None)
        target_only=out('target',dates[first],target,entry) if first is not None else out('horizon_close',dates[-1],rb[-1]['close'],entry)
        pessimistic=optimistic=None;ambiguous=False
        for j,b in enumerate(rb):
            # Enumerate open precedences first, then possible H/L paths.
            if b['open']<=stop:reason='stop_gap';price=b['open']
            elif b['open']>=target:reason='target';price=target
            elif b['low']<=stop and b['high']>=target:
                pessimistic=out('stop',dates[j],stop,entry);optimistic=out('target',dates[j],target,entry);ambiguous=True;break
            elif b['low']<=stop:reason='stop';price=stop
            elif b['high']>=target:reason='target';price=target
            else:continue
            pessimistic=optimistic=out(reason,dates[j],price,entry);break
        if pessimistic is None:pessimistic=optimistic=out('horizon_close',dates[-1],rb[-1]['close'],entry)
        equal({k:d['models']['targetOnly'][k] for k in target_only},target_only,(key,'targetOnly'))
        equal(d['models']['targetStop']['conservative'],pessimistic,(key,'conservative'))
        equal(d['models']['targetStop']['optimistic'],optimistic,(key,'optimistic'))
        equal(d['models']['targetStop']['sameDayAmbiguous'],ambiguous,(key,'ambiguous'))
        prior=target_only['exitReason']=='target' and pessimistic['exitReason'] in ['stop','stop_gap'] and pessimistic['exitDate']<target_only['exitDate']
        equal(r['targetOnlyAfterEarlierStop'],prior,(key,'strictlyEarlierStop'))
        nets=[]
        for cost in d['costSensitivity']:
            c=Decimal(cost['roundTripBps'])/10000;net=gross-c
            equal(cost['rawMark'],{'netD5':float(net),'allNegativeD5':net<0,'lossAtLeast5Pct':net<=Decimal('-.05'),'targetTouchAndD5NetPositive':touch and net>0,'targetTouchAndD5NetNonnegative':touch and net>=0},(key,'rawCost'))
            tn=Decimal('.10')-c if first is not None else net
            # Recover exact proxy gross from decimal price, avoiding roundtrip float.
            pn=Decimal(str(pessimistic['exitPrice']))/entry-1-c;on=Decimal(str(optimistic['exitPrice']))/entry-1-c
            equal(cost['targetOnly'],{'netReturn':float(tn),'allNegative':tn<0,'lossAtLeast5Pct':tn<=Decimal('-.05')},(key,'targetOnlyCost'))
            equal(cost['targetStop'],{'netReturnLower':float(pn),'netReturnUpper':float(on),'allNegativePossible':pn<0,'allNegativeCertain':on<0,'lossAtLeast5PctPossible':pn<=Decimal('-.05'),'lossAtLeast5PctCertain':on<=Decimal('-.05')},(key,'firstPassageCost'))
            nets.append((float(net),float(tn),float(pn),float(on)))
        oracle[key]={'strict':True,'touch':touch,'bull':bull,'nets':nets,'ambiguous':ambiguous,'priorStop':prior,'mae':float(mae)}
        models['strict']+=1;models['ambiguous']+=ambiguous;models['priorStopThenTarget']+=prior;models['gapStop']+=pessimistic['exitReason']=='stop_gap'
        for name,condition in [('ambiguous',ambiguous),('priorStopThenTarget',prior),('gapStop',pessimistic['exitReason']=='stop_gap'),('touchButD5Loss',touch and gross-Decimal('.003')<0)]:
            if condition:witnesses.setdefault(name,r)

# The 78 split rows overlap; never pool them as independent observations.
aggregate_checks=0
for row in report['rows']:
    if row['partition']=='inner':dates=sorted({r['signalDate'] for r in records if r['study']==row['study'] and r['partition']=='inner' and r['policy']==row['policy']})[-80:]
    else:dates=report['splitCalendar'][row['split']]['dates']
    subset=[r for r in records if r['study']==row['study'] and r['partition']==row['partition'] and r['policy']==row['policy'] and r['signalDate'] in set(dates)]
    strict=[r for r in subset if r['diagnostic']['strictAll5PositiveOhlcv']]
    equal(row['selectedSlots'],len(subset),(row['study'],row['policy'],'selectedSlots'));equal(row['strictKnown'],len(strict),(row['study'],row['policy'],'strictKnown'))
    equal(row['strictTouch10']['count'],sum(r['diagnostic']['raw']['targetTouch10'] for r in strict),'aggregateT')
    equal(row['sameBarAmbiguous']['count'],sum(r['diagnostic']['models']['targetStop']['sameDayAmbiguous'] for r in strict),'aggregateAmbiguous')
    equal(row['targetOnlyAfterEarlierStop']['count'],sum(r['targetOnlyAfterEarlierStop'] for r in strict),'aggregateEarlierStop')
    for j,cost in enumerate(row['costSensitivity']):
        for name,idx in [('strictD5',0),('targetOnly',1),('conservative',2),('optimistic',3)]:
            v=[oracle[(r['study'],r['partition'],r['policy'],r['signalDate'],r['symbol'])]['nets'][j][idx] for r in strict]
            c=cost['targetStop'][name] if name in ['conservative','optimistic'] else cost[name]
            metric='netD5' if name=='strictD5' else 'netReturn'
            equal(c[metric]['known'],len(v),'aggregateKnown');equal(c[metric]['mean'],statistics.mean(v) if v else None,'aggregateMean')
            equal(c['anyNegative']['count'],sum(x<0 for x in v),'aggregateL0');equal(c['lossAtLeast5Pct']['count'],sum(x<=-.05 for x in v),'aggregateL5');aggregate_checks+=4

# Check actual frozen raw source rather than only trusting copied ledger candles.
sample_keys={(r['symbol'],date) for r in witnesses.values() for date in r['diagnostic']['sessionDates']};rawsource={}
for line in pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson').open():
    symbol=json.loads(line[1:line.index(',')])
    if not any(s==symbol for s,d in sample_keys):continue
    symbol,rows=json.loads(line)
    for b in rows:
        date=b['trade_date']
        if (symbol,date) in sample_keys:rawsource[(symbol,date)]=b
for name,r in witnesses.items():
    pick=lookup[(r['study'],r['partition'],r['policy'],r['signalDate'],r['symbol'])]
    for b in pick['dailyBars']:
        source=rawsource[(r['symbol'],b['date'])]
        equal([b[k] for k in ['open','high','low','close','volume']],[source[k] for k in ['open','high','low','close','volume']],('rawSourceWitness',name,b['date']))
result={'scope':'Independent Decimal OHLC oracle over all fixed selected KIS observations and all78 overlapping split aggregations; no model/selector execution','selectedObservations':len(records),'independentAssertions':checks,'aggregateRows':len(report['rows']),'aggregateArithmeticAssertions':aggregate_checks,'oracleCountsNonUniqueOverlappingPolicyObservations':dict(models),'rawSourceWitnessBarCount':len(sample_keys),'witnesses':{k:{f:r[f] for f in ['study','partition','policy','signalDate','symbol']} for k,r in witnesses.items()},'differences':[],'newNaver2023_2024OutcomesRead':False,'fitCalls':0,'sourceTruthLimitation':'Conditional on frozen KIS source; no real fills, adjusted-vintage audit or exchange-close equivalence claim','hashes':{str(p):sha(p) for p in [pathlib.Path(__file__),H/'compact-summary.json',H/'selected-tickers-and-outcomes.json',*paths.values()]}}
(E/'independent-economic-diagnostic-audit.json').write_text(json.dumps(result,indent=2,allow_nan=False));print(json.dumps(result),flush=True)
