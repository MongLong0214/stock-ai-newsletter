"""Whole-sample block-length sensitivity; fixed selections and point estimates."""
import json
from pathlib import Path
import numpy as np
import paired_statistics as stats
B=Path('/tmp/composite-score-experimental-20260930/paired-statistics');p=B/'results/statistics.json';old=json.loads(p.read_text());before_original=stats.sha(p)
config=json.loads((B/'frozen-inputs.json').read_text());policies,before,helper=stats.preflight(config)
dates=[d['signalDate'] for d in next(iter(policies.values()))['days']];arrays={};metadata={}
for name,run in policies.items():
 assert [d['signalDate'] for d in run['days']]==dates
 vals=[];mm=[]
 for d in run['days']:
  v,m=stats.row_stats(d,helper);vals.append([v[k] for k in stats.METRICS]);mm.append(m)
 arrays[name]=np.asarray(vals,dtype=float);metadata[name]=mm
# In-process parameter only; original stats script/results are untouched.
stats.BLOCK=20;r=stats.scope_summary(arrays,metadata,dates,dates);keys=['touch','L5','ANYnegativeD5','netD5','FPnetLower','FPnetUpper'];checks=0
for name,z in r['policies'].items():
 for metric in stats.METRICS:
  a=old['scopes']['whole2023_2024']['policies'][name]['metrics'][metric]['point'];b=z['metrics'][metric]['point'];assert a==b;(checks:=checks+1)
 r['policies'][name]={'counts':z['counts'],'metrics':{k:z['metrics'][k] for k in keys},'unknownEventBounds':{k:z['unknownEventBounds'][k] for k in keys if k in z['unknownEventBounds']}}
r['pairedCandidateMinusBaseline']={name:{k:z[k] for k in keys} for name,z in r['pairedCandidateMinusBaseline'].items()};r.pop('pairedUnknownEventDifferenceBounds')
after={p:stats.sha(p) for p in before};assert before==after and stats.sha(p)==before_original
out={'schema':'fixed-primary-block20-sensitivity-v1','scope':'whole2023_2024 only; exact same five frozen candidates and two baselines','bootstrap':{'blockSignalDays':20,'replicates':1000,'seed':42,'method':'noncircular overlapping moving blocks; truncate sampled final block','CI':'95% percentile, unadjusted descriptive intervals'},'pointEstimateEqualityChecks':checks,'allPointEstimatesIdenticalToBlock10':True,'originalBlock10Path':str(p),'originalBlock10Sha256Before':before_original,'originalBlock10Sha256After':stats.sha(p),'sourceHashesBefore':before,'sourceHashesAfter':after,'sourceBytesUnchanged':True,'modelFitSelectionOrTuning':False,'productMutations':0,'result':r}
stats.write(B/'results/block20-sensitivity.json',out);print(json.dumps({'pointsIdentical':checks,'sourceBytesUnchanged':True,'output':str(B/'results/block20-sensitivity.json')}))
