# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3"]
# ///
"""Observed source-only cache; this program NEVER calculates future labels."""
import json,pathlib,hashlib,math,datetime,importlib.util,time
import numpy as np
OUT=pathlib.Path('/tmp/composite-score-experimental-20260930');DIR=OUT/'naver-cache';DIR.mkdir(exist_ok=True)
META=OUT/'naver-ts-observed/manifest.json';PLAN=OUT/'naver-protocol.json'
def sha(p):
    with pathlib.Path(p).open('rb') as h:return hashlib.file_digest(h,'sha256').hexdigest()
assert sha(PLAN)=='377ed12d88de69989043bd7ef21b4b057a44c2fbab90ba19f4f679189e69033c'
assert META.exists(),'Wait for complete actual TS source-only observed export'
m=json.loads(META.read_text());output=m['output'];rawmeta=m['raw']
assert m['source']=='naver-fchart' and output['dtype']=='<f8' and output['columns']==28
assert output['bytes']==output['rows']*28*8 and sha(output['path'])==output['sha256']
assert sha(rawmeta['path'])==rawmeta['sha256']
calendar=m['calendarDates'];signals=m['signalDates'];symbols=m['symbols'];di={d:i for i,d in enumerate(calendar)}
assert calendar==sorted(set(calendar)) and signals==sorted(set(signals)) and len(set(symbols))==len(symbols)
assert all('2020-01-01'<=d<='2024-12-31' and di[d]>=319 for d in signals)
train=[d for d in signals if d<='2022-12-31'];primary=[d for d in signals if d>='2023-01-01'];assert len(train)>=680 and primary
first=di[primary[0]];assert first-5-504>=319,'505 mature signal panels plus full320 observed prefix unavailable'
assert all(calendar[i] in set(signals) for i in range(first-5-504,first-4)),'No compressed missing signal panels'
module_path=OUT/'extra_features.py';assert sha(module_path)=='b35b34b70b3420e5756b4d14883d385e61bb8bf1c1127eb53c71a75ca358786b'
spec=importlib.util.spec_from_file_location('extra_features',module_path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
spec50=json.loads((OUT/'featurespec.json').read_text());assert spec50['extraFeatureNames']==module.EXTRA_FEATURE_NAMES
source=np.memmap(output['path'],mode='r',dtype='<f8',shape=(output['rows'],28))
assert np.isfinite(source[:,[0,1,27]]).all() and np.all(source[:,0]==source[:,0].astype(np.int32)) and np.all(source[:,1]==source[:,1].astype(np.int32))
dateidx=source[:,0].astype(np.int32);symidx=source[:,1].astype(np.int32)
assert dateidx.min()==0 and dateidx.max()==len(signals)-1 and symidx.min()>=0 and symidx.max()<len(symbols)
permutation=np.lexsort((symidx,dateidx));pairs=np.column_stack([dateidx[permutation],symidx[permutation]])
assert not np.any(np.all(pairs[1:]==pairs[:-1],axis=1)),'Duplicate actual eligible membership'
counts=np.bincount(dateidx,minlength=len(signals));assert np.all(counts>0)
expected=m['eligibleCounts']
assert counts.tolist()==([expected[d] for d in signals] if isinstance(expected,dict) else expected)
offsets=np.r_[0,np.cumsum(counts,dtype=np.int64)];n=int(offsets[-1])
inverse=np.empty(n,dtype=np.int64);inverse[permutation]=np.arange(n,dtype=np.int64)
observed=np.lib.format.open_memmap(DIR/'X50.npy',mode='w+',dtype=np.float64,shape=(n,50));observed[:,:18]=source[permutation,2:20];observed[:,18:]=np.nan
scores=np.lib.format.open_memmap(DIR/'sourceSignals7.npy',mode='w+',dtype=np.int16,shape=(n,7));scores[:]=source[permutation,20:27]
assert np.all(source[:,20:27]==source[:,20:27].astype(np.int16)) and np.all((scores>=0)&(scores<=100))
turnover=np.lib.format.open_memmap(DIR/'turnover.npy',mode='w+',dtype=np.float64,shape=(n,));turnover[:]=source[permutation,27]
np.save(DIR/'symbols.npy',symidx[permutation],allow_pickle=False);np.save(DIR/'offsets.npy',offsets,allow_pickle=False)
# Raw observed cache preserves exact source data/zero volumes/invalid values; no label reads.
bars=np.lib.format.open_memmap(DIR/'rawBars.npy',mode='w+',dtype=np.float64,shape=(len(symbols),len(calendar),5));bars[:]=np.nan
symbolindex={s:i for i,s in enumerate(symbols)}
sort_symbol=np.argsort(symidx,kind='stable');symbolcounts=np.bincount(symidx,minlength=len(symbols));symboloffsets=np.r_[0,np.cumsum(symbolcounts,dtype=np.int64)]
written=np.zeros(n,dtype=bool);raw_seen=set();start=time.monotonic();processed=0
for line in pathlib.Path(rawmeta['path']).open():
    symbol,rr=json.loads(line)
    if symbol not in symbolindex:continue
    si=symbolindex[symbol];assert symbol not in raw_seen;raw_seen.add(symbol)
    bydate={}
    for r in rr:
        assert r['source']=='naver-fchart';d=r['trade_date'];assert d not in bydate
        bydate[d]=r
        if d in di:
            bars[si,di[d]]=[v if isinstance(v,(int,float)) and math.isfinite(v) else np.nan for v in (r.get(k) for k in ['open','high','low','close','volume'])]
    if symbolcounts[si]:
        observed_module=module.ObservedSetupFeatures(calendar,bydate,expected_source='naver-fchart')
        for srcindex in sort_symbol[symboloffsets[si]:symboloffsets[si+1]]:
            dst=int(inverse[srcindex]);d=signals[int(dateidx[srcindex])];vv=observed_module.at(d);assert len(vv)==32 and not written[dst]
            observed[dst,18:]=[v if module.finite(v) else np.nan for v in vv];written[dst]=True
    processed+=1
    if processed%200==0:print('OBSERVED_CACHE_PROGRESS',processed,'of',len(symbols),'seconds',round(time.monotonic()-start,2),flush=True)
assert len(raw_seen)==len(symbols) and written.all()
for a in [observed,scores,turnover,bars]:a.flush()
hashes={str(p):sha(p) for p in [META,PLAN,module_path,OUT/'featurespec.json',pathlib.Path(__file__),pathlib.Path(output['path']),pathlib.Path(rawmeta['path'])]}
cachefiles={name:{'path':str(DIR/name),'sha256':sha(DIR/name)} for name in ['X50.npy','sourceSignals7.npy','turnover.npy','symbols.npy','offsets.npy','rawBars.npy']}
manifest={'completedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'naver-fchart','noFutureLabelsCalculated':True,'new2023_2024OutcomesRead':False,'rowCount':n,'signalDates':signals,'calendarDates':calendar,'symbols':symbols,'masterNames':m['masterNames'],'eligibleCounts':counts.tolist(),'trainDates':train,'primaryDates':primary,'featureNames':spec50['featureNames'],'rowOrder':'actualsignal date ascending then ASCII symbol indexed source order','queryDateContiguous':True,'nativeMissingInputValues':int(np.isnan(observed).sum()),'files':cachefiles,'sourceHashes':hashes,'firstPrimaryAvailable505MaturePanels':calendar[first-5-504:first-4],'firstPrimaryAsOf':primary[0],'limitations':['Currentmaster/currentstatus/survivorship','Currentadjustedsourcevintage andvolume','KnownKIS2025–26informedhypothesisdesign','No mixed vendor or falseKIS tag']}
(DIR/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,allow_nan=False));print('OBSERVED_CACHE_COMPLETE',n,'rows',len(signals),'dates','elapsed',time.monotonic()-start,flush=True)
