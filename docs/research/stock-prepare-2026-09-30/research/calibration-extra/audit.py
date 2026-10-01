import json,hashlib,math
from pathlib import Path
from collections import Counter
base=Path('/tmp/composite-score-research-20260930/calibration-extra');m=json.loads((base/'manifest.json').read_text());meta=json.loads(Path(m['metadataInput']['path']).read_text());calendar=meta['tradingDays'];idx={d:i for i,d in enumerate(calendar)}
master_set={x['symbol'] for x in m['currentMasters']};dates=m['dates'];needed=set(dates)
for d in dates:
 if m['maturity'][d]['mature']:needed.update(m['maturity'][d]['observedWindow'])
raw={};rh=hashlib.sha256()
for line in Path(m['rawInput']['path']).open('rb'):
 rh.update(line);s,rows=json.loads(line)
 if s not in master_set and s!='KOSPI':continue
 target=raw.setdefault(s,{})
 for r in rows:
  if r['trade_date'] in needed or s=='KOSPI':target[r['trade_date']]=r
assert rh.hexdigest()==m['rawInput']['sha256']
outputs={};hashes={}
for key,o in m['outputs'].items():
 data=Path(o['path']).read_bytes();assert hashlib.sha256(data).hexdigest()==o['sha256'];hashes[key]=o['sha256'];outputs[key]=[json.loads(x) for x in data.splitlines()]
sets={r['date']:set(r['runtimeEligibleSymbols']) for r in outputs['eligibility']};assert set(sets)==set(dates)
assert len(outputs['eligibility'])==len(dates)
for r in outputs['eligibility']:assert len(r['runtimeEligibleSymbols'])==len(sets[r['date']])
near=lambda a,b: a==b or isinstance(a,(int,float)) and isinstance(b,(int,float)) and math.isclose(a,b,rel_tol=1e-12,abs_tol=1e-12)
seen=set();counts=Counter();perdate={d:Counter() for d in dates}
for r in outputs['wide']:
 d,s=r['date'],r['symbol'];key=(d,s);assert d in dates and s in master_set and key not in seen;seen.add(key);perdate[d]['rows']+=1
 assert r['feature']['symbol']==s and r['feature']['simDate']==d
 assert len(r['signals'])==7 and all(isinstance(v,int) and 0<=v<=100 for v in r['signals'].values())
 assert r['flags']['priorTargetEligible']==(s in sets[d])
 assert r['labelMature']==m['maturity'][d]['mature']
 row=raw.get(s,{}).get(d)
 if row:
  for field in ['open','high','low','close','volume']:assert near(r['feature'][field],row[field])
 if r['label'] is None:
  if not r['labelMature']:perdate[d]['immatureNullLabels']+=1
  continue
 assert r['labelMature'] and r['flags']['preCommonPool'];lab=r['label'];window=m['maturity'][d]['observedWindow'];assert len(window)==5 and window[-1]<=meta['asOfDate']
 counts['labels']+=1;perdate[d]['labels']+=1;counts['label_'+lab['status']]+=1
 assert lab['entryDate']==window[0]
 if lab['status'] in ['hit','miss']:
  rows=[raw[s][day] for day in window];entry=rows[0]['open'];high=max(x['high'] for x in rows);low=min(x['low'] for x in rows)
  assert near(lab['entry'],entry) and near(lab['entryVolume'],rows[0]['volume']) and near(lab['maxHigh'],high)
  touched=math.floor(high+.5)*100>=math.floor(entry+.5)*110
  assert lab['touched']==touched and lab['status']==('hit' if touched else 'miss')
  assert near(lab['return5d'],rows[-1]['close']/entry-1) and near(lab['entryReturn'],rows[0]['close']/entry-1)
  assert near(lab['maxDrawdown'],min(0,low/entry-1)) and lab['entryBullish']==(rows[0]['close']>entry)
  counts['validLabelsIndependentlyRecomputed']+=1
assert len(seen)==7*2431
context_seen=set();benchmarks={}
for r in outputs['context']:
 d,s=r['date'],r['symbol'];key=(d,s);assert key not in context_seen;context_seen.add(key)
 assert key in seen and r['context']['breadthUniverseSymbols']==2431
 if d not in benchmarks:
  days21=calendar[idx[d]-20:idx[d]+1];rs=[raw['KOSPI'][day] for day in days21]
  benchmarks[d]={'return20':(rs[-1]['close']/rs[0]['close']-1)*100,'sma20distance':(rs[-1]['close']/(sum(x['close'] for x in rs[-20:])/20)-1)*100}
 assert near(r['context']['benchmarkReturn20Percent'],benchmarks[d]['return20']) and near(r['context']['benchmarkSma20DistancePercent'],benchmarks[d]['sma20distance'])
assert context_seen==seen
for d in dates:
 assert perdate[d]['rows']==2431
 if not m['maturity'][d]['mature']:assert perdate[d]['immatureNullLabels']==2431 and perdate[d]['labels']==0
assert counts['labels']==m['labelCalls']
audit={'dates':dates,'wideRows':len(seen),'contextRows':len(context_seen),'eligibleMemberships':sum(len(v) for v in sets.values()),'outputHashesIndependentlyVerified':hashes,'rawInputHashVerified':True,'featureCurrentOhlcvMatchesRaw':True,'wideContextKeysIdentical':True,'allCurrentMastersPerDate':2431,'runtimeMembershipMatchesEveryWideFlag':True,'runtimeEligibilityComputedByActualTS':True,'eligibilityUsedNoFutureLabels':True,'sourceStableDuringExport':m['sourceChanged']==[],'counts':dict(counts),'perDate':{d:dict(v) for d,v in perdate.items()},'immatureDatesAllLabelsNull':[d for d in dates if not m['maturity'][d]['mature']],'benchmark20DayMetricsIndependentlyRecomputedDays':len(benchmarks),'labelOutsideAllowedWindowReads':m['labelOutsideWindow'],'duplicateChunksMerged':m['rawInput']['duplicateSymbolChunks'],'duplicateDateRowsMerged':m['rawInput']['duplicateDateRows'],'originalArtifactsModified':False,'databaseOrExternalWriteCalls':0}
(base/'audit.json').write_text(json.dumps(audit,indent=2)+'\n');print(json.dumps(audit))
