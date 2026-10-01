"""Observed-input only: no future labels, fits, selections or 2023-24 outcomes."""
import json,pathlib,hashlib
import numpy as np
E=pathlib.Path('/tmp/composite-score-experimental-20260930')
def sha(p):
    with pathlib.Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
m=json.loads((E/'naver-ts-observed/manifest.json').read_text());errors=[]
def check(v,name):
    if not v:errors.append(name)
check(m['source']=='naver-fchart' and not m['providerRetagged'],'provider')
check(all(m[k]==0 for k in ['labelReads','fitCalls','stockSelections','networkCalls','productMutations']),'no outcomes/fits/selection')
check(not m['sourceChanged'] and m['featureWarmupCalendarBars']==320,'source + warmup')
check(m['calendarDates']==sorted(set(m['calendarDates'])) and m['signalDates']==sorted(set(m['signalDates'])),'calendar order')
check(m['symbols']==sorted(set(m['symbols'])),'ASCII symbol indices')
root=pathlib.Path('/Users/isaac/WebstormProjects/stock-ai-newsletter/scripts/stock-picks')
for name,h in m['sourceHashes'].items():check(sha(root/name)==h,'current actual TS source '+name)
check(sha(m['raw']['path'])==m['raw']['sha256'],'frozen raw bytes only')
check(sha(m['master']['path'])==m['master']['sha256'],'master bytes')
check(sha(E/'naver-protocol.json')==m['protocol']['sha256'],'protocol bytes')
results=[];codes=[]
for name,entry,width,counts,rsi,cap in [('current',m['output'],28,m['eligibleCounts'],75,10),('additional',m['relaxedMomentumObservationOnly']['output'],33,m['relaxedMomentumObservationOnly']['perDateAdditionalCounts'],85,15)]:
    check(sha(entry['path'])==entry['sha256'],name+' bytes hash')
    check(pathlib.Path(entry['path']).stat().st_size==entry['rows']*width*8,name+' bytes width')
    a=np.memmap(entry['path'],mode='r',dtype='<f8',shape=(entry['rows'],width));di=a[:,0].astype(np.int32);si=a[:,1].astype(np.int32)
    check(np.array_equal(a[:,0],di) and np.array_equal(a[:,1],si),name+' integer keys')
    check(np.all((di>=0)&(di<len(m['signalDates']))) and np.all((si>=0)&(si<len(m['symbols']))),name+' valid key ranges')
    code=di.astype(np.int64)*len(m['symbols'])+si;codes.append(code)
    check(len(np.unique(code))==len(code),name+' unique keys')
    check(np.bincount(di,minlength=len(m['signalDates'])).tolist()==counts,name+' exact perdate counts')
    score=a[:,20:27];check(np.isfinite(score).all() and np.all(score==np.floor(score)) and np.all((score>=0)&(score<=100)),name+' seven actual integer scores')
    check(not np.isinf(a).any(),name+' observed NaN not infinity')
    check(np.all((a[:,10]>=0)&(a[:,10]<=rsi)) and np.all(a[:,27]>=500_000_000) and np.all(a[:,7]<cap) and np.all(a[:,9]<cap),name+' numeric currentgate')
    breadth=np.array([above/eligible*100 if eligible else np.nan for above,eligible in zip(m['breadthAbove'],m['breadthEligible'])]);check(np.array_equal(a[:,19],breadth[di],equal_nan=True),name+' actual global breadth')
    results.append({'name':name,'rows':len(a),'sha256':entry['sha256'],'columns':width})
check(np.intersect1d(codes[0],codes[1]).size==0,'relaxed disjoint from current')
report={'scope':'Independent entire observed NAVER binary/provenance verification only; no outcomes calculated','results':results,'signalDates':len(m['signalDates']),'symbols':len(m['symbols']),'differences':errors,'newNaver2023_2024OutcomesRead':False,'sourceTruthClaim':'Byte/source consistency only; does not establish point-in-time adjustments or exchange-close equivalence with KIS','sourceHashes':{str(p):sha(p) for p in [pathlib.Path(__file__),E/'naver-ts-observed/manifest.json',E/'naver-research.py',E/'naver-protocol.json']}}
(E/'independent-naver-observed-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));assert not errors
