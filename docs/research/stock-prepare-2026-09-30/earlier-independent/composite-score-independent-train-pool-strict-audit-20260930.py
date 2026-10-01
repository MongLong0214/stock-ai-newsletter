import collections, hashlib, json, math, pathlib, statistics

B = pathlib.Path('/tmp/composite-score-research-20260930')
WIDE = B / 'wide-training.ndjson'
MANIFEST = B / 'wide-training-manifest.json'
PRICES = pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson')
META = pathlib.Path('/tmp/stock-research-fresh-mature-20260930/features/metadata.json')
manifest = json.loads(MANIFEST.read_text())
assert hashlib.file_digest(WIDE.open('rb'), 'sha256').hexdigest() == manifest['output']['sha256']
train = manifest['output']['dates']
calendar = json.loads(META.read_text())['tradingDays']
ci = {d:i for i,d in enumerate(calendar)}
label_dates = {d:calendar[ci[d]+1:ci[d]+6] for d in train}
allowed = set().union(*map(set,label_dates.values()))
raw = {}
for line in PRICES.open():
    s, rows = json.loads(line)
    raw[s] = {r['trade_date']:tuple(r[k] for k in ['open','high','low','close','volume']) for r in rows if r['trade_date'] in allowed and r['source']=='kis'}

def mark(symbol,date):
    rr = [raw.get(symbol,{}).get(d) for d in label_dates[date]]
    complete = len(rr)==5 and all(r is not None for r in rr)
    ohlc = complete and all(all(isinstance(v,(float,int)) and math.isfinite(v) and v>0 for v in r[:4]) and r[2]<=min(r[0],r[3])<=max(r[0],r[3])<=r[1] for r in rr)
    volume = complete and all(isinstance(r[4],(float,int)) and math.isfinite(r[4]) and r[4]>0 for r in rr)
    result = {'validStrict5Bars':bool(ohlc and volume),'missingBar':not complete,'badOhlc':bool(complete and not ohlc),'zeroOrBadVolume':bool(complete and not volume)}
    if result['validStrict5Bars']:
        entry = rr[0][0]
        net = rr[-1][3]/entry-1-.003
        touch = max(r[1] for r in rr)>=entry*110/100
        result.update({'net':net,'touch':touch,'bullish':rr[0][3]>entry,'positive':net>0,'jointTouchPositive':touch and net>0,'mae':min(0,min(r[2] for r in rr)/entry-1)})
    return result

groups=collections.defaultdict(list)
source_mismatch=[]
count=0
for line in WIDE.open():
    p=json.loads(line)
    assert p['date'] in label_dates
    flags=p['flags']; f=p['feature']
    if not flags['preCommonPool']: continue
    count+=1
    p['actual']=mark(p['symbol'],p['date'])
    a=p['actual']; label=p['label']
    if a['validStrict5Bars'] and label['status'] in ['hit','miss'] and (abs(a['net']-(label['return5d']-.003))>1e-12 or a['touch']!=label['touched'] or a['bullish']!=label['entryBullish']):source_mismatch.append([p['date'],p['symbol']])
    candle = f['close']/f['open']-1 if f['open'] else None
    close_change = (1+f['gapFromPreviousClosePercent']/100)*(f['close']/f['open'])-1 if f['gapFromPreviousClosePercent'] is not None and f['open'] else None
    target_other = flags['notPreferredShare'] and flags['signalDayReturnBelow10pct'] and f['atrPercent14'] is not None and math.isfinite(f['atrPercent14'])
    predicates = {
        'preCommonPool':True,
        'commonGate75':flags['commonGate75'],
        'originalTargetEligible':flags['priorTargetEligible'],
        'excludedAnyCommonGate':not flags['commonGate75'],
        'rsiAbove75OtherCommonChecksPass':flags['commonGateNoRsiCeiling'] and not flags['rsiAtMost75'],
        'rsiAbove75OtherTargetChecksPass':flags['commonGateNoRsiCeiling'] and not flags['rsiAtMost75'] and target_other,
        'turnoverBelow500mOtherCommonChecksPass':flags['commonGateNoTurnoverFloor'] and not flags['turnoverAtLeast500m'],
        'turnoverBelow500mOtherTargetChecksPass':flags['commonGateNoTurnoverFloor'] and not flags['turnoverAtLeast500m'] and target_other,
        'signal10ExclusionOtherTargetChecksPass':flags['commonGate75'] and flags['notPreferredShare'] and not flags['signalDayReturnBelow10pct'],
        'signalCandleAtLeast10OtherTargetChecksPass':flags['commonGate75'] and flags['notPreferredShare'] and candle is not None and candle>=.10,
        'signalCloseChangeAtLeast10OtherTargetChecksPass':flags['commonGate75'] and flags['notPreferredShare'] and close_change is not None and close_change>=.10,
        'preferredExcludedCommonGatePass':flags['commonGate75'] and not flags['notPreferredShare'],
        'eligibleScoreAtLeast70':flags['priorTargetEligible'] and p['signals']['overall_score']>=70,
        'eligibleScoreAtLeast70Sma20ExtensionAbove15':flags['priorTargetEligible'] and p['signals']['overall_score']>=70 and f['sma20DistancePercent'] is not None and f['sma20DistancePercent']>15,
        'eligibleScoreAtLeast70Sma20ExtensionAtMost15':flags['priorTargetEligible'] and p['signals']['overall_score']>=70 and f['sma20DistancePercent'] is not None and f['sma20DistancePercent']<=15,
    }
    # Retain all rows in descriptive group denominators, including unknown outcomes.
    for k,yes in predicates.items():
        if yes:groups[k].append(p)

def summary(pp):
    valid=[p for p in pp if p['actual']['validStrict5Bars']]
    n=len(valid); rr=[p['actual']['net'] for p in valid]
    bydate=collections.defaultdict(list)
    for p in valid:bydate[p['date']].append(p['actual'])
    return {'rows':len(pp),'dates':len({p['date'] for p in pp}),'sourceStatusCounts':dict(collections.Counter(p['label']['status'] for p in pp)),'strict5Bars':n,'strictMissing':len(pp)-n,'missingBarCount':sum(p['actual']['missingBar'] for p in pp),'badOhlcCount':sum(p['actual']['badOhlc'] for p in pp),'zeroOrBadVolumeCount':sum(p['actual']['zeroOrBadVolume'] for p in pp),'touchCount':sum(p['actual']['touch'] for p in valid),'positiveD5NetCount':sum(p['actual']['positive'] for p in valid),'touchAndPositiveD5NetCount':sum(p['actual']['jointTouchPositive'] for p in valid),'D1bullishCount':sum(p['actual']['bullish'] for p in valid),'loss5Count':sum(r<=-.05 for r in rr),'loss10Count':sum(r<=-.10 for r in rr),'touchRate':sum(p['actual']['touch'] for p in valid)/n if n else None,'positiveD5NetRate':sum(p['actual']['positive'] for p in valid)/n if n else None,'touchAndPositiveD5NetRate':sum(p['actual']['jointTouchPositive'] for p in valid)/n if n else None,'D1bullishRate':sum(p['actual']['bullish'] for p in valid)/n if n else None,'loss5Rate':sum(r<=-.05 for r in rr)/n if n else None,'loss10Rate':sum(r<=-.10 for r in rr)/n if n else None,'meanD5Net30bps':statistics.mean(rr) if n else None,'medianD5Net30bps':statistics.median(rr) if n else None,'meanMAE':statistics.mean(p['actual']['mae'] for p in valid) if n else None,'signalDateBalanced':{'daysWithStrictLabels':len(bydate),'touchRate':statistics.mean(statistics.mean(p['touch'] for p in v) for v in bydate.values()) if bydate else None,'meanD5Net30bps':statistics.mean(statistics.mean(p['net'] for p in v) for v in bydate.values()) if bydate else None,'loss5Rate':statistics.mean(statistics.mean(p['net']<=-.05 for p in v) for v in bydate.values()) if bydate else None,'loss10Rate':statistics.mean(statistics.mean(p['net']<=-.10 for p in v) for v in bydate.values()) if bydate else None}}

out=pathlib.Path('/tmp/composite-score-independent-train-pool-strict-audit-20260930.json')
report={'scope':'TRAIN80 descriptive gate exclusions, no VAL/TEST label accesses, score/threshold/model optimization, source/UI/copy/production changes. Each group requires preCommonPool (current active/calculated snapshot), and reason-only groups preserve all other actual common/target checks and current status where named. Strict5Bar statistics require independent raw D1-D5 positive consistent OHLC and all5 positive-volume bars; unknown outcomes remain counted outside conditional metrics. Signalcap>=10 OR candle>=10 groups overlap. No causal/performance-promotion claims. Highscore70/extension15 thresholds are fixed existing descriptive thresholds, not fitted.','signalDates':{'from':min(train),'through':max(train),'count':len(train)},'labelPriceDates':{'from':min(allowed),'through':max(allowed),'count':len(allowed)},'preCommonRows':count,'strictRawVsKnownSourceLabelDifferences':source_mismatch,'results':{k:summary(v) for k,v in groups.items()},'inputHashes':{str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [WIDE,MANIFEST,PRICES,META,pathlib.Path(__file__)]},'limitations':['Current master/status snapshot cannot represent delisted/inactive historical members','KIS/database OHLC may be adjusted and mixed-vintage; not certified exchange raw/unadjusted prices','Fixed30bps does not establish executable small-cap returns','Pooled same stocks and overlapping5-session windows are dependent; date-balanced metrics included','TRAIN descriptive cohorts cannot justify new thresholds or a next-day success guarantee']}
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'report':str(out),'rows':count,'sourceLabelDifferences':len(source_mismatch),'results':report['results']},ensure_ascii=False))
