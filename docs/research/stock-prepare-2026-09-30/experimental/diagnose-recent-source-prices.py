import collections, hashlib, json, time
from pathlib import Path
B=Path('/tmp/composite-score-experimental-20260930'); O=B/'source-bridge'; N=B/'naver-history'; K=Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson')
paths=[K,N/'prices.ndjson',O/'live-kis-recent.json',O/'live-kis-market-variants.json']
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def dump(name,obj): (O/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
start=time.time();before={str(p):sha(p) for p in paths}; masters={r['symbol'] for r in json.loads((N/'master-snapshot.json').read_bytes())['masters']}; cal=json.loads((N/'calendar.json').read_bytes())['dates']; ci={d:i for i,d in enumerate(cal)}
selected=json.loads((O/'selected-cohort.json').read_bytes())['selected']; skeys={(r['symbol'],d['date']) for r in selected for d in r['dailyBars'] if d['date']>='2026-09-14'}
km={}
with K.open('rb') as f:
 for line in f:
  s,rs=json.loads(line)
  if s not in masters:continue
  for r in rs:
   if '2026-09-14'<=r['trade_date']<='2026-09-29':
    key=(s,r['trade_date']);assert key not in km or km[key]==r;km[key]=r
live={}; fields=['open','high','low','close','volume']; rawfields=['stck_oprc','stck_hgpr','stck_lwpr','stck_clpr','acml_vol']; symbycode={s.split(':')[1]:s for s in masters}
for p in paths[2:]:
 d=json.loads(p.read_bytes())
 for c in d['calls']:
  q=c['query'];s=symbycode[q['FID_INPUT_ISCD']];market=q['FID_COND_MRKT_DIV_CODE']
  for r in c['rawRows']:
   ds=r['stck_bsop_date'];date=ds[:4]+'-'+ds[4:6]+'-'+ds[6:]; assert '2026-09-14'<=date<='2026-09-29'
   live[(s,date,market)]={f:float(r[k]) for f,k in zip(fields,rawfields)}
lagcounts=collections.defaultdict(collections.Counter); bydate=collections.defaultdict(lambda:collections.defaultdict(collections.Counter)); variantrows=[]; all_pair_counts=collections.defaultdict(collections.Counter); examples=collections.defaultdict(list)
with (N/'prices.ndjson').open('rb') as f:
 for line in f:
  s,rs=json.loads(line)
  if s not in masters:continue
  # Only recent raw prices are used, no historical outcomes or labels.
  nm={r['trade_date']:r for r in rs if '2026-09-09'<=r['trade_date']<='2026-09-29'}
  for date in cal:
   if not ('2026-09-14'<=date<='2026-09-29'):continue
   k=km.get((s,date)); n=nm.get(date)
   if k is None or n is None:continue
   discrep=k['close']!=n['close'];groups=['all_common_rows']+(['same_date_close_discrepant'] if discrep else [])+(['selected_future_bar_rows'] if (s,date) in skeys else [])+(['selected_discrepant_rows'] if (s,date) in skeys and discrep else [])
   for lag in [-2,-1,0,1,2]:
    ix=ci[date]+lag;td=cal[ix] if 0<=ix<len(cal) else None;t=nm.get(td)
    for group in groups:
     c=lagcounts[(group,lag)];bc=bydate[date][(group,lag)];c['requestedRows']+=1;bc['requestedRows']+=1
     if t is None:c['missingTarget']+=1;bc['missingTarget']+=1;continue
     c['availableRows']+=1;bc['availableRows']+=1
     if k['close']==t['close']:
      c['exactCloseMatches']+=1;bc['exactCloseMatches']+=1
      if discrep and lag!=0 and len(examples[lag])<5:examples[lag].append({'symbol':s,'kisDate':date,'kisClose':k['close'],'naverSameDateClose':n['close'],'naverMatchDate':td,'naverMatchClose':t['close']})
   variants={m:live[(s,date,m)] for m in ['J','NX','UN'] if (s,date,m) in live}
   if variants:
    sources={'frozenKis':{f:k[f] for f in fields},'naver':{f:n[f] for f in fields},**{'live'+m:v for m,v in variants.items()}}
    pairs={}
    for a,b in [('liveJ','frozenKis'),('liveJ','naver'),('liveNX','naver'),('liveUN','naver')]:
     if a not in sources or b not in sources:continue
     name=a+'__'+b;eq={f:sources[a][f]==sources[b][f] for f in fields};pairs[name]=eq;c=all_pair_counts[name];c['rows']+=1;c['allFiveFieldsExact']+=int(all(eq.values()))
     for f in fields:c[f+'Exact']+=int(eq[f])
    variantrows.append({'symbol':s,'date':date,'sources':sources,'fieldEquality':pairs})
def formatcounts(d):
 return [{'cohort':g,'naverSessionLag':lag,**dict(c),'exactCloseMatchFraction':c['exactCloseMatches']/c['availableRows'] if c['availableRows'] else None} for (g,lag),c in sorted(d.items())]
after={str(p):sha(p) for p in paths};assert before==after
common={'sourceHashesBefore':before,'sourceHashesAfter':after,'sourceBytesUnchanged':before==after,'scope':'Recent raw prices only; no outcomes, no model fitting. Positive lag means Naver later observed KOSPI calendar session. Missing edge targets excluded from available denominator. Exact coincidences do not establish provenance or causality.','currentMasterSurvivorshipRetained':True,'newNaver2023_2024LabelsRead':False,'modelSelectionOrTuning':False,'sourcePricesEdited':False,'productExternalWrites':0}
lagreport={**common,'dateRange':['2026-09-14','2026-09-29'],'rawTargetRange':['2026-09-09','2026-09-29'],'counts':formatcounts(lagcounts),'byDate':[{'date':d,'counts':formatcounts(x)} for d,x in sorted(bydate.items())],'firstFiveCoincidenceExamplesByNonzeroLag':dict(examples)};dump('recent-close-lag-diagnostic.json',lagreport)
report={**common,'officialDocumentation':'https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/inquire_daily_itemchartprice.py','documentedMarketCodes':{'J':'KRX','NX':'NXT','UN':'combined'},'documentedAdjustmentCode':{'0':'adjusted','1':'original'},'allCallsAdjustmentCode':'0','apiPath':'/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice','trId':'FHKST03010100','priceApiCallCount':8,'returnedCloseField':'stck_clpr','marketOverrideOnlyForNXUN':True,'pairCounts':dict(all_pair_counts),'rows':variantrows,'elapsedSeconds':time.time()-start};dump('live-kis-frozen-naver-comparison.json',report)
print(json.dumps({'lagCounts':lagreport['counts'],'livePairCounts':report['pairCounts'],'elapsedSeconds':report['elapsedSeconds']},ensure_ascii=False))
