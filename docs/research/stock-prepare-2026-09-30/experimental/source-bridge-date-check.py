import collections,hashlib,json
from pathlib import Path
B=Path('/tmp/composite-score-experimental-20260930/naver-history');O=B.parent/'source-bridge';K=Path('/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson')
cp={x['symbol']:x for x in map(json.loads,(B/'checkpoints.ndjson').read_text().splitlines())};masters={x['symbol'] for x in json.loads((B/'master-snapshot.json').read_bytes())['masters']};counts=collections.defaultdict(collections.Counter);examples={};fields=['open','high','low','close','volume']
with K.open('rb') as kf,(B/'prices.ndjson').open('rb') as nf:
 for line in kf:
  symbol,rows=json.loads(line)
  if symbol not in masters:continue
  c=cp[symbol];nf.seek(c['normalizedOffset']);nline=nf.read(c['normalizedBytes']);assert hashlib.sha256(nline).hexdigest()==c['normalizedSha256'];_,ns=json.loads(nline);nm={r['trade_date']:r for r in ns}
  for k in rows:
   date=k['trade_date'];n=nm.get(date)
   if n is None:continue
   t=counts[date];t['comparedRows']+=1;changed=[f for f in fields if n[f]!=k[f]]
   for f in changed:t[f+'Different']+=1
   if any(f!='volume' for f in changed):t['anyPriceDifferent']+=1
   if changed:t['anyOhlcvDifferent']+=1
   if 'close' in changed and date not in examples:examples[date]={'symbol':symbol,'naver':{f:n[f] for f in fields},'kis':{f:k[f] for f in fields}}
results=[{'date':d,**dict(c),'anyPriceDifferentFraction':c['anyPriceDifferent']/c['comparedRows']} for d,c in sorted(counts.items())]
(O/'date-comparison.ndjson').write_text(''.join(json.dumps(r,separators=(',',':'))+'\n' for r in results))
top=sorted(results,key=lambda x:x['anyPriceDifferentFraction'],reverse=True)[:20];report={'topDatesByPriceDisagreementFraction':[{**x,'firstCloseDifferenceExample':examples.get(x['date'])} for x in top],'labelsComputed':False,'performanceComputed':False,'rawValuesEdited':False}
(O/'date-difference-summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(top[:10]))
