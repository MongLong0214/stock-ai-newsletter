import json,hashlib,math
from pathlib import Path
from collections import Counter
base=Path('/tmp/composite-score-research-20260930/earlier-training')
m=json.loads((base/'manifest.json').read_text())
fresh=json.loads(Path('/tmp/stock-research-fresh-mature-20260930/input/metadata.json').read_text())
calendar=fresh['tradingDays'];idx={d:i for i,d in enumerate(calendar)};cut=m['originalTrainCutoff'];dates=m['output']['dates'];date_set=set(dates)
expected_dates=[d for i,d in enumerate(calendar) if i>=79 and i+5<len(calendar) and calendar[i+5]<cut]
assert dates==expected_dates
masters={r['symbol'] for r in m['currentMasters']};assert len(masters)==2431
raw={};raw_hash=hashlib.sha256()
for line in Path(m['rawInput']['path']).open('rb'):
 raw_hash.update(line);symbol,rows=json.loads(line)
 if symbol in masters or symbol=='KOSPI':raw[symbol]={r['trade_date']:r for r in rows if r['trade_date']<cut}
assert raw_hash.hexdigest()==m['rawInput']['sha256']
assert all(d<cut for rows in raw.values() for d in rows)

def near(a,b):return a==b or isinstance(a,(int,float)) and isinstance(b,(int,float)) and math.isclose(a,b,rel_tol=1e-12,abs_tol=1e-12)
wh=hashlib.sha256();seen=set();bydate=Counter();counts=Counter();max_label_date='';min_history=10**9;max_history=0;sample_rows=[]
for line in Path(m['output']['path']).open('rb'):
 wh.update(line);r=json.loads(line);d=r['date'];s=r['symbol'];key=(d,s)
 assert d in date_set and s in masters and key not in seen;seen.add(key);bydate[d]+=1
 assert r['feature']['simDate']==d and r['feature']['symbol']==s
 assert all(isinstance(v,int) and 0<=v<=100 for v in r['signals'].values()) and len(r['signals'])==7
 hs=r['researchHistory']['featureHistoryCalendarSessions'];assert hs==idx[d]+1 and hs>=80;min_history=min(min_history,hs);max_history=max(max_history,hs)
 assert r['researchHistory']['position52wObservations']==r['feature']['position52wObservations']
 expected_neutral=not (r['feature']['position52wFullWindow'] and r['feature']['position52wObservations']>=252)
 assert r['researchHistory']['position52wUsesNeutralScore']==expected_neutral
 counts['partialPositionNeutral' if expected_neutral else 'fullPosition']+=1
 row=raw.get(s,{}).get(d)
 assert r['flags']['currentKis']==bool(row and row['source']=='kis')
 if row:
  for field in ['open','high','low','close','volume']:assert near(r['feature'][field],row[field])
 assert r['flags']['preCommonPool']==(r['flags']['currentKis'] and r['flags']['hasCalculatedOutputMetrics'])
 if r['flags']['preCommonPool']:counts['preCommonPool']+=1
 lab=r['label']
 if lab is not None:
  counts['labels']+=1;counts['label_'+lab['status']]+=1
  assert r['flags']['preCommonPool']
  future=calendar[idx[d]+1:idx[d]+6];assert len(future)==5 and max(future)<cut
  max_label_date=max(max_label_date,future[-1]);assert lab['entryDate']==future[0]
  if lab['status'] in ['hit','miss']:
   rows=[raw[s][day] for day in future];entry=rows[0]['open'];high=max(x['high'] for x in rows);low=min(x['low'] for x in rows)
   assert near(lab['entry'],entry) and near(lab['entryVolume'],rows[0]['volume']) and near(lab['maxHigh'],high)
   touch=math.floor(high+.5)*100>=math.floor(entry+.5)*110
   assert lab['touched']==touch and lab['status']==('hit' if touch else 'miss')
   assert near(lab['return5d'],rows[-1]['close']/entry-1)
   assert near(lab['entryReturn'],rows[0]['close']/entry-1)
   assert lab['entryBullish']==(rows[0]['close']>entry)
   assert near(lab['maxDrawdown'],min(0,low/entry-1))
   counts['validLabelsIndependentlyRecomputed']+=1
 if len(sample_rows)<3 and r['flags']['preCommonPool']:sample_rows.append({'date':d,'symbol':s,'historySessions':hs,'positionObservations':r['feature']['position52wObservations']})
assert wh.hexdigest()==m['output']['sha256'] and len(seen)==m['output']['rows']
assert all(bydate[d]==2431 for d in dates)
ch=hashlib.sha256();cseen=set();cbydate=Counter();benchmark_days={};context_counts=Counter()
for line in Path(m['contextOutput']['path']).open('rb'):
 ch.update(line);r=json.loads(line);d=r['date'];s=r['symbol'];key=(d,s);c=r['context']
 assert d in date_set and s in masters and key not in cseen;cseen.add(key);cbydate[d]+=1
 assert c['breadthUniverseSymbols']==2431 and c['benchmarkSymbol']=='KOSPI'
 if d not in benchmark_days:
  def ret(period):
   hist=calendar[idx[d]-period:idx[d]+1];rows=[raw.get('KOSPI',{}).get(x) for x in hist]
   if len(hist)!=period+1 or not all(x and x['close']>0 for x in rows):return None
   return (rows[-1]['close']/rows[0]['close']-1)*100
  hist20=calendar[idx[d]-19:idx[d]+1];rows20=[raw.get('KOSPI',{}).get(x) for x in hist20]
  sma=(rows20[-1]['close']/(sum(x['close'] for x in rows20)/20)-1)*100 if len(rows20)==20 and all(x and x['close']>0 for x in rows20) else None
  benchmark_days[d]={'return20':ret(20),'return60':ret(60),'sma20distance':sma}
 expected=benchmark_days[d]
 assert near(c['benchmarkReturn20Percent'],expected['return20']) and near(c['benchmarkSma20DistancePercent'],expected['sma20distance'])
 for metric in ['benchmarkReturn20Percent','benchmarkSma20DistancePercent','relativeReturn20PercentagePoints','relativeReturn60PercentagePoints']:
  context_counts[metric+('_null' if c[metric] is None else '_nonNull')]+=1
 for value in c.values():
  if isinstance(value,(int,float)):assert math.isfinite(value)
assert ch.hexdigest()==m['contextOutput']['sha256'] and len(cseen)==len(seen) and cseen==seen
assert all(cbydate[d]==2431 for d in dates)
report={'earlierSignalDays':len(dates),'signalRange':[dates[0],dates[-1]],'labelMaturityStrictCutoff':cut,'latestLabelPriceDate':max_label_date,'labelSignalsInOriginalTrainOrLater':0,'prefixCalendarSessions':[min_history,max_history],'currentMasters':len(masters),'wideRows':len(seen),'contextRows':len(cseen),'wideAndContextKeysMatchExactly':True,'outputHashesIndependentlyVerified':True,'rawInputHashUnchanged':True,'noOtherResearchPointFilesOpened':True,'counts':dict(counts),'contextCounts':dict(context_counts),'benchmarkReturn20CoveredDays':sum(v['return20'] is not None for v in benchmark_days.values()),'benchmarkReturn60CoveredDays':sum(v['return60'] is not None for v in benchmark_days.values()),'benchmarkSma20CoveredDays':sum(v['sma20distance'] is not None for v in benchmark_days.values()),'sampleFirstValidRows':sample_rows,'exportLabelOutsideAllowedWindowReads':m['counts']['labelOutsideAllowedWindowReads'],'exportLabelOutsideEarlierSignalSetCalls':m['counts']['labelOutsideTrainCalls'],'sourceFilesChangedWhileRunning':m['sourceFilesChangedWhileRunning'],'limitation':'Current-master/status survivorship bias and 80-314-session research history; production uses 320 sessions. Earlier rows are new to this requested analysis, not an independent untouched holdout.'}
(base/'audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
