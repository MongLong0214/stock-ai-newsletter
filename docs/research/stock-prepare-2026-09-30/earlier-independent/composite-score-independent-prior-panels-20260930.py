import collections,hashlib,json,math,pathlib,statistics
B=pathlib.Path('/tmp/composite-score-research-20260930');extra=B/'calibration-extra'
def read(p):return json.loads(pathlib.Path(p).read_text())
calendar=read('/tmp/stock-research-fresh-mature-20260930/features/metadata.json')['tradingDays'];ci={d:i for i,d in enumerate(calendar)}
keys=read('/tmp/composite-score-independent-event-input-keys-20260930.json');members=collections.defaultdict(set)
for d,s in keys:members[d].add(s)
for line in (extra/'runtime-eligibility.ndjson').open():
 r=json.loads(line);assert r['date'] not in members;members[r['date']]=set(r['runtimeEligibleSymbols'])
dates=sorted(members,key=ci.__getitem__);assert len(dates)==423
assert dates==calendar[ci[dates[0]]:ci[dates[-1]]+1]
rawpath=pathlib.Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson');raw={};sourcecount=collections.Counter();need=set().union(*members.values())
for line in rawpath.open():
 s,rows=json.loads(line)
 if s not in need:continue
 dic={}
 for r in rows:
  d=r['trade_date']
  if r['source']=='kis' and d in ci and d>dates[0]:
   assert d not in dic;dic[d]=tuple(r[k] for k in ['open','high','low','close','volume']);sourcecount['rawRowsUsed']+=1
 raw[s]=dic
def finite(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
panels={}
for d in dates:
 futures=calendar[ci[d]+1:ci[d]+6];counts=collections.Counter();counts['eligible']=len(members[d]);mature=len(futures)==5
 for s in members[d]:
  rr=[raw.get(s,{}).get(day) for day in futures]
  complete=mature and all(r is not None for r in rr)
  valid=complete and all(all(finite(v) and v>0 for v in r[:4]) and r[2]<=min(r[0],r[3])<=max(r[0],r[3])<=r[1] for r in rr)
  volume=complete and all(finite(r[4]) and r[4]>0 for r in rr)
  if not (valid and volume):
   counts['unknown']+=1
   if not complete:counts['missingOrImmature']+=1
   elif not valid:counts['invalidOhlc']+=1
   else:counts['zeroVolume']+=1
   continue
  counts['strict']+=1;entry=rr[0][0]
  counts['touch']+=max(r[1] for r in rr)>=entry*110/100
  counts['D1bullish']+=rr[0][3]>entry
  counts['loss5']+=rr[-1][3]/entry-1-.003<=-.05
 assert counts['eligible']==counts['strict']+counts['unknown']
 panels[d]={'signalDate':d,'maturityDate':futures[-1] if mature else None,'futures':futures,'counts':{k:counts[k] for k in ['eligible','strict','unknown','missingOrImmature','invalidOhlc','zeroVolume','touch','D1bullish','loss5']},'prior':{h:counts[h]/counts['strict'] if counts['strict'] else None for h in ['touch','D1bullish','loss5']}}
inputaudit=read('/tmp/composite-score-independent-event-input-audit-20260930.json');earlier=inputaudit['signalDates'][:235];trainpriors={}
for scope,n in [('first150',150),('all235',235)]:
 meta=read(B/'event-composite-study'/(scope+'-model-meta.json'));assert meta['trainingDates']==earlier[:n]
 priors={h:statistics.fmean(panels[d]['prior'][h] for d in earlier[:n]) for h in ['touch','D1bullish','loss5']}
 for h,v in priors.items():assert abs(v-meta['metadata'][h]['dateBalancedWeightedEventRate'])<1e-14
 assert sum(panels[d]['counts']['strict'] for d in earlier[:n])==meta['trainingRows']
 trainpriors[scope]=priors
windows={}
for d in earlier[155:]+inputaudit['signalDates'][235:]:
 ds=calendar[ci[d]-24:ci[d]-4];assert len(ds)==20 and ds[-1]==calendar[ci[d]-5]
 assert all(s in panels and panels[s]['maturityDate']<=d and panels[s]['counts']['strict']>0 for s in ds)
 windows[d]={'signalDate':d,'calibrationSignalDates':ds,'calibrationMaturityDates':[panels[s]['maturityDate'] for s in ds],'sourceModel':'first150' if d in earlier else 'all235','recentPriors':{h:statistics.fmean(panels[s]['prior'][h] for s in ds) for h in ['touch','D1bullish','loss5']}}
out=pathlib.Path('/tmp/composite-score-independent-prior-panels-20260930.json')
report={'scope':'Independent all423 consecutive actual-calendar eligible panels, all509015 raw outcome checks, strict same-close mature last20 panel windows and source-prior metadata. No new fit or score policy.','counts':{'panels':len(panels),'eligible':sum(p['counts']['eligible'] for p in panels.values()),'strictLabels':sum(p['counts']['strict'] for p in panels.values()),'unknown':sum(p['counts']['unknown'] for p in panels.values()),'activatedSignalDates':len(windows)}|dict(sourcecount),'rawInputSha256':hashlib.file_digest(rawpath.open('rb'),'sha256').hexdigest(),'trainingPriors':trainpriors,'panels':panels,'windows':windows,'limits':['Same-close maturity is parent-authorized retrospective research assumption; actual production calibration fetch must await closed data.','Loss5 is D5net<=-5% inclusive 30bps, not any loss.','Current master/status snapshot and daily-price/fill limitations retained.']}
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'report':str(out),'counts':report['counts'],'trainingPriors':trainpriors}),flush=True)
