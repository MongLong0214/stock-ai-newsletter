from __future__ import annotations
import argparse,datetime,hashlib,json,math,os,re,sys,time
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlencode
from curl_cffi import requests

BASE=Path('/tmp/composite-score-experimental-20260930/naver-history')
SOURCE=Path('/tmp/stock-research-fresh-mature-20260930/input/metadata.json')
CUTOFF='2026-09-29'; INTERVAL=1.0; MAX_ATTEMPTS=3; COUNT=2000
SCHEMA='naver-fchart-raw-ohlcv-flags-v1'

def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(b):return hashlib.sha256(b).hexdigest()
def encoded(x):return (json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode()
def atomic(path,data):
 p=path.with_suffix(path.suffix+'.tmp');p.write_bytes(data);os.replace(p,path)
def safe(symbol):return symbol.replace(':','_')

class ChartParser(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.chart=None;self.items=[];self.closed=False;self.charts=0
 def handle_starttag(self,tag,attrs):
  if tag=='chartdata':self.chart=dict(attrs);self.charts+=1
  if tag=='item':self.items.append(dict(attrs).get('data'))
 def handle_endtag(self,tag):
  if tag=='chartdata':self.closed=True

def parse(raw,symbol):
 # Decode according to the response XML declaration; preserve original bytes separately.
 head=raw[:160].decode('ascii','ignore');match=re.search(r'encoding=[\"\']([^\"\']+)',head,re.I);encoding=match.group(1) if match else 'utf-8'
 body=raw.decode(encoding,errors='strict');p=ChartParser();p.feed(body);p.close()
 code=symbol.split(':')[-1]
 if p.charts!=1 or not p.closed or not p.chart or p.chart.get('symbol')!=code or p.chart.get('timeframe')!='day':raise ValueError('XML chart identity/closure contract failed')
 rows=[];all_dates=[];future=0;dups=[];seen=set();flag_counts={};parse_invalid=0
 for item in p.items:
  values=item.split('|') if isinstance(item,str) else []
  if len(values)!=6 or not re.fullmatch(r'\d{8}',values[0]):raise ValueError('XML item does not have six fields with YYYYMMDD date')
  date=datetime.datetime.strptime(values[0],'%Y%m%d').date().isoformat();all_dates.append(date)
  if date in seen:dups.append(date)
  seen.add(date)
  if date>CUTOFF:future+=1;continue
  fields=[];bad_number=False
  for text in values[1:]:
   try:
    value=float(text)
    if not math.isfinite(value):value=None;bad_number=True
    elif value.is_integer():value=int(value)
   except (ValueError,OverflowError):value=None;bad_number=True
   fields.append(value)
  o,h,l,c,v=fields;finite_prices=all(isinstance(x,(int,float)) for x in fields[:4]);positive=finite_prices and min(fields[:4])>0
  contained=bool(positive and l<=min(o,c)<=max(o,c)<=h)
  deviation=max(l-min(o,c),max(o,c)-h,h-l if h<l else 0,0) if positive else None
  flags={'invalidOhlc':not contained,'missingOrNonFiniteNumber':bad_number,'nonPositivePrice':bool(finite_prices and not positive),'ohlcContainmentViolation':bool(positive and not contained),'roundingLikeContainmentViolation':bool(positive and not contained and deviation<=3),'zeroVolume':v==0,'missingOrNegativeVolume':v is None or v<0,'suspensionLike':bool(v==0 and (not positive or (o==h==l==c)))}
  for key,val in flags.items():
   if val:flag_counts[key]=flag_counts.get(key,0)+1
  row={'symbol':symbol,'trade_date':date,'open':o,'high':h,'low':l,'close':c,'volume':v,'source':'naver-fchart','flags':flags}
  rows.append(row)
 if dups:raise ValueError('Duplicate trade dates in one source response: '+','.join(dups[:3]))
 rows.sort(key=lambda r:r['trade_date'])
 return rows,{'chart':p.chart,'wireEncoding':encoding,'rawRows':len(p.items),'normalizedRows':len(rows),'excludedAfterCutoff':future,'firstRawDate':min(all_dates,default=None),'lastRawDate':max(all_dates,default=None),'firstDate':rows[0]['trade_date'] if rows else None,'lastDate':rows[-1]['trade_date'] if rows else None,'duplicateDates':0,'flagCounts':flag_counts}

def load_lines(path):
 if not path.exists():return []
 data=path.read_bytes();lines=data.splitlines(keepends=True);valid=[];size=0
 for i,line in enumerate(lines):
  if not line.endswith(b'\n'):
   if i!=len(lines)-1:raise RuntimeError('Nonterminal truncated checkpoint')
   atomic(path,data[:size]);break
  valid.append(json.loads(line));size+=len(line)
 return valid

def run():
 parser=argparse.ArgumentParser();parser.add_argument('--verify-only',action='store_true');parser.add_argument('--stop-after',type=int);args=parser.parse_args()
 BASE.mkdir(exist_ok=True);(BASE/'raw').mkdir(exist_ok=True)
 source_bytes=SOURCE.read_bytes();meta=json.loads(source_bytes);masters=sorted(meta['masters'],key=lambda x:x['symbol']);symbols=[x['symbol'] for x in masters]
 if len(symbols)!=2431 or len(set(symbols))!=2431:raise RuntimeError('Expected exactly 2431 unique fixed masters')
 if any(not re.fullmatch(r'KOS(?:PI|DAQ):[0-9A-Z]{6}',s) for s in symbols):raise RuntimeError('Unexpected symbol contract')
 snapshot={'schema':SCHEMA,'sourceMetadataPath':str(SOURCE),'sourceMetadataSha256':digest(source_bytes),'sourceDownloadedAt':meta.get('downloadedAt'),'masters':masters,'symbols':['KOSPI']+symbols,'currentMasterSurvivorshipBias':True,'pointInTimeHistoricalUniverse':False}
 snapshot_bytes=encoded(snapshot);sp=BASE/'master-snapshot.json'
 if sp.exists() and sp.read_bytes()!=snapshot_bytes:raise RuntimeError('Frozen master snapshot differs; refusing mixed universe')
 if not sp.exists():atomic(sp,snapshot_bytes)
 ordered=snapshot['symbols'];manifest_path=BASE/'manifest.json';checkpoint_path=BASE/'checkpoints.ndjson';prices_path=BASE/'prices.ndjson'
 script_hash=digest(Path(__file__).read_bytes());new_manifest={'schema':SCHEMA,'createdAt':now(),'source':'naver-fchart','endpointTemplate':'https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count=2000&requestType=0','requestedCount':COUNT,'normalizedThroughDate':CUTOFF,'rateRequestsPerSecond':1,'maximumAttemptsPerSymbol':MAX_ATTEMPTS,'masterSnapshotSha256':digest(snapshot_bytes),'scriptSha256':script_hash,'currentMasterSymbols':2431,'benchmarkSymbols':1,'totalRequestedSymbols':len(ordered),'currentMasterSurvivorshipBias':True,'pointInTimeHistoricalUniverse':False,'kisMerged':False,'labelsComputed':False,'performanceComputed':False,'productExternalWrites':0,'rawBytesPreserved':True,'status':'running'}
 if manifest_path.exists():
  manifest=json.loads(manifest_path.read_bytes())
  for k in ['schema','masterSnapshotSha256','scriptSha256','normalizedThroughDate']:
   if manifest.get(k)!=new_manifest[k]:raise RuntimeError('Resume manifest identity mismatch: '+k)
 else:manifest=new_manifest;atomic(manifest_path,encoded(manifest))
 checkpoints=load_lines(checkpoint_path);by_symbol={c['symbol']:c for c in checkpoints}
 if len(by_symbol)!=len(checkpoints) or any(s not in ordered for s in by_symbol):raise RuntimeError('Duplicate/foreign checkpoint symbol')
 committed=0;verified=0
 with prices_path.open('a+b') as prices:
  for cp in checkpoints:
   if cp['status']!='success':continue
   raw_path=BASE/cp['rawPath'];raw=raw_path.read_bytes()
   if digest(raw)!=cp['rawSha256']:raise RuntimeError('Raw byte identity failed '+cp['symbol'])
   rows,info=parse(raw,cp['symbol']);line=encoded([cp['symbol'],rows])
   if digest(line)!=cp['normalizedSha256'] or len(line)!=cp['normalizedBytes'] or cp['normalizedOffset']!=committed:raise RuntimeError('Reparsed checkpoint bytes differ '+cp['symbol'])
   prices.seek(committed)
   if prices.read(len(line))!=line:raise RuntimeError('Committed prices bytes differ '+cp['symbol'])
   committed+=len(line);verified+=1
  prices.seek(0,os.SEEK_END)
  if prices.tell()>committed:prices.truncate(committed);prices.flush();os.fsync(prices.fileno())
 if args.verify_only:
  print(json.dumps({'verifiedSuccessCheckpoints':verified,'totalCheckpoints':len(checkpoints),'pricesCommittedBytes':committed,'rawAndNormalizedIdentityVerified':True}));return

 start=time.monotonic();session_start=now();last_request=-1e9;session_attempts=0;reused_orphans=0;next_milestone=(len(checkpoints)*10//len(ordered)+1)*10
 def progress():
  success=sum(c['status']=='success' for c in checkpoints);failed=sum(c['status']=='failed' for c in checkpoints);empty=sum(c['status']=='success' and c['normalizedRows']==0 for c in checkpoints);elapsed=time.monotonic()-start
  done=len(checkpoints);remaining=len(ordered)-done;session_done=done-initial_done;eta=remaining*max(INTERVAL,elapsed/max(session_done,1))
  value={'schema':SCHEMA,'updatedAt':now(),'status':'running' if remaining else 'collected','totalSymbols':len(ordered),'completedSymbols':done,'successfulSymbols':success,'emptySymbols':empty,'failedSymbols':failed,'pendingSymbols':remaining,'normalizedRows':sum(c.get('normalizedRows',0) for c in checkpoints),'rawRows':sum(c.get('rawRows',0) for c in checkpoints),'excludedAfterCutoff':sum(c.get('excludedAfterCutoff',0) for c in checkpoints),'httpAttemptsTotal':sum(len(c.get('attempts',[])) for c in checkpoints),'sessionHttpAttempts':session_attempts,'sessionStartedAt':session_start,'sessionElapsedSeconds':round(elapsed,3),'estimatedSecondsRemaining':round(eta),'resumedVerifiedSymbols':verified,'reusedOrphanRawResponses':reused_orphans,'percentComplete':round(done/len(ordered)*100,2),'productExternalWrites':0}
  atomic(BASE/'progress.json',encoded(value));return value
 initial_done=len(checkpoints);progress()
 session=requests.Session(impersonate='safari')
 for symbol in ordered:
  if symbol in by_symbol:continue
  code=symbol.split(':')[-1];url='https://fchart.stock.naver.com/sise.nhn?'+urlencode({'symbol':code,'timeframe':'day','count':COUNT,'requestType':0});raw_path=BASE/'raw'/f'{safe(symbol)}.xml';attempts=[];raw=None;info=None;rows=None;fetched_at=None
  if raw_path.exists():
   raw=raw_path.read_bytes();rows,info=parse(raw,symbol);fetched_at=datetime.datetime.fromtimestamp(raw_path.stat().st_mtime,datetime.timezone.utc).isoformat();reused_orphans+=1
  else:
   for attempt in range(1,MAX_ATTEMPTS+1):
    wait=max(0,INTERVAL-(time.monotonic()-last_request));time.sleep(wait)
    last_request=time.monotonic();session_attempts+=1;started=now();record={'attempt':attempt,'startedAt':started,'url':url};response=None
    try:
     response=session.get(url,headers={'Referer':'https://fchart.stock.naver.com/'},timeout=25,allow_redirects=False)
     record.update(status=response.status_code,elapsedSeconds=round(time.monotonic()-last_request,3),responseBytes=len(response.content),rawSha256=digest(response.content),contentType=response.headers.get('Content-Type'))
     candidate=response.content
     if response.status_code!=200:raise ValueError('HTTP status '+str(response.status_code))
     parsed,parsed_info=parse(candidate,symbol)
     raw=candidate;rows=parsed;info=parsed_info;fetched_at=now();atomic(raw_path,raw);record['result']='success';attempts.append(record);break
    except Exception as exc:
     record['result']='failed';record['error']=str(exc)[:400]
     if response is not None:
      failure_path=BASE/'raw'/f'{safe(symbol)}.attempt{attempt}.response';atomic(failure_path,response.content);record['responsePath']=str(failure_path.relative_to(BASE))
     attempts.append(record)
     if attempt<MAX_ATTEMPTS:time.sleep(5*2**(attempt-1))
  cp={'symbol':symbol,'finishedAt':now(),'attempts':attempts}
  if raw is not None and info is not None:
   line=encoded([symbol,rows]);cp.update(status='success',fetchedAt=fetched_at,rawPath=str(raw_path.relative_to(BASE)),rawSha256=digest(raw),rawBytes=len(raw),normalizedSha256=digest(line),normalizedOffset=committed,normalizedBytes=len(line),**info)
   with prices_path.open('ab') as f:f.write(line);f.flush();os.fsync(f.fileno())
   committed+=len(line)
  else:cp.update(status='failed',failureReason=attempts[-1]['error'] if attempts else 'Unknown failure')
  with checkpoint_path.open('ab') as f:f.write(encoded(cp));f.flush();os.fsync(f.fileno())
  checkpoints.append(cp);by_symbol[symbol]=cp;p=progress()
  if p['percentComplete']>=next_milestone or p['pendingSymbols']==0:
   print(json.dumps({'event':'milestone',**p}),flush=True);next_milestone+=10
  if cp['status']=='failed':print(json.dumps({'event':'symbol_failed','symbol':symbol,'attempts':len(attempts),'reason':cp.get('failureReason')}),flush=True)
  if args.stop_after and len(checkpoints)>=args.stop_after:
   print(json.dumps({'event':'stopped_at_requested_checkpoint',**p}),flush=True);return

 # All outputs below summarize observed source coverage only, never future outcomes.
 index_cp=by_symbol.get('KOSPI');anchor_cp=by_symbol.get('KOSPI:005930');calendar=[];anchor=[]
 if index_cp and index_cp['status']=='success':calendar=[r['trade_date'] for r in parse((BASE/index_cp['rawPath']).read_bytes(),'KOSPI')[0] if not r['flags']['invalidOhlc']]
 if anchor_cp and anchor_cp['status']=='success':anchor=[r['trade_date'] for r in parse((BASE/anchor_cp['rawPath']).read_bytes(),'KOSPI:005930')[0] if not r['flags']['invalidOhlc'] and r['volume']>0]
 calendar_set=set(calendar);coverage=[];totals={};sample=[];normalized_sha=hashlib.sha256()
 with prices_path.open('rb') as f:
  for line in f:
   normalized_sha.update(line);symbol,rows=json.loads(line);bydate={r['trade_date']:r for r in rows};run_length=0;valid320=0;valid_rows=0
   for date in calendar:
    row=bydate.get(date);valid=bool(row and not row['flags']['invalidOhlc'] and not row['flags']['missingOrNegativeVolume'] and row['volume']>0)
    run_length=run_length+1 if valid else 0;valid320+=run_length>=320;valid_rows+=valid
   if rows:
    missing=[d for d in calendar if rows[0]['trade_date']<=d<=rows[-1]['trade_date'] and d not in bydate]
    outside=[d for d in bydate if d not in calendar_set]
   else:missing=[];outside=[]
   coverage.append({'symbol':symbol,'rows':len(rows),'firstDate':rows[0]['trade_date'] if rows else None,'lastDate':rows[-1]['trade_date'] if rows else None,'validPositiveVolumeRowsOnIndexCalendar':valid_rows,'signalSessionsWith320ConsecutiveValidOhlcv':valid320,'missingObservedSessionsWithinOwnRange':len(missing),'datesOutsideIndexCalendar':len(outside)})
   for r in rows:
    for key,val in r['flags'].items():
     if val:totals[key]=totals.get(key,0)+1
   if symbol!='KOSPI' and rows and len(sample)<3:sample.append(rows[0])
 calendar_report={'schema':SCHEMA,'benchmarkSymbol':'KOSPI','calendarSource':'Observed valid Naver KOSPI OHLC dates only','dates':calendar,'firstDate':calendar[0] if calendar else None,'lastDate':calendar[-1] if calendar else None,'count':len(calendar),'anchorSymbol':'KOSPI:005930','indexMissingVsPositiveVolumeAnchor':sorted(set(anchor)-calendar_set),'indexExtraVsPositiveVolumeAnchor':sorted(calendar_set-set(anchor)),'indexAndAnchorCalendarEqual':bool(calendar and anchor and calendar_set==set(anchor)),'holidayDatesInvented':False}
 atomic(BASE/'calendar.json',encoded(calendar_report));atomic(BASE/'coverage.ndjson',b''.join(encoded(x) for x in coverage));atomic(BASE/'schema-sample.json',encoded({'schema':SCHEMA,'pricesNdjsonShape':'Each line [symbol, array of normalized OHLCV rows with flags]. Raw invalid values preserved, no repaired candles.','rows':sample}))
 final=progress();final['status']='complete';atomic(BASE/'progress.json',encoded(final));manifest.update(status='complete',finishedAt=now(),coverage=final,flags=totals,pricesSha256=normalized_sha.hexdigest(),pricesBytes=prices_path.stat().st_size,checkpointsSha256=digest(checkpoint_path.read_bytes()),calendarSha256=digest((BASE/'calendar.json').read_bytes()),failedSymbols=[{'symbol':c['symbol'],'reason':c.get('failureReason')} for c in checkpoints if c['status']=='failed'],emptySymbols=[c['symbol'] for c in checkpoints if c['status']=='success' and not c['normalizedRows']],firstNormalizedDate=min((c['firstDate'] for c in checkpoints if c.get('firstDate')),default=None),lastNormalizedDate=max((c['lastDate'] for c in checkpoints if c.get('lastDate')),default=None),calendarValidated=calendar_report['indexAndAnchorCalendarEqual'],symbolsWithAtLeastOne320SessionWindow=sum(c['signalSessionsWith320ConsecutiveValidOhlcv']>0 for c in coverage),resumeByteVerificationPassed=True)
 atomic(manifest_path,encoded(manifest));print(json.dumps({'event':'complete',**final,'pricesSha256':manifest['pricesSha256'],'calendarValidated':manifest['calendarValidated']}),flush=True)

if __name__=='__main__':run()
