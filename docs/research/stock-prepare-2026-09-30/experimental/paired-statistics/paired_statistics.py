"""Frozen-ledger descriptive statistics; no fitting, no raw-universe reads.
Import and synthetic tests never open a primary ledger. main requires all five
TRAIN winners, producer-declared completed ledger hashes, and immutable helper.
"""
import argparse, collections, hashlib, importlib.util, json, math
from pathlib import Path
import numpy as np

DRAWS=1000; BLOCK=10; SEED=42; COST_BPS=30
EVENTS=['touch','L5','ANYnegativeD5','D1bull','FPtargetFirstLower','FPtargetFirstUpper','FPnegativeCertain','FPnegativePossible','FPloss5Certain','FPloss5Possible','FPambiguous','FPstopBeforeLaterTouch']
RETURNS=['netD5','FPnetLower','FPnetUpper','targetOnlyNet']
METRICS=EVENTS+RETURNS+['strictCoverage','scoreAll3AtLeast70','all3Touch','threePicksCoverage']

def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
 return h.hexdigest()

def write(path,data): Path(path).write_text(json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
def finite(v): return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def number(x): return float(x) if np.isfinite(x) else None

def bootstrap_weights(n):
 """Noncircular overlapping moving blocks, sample enough, truncate to n dates."""
 assert n>0
 length=min(BLOCK,n);rng=np.random.default_rng(SEED)
 starts=rng.integers(0,n-length+1,size=(DRAWS,math.ceil(n/length)))
 indices=(starts[:,:,None]+np.arange(length)[None,None,:]).reshape(DRAWS,-1)[:,:n]
 weights=np.zeros((DRAWS,n),dtype=np.int16)
 for row,ii in enumerate(indices):np.add.at(weights[row],ii,1)
 assert np.all(weights.sum(axis=1)==n)
 return weights

def ratio(numerator,denominator):
 return np.divide(numerator,denominator,out=np.full(np.broadcast_shapes(np.shape(numerator),np.shape(denominator)),np.nan,dtype=float),where=np.asarray(denominator)>0)

def ci(point,replicates):
 good=np.asarray(replicates)[np.isfinite(replicates)]
 return {'point':number(point),'lower95':float(np.quantile(good,.025)) if len(good) else None,'upper95':float(np.quantile(good,.975)) if len(good) else None,'finiteBootstrapReplicates':len(good)}

def row_stats(day,helper):
 # Numerator/denominator per date preserve each policy's own roster and unknowns.
 p=day['picks']; assert len(p)<=3 and len({x['symbol'] for x in p})==len(p)
 assert len(p)==day.get('pickedCount',len(p))
 stats={m:[0.,0.] for m in METRICS}; events_known=[];unknown=0
 for pick in p:
  o=pick['outcome'];strict=o['strictLabelValid']; assert isinstance(strict,bool)
  dates=[b['date'] for b in pick['dailyBars']]
  assert len(dates)==5 and dates[0]==pick['recommendationDate'] and dates[-1]==pick['expectedD5date']
  assert day['signalDate']<dates[0] and all('2023-01-01'<=d<='2025-01-15' for d in dates)
  z=helper(dates,{b['date']:b for b in pick['dailyBars']},entry_open=pick['D1open'])
  assert (z['status']=='known')==strict,('strict coverage mismatch',pick['symbol'],day['signalDate'])
  if not strict: unknown+=1;continue
  assert finite(o['net5d']) and isinstance(o['touch'],bool) and isinstance(o['entryBullish'],bool)
  fp=z['models']['targetStop'];s=next(x for x in z['costSensitivity'] if x['roundTripBps']==COST_BPS);v=s['targetStop']
  # Preserve original floating-comparison touch in ledger, helper exact-decimal FP separately.
  assert abs(o['net5d']-s['rawMark']['netD5'])<1e-10
  ev={'touch':o['touch'],'L5':o['net5d']<=-.05,'ANYnegativeD5':o['net5d']<0,'D1bull':o['entryBullish'],
   'FPtargetFirstLower':fp['conservative']['exitReason']=='target','FPtargetFirstUpper':fp['optimistic']['exitReason']=='target',
   'FPnegativeCertain':v['allNegativeCertain'],'FPnegativePossible':v['allNegativePossible'],
   'FPloss5Certain':v['lossAtLeast5PctCertain'],'FPloss5Possible':v['lossAtLeast5PctPossible'],'FPambiguous':fp['sameDayAmbiguous'],
   'FPstopBeforeLaterTouch':o['touch'] and fp['conservative']['exitReason'] in ['stop','stop_gap']}
  vals={**ev,'netD5':o['net5d'],'FPnetLower':v['netReturnLower'],'FPnetUpper':v['netReturnUpper'],'targetOnlyNet':s['targetOnly']['netReturn']}
  if 'T_safe' in o:
   assert o['T_safe']==ev['FPtargetFirstLower'] and o['L0_FP']==ev['FPnegativePossible'] and o['fpSameBarAmbiguous']==ev['FPambiguous']
   assert abs(o['fpNet30bps']-vals['FPnetLower'])<1e-10
  for m,x in vals.items():assert finite(x) or isinstance(x,bool);stats[m][0]+=float(x);stats[m][1]+=1
  events_known.append(o['touch'])
 known=len(p)-unknown
 stats['strictCoverage']=[known,len(p)]
 stats['scoreAll3AtLeast70']=[int(len(p)==3 and all(x['signals']['overall_score']>=70 for x in p)),1]
 stats['threePicksCoverage']=[int(len(p)==3),1]
 full_known=len(p)==3 and known==3
 stats['all3Touch']=[int(full_known and all(events_known)),int(full_known)]
 # Missing rosters cannot achieve all3; unknown only when roster has exactly3.
 day_unknown=int(len(p)==3 and not full_known)
 meta={'selected':len(p),'strictKnown':known,'unknown':unknown,'all3KnownDays':int(full_known),'all3UnknownDays':day_unknown,'shortfallDays':int(len(p)<3)}
 return stats,meta

def scope_summary(arrays,metadata,dates,all_dates):
 ii=np.array([all_dates.index(d) for d in dates]);w=bootstrap_weights(len(ii));out={};reps={}
 for policy,array in arrays.items():
  a=array[ii];totals=a.sum(axis=0);sample=np.einsum('dn,nmk->dmk',w,a,optimize=True)
  rr=ratio(sample[:,:,0],sample[:,:,1]);point=ratio(totals[:,0],totals[:,1]);reps[policy]=rr
  meta={k:int(sum(metadata[policy][i][k] for i in ii)) for k in metadata[policy][0]};bounds={}
  for j,m in enumerate(EVENTS):
   t=meta['selected'];knowntrue=totals[j,0];u=meta['unknown'];bounds[m]={'selected':t,'knownTrue':int(knowntrue),'unknown':u,'minimumTrueRateAllSelected':knowntrue/t if t else None,'maximumTrueRateAllSelected':(knowntrue+u)/t if t else None}
  j=METRICS.index('all3Touch');bounds['all3Touch']={'allSignalDays':len(ii),'knownTrueDays':int(totals[j,0]),'unknownCompleteRosterDays':meta['all3UnknownDays'],'minimumRateAllSignalDays':totals[j,0]/len(ii),'maximumRateAllSignalDays':(totals[j,0]+meta['all3UnknownDays'])/len(ii),'shortfallDaysAreFailures':True}
  out[policy]={'counts':meta,'metrics':{m:{**ci(point[j],rr[:,j]),'numerator':number(totals[j,0]),'denominator':int(totals[j,1])} for j,m in enumerate(METRICS)},'unknownEventBounds':bounds,'unknownNetD5Bound':'Unknown unbounded upside gives no finite worst/best identification interval; conditional mean and unknown count are reported. No invented imputation.'}
 deltas={}
 for candidate in arrays:
  if candidate in ['currentOverall','ATRbaseline']:continue
  for base in ['currentOverall','ATRbaseline']:
   key=candidate+' minus '+base
   deltas[key]={m:ci((out[candidate]['metrics'][m]['point']-out[base]['metrics'][m]['point']) if out[candidate]['metrics'][m]['point'] is not None and out[base]['metrics'][m]['point'] is not None else np.nan,reps[candidate][:,j]-reps[base][:,j]) for j,m in enumerate(METRICS)}
 return {'dateCount':len(dates),'fromDate':dates[0],'throughDate':dates[-1],'policies':out,'pairedCandidateMinusBaseline':deltas,'pairedUnknownEventDifferenceBounds':{c+' minus '+b:{m:{'lower':out[c]['unknownEventBounds'][m]['minimumTrueRateAllSelected']-out[b]['unknownEventBounds'][m]['maximumTrueRateAllSelected'],'upper':out[c]['unknownEventBounds'][m]['maximumTrueRateAllSelected']-out[b]['unknownEventBounds'][m]['minimumTrueRateAllSelected']} for m in EVENTS if out[c]['counts']['selected'] and out[b]['counts']['selected']} for c in arrays if c not in ['currentOverall','ATRbaseline'] for b in ['currentOverall','ATRbaseline']}}

def baseline_fingerprint(run):
 return [(d['signalDate'],[(p['symbol'],p['signals'],p['dailyBars'],{k:p['outcome'].get(k) for k in ['strictLabelValid','touch','net5d','entryBullish']}) for p in d['picks']]) for d in run['days']]

def preflight(config):
 # Do not touch any new primary output until ALL five train winners are frozen.
 expected={'L5':{'A','B'},'L0':{'A','B'},'FP':{'A'}};snapshots={};frozen=[];freeze_data={}
 assert config['producerCompletionConfirmed'] is True and len(config['ledgers'])==3
 for kind in ['L5','L0','FP']:
  spec=config['freezes'][kind];p=Path(spec['path']);assert sha(p)==spec['sha256'];data=json.loads(p.read_text())
  assert data['noPrimaryOutcomesUsed'] is True and data['onlyTRAIN2020_2022'] is True
  entries=data['winners'] if kind!='FP' else {'A':data['winner']};assert set(entries)==expected[kind]
  assert all(e['config']['family']=='A' if f=='A' else e['config']['family']=='B' for f,e in entries.items())
  frozen.append(data['frozenAtUTC']);snapshots[str(p)]=spec['sha256'];freeze_data[kind]=data
 assert len(frozen)==3
 helper=config['outcomeHelper'];assert sha(helper['path'])==helper['sha256'];snapshots[helper['path']]=helper['sha256']
 # Only now can completed primary bytes be read or hashed.
 policies={};assert {x['kind'] for x in config['ledgers']}=={'L5','L0','FP'}
 for spec in config['ledgers']:
  assert spec['completed'] is True
  p=Path(spec['path']);assert sha(p)==spec['sha256'];d=json.loads(p.read_text());snapshots[str(p)]=spec['sha256']
  assert d['actualPublishedHistory'] is False
  assert d['sourceHashes']==freeze_data[spec['kind']]['sourceHashes']
  assert d['protocolSha256']==freeze_data[spec['kind']]['protocolSha256']
  for run in d['policies']:
   n=run['name'];name=spec['kind']+'-'+n if n.startswith('winner') else n
   if n.startswith('winner'):
    selected=freeze_data[spec['kind']]['winner'] if spec['kind']=='FP' else freeze_data[spec['kind']]['winners'][n[-1]]
    assert all(p['modelConfig']==selected['config'] for d in run['days'] for p in d['picks'])
   if name in policies:assert baseline_fingerprint(policies[name])==baseline_fingerprint(run),'baseline policies differ; cannot silently combine'
   else:policies[name]=run
 assert set(policies)=={'L5-winnerA','L5-winnerB','L0-winnerA','L0-winnerB','FP-winnerFP','currentOverall','ATRbaseline'}
 sp=importlib.util.spec_from_file_location('immutable_fp_helper',helper['path']);mod=importlib.util.module_from_spec(sp);sp.loader.exec_module(mod)
 return policies,snapshots,mod.diagnose_five_session_outcomes

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--config',required=True);ap.add_argument('--output',required=True);args=ap.parse_args();config=json.loads(Path(args.config).read_text())
 policies,before,helper=preflight(config);dates=[d['signalDate'] for d in next(iter(policies.values()))['days']]
 assert dates==sorted(set(dates)) and all('2023-01-01'<=d<='2024-12-31' for d in dates)
 arrays={};metadata={};schema_checks=0
 for name,run in policies.items():
  assert [d['signalDate'] for d in run['days']]==dates
  aa=[];mm=[]
  for day in run['days']:
   vals,meta=row_stats(day,helper);aa.append([vals[m] for m in METRICS]);mm.append(meta);schema_checks+=len(day['picks'])
  arrays[name]=np.asarray(aa,dtype=float);metadata[name]=mm
 scopes={'whole2023_2024':dates}
 for y in ['2023','2024']:
  scopes[y]=[d for d in dates if d[:4]==y]
  for q in range(1,5):scopes[y+'Q'+str(q)]=[d for d in dates if d[:4]==y and (int(d[5:7])-1)//3+1==q]
 result={s:scope_summary(arrays,metadata,ds,dates) for s,ds in scopes.items() if ds}
 after={p:sha(p) for p in before};assert before==after
 report={'schema':'independent-paired-daily-block-statistics-v1','method':{'bootstrap':'non-circular overlapping moving blocks; truncate final sampled block to scope length','blockSignalDays':BLOCK,'replicates':DRAWS,'seed':SEED,'interval':'95% percentile, unadjusted for multiple comparisons','pairedUnit':'identical signal-date block draws; each policy retains its own original roster and strict denominator, no selected-ticker intersection','costBasisPoints':COST_BPS,'firstPassage':'immutable decimal OHLC helper, conservative/optimistic both-barrier bounds; modeled proxies not actual fills','sourceTouch':'preserved original ledger floating-comparison touch; exact-decimal helper FP separate'},'allFiveWinnersFrozenBeforeRead':True,'producerCompletionConfirmed':True,'originalSelectedInstancesChecked':schema_checks,'sourceHashesBefore':before,'sourceHashesAfter':after,'sourceBytesUnchanged':True,'noFitSelectionOrTuning':True,'productMutations':0,'scopes':result,'limitations':['Descriptive confidence intervals conditional on fixed fitted policies, survivor/current-status universe, source, sample and overlapping positions.','Many candidates, outcomes and time slices imply multiplicity; these unadjusted intervals do not establish a prespecified familywise success claim.','Moving-block bootstrap assumes within-scope dependence reasonably represented by 10-day blocks; quarterly short samples and structural market changes can invalidate nominal coverage.','Current adjusted NAVER history is not a historical point-in-time adjustment/universe snapshot and does not prove equivalent live KIS inputs.','First passage uses daily OHLC barriers and modeled gap fills; it does not observe intraday order within ambiguous bars or executable fills.','Quarterly fixed-model schedule may learn from earlier matured primary observations under the frozen causal protocol; these are not one globally frozen fit.','Unknown selected outcomes retained, never excluded from selection or silently counted as negatives/positives.']}
 out=Path(args.output);out.mkdir(parents=True,exist_ok=True);write(out/'statistics.json',report)
 lines=['scope,policy,metric,point,lower95,upper95,denominator,unknown']
 for scope,res in result.items():
  for policy,v in res['policies'].items():
   for metric,z in v['metrics'].items():lines.append(','.join(map(str,[scope,policy,metric,z['point'],z['lower95'],z['upper95'],z['denominator'],v['counts']['unknown']])))
 (out/'metrics.csv').write_text('\n'.join(lines)+'\n')
 paired=['scope,comparison,metric,point,lower95,upper95']
 for scope,res in result.items():
  for comparison,metrics in res['pairedCandidateMinusBaseline'].items():
   for metric,z in metrics.items():paired.append(','.join(map(str,[scope,comparison,metric,z['point'],z['lower95'],z['upper95']])))
 (out/'paired-differences.csv').write_text('\n'.join(paired)+'\n');write(out/'audit.json',{k:report[k] for k in ['allFiveWinnersFrozenBeforeRead','producerCompletionConfirmed','originalSelectedInstancesChecked','sourceHashesBefore','sourceHashesAfter','sourceBytesUnchanged','noFitSelectionOrTuning','productMutations']})
 print(json.dumps({'output':str(out),'policies':len(policies),'dates':len(dates),'scopes':len(result),'selectedInstances':schema_checks,'sourceBytesUnchanged':True}))
if __name__=='__main__':main()
