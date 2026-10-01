from __future__ import annotations
import collections,datetime,hashlib,json,math,statistics,time
from pathlib import Path
B=Path('/tmp/composite-score-experimental-20260930');N=B/'naver-history';O=B/'source-bridge';K=Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson');FILES=[B/'kis-outer-ledger.json',B/'kis-l0-outer-ledger.json'];FIELDS=['open','high','low','close','volume'];MIN='2025-12-23';MAX='2026-09-18';END='2026-09-29';COST=.003

def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for c in iter(lambda:f.read(8*1024*1024),b''):h.update(c)
 return h.hexdigest()
def finite(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def valid(r):
 if r is None:return False
 o,h,l,c=[r.get(f) for f in FIELDS[:4]]
 return all(finite(x) and x>0 for x in [o,h,l,c]) and l<=o<=h and l<=c<=h

def label(bars):
 raw=len(bars)==5 and all(valid(r) for r in bars);strict=raw and all(finite(r['volume']) and r['volume']>0 for r in bars)
 out={'rawMarkValid':raw,'strictLabelValid':strict,'missingBar':any(r is None for r in bars),'invalidOhlc':any(not valid(r) for r in bars),'zeroOrMissingVolume':any(r is None or not finite(r.get('volume')) or r['volume']<=0 for r in bars),'entry':bars[0]['open'] if bars[0] and finite(bars[0].get('open')) and bars[0]['open']>0 else None,'grossD5':None,'netD5':None,'touch':None,'L0':None,'L5':None,'D1bullish':None,'mae':None,'maxGainPercent':None}
 if raw:
  entry=bars[0]['open'];gross=bars[-1]['close']/entry-1;high=max(r['high'] for r in bars);out.update(rawGrossD5=gross,rawNetD5=gross-COST)
 if strict:
  touch=math.floor(high+.5)*100>=math.floor(entry+.5)*110;net=gross-COST
  out.update(grossD5=gross,netD5=net,touch=touch,L0=net<0,L5=net<=-.05,D1bullish=bars[0]['close']>entry,mae=min(0,min(r['low'] for r in bars)/entry-1),maxGainPercent=(high/entry-1)*100)
 return out

def ratios(kb,nb):
 full=[];days=[];differences=[];missing=False
 for k,n in zip(kb,nb):
  if not k or not n:missing=True;days.append(None);continue
  pr=[n[f]/k[f] if finite(n.get(f)) and finite(k.get(f)) and n[f]>0 and k[f]>0 else None for f in FIELDS[:4]];vr=n['volume']/k['volume'] if finite(n.get('volume')) and finite(k.get('volume')) and k['volume']>0 else None
  vals=[x for x in pr if x is not None];day={'ohlcRatios':dict(zip(FIELDS[:4],pr)),'volumeRatio':vr,'medianPriceScale':statistics.median(vals) if len(vals)==4 else None,'allPricesPositive':len(vals)==4}
  if len(vals)==4:day['relativeOhlcScaleSpread']=max(vals)/min(vals)-1;full.extend(vals)
  days.append(day);differences.append(any(k.get(f)!=n.get(f) for f in FIELDS))
 all20=len(full)==20;alluniform=all(d and d['allPricesPositive'] and d['relativeOhlcScaleSpread']<=.002 for d in days);scales=[d['medianPriceScale'] for d in days if d and d['medianPriceScale'] is not None];spread=max(scales)/min(scales)-1 if len(scales)==5 else None
 constant=all20 and max(full)/min(full)-1<=.002;scale=statistics.median(full) if all20 else None;away=scale is not None and abs(scale-1)>=.005
 if missing:kind='missing_bar'
 elif not any(differences):kind='all_ohlcv_exact'
 elif not all20:kind='invalid_or_nonpositive_price'
 elif constant and away:kind='constant_adjustment_scale_like'
 elif alluniform and spread is not None and spread>.002:kind='changing_daily_scale_like'
 elif constant:kind='near_unit_scale_small_differences'
 else:kind='nonuniform_ohlc_changes'
 return {'classification':kind,'constantAcrossAll20OhlcWithin0p2pct':constant,'medianPriceScale':scale,'dayMedianScaleSpread':spread,'days':days,'anyOhlcvDifference':any(differences),'corporateActionConfirmed':False}

start=time.monotonic();hash_before={str(p):sha(p) for p in [K,N/'prices.ndjson',*FILES]};assert hash_before[str(K)]=='c0fe673a5c0cef5197625d2ccd811c900bbe6655e81a66f4b797c6e741a1ce54';assert hash_before[str(N/'prices.ndjson')]=='6347d11d70043a9016f751f8f4c1de31f4498c20d29f7e69688b8e76dbd003a8'
calendar=json.loads((N/'calendar.json').read_bytes())['dates'];idx={d:i for i,d in enumerate(calendar)};selected={};policy_keys={};ledger_days={}
for path in FILES:
 ledger=json.loads(path.read_bytes());cohort='L5' if path.name=='kis-outer-ledger.json' else 'L0'
 for policy in ledger['policies']:
  name=cohort+'/'+policy['name'];policy_keys[name]=[];ledger_days[name]=len(policy['days'])
  for day in policy['days']:
   date=day['signalDate'];assert MIN<=date<=MAX
   dd=calendar[idx[date]+1:idx[date]+6];assert len(dd)==5 and dd[0]>'2025-12-23' and dd[-1]<=END
   for p in day['picks']:
    assert p['date']==date and p['recommendationDate']==dd[0] and p['expectedD5date']==dd[-1]
    assert [x['date'] for x in p['dailyBars']]==dd
    key=(date,p['symbol']);policy_keys[name].append(key)
    if key not in selected:selected[key]={'signalDate':date,'symbol':p['symbol'],'currentMasterName':p['currentMasterName'],'dates':dd,'memberships':[],'ledgerOutcomes':[],'ledgerBars':[]}
    selected[key]['memberships'].append(name);selected[key]['ledgerOutcomes'].append(p['outcome']);selected[key]['ledgerBars'].append(p['dailyBars'])
# Only the explicitly selected 2025-2026 five-day windows are allowed to reach the label function.
allow=collections.defaultdict(set)
for x in selected.values():allow[x['symbol']].update(x['dates'])
assert all('2025-12-24'<=d<=END for ds in allow.values() for d in ds)
kr=collections.defaultdict(dict)
with K.open('rb') as f:
 for line in f:
  symbol,rows=json.loads(line)
  if symbol not in allow:continue
  for r in rows:
   if r['trade_date'] in allow[symbol]:kr[symbol][r['trade_date']]=r
cp={c['symbol']:c for c in map(json.loads,(N/'checkpoints.ndjson').read_text().splitlines())};nr=collections.defaultdict(dict)
with (N/'prices.ndjson').open('rb') as f:
 for symbol,ds in allow.items():
  c=cp[symbol];f.seek(c['normalizedOffset']);line=f.read(c['normalizedBytes']);assert hashlib.sha256(line).hexdigest()==c['normalizedSha256'];s,rows=json.loads(line);assert s==symbol
  for r in rows:
   if r['trade_date'] in ds:nr[symbol][r['trade_date']]=r
records=[];bykey={};mismatches=[]
for key,x in sorted(selected.items()):
 symbol=x['symbol'];dd=x['dates'];assert MIN<=x['signalDate']<=MAX and all('2025-12-24'<=d<=END for d in dd)
 kb=[kr[symbol].get(d) for d in dd];nb=[nr[symbol].get(d) for d in dd];kl=label(kb);nl=label(nb)
 for original,bars in zip(x['ledgerOutcomes'],x['ledgerBars']):
  for r,b in zip(kb,bars):
   if r is None:assert all(b.get(f) is None for f in FIELDS)
   else:assert all(r.get(f)==b.get(f) for f in FIELDS)
  assert original['rawMarkValid']==kl['rawMarkValid'] and original['strictLabelValid']==kl['strictLabelValid']
  if kl['strictLabelValid']:
   assert abs(original['net5d']-kl['netD5'])<1e-12 and original['touch']==kl['touch'] and original['entryBullish']==kl['D1bullish']
 pair=kl['strictLabelValid'] and nl['strictLabelValid'];changes={f:kl[f]!=nl[f] if pair else None for f in ['touch','L0','L5','D1bullish']}
 rec={'signalDate':x['signalDate'],'symbol':symbol,'currentMasterName':x['currentMasterName'],'entryDate':dd[0],'D5date':dd[-1],'memberships':x['memberships'],'sourceDifferences':ratios(kb,nb),'includesRecentMismatchPeriod':any(d>='2026-09-14' for d in dd),'kis':kl,'naver':nl,'bothStrict':pair,'change':changes,'netD5DifferenceNaverMinusKis':nl['netD5']-kl['netD5'] if pair else None,'dailyBars':[{'session':j+1,'date':d,'kis':{f:kb[j].get(f) for f in FIELDS} if kb[j] else None,'naver':{f:nb[j].get(f) for f in FIELDS} if nb[j] else None} for j,d in enumerate(dd)]}
 records.append(rec);bykey[key]=rec

def summarize(rr):
 known=[r for r in rr if r['bothStrict']];changed=[r for r in known if any(r['change'].values())];s={'selections':len(rr),'uniquePicks':len({(r['signalDate'],r['symbol']) for r in rr}),'kisUnknownRetained':sum(not r['kis']['strictLabelValid'] for r in rr),'naverUnknownRetained':sum(not r['naver']['strictLabelValid'] for r in rr),'bothStrict':len(known),'sourceDifferenceClasses':dict(collections.Counter(r['sourceDifferences']['classification'] for r in rr)),'eventChangedRows':len(changed),'touchFlips':sum(r['change']['touch'] for r in known),'L0Flips':sum(r['change']['L0'] for r in known),'L5Flips':sum(r['change']['L5'] for r in known),'D1bullishFlips':sum(r['change']['D1bullish'] for r in known),'maxAbsoluteNetD5Difference':max((abs(r['netD5DifferenceNaverMinusKis']) for r in known),default=None),'meanNetD5Difference':statistics.mean(r['netD5DifferenceNaverMinusKis'] for r in known) if known else None}
 for f in ['touch','L0','L5']:
  s[f+'KisTrueNaverFalse']=sum(r['kis'][f] and not r['naver'][f] for r in known);s[f+'KisFalseNaverTrue']=sum(not r['kis'][f] and r['naver'][f] for r in known)
 return s
summaries={name:{'days':ledger_days[name],**summarize([bykey[k] for k in keys])} for name,keys in policy_keys.items()}
worst=sorted((r for r in records if r['kis']['strictLabelValid']),key=lambda r:r['kis']['netD5'])[:20]
worst_summary=summarize(worst);classes={c:summarize([r for r in records if r['sourceDifferences']['classification']==c]) for c in sorted({r['sourceDifferences']['classification'] for r in records})};hash_after={p:sha(Path(p)) for p in hash_before};assert hash_after==hash_before
report={'schema':'selected-provider-diagnostic-v1','scope':'Post-hoc source quality diagnostic of already-reused KIS 2025-2026 selected ledger positions; no new Naver 2023-2024 label/outcome/model selection','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':round(time.monotonic()-start,3),'allowedSignalDateRange':[MIN,MAX],'allowedFutureBarDateRange':['2025-12-24',END],'actualObservedCalendar':'naver-history/calendar.json; every ledger D1-D5 date independently matched','fixedRoundTripCost':COST,'labels':{'touch':'Math.round(high)*100 >= Math.round(D1open)*110, any D1-D5 high','netD5':'D5close/D1open - 1 - .003','L0':'netD5 < 0','L5':'netD5 <= -.05','strict':'all five OHLC valid and finite strictly positive volume; otherwise event/net labels remain null'},'sourceHashesBefore':hash_before,'sourceHashesAfter':hash_after,'sourceBytesUnchanged':True,'policySummaries':summaries,'uniqueSelectedSummary':summarize(records),'uniqueSelectedByDifferenceClass':classes,'recentMismatchPeriodSummary':summarize([r for r in records if r['includesRecentMismatchPeriod']]),'earlierWindowSummary':summarize([r for r in records if not r['includesRecentMismatchPeriod']]),'worst20KisNetLossSummary':worst_summary,'worst20KisNetLossPairedWitnesses':worst,'selected':records,'ledgerBarsAndStrictLabelsIndependentlyReproduced':True,'newNaver2023_2024LabelsRead':False,'modelSelectionOrTuning':False,'originalKisLabelsOverwritten':False,'sourcePricesEdited':False,'productExternalWrites':0,'corporateActionCauseConfirmed':False,'causalOutOfSamplePerformanceClaim':False}
(O/'selected-cohort.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'elapsedSeconds':report['elapsedSeconds'],'summary':report['uniqueSelectedSummary'],'policies':summaries,'worst20':worst_summary},ensure_ascii=False))
