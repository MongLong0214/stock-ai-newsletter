import collections, hashlib, json, math, pathlib, statistics

BASE=pathlib.Path('/tmp/composite-score-research-20260930')
meta=json.loads(pathlib.Path('/tmp/stock-target-rebuilt-20260929/metadata.json').read_text())
train=set(meta['evaluationDates'][:80])
export={}
for line in (BASE/'current-signals.ndjson').open():
    p=json.loads(line)
    export[(p['provenance'],p['date'],p['symbol'])]=p['signals']
clamp=lambda x:max(0,min(100,x))
score=lambda x:math.floor(clamp(x)+.5)
center=lambda x,b:score(50+x/b*50) if x is not None and math.isfinite(x) else 50
avg=lambda a:score(statistics.mean(a))
weights={'trend_score':.20,'momentum_score':.15,'volume_score':.25,'volatility_score':.10,'pattern_score':.20,'sentiment_score':.10}
errors=[];joined=0;eligible_train=0;atoms=collections.defaultdict(list);categories=collections.defaultdict(list);witnesses={}
for provenance,path in [('primary',pathlib.Path('/tmp/upside-scored.ndjson')),('fresh-mature',pathlib.Path('/tmp/stock-research-fresh-mature-20260930/scored.ndjson'))]:
    for line in path.open():
        d,pp=json.loads(line)
        for p in pp:
            f=p['feature'];close=f['close'];s60=(close/f['sma60']-1)*100;smax=(f['sma20']/f['sma60']-1)*100;macd=f['macdHistogram']/close*100
            obv=f['obvSlope20']/(f['volume']/f['volumeRatio20']);pos=score(f['position52w']*100) if f['position52wFullWindow'] and f['position52wObservations']>=252 else 50
            a={'closeToSma20':center(f['sma20DistancePercent'],10),'closeToSma60':center(s60,20),'sma20DailyLogSlope':center(f['sma20Slope5']*100,1),'signedTrendFit':score(50+(1 if f['trendSlope20']>0 else -1 if f['trendSlope20']<0 else 0)*min(1,max(0,f['trendR2_20']))*50),'rsi':score(f['rsi14']),'macdPercent':center(macd,2),'bullishCandleMomentum':65 if f['bullishCandle'] else 35,'consecutiveUpDays':score(50+f['consecutiveUpDays']*10),'volumePercentile':score(f['volumePercentile60']),'volumeRatio':center(f['volumeRatio20']-1,2),'normalizedObv':center(obv,.5),'atr3Preference':score(100-abs(f['atrPercent14']-3)*20),'prior60HighDistance':center(f['distanceFromHigh60'],5),'bullishCandlePattern':70 if f['bullishCandle'] else 30,'sma20ToSma60':center(smax,5),'full252PricePosition':pos,'dailyLogTrendSlope':center(f['trendSlope20']*100,1)}
            s={'trend_score':avg([a[k] for k in ['closeToSma20','closeToSma60','sma20DailyLogSlope','signedTrendFit']]),'momentum_score':avg([a[k] for k in ['rsi','macdPercent','bullishCandleMomentum','consecutiveUpDays']]),'volume_score':avg([a[k] for k in ['volumePercentile','volumeRatio','normalizedObv']]),'volatility_score':a['atr3Preference'],'pattern_score':avg([a[k] for k in ['prior60HighDistance','bullishCandlePattern','sma20ToSma60','full252PricePosition']]),'sentiment_score':avg([a[k] for k in ['full252PricePosition','dailyLogTrendSlope','consecutiveUpDays']])}
            # Match the JavaScript left-associative additions; Python3.12 sum()
            # compensates float sums and can cross a mathematical half-point.
            weighted=0.0
            for k,w in weights.items():weighted+=s[k]*w
            s['overall_score']=score(weighted)
            true=export.pop((provenance,d,p['symbol']),None);joined+=1
            if s!=true:errors.append({'date':d,'symbol':p['symbol'],'independent':s,'actualTS':true})
            if provenance=='primary' and d in train and p['eligible']:
                eligible_train+=1
                for k,v in a.items():atoms[k].append(v)
                for k,v in s.items():categories[k].append(v)
                atoms['rawDistance60'].append(f['distanceFromHigh60'])
                atoms['rawATR'].append(f['atrPercent14'])
                atoms['rawRsi'].append(f['rsi14'])
                atoms['partial252'].append(not f['position52wFullWindow'] or f['position52wObservations']<252)
                atoms['negativeTrend'].append(f['trendSlope20']<0)
                if f['distanceFromHigh60']>5 and 'positivePrior60HighBreakout' not in witnesses:witnesses['positivePrior60HighBreakout']={'date':d,'symbol':p['symbol'],'raw':f['distanceFromHigh60'],'atom':a['prior60HighDistance'],'pattern':s['pattern_score']}
                if f['trendSlope20']>0 and f['trendR2_20']>.9 and f['trendSlope20']*100<.1 and 'tinyPositiveTrendFitReward' not in witnesses:witnesses['tinyPositiveTrendFitReward']={'date':d,'symbol':p['symbol'],'slopePercentPerDay':f['trendSlope20']*100,'r2':f['trendR2_20'],'signedTrendFit':a['signedTrendFit'],'trend':s['trend_score']}

def summary(v):
    return {'count':len(v),'min':min(v),'max':max(v),'mean':statistics.mean(v),'median':statistics.median(v),'zeroCount':sum(x==0 for x in v),'hundredCount':sum(x==100 for x in v)}
raw=atoms['rawDistance60']
result={'scope':'Independent current math and training-only input audit. No outcome labels used for deciding transformations, weights or thresholds. No source/UI/copy edits. Not a formal PR review attempt.','sourceCommit':'97b0c2ffa7b89a7ffdd4bae53e4c0e416e00f22f','actualTSIndependentMathJoin':{'rows':joined,'differences':errors,'unmatchedOutputRows':len(export)},'trainInputWindow':{'from':meta['evaluationDates'][0],'through':meta['evaluationDates'][79],'signalDays':80,'eligibleRows':eligible_train},'categoryWeights':weights,'effectiveAtomicWeightsBeforeRounding':{'full252PricePosition':.20/4+.10/3,'consecutiveUpDays':.15/4+.10/3,'bullishCandle':.15/4+.20/4,'eachTrendAtom':.20/4,'eachVolumeAtom':.25/3,'ATR3Preference':.10,'highDistance60':.20/4,'SMA20ToSMA60':.20/4,'dailyLogTrendSlope':.10/3},'duplicateWitnesses':{'bullishCandleTotalBullMinusBearOverallPoints':(65-35)*.15/4+(70-30)*.20/4,'consecutiveUpDaysOneAdditionalDayOverallPointsBelowSaturation':10*(.15/4+.10/3),'full252PricePosition50To100OverallPoints':50*(.20/4+.10/3)},'trainCategoryRanges':{k:summary(v) for k,v in categories.items()},'trainAtomRanges':{k:summary(v) for k,v in atoms.items()},'distanceFromPrior60HighSignAudit':{'definition':'Current close / maximum of previous60 closes excluding current -1, in percent; positive breakout is valid. Earlier <=0-only claim was incorrect and has been withdrawn.','positiveCount':sum(v>0 for v in raw),'negativeCount':sum(v<0 for v in raw),'zeroCount':sum(v==0 for v in raw),'atOrBelowMinus5Count':sum(v<=-5 for v in raw),'atOrAbovePlus5Count':sum(v>=5 for v in raw)},'actualFeatureWitnesses':witnesses,'judgment':'Four earlier math repairs remain internally consistent. Current arbitrary scales, feature duplication and ATR3 preference describe historical technical conditions; they do not establish a five-day surge/safety objective. Constrained weights need independent chronological training-only validation, not a post-test score uplift.','sourceHashes':{str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [BASE/'current-signals.ndjson',BASE/'current-signals-manifest.json',BASE/'signals-main.ts',pathlib.Path('/Users/isaac/WebstormProjects/stock-ai-newsletter/scripts/stock-picks/indicators.ts'),pathlib.Path(__file__)]}}
out=pathlib.Path('/tmp/composite-score-independent-math-audit-20260930.json');out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'report':str(out),'rows':joined,'differences':len(errors),'unmatched':len(export),'trainEligible':eligible_train,'distanceSign':result['distanceFromPrior60HighSignAudit'],'duplicates':result['duplicateWitnesses'],'witnesses':witnesses},ensure_ascii=False))
