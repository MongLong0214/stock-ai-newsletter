import json, pathlib, math, hashlib, datetime
out=pathlib.Path('/tmp/composite-score-research-20260930/weight-study');base=out.parent
ledgers=[json.loads((out/p).read_text()) for p in ['inner-ledger.json','outer-ledger.json']]
fits=json.loads((out/'weights.json').read_text());meta=json.loads(pathlib.Path('/tmp/stock-research-fresh-mature-20260930/features/metadata.json').read_text());days=meta['tradingDays'];di={d:i for i,d in enumerate(days)}
pairs={(d['signalDate'],p['symbol']) for l in ledgers for policy in l['policies'] for d in policy['days'] for p in d['picks']}
needed={symbol for date,symbol in pairs};raw={};source=pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson')
for line in source.open():
    symbol,rr=json.loads(line)
    if symbol in needed:raw[symbol]={r['trade_date']:r for r in rr if r['source']=='kis'}
source_signals={}
for line in (base/'current-signals.ndjson').open():
    p=json.loads(line);key=(p['date'],p['symbol'])
    if key in pairs:source_signals[key]=p['signals']
categories=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score']
audit={'instances':0,'rawBarDifferences':[],'markDifferences':[],'utilityDifferences':[],'categoryDifferences':[],'publishedScoreDifferences':[],'maturityViolations':[],'strictMissingInstances':0,'expectedUnavailableSourceLabels':[]}
close=lambda a,b:abs(a-b)<1e-9
for ledger in ledgers:
    for policy in ledger['policies']:
        for day in policy['days']:
            for p in day['picks']:
                audit['instances']+=1;key=[policy['name'],day['signalDate'],p['symbol']];i=di[day['signalDate']];calendar=days[i+1:i+6];bars=[raw.get(p['symbol'],{}).get(d) for d in calendar]
                if len(bars)!=5 or any(b is None for b in bars):audit['rawBarDifferences'].append(key+['missing']);continue
                if p['recommendationDate']!=calendar[0] or p['expectedD5date']!=calendar[-1] or [b['date'] for b in p['dailyBars']]!=calendar:audit['rawBarDifferences'].append(key+['calendar'])
                for b,e in zip(bars,p['dailyBars']):
                    if any(b[k]!=e[k] for k in ['open','high','low','close','volume']):audit['rawBarDifferences'].append(key+[e['date']])
                entry=bars[0]['open'];n=bars[-1]['close']/entry-1-.003;mae=min(0,min(b['low']/entry-1 for b in bars));touch=any(b['high']>=entry*110/100 for b in bars);bull=bars[0]['close']>entry;zero=any(b['volume']<=0 for b in bars)
                if not close(n,p['net5d']) or not close(mae,p['mae']) or touch!=p['touch'] or bull!=p['entryBullish'] or zero!=p['zeroVolumeFlag']:audit['markDifferences'].append(key)
                if zero:
                    audit['strictMissingInstances']+=1
                    if p['utilityLabelValid'] or p['utility'] is not None:audit['utilityDifferences'].append(key+['zeroVolumeLabelMustBeMissing'])
                else:
                    utility=(2*n if n<0 else n)+(.10 if touch and n>0 else 0)+(.025 if bull else 0)-.5*max(0,-mae-.05)
                    if not p['utilityLabelValid'] or not close(utility,p['utility']):audit['utilityDifferences'].append(key)
                source_score=source_signals[(day['signalDate'],p['symbol'])]
                if any(p['sourceSignals'][k]!=source_score[k] or p['signals'][k]!=source_score[k] for k in categories):audit['categoryDifferences'].append(key)
                if not p['modelActive']:value=source_score['overall_score']
                else:
                    fit=fits[p['fitScope']+'_'+p['weightFamily']];units=fit['weightMillionths'];values=[source_score[k] for k in categories]
                    if p['weightFamily']=='arithmetic':value=(sum(w*v for w,v in zip(units,values))+500000)//1000000
                    elif 0 in values:value=0
                    else:value=int(math.floor(math.prod(v**(w/1000000) for w,v in zip(units,values))+.5))
                if value!=p['signals']['overall_score']:audit['publishedScoreDifferences'].append(key)
                old=p['sourceLabel']
                if not old or old.get('status') not in ['hit','miss']:audit['expectedUnavailableSourceLabels'].append({'selection':key,'sourceStatus':old.get('status') if old else None,'zeroVolumeFlag':zero})
for fit in fits.values():
    if any(days[di[row['date']]+5]>=fit['activationDate'] for row in fit['trainingDateCounts']):audit['maturityViolations'].append([fit['scope'],fit['family']])
audit['generatedAtUTC']=datetime.datetime.now(datetime.timezone.utc).isoformat();audit['sourceHashes']={str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [source,base/'current-signals.ndjson',out/'weights.json',out/'inner-ledger.json',out/'outer-ledger.json',pathlib.Path(__file__)]}
(out/'independent-raw-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2));print(json.dumps(audit,ensure_ascii=False))
assert not any(audit[k] for k in ['rawBarDifferences','markDifferences','utilityDifferences','categoryDifferences','publishedScoreDifferences','maturityViolations'])
