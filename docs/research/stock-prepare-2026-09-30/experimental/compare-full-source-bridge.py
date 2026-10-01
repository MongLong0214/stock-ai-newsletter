from __future__ import annotations
import array,collections,datetime,hashlib,heapq,json,math,resource,statistics,time
from pathlib import Path
B=Path('/tmp/composite-score-experimental-20260930/naver-history');K=Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson');O=B.parent/'source-bridge';O.mkdir(exist_ok=True)
EXPECTED='c0fe673a5c0cef5197625d2ccd811c900bbe6655e81a66f4b797c6e741a1ce54';FIELDS=['open','high','low','close','volume'];CUTOFF='2026-09-29'
def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for part in iter(lambda:f.read(8*1024*1024),b''):h.update(part)
 return h.hexdigest()
def num(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def valid(r):
 o,h,l,c=[r.get(f) for f in FIELDS[:4]]
 return all(num(x) and x>0 for x in [o,h,l,c]) and l<=o<=h and l<=c<=h and l<=h

def quantiles(a):
 if not a:return {'count':0}
 a=sorted(a);n=len(a)
 def q(p):
  j=(n-1)*p;i=int(j);return a[i]+(a[min(i+1,n-1)]-a[i])*(j-i)
 return {'count':n,'min':a[0],'p01':q(.01),'p05':q(.05),'p25':q(.25),'median':q(.5),'p75':q(.75),'p95':q(.95),'p99':q(.99),'max':a[-1]}

def new_stats():return {'counts':collections.Counter(),'fields':{f:collections.Counter() for f in FIELDS},'maxErrors':{},'volumeBias':array.array('d'),'volumeAbsError':array.array('d'),'positivePriceAbsRelativeError':array.array('d'),'flagCounts':collections.Counter()}
def condensed(s):return {'counts':dict(s['counts']),'fields':{f:dict(x) for f,x in s['fields'].items()},'maxErrors':s['maxErrors'],'relativeVolumeBiasNaverOverKisMinusOne':quantiles(s['volumeBias']),'absoluteVolumeError':quantiles(s['volumeAbsError']),'absoluteRelativePriceErrorWhereBothPositive':quantiles(s['positivePriceAbsRelativeError']),'flagCounts':dict(s['flagCounts'])}

def main():
 start=time.monotonic();manifest=json.loads((B/'manifest.json').read_bytes());audit=json.loads((B/'audit.json').read_bytes())
 assert manifest['status']=='complete' and audit['passed']
 snapshot=json.loads((B/'master-snapshot.json').read_bytes());symbols=[x['symbol'] for x in snapshot['masters']];requested=set(symbols+['KOSPI']);checkpoints={c['symbol']:c for c in map(json.loads,(B/'checkpoints.ndjson').read_text().splitlines())};calendar=set(json.loads((B/'calendar.json').read_bytes())['dates'])
 khash=sha(K);assert khash==EXPECTED
 kindex=collections.defaultdict(list);line_counts=collections.Counter();offset=0;input_rows=0;outside_rows=0
 with K.open('rb') as f:
  for line in f:
   symbol,rows=json.loads(line);line_counts[symbol]+=1
   if symbol in requested:kindex[symbol].append((offset,len(line)));input_rows+=len(rows)
   else:outside_rows+=len(rows)
   offset+=len(line)
 stats=new_stats();indexstats=new_stats();per_symbol=[];heap=[];counter=0;duplicate_rows=0;conflicting_duplicates=0;conflict_examples=[];source_errors=0;date_min=None;date_max=None;missing_kis_symbols=[];missing_naver_symbols=[]
 with K.open('rb') as kf,(B/'prices.ndjson').open('rb') as nf,(O/'symbol-comparison.ndjson').open('w') as summary:
  for position,symbol in enumerate(symbols+['KOSPI']):
   krows={}
   for off,length in kindex.get(symbol,[]):
    kf.seek(off);sym,rows=json.loads(kf.read(length));assert sym==symbol
    for r in rows:
     if r.get('source')!='kis':source_errors+=1
     date=r['trade_date']
     if date in krows:
      duplicate_rows+=1
      if any(krows[date].get(f)!=r.get(f) for f in FIELDS):
       conflicting_duplicates+=1
       if len(conflict_examples)<20:conflict_examples.append({'symbol':symbol,'date':date,'earlier':{f:krows[date].get(f) for f in FIELDS},'later':{f:r.get(f) for f in FIELDS}})
     krows[date]=r
   krows={d:r for d,r in krows.items() if d<=CUTOFF}
   cp=checkpoints.get(symbol)
   if cp and cp['status']=='success':
    nf.seek(cp['normalizedOffset']);line=nf.read(cp['normalizedBytes']);assert hashlib.sha256(line).hexdigest()==cp['normalizedSha256'];sym,nlist=json.loads(line);assert sym==symbol and all(r['source']=='naver-fchart' for r in nlist);nrows={r['trade_date']:r for r in nlist}
   else:nrows={}
   if not krows:missing_kis_symbols.append(symbol)
   if not nrows:missing_naver_symbols.append(symbol)
   common=sorted(krows.keys()&nrows.keys());target=indexstats if symbol=='KOSPI' else stats;sc=collections.Counter();sv=[];max_price_abs=0;max_price_rel=0;max_volume_abs=0;max_volume_bias=0
   missing_n=sorted(krows.keys()-nrows.keys());missing_k=sorted(d for d in nrows.keys()-krows.keys() if krows and min(krows)<=d<=max(krows))
   sc.update({'commonRows':len(common),'kisRows':len(krows),'naverRows':len(nrows),'kisDatesMissingNaver':len(missing_n),'kisDatesMissingNaverOnIndexCalendar':sum(d in calendar for d in missing_n),'kisDatesMissingNaverOffIndexCalendar':sum(d not in calendar for d in missing_n),'naverDatesMissingKisWithinKisRange':len(missing_k)})
   for date in common:
    n,k=nrows[date],krows[date];nv,kv=valid(n),valid(k);flags=[];price_ratios=[];price_diffs=[];price_all_equal=True;row_all_equal=True;row_max_rel=0;row_max_abs=0;vol_bias=None
    date_min=date if date_min is None else min(date_min,date);date_max=date if date_max is None else max(date_max,date)
    for f in FIELDS:
     x,y=n.get(f),k.get(f);fs=target['fields'][f];fs['comparedRows']+=1
     if num(x) and num(y):
      fs['bothFinite']+=1;eq=x==y;fs['exactEqual' if eq else 'different']+=1;ae=abs(x-y)
      if f!='volume':
       price_diffs.append(ae);row_max_abs=max(row_max_abs,ae);price_all_equal &= eq
       if x>0 and y>0:
        ratio=x/y;price_ratios.append(ratio);rel=abs(ratio-1);row_max_rel=max(row_max_rel,rel);target['positivePriceAbsRelativeError'].append(rel)
      else:
       target['volumeAbsError'].append(ae);max_volume_abs=max(max_volume_abs,ae)
       if y>0 and x>=0:vol_bias=x/y-1;target['volumeBias'].append(vol_bias);sv.append(vol_bias);max_volume_bias=max(max_volume_bias,abs(vol_bias))
       if y==0:fs['kisZeroVolume']+=1
       if x==0:fs['naverZeroVolume']+=1
       if x==y==0:fs['bothZeroVolume']+=1
      if f not in target['maxErrors'] or ae>target['maxErrors'][f]['absoluteError']:target['maxErrors'][f]={'absoluteError':ae,'symbol':symbol,'date':date,'naver':x,'kis':y,'relativeToKis':(x/y-1) if y else None}
     else:
      eq=x==y;fs['bothMissingOrNonfinite' if not num(x) and not num(y) else 'oneMissingOrNonfinite']+=1
      if f!='volume':price_all_equal=False
     row_all_equal &= eq
    max_price_abs=max(max_price_abs,row_max_abs);max_price_rel=max(max_price_rel,row_max_rel)
    sc['allOhlcvExactRows']+=bool(row_all_equal);sc['allPriceExactRows']+=bool(price_all_equal);sc['volumeExactRows']+=n.get('volume')==k.get('volume')
    if nv and kv:flags.append('bothValidOhlc')
    elif nv:flags.append('invalidKisOnly')
    elif kv:flags.append('invalidNaverOnly')
    else:flags.append('bothInvalidOhlc')
    if n.get('volume')==0 and k.get('volume')==0:flags.append('zeroVolumeBoth')
    elif (n.get('volume')==0)!=(k.get('volume')==0):flags.append('zeroVolumeDisagreement')
    if all(n.get(f)==0 for f in ['open','high','low']) and n.get('volume')==0:flags.append('naverZeroOhlSuspensionLike')
    if all(k.get(f)==0 for f in ['open','high','low']) and k.get('volume')==0:flags.append('kisZeroOhlSuspensionLike')
    if len(price_diffs)==4 and not price_all_equal and len(price_ratios)==4 and max(price_diffs)<=3:flags.append('priceDifferenceAtMost3CurrencyUnitsBothPositive')
    if len(price_ratios)==4:
     scale=statistics.median(price_ratios);spread=(max(price_ratios)-min(price_ratios))/scale
     if abs(scale-1)>=.005 and spread<=.002:
      flags.append('adjustmentScaleMismatchCandidate')
      if vol_bias is not None and abs((1+vol_bias)*scale-1)<=.02:flags.append('inversePriceVolumeScaleCandidate')
    for key,val in n.get('flags',{}).items():
     if val:flags.append('naverFlag_'+key)
    sc.update(flags);target['flagCounts'].update(flags)
    # Rank data-source discrepancies only. Never reads any return or target outcome.
    rank=max(row_max_rel,abs(vol_bias) if vol_bias is not None else 0)
    if rank>0:
     example={'symbol':symbol,'date':date,'maximumPositivePriceRelativeError':row_max_rel,'maximumAbsolutePriceError':row_max_abs,'relativeVolumeBias':vol_bias,'naver':{f:n.get(f) for f in FIELDS},'kis':{f:k.get(f) for f in FIELDS},'flags':flags}
     counter+=1;item=(rank,counter,example)
     if len(heap)<20:heapq.heappush(heap,item)
     elif rank>heap[0][0]:heapq.heapreplace(heap,item)
   target['counts'].update(sc)
   result={'symbol':symbol,**dict(sc),'firstCommonDate':common[0] if common else None,'lastCommonDate':common[-1] if common else None,'maximumAbsolutePriceError':max_price_abs,'maximumPositivePriceRelativeError':max_price_rel,'maximumAbsoluteVolumeError':max_volume_abs,'maximumAbsoluteRelativeVolumeBias':max_volume_bias,'relativeVolumeBias':quantiles(sv),'exampleKisDatesMissingNaver':missing_n[:5],'exampleNaverDatesMissingKis':missing_k[:5]}
   per_symbol.append(result);summary.write(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
   if (position+1)%500==0:print(json.dumps({'event':'source_comparison_progress','symbols':position+1,'seconds':round(time.monotonic()-start,1)}),flush=True)
 assert source_errors==0
 khash_after=sha(K);assert khash_after==khash
 report={'schema':'naver-kis-source-bridge-v1','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':round(time.monotonic()-start,3),'kisPath':str(K),'kisSha256Before':khash,'kisSha256After':khash_after,'kisBytesUnchanged':True,'naverDirectory':str(B),'naverPricesSha256':manifest['pricesSha256'],'currentMasterSnapshotSha256':manifest['masterSnapshotSha256'],'requestedCurrentMasterStocks':len(symbols),'benchmarkReportedSeparately':'KOSPI','comparedStocksWithCommonRows':sum(x['symbol']!='KOSPI' and x['commonRows']>0 for x in per_symbol),'commonDateRange':[date_min,date_max],'kisInputRowsForRequestedUniverseBeforeDedup':input_rows,'kisDuplicateRows':duplicate_rows,'kisConflictingDuplicateRows':conflicting_duplicates,'kisDuplicateResolution':'last file occurrence wins, separately recorded; original bytes untouched','kisConflictingDuplicateExamples':conflict_examples,'kisRowsOutsideRequestedUniverseNotCompared':outside_rows,'missingKisSymbols':missing_kis_symbols,'missingNaverSymbols':missing_naver_symbols,'stocks':condensed(stats),'benchmark':condensed(indexstats),'topSymbolDiscrepancies':sorted((x for x in per_symbol if x['symbol']!='KOSPI'),key=lambda x:max(x['maximumPositivePriceRelativeError'],x['maximumAbsoluteRelativeVolumeBias']),reverse=True)[:20],'topRowDiscrepancies':[x[2] for x in sorted(heap,reverse=True)],'definitions':{'relativeVolumeBias':'naver.volume/kis.volume - 1; KIS volume > 0 and Naver volume >= 0; zero denominators counted separately','quantiles':'Exact linear interpolation at (n-1)*p across common matched observations; not outcome-conditioned','adjustmentScaleMismatchCandidate':'All four prices positive; median Naver/KIS scale differs >=0.5%; (max ratio-min ratio)/median<=0.2%. Descriptive candidate, not verified corporate action.','inversePriceVolumeScaleCandidate':'Above candidate and absolute(price scale * volume scale - 1)<=2%','roundingSizedDifference':'All four OHLC prices positive and maximum absolute difference <=3 currency units. Descriptive size only, not verified rounding cause.','coverage':'All fixed current masters retained, including any zero-overlap or failed source responses. Off-index dates reported, not silently merged or repaired.'},'limitations':['Current-master survivor/status bias persists; not the historical point-in-time universe.','Both providers are retrieved or frozen at different vintages; corporate-action causes cannot be confirmed from these normalized OHLCV files alone.','Naver historical behavior is not assumed equivalent to current KIS production inputs.','No source blending, price repair, outcome calculation, label calculation or model fitting.'],'labelsComputed':False,'performanceComputed':False,'fitPerformed':False,'sourcePricesEdited':False,'productExternalWrites':0,'peakResidentBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
 (O/'comparison.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'event':'source_comparison_complete','elapsedSeconds':report['elapsedSeconds'],'comparedStocks':report['comparedStocksWithCommonRows'],'commonStockRows':report['stocks']['counts']['commonRows'],'duplicateConflicts':conflicting_duplicates,'kisUnchanged':True,'peakResidentBytes':report['peakResidentBytes']}),flush=True)

if __name__=='__main__':main()
