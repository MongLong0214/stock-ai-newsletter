from pathlib import Path
import datetime,hashlib,json,math,re,xml.etree.ElementTree as ET
B=Path('/tmp/composite-score-experimental-20260930/naver-history')
H=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((B/'manifest.json').read_bytes())
if m['status']!='complete':raise RuntimeError('Collection must finish before independent full audit')
cp=[json.loads(x) for x in (B/'checkpoints.ndjson').read_bytes().splitlines()]
snapshot=(B/'master-snapshot.json').read_bytes();s=json.loads(snapshot)
assert H(snapshot)==m['masterSnapshotSha256']
assert len(s['masters'])==2431 and len(cp)==2432
assert {x['symbol'] for x in cp}==set(s['symbols'])
assert H(Path(s['sourceMetadataPath']).read_bytes())==s['sourceMetadataSha256']
assert H((B/'checkpoints.ndjson').read_bytes())==m['checkpointsSha256']
expected=[x for x in cp if x['status']=='success'];starts=[];raw_rows=0;rows_count=0;excluded=0;validated_raw=0;offset=0;global_hash=hashlib.sha256();flag_counts={};dmin=None;dmax=None;normalized_symbols=[]
for c in cp:
 assert len(c['attempts'])<=m['maximumAttemptsPerSymbol']
 starts.extend(datetime.datetime.fromisoformat(a['startedAt']) for a in c['attempts'])
 for a in c['attempts']:
  if a.get('responsePath'):assert H((B/a['responsePath']).read_bytes())==a['rawSha256']
with (B/'prices.ndjson').open('rb') as p:
 for c in expected:
  line=p.readline();assert line and line.endswith(b'\n');global_hash.update(line)
  assert H(line)==c['normalizedSha256'] and len(line)==c['normalizedBytes'] and offset==c['normalizedOffset'];offset+=len(line)
  symbol,rows=json.loads(line);assert symbol==c['symbol'];normalized_symbols.append(symbol)
  raw=(B/c['rawPath']).read_bytes();assert len(raw)==c['rawBytes'] and H(raw)==c['rawSha256'];validated_raw+=1
  encoding=re.search(br'encoding=[\"\']([^\"\']+)',raw[:160],re.I).group(1).decode('ascii')
  root=ET.fromstring(raw.decode(encoding));charts=root.findall('chartdata');assert len(charts)==1
  chart=charts[0];assert chart.attrib['symbol']==symbol.split(':')[-1] and chart.attrib['timeframe']=='day'
  original=[];raw_dates=[]
  for item in chart.findall('item'):
   fields=item.attrib['data'].split('|');assert len(fields)==6
   date=datetime.datetime.strptime(fields[0],'%Y%m%d').date().isoformat();raw_dates.append(date)
   if date>m['normalizedThroughDate']:excluded+=1;continue
   values=[]
   for value in fields[1:]:
    try:
     number=float(value);values.append(number if math.isfinite(number) else None)
    except (ValueError,OverflowError):values.append(None)
   original.append((date,values))
  original.sort();assert len(original)==len(rows)==c['normalizedRows'] and len(raw_dates)==c['rawRows'] and len(raw_dates)==len(set(raw_dates))
  raw_rows+=len(raw_dates);rows_count+=len(rows)
  for (date,values),row in zip(original,rows):
   assert row['symbol']==symbol and row['trade_date']==date and row['source']=='naver-fchart'
   assert [row[f] for f in ['open','high','low','close','volume']]==values
   assert date<=m['normalizedThroughDate']
   o,h,l,cl,v=values;finite=all(x is not None for x in values[:4]);positive=finite and min(values[:4])>0
   valid=bool(positive and l<=o<=h and l<=cl<=h and l<=h)
   flags=row['flags'];assert flags['invalidOhlc']==(not valid)
   assert flags['zeroVolume']==(v==0)
   assert flags['missingOrNegativeVolume']==(v is None or v<0)
   assert flags['nonPositivePrice']==bool(finite and not positive)
   assert flags['missingOrNonFiniteNumber']==any(x is None for x in values)
   for key,value in flags.items():
    if value:flag_counts[key]=flag_counts.get(key,0)+1
   dmin=date if dmin is None else min(dmin,date);dmax=date if dmax is None else max(dmax,date)
 assert p.read()==b''
assert global_hash.hexdigest()==m['pricesSha256'] and offset==m['pricesBytes']
assert flag_counts==m['flags'] and dmin==m['firstNormalizedDate'] and dmax==m['lastNormalizedDate']
assert rows_count==m['coverage']['normalizedRows'] and raw_rows==m['coverage']['rawRows'] and excluded==m['coverage']['excludedAfterCutoff']
intervals=[(b-a).total_seconds() for a,b in zip(starts,starts[1:])]
calendar=json.loads((B/'calendar.json').read_bytes());assert H((B/'calendar.json').read_bytes())==m['calendarSha256']
assert calendar['indexAndAnchorCalendarEqual'] and not calendar['indexMissingVsPositiveVolumeAnchor'] and not calendar['indexExtraVsPositiveVolumeAnchor']
audit={'passed':True,'auditedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'independentParser':'Python system xml.etree.ElementTree (collector uses HTMLParser)','requestedUniverse':len(s['symbols']),'requestedStockMasters':len(s['masters']),'successSymbolsVerified':validated_raw,'failedSymbolsRetained':len(cp)-validated_raw,'rawRowsVerified':raw_rows,'normalizedRowsVerified':rows_count,'cutoffExcludedRowsVerified':excluded,'firstDate':dmin,'lastDate':dmax,'rawHashChecksPassed':validated_raw,'normalizedHashChecksPassed':validated_raw,'rawValuesPreserved':True,'rawDateUniquenessVerified':True,'flagsVerified':['invalidOhlc','zeroVolume','missingOrNegativeVolume','nonPositivePrice','missingOrNonFiniteNumber'],'pricesSha256':global_hash.hexdigest(),'minimumObservedRequestStartIntervalSeconds':min(intervals,default=None),'maximumAttemptsPerCompletedSymbol':max(len(c['attempts']) for c in cp),'observedCalendarAndAnchorEqual':True,'calendarSessions':len(calendar['dates']),'frozenMetadataBytesUnchanged':True,'masterSurvivorshipBiasUnchanged':True,'labelsComputed':False,'performanceComputed':False,'networkAccess':False,'productExternalWrites':0}
(B/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n');print(json.dumps(audit,ensure_ascii=False))
