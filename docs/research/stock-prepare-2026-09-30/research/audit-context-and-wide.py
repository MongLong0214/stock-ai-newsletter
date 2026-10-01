import json,hashlib,subprocess
from pathlib import Path
from collections import Counter
from itertools import islice
base=Path('/tmp/composite-score-research-20260930')
wm=json.loads((base/'wide-training-manifest.json').read_text())
cm=json.loads((base/'technical-context-manifest.json').read_text())
train=set(wm['output']['dates'])
assert len(train)==80
baseline={}
with Path('/tmp/upside-scored.ndjson').open() as f:
 for line in islice(f,80):
  date,points=json.loads(line)
  assert date in train
  for point in points:
   key=(date,point['symbol'])
   baseline[key]=(point['feature'],point['label'])
corrected={}
with (base/'current-signals.ndjson').open() as f:
 for line in f:
  row=json.loads(line)
  if row['provenance']=='primary' and row['date'] in train:
   corrected[(row['date'],row['symbol'])]=row['signals']
seen=set();whash=hashlib.sha256();date_counts=Counter();counts=Counter();mismatches={'feature':[],'label':[],'signals':[]}
for line in (base/'wide-training.ndjson').open('rb'):
 whash.update(line);r=json.loads(line);key=(r['date'],r['symbol'])
 assert r['date'] in train and key not in seen;seen.add(key)
 assert r['feature']['simDate']==r['date'] and r['feature']['symbol']==r['symbol']
 assert len(r['signals'])==7 and all(isinstance(v,int) and 0<=v<=100 for v in r['signals'].values())
 date_counts[r['date']]+=1
 if r['label'] is not None:
  assert r['flags']['preCommonPool'];counts['labels']+=1
  counts['label_'+r['label']['status']]+=1
 counts['preCommonPool']+=int(r['flags']['preCommonPool'])
 for flag in ['commonGate75','commonGate70','priorTargetEligible']:
  counts[flag+'_within_preCommonPool']+=int(r['flags']['preCommonPool'] and r['flags'][flag])
 if key in baseline:
  counts['original_train_points_matched']+=1
  oldf,oldl=baseline[key]
  for field,actual,expected in [('feature',r['feature'],oldf),('label',r['label'],oldl),('signals',r['signals'],corrected[key])]:
   if actual!=expected:mismatches[field].append({'date':key[0],'symbol':key[1]})
assert whash.hexdigest()==wm['output']['sha256']
assert len(seen)==wm['output']['rows']
assert all(v==wm['currentMasterCount'] for v in date_counts.values())
assert counts['original_train_points_matched']==len(baseline)
assert not any(mismatches.values()),{k:len(v) for k,v in mismatches.items()}
chash=hashlib.sha256();seen_context=set();context_dates=Counter()
for line in (base/'technical-context.ndjson').open('rb'):
 chash.update(line);r=json.loads(line);key=(r['date'],r['symbol'])
 assert key not in seen_context;seen_context.add(key);context_dates[r['date']]+=1
 assert r['context']['breadthUniverseSymbols']==cm['currentMasterCount']
 assert r['context']['benchmarkSymbol']=='KOSPI'
assert len(seen_context)==cm['output']['rows'] and chash.hexdigest()==cm['output']['sha256']
assert all(v==cm['currentMasterCount'] for v in context_dates.values())
old_source=subprocess.check_output(['git','show','97b0c2ffa7b89a7ffdd4bae53e4c0e416e00f22f:scripts/stock-picks/generate-picks.ts'],text=True)
new_source=Path('/Users/isaac/WebstormProjects/stock-ai-newsletter/scripts/stock-picks/generate-picks.ts').read_text()
def metric_fn(s):return s[s.index('export const hasCalculatedOutputMetrics'):s.index('\nexport function buildRationale')]
assert metric_fn(old_source)==metric_fn(new_source)
report={'contextOutputHashAndAllRowsVerified':True,'contextRows':len(seen_context),'contextDays':len(context_dates),'wideOutputHashAndAllRowsVerified':True,'wideRows':len(seen),'wideDays':len(date_counts),'allWideOutputDatesAreTraining':True,'baselinePointOutcomesAccessedOnlyFirst80TrainingLines':True,'baselineTrainingPoints':len(baseline),'wideOverlapWithOriginalTrainingPoints':counts['original_train_points_matched'],'featureLabelAndCorrectedSignalMismatches':{k:len(v) for k,v in mismatches.items()},'counts':dict(counts),'hasCalculatedOutputMetricsMainAndCurrentByteIdentical':True,'hasCalculatedOutputMetricsSha256':hashlib.sha256(metric_fn(new_source).encode()).hexdigest(),'rawInputUnchangedDuringExport':wm['inputUnchanged'],'noDatabaseOrNetworkCalls':True}
(base/'context-wide-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
