"""One pass over already-audited observed runtime-eligible NAVER keys, after freeze.
Uses the exact frozen research label_panel AST; never fit, rank or select stocks.
"""
import argparse,ast,json
from pathlib import Path
import numpy as np
import paired_statistics as stats

FIELDS=['touch','L5','ANYnegativeD5','D1bull','netD5','strictCoverage']

def evaluate(config_path,out):
 config=json.loads(Path(config_path).read_text());policies,before,_=stats.preflight(config)
 base=Path('/tmp/composite-score-experimental-20260930');cache=base/'naver-cache';mp=cache/'manifest.json';manifest=json.loads(mp.read_text());before[str(mp)]=stats.sha(mp)
 assert manifest['source']=='naver-fchart' and manifest['noFutureLabelsCalculated'] and not manifest['new2023_2024OutcomesRead'] and manifest['rowCount']==1559349
 for p in [base/'naver-ts-observed/source-parity-causality-audit.json',base/'naver-ts-observed/compact-integrity-audit.json']:
  assert json.loads(p.read_text())['passed'];before[str(p)]=stats.sha(p)
 for e in manifest['files'].values():assert stats.sha(e['path'])==e['sha256'];before[e['path']]=e['sha256']
 for p,h in manifest['sourceHashes'].items():assert stats.sha(p)==h;before[p]=h
 def load(name):return np.load(manifest['files'][name]['path'],mmap_mode='r',allow_pickle=False)
 raw=load('rawBars.npy');symbols=load('symbols.npy');offsets=load('offsets.npy');dates=manifest['primaryDates'];signals=manifest['signalDates'];cal=manifest['calendarDates'];si={d:i for i,d in enumerate(signals)};di={d:i for i,d in enumerate(cal)}
 source=base/'naver-research.py';sourcehash=stats.sha(source)
 frozen=json.loads(Path(config['freezes']['L5']['path']).read_text());assert frozen['sourceHashes'][str(source)]==sourcehash;before[str(source)]=sourcehash
 tree=ast.parse(source.read_text());nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['span','label_panel']];assert len(nodes)==2
 env={'np':np,'si':si,'di':di,'offsets':offsets,'raw':raw,'symbolIndices':symbols,'train':set(manifest['trainDates']),'allow_primary':True,'labels':{},'RISK':'L5','calendar':cal}
 exec(compile(ast.Module(body=nodes,type_ignores=[]),'frozen-label-panel','exec'),env)
 population=[];daily=[];arrays={name:[] for name in policies};selected_lookup={name:{x['signalDate']:x for x in p['days']} for name,p in policies.items()};checked=0
 for d in dates:
  assert '2023-01-01'<=d<='2024-12-31';a,b=env['span'](d);p=env['label_panel'](d);strict=p['strict'];n=b-a;k=int(strict.sum());assert n==manifest['eligibleCounts'][si[d]]
  vals=[int(p['touch'][strict].sum()),int((p['net'][strict]<=-.05).sum()),int((p['net'][strict]<0).sum()),int(p['bull'][strict].sum()),float(p['net'][strict].sum()),k]
  row=[[v,k if i<5 else n] for i,v in enumerate(vals)];population.append(row);daily.append({'signalDate':d,'runtimeEligibleObservedCandidates':n,'futureStrictKnown':k,'unknown':n-k,**{f:row[j][0] for j,f in enumerate(FIELDS)}})
  keys=[manifest['symbols'][int(x)] for x in symbols[a:b]];assert len(set(keys))==n;lookup={s:i for i,s in enumerate(keys)}
  for name in policies:
   day=selected_lookup[name][d];counts=np.zeros((len(FIELDS),2),dtype=float);counts[-1,1]=len(day['picks'])
   for pick in day['picks']:
    assert pick['symbol'] in lookup;ix=lookup[pick['symbol']];o=pick['outcome'];assert bool(strict[ix])==o['strictLabelValid'];checked+=1
    if not strict[ix]:continue
    assert bool(p['touch'][ix])==o['touch'] and bool(p['bull'][ix])==o['entryBullish'] and abs(float(p['net'][ix])-o['net5d'])<1e-12
    v=[o['touch'],o['net5d']<=-.05,o['net5d']<0,o['entryBullish'],o['net5d'],1]
    for j,value in enumerate(v):counts[j,0]+=float(value)
    counts[:-1,1]+=1
   arrays[name].append(counts)
  env['labels'].clear()
 arrays={n:np.asarray(x,dtype=float) for n,x in arrays.items()};pop=np.asarray(population,dtype=float)
 scopes={'whole2023_2024':list(range(len(dates)))}
 for year in ['2023','2024']:
  scopes[year]=[i for i,d in enumerate(dates) if d[:4]==year]
  for q in range(1,5):scopes[year+'Q'+str(q)]=[i for i,d in enumerate(dates) if d[:4]==year and (int(d[5:7])-1)//3+1==q]
 results={}
 for scope,ii in scopes.items():
  w=stats.bootstrap_weights(len(ii));p=pop[ii];pt=p.sum(axis=0);pr=np.einsum('dn,nmk->dmk',w,p,optimize=True);point=stats.ratio(pt[:,0],pt[:,1]);rep=stats.ratio(pr[:,:,0],pr[:,:,1]);n=int(pt[-1,1]);k=int(pt[-1,0]);u=n-k
  metrics={m:{**stats.ci(point[j],rep[:,j]),'numerator':float(pt[j,0]),'denominator':int(pt[j,1])} for j,m in enumerate(FIELDS)};enrichment={};differences={};policyrep={};policypoints={}
  for name,array in arrays.items():
   a=array[ii];t=a.sum(axis=0);rr=np.einsum('dn,nmk->dmk',w,a,optimize=True);pp=stats.ratio(t[:,0],t[:,1]);br=stats.ratio(rr[:,:,0],rr[:,:,1]);policyrep[name]=br;policypoints[name]=pp
   enrichment[name]={m:{'selectedMinusPopulation':stats.ci(pp[j]-point[j],br[:,j]-rep[:,j]),'selectedOverPopulationRatio':stats.ci(pp[j]/point[j] if point[j]!=0 and m!='netD5' else np.nan,stats.ratio(br[:,j],rep[:,j]) if m!='netD5' else np.full(stats.DRAWS,np.nan))} for j,m in enumerate(FIELDS)}
  for name in arrays:
   if name in ['currentOverall','ATRbaseline']:continue
   for baseline in ['currentOverall','ATRbaseline']:
    # Same universe term cancels. Recompute to verify fixed-model enrichment difference.
    delta=(policyrep[name]-rep)-(policyrep[baseline]-rep);assert np.allclose(delta,policyrep[name]-policyrep[baseline],equal_nan=True)
    differences[name+' minus '+baseline]={m:stats.ci(policypoints[name][j]-policypoints[baseline][j],delta[:,j]) for j,m in enumerate(FIELDS)}
  results[scope]={'dateCount':len(ii),'observedRuntimeEligibleKeys':n,'futureStrictKnown':k,'futureUnknown':u,'populationMetrics':metrics,'eventUnknownBounds':{m:{'lower':pt[j,0]/n,'upper':(pt[j,0]+u)/n} for j,m in enumerate(FIELDS[:4])},'selectedEnrichment':enrichment,'candidateMinusBaselineEnrichmentDifference':differences}
 after={p:stats.sha(p) for p in before};assert before==after
 report={'schema':'fixed-model-observed-population-enrichment-v1','scope':'Post-freeze PRIMARY2023–2024 only; currentmaster runtime-eligible observed cohort, not historical entire market; no cooldown exclusion for population','allFiveWinnersFrozenBeforeRead':True,'originalObservedCacheRows':manifest['rowCount'],'primaryRuntimeEligibleKeys':int(pop[:,-1,1].sum()),'allSelectedInstancesJoinedAndCompared':checked,'actualTsObservedAuditsPassed':True,'labelImplementation':'Unmodified frozen naver-research.py span and label_panel AST; original floating thresholds preserved; no model code executes','labelHelperSourceSha256':sourcehash,'sourceHashesBefore':before,'sourceHashesAfter':after,'sourceBytesUnchanged':True,'modelFitSelectionOrTuning':False,'productMutations':0,'scopes':results,'caveats':['Population contains current surviving master/status cohort, not point-in-time historical listed market.','Future strict validity only changes reported outcome denominators, never observed candidate eligibility or selection.','Population has no strategy-specific cooldown; enrichment is descriptive conditional on eligibility.','Identical 10-day moving-block draws pair policy and population; 1000 replicates seed42,95% percentile intervals, no multiplicity adjustment.','Observed NAVER adjustment/session source differences do not establish live KIS equivalence.']}
 out=Path(out);stats.write(out/'population-enrichment.json',report);(out/'population-daily.ndjson').write_text(''.join(json.dumps(r,separators=(',',':'))+'\n' for r in daily));print(json.dumps({'primaryRuntimeEligibleKeys':report['primaryRuntimeEligibleKeys'],'joinedSelected':checked,'scopes':len(results),'sourceBytesUnchanged':True}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('--output',required=True);a=p.parse_args();evaluate(a.config,a.output)
