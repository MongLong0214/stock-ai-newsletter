from pathlib import Path
import json,hashlib,xml.etree.ElementTree as ET,statistics
base=Path('/tmp/composite-score-experimental-20260930')
kis=dict(json.loads(x) for x in (base/'long-history-sample-complete.ndjson').read_text().splitlines())
targets=[('KOSPI:005930','samsung'),('KOSDAQ:086520','ecopro'),('KOSDAQ:035900','jyp'),('KOSPI','kospi')]
reports=[];out=[]
for symbol,name in targets:
 p=base/f'naver-{name}.xml'; root=ET.fromstring(p.read_text());chart=root.find('chartdata');rows=[];invalid=[]
 for item in chart.findall('item'):
  vals=item.attrib['data'].split('|')
  if len(vals)!=6: raise ValueError((symbol,vals))
  d=vals[0];nums=list(map(float,vals[1:]));row=dict(zip(['open','high','low','close','volume'],nums));row.update(symbol=symbol,trade_date=f'{d[:4]}-{d[4:6]}-{d[6:]}',source='naver-fchart')
  if not (row['low']<=min(row['open'],row['close'])<=max(row['open'],row['close'])<=row['high'] and min(nums[:4])>0 and row['volume']>=0):invalid.append(row)
  rows.append(row)
 nr={r['trade_date']:r for r in rows};kr={r['trade_date']:r for r in kis[symbol]};common=sorted(nr.keys()&kr.keys());diff=[];fields={f:[] for f in ['open','high','low','close','volume']}
 for date in common:
  n,k=nr[date],kr[date];changed={}
  for f in fields:
   if n[f]!=k[f]:
    changed[f]={'naver':n[f],'kis':k[f],'difference':n[f]-k[f],'ratio':n[f]/k[f] if k[f] else None};fields[f].append(changed[f])
  if changed:diff.append({'date':date,'fields':changed})
 fstats={}
 for f,ds in fields.items():
  ratios=[x['ratio'] for x in ds if x['ratio'] is not None]
  fstats[f]={'different':len(ds),'equal':len(common)-len(ds),'maxAbsoluteDifference':max((abs(x['difference']) for x in ds),default=0),'medianRatioWhereDifferent':statistics.median(ratios) if ratios else None,'minRatioWhereDifferent':min(ratios,default=None),'maxRatioWhereDifferent':max(ratios,default=None)}
 rep={'symbol':symbol,'metadata':chart.attrib,'rows':len(rows),'firstDate':min(nr),'lastDate':max(nr),'duplicateDates':len(rows)-len(nr),'invalidRows':len(invalid),'invalidExamples':invalid[:3],'zeroVolume':sum(r['volume']==0 for r in rows),'currentUnfinishedSessionPresent':'2026-09-30' in nr,'comparisonRange':['2022-01-03','2024-12-30'],'comparisonDates':len(common),'kisDatesMissingNaver':sorted(kr.keys()-nr.keys()),'naverDatesMissingKisInComparisonRange':sorted(d for d in nr.keys()-kr.keys() if '2022-01-03'<=d<='2024-12-30'),'allOhlcvEqualRows':len(common)-len(diff),'differentRows':len(diff),'fieldStats':fstats,'differenceExamples':diff[:5],'rawSha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 (base/f'naver-kis-differences-{name}.json').write_text(json.dumps(diff,ensure_ascii=False,indent=2)+'\n');reports.append(rep);out.append([symbol,rows])
raw=base/'naver-long-history-sample.ndjson';raw.write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in out))
report={'retrievedAt':'2026-09-30','endpoint':'https://fchart.stock.naver.com/sise.nhn?symbol={symbol}&timeframe=day&count=2000&requestType=0','wireFormat':'XML with chartdata attributes and item data date|open|high|low|close|volume','formatVersionFieldPresent':False,'allResponsesEngineValidated':True,'samples':reports,'totalRows':sum(x['rows'] for x in reports),'outputRawSha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'referenceKisSha256':hashlib.sha256((base/'long-history-sample-complete.ndjson').read_bytes()).hexdigest(),'externalWrites':0}
(base/'naver-kis-comparison.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
for r in reports:print(json.dumps({k:v for k,v in r.items() if k not in ['differenceExamples','invalidExamples']},ensure_ascii=False))
