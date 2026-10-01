import hashlib,json
from pathlib import Path
B=Path('/tmp/composite-score-experimental-20260930/naver-history');D=B.parent
cp={c['symbol']:c for c in map(json.loads,(B/'checkpoints.ndjson').read_text().splitlines())}
targets=['KOSPI:005930','KOSDAQ:086520','KOSDAQ:035900','KOSPI']
if any(s not in cp or cp[s]['status']!='success' for s in targets):raise SystemExit('Four requested successful checkpoints are not all available yet')
lines=[]
with (B/'prices.ndjson').open('rb') as f:
 for s in targets:
  c=cp[s];f.seek(c['normalizedOffset']);line=f.read(c['normalizedBytes']);assert hashlib.sha256(line).hexdigest()==c['normalizedSha256'];symbol,rows=json.loads(line);assert symbol==s and all(r['source']=='naver-fchart' and r['trade_date']<='2026-09-29' for r in rows)
  assert hashlib.sha256((B/c['rawPath']).read_bytes()).hexdigest()==c['rawSha256'];lines.append(line)
output=b''.join(lines);path=D/'naver-history-sample-four.ndjson'
if path.exists():assert path.read_bytes()==output
else:path.write_bytes(output)
manifest={'schema':'naver-fchart-raw-ohlcv-flags-v1','source':'naver-fchart','symbols':targets,'sourceDirectory':str(B),'sourceStillCollectingOtherSymbols':True,'sampleCopiedExactCommittedBytes':True,'cutoff':'2026-09-29','masterSnapshotPath':str(B/'master-snapshot.json'),'masterSnapshotSha256':hashlib.sha256((B/'master-snapshot.json').read_bytes()).hexdigest(),'samplePath':str(path),'sampleSha256':hashlib.sha256(output).hexdigest(),'sampleBytes':len(output),'sampleRows':sum(cp[s]['normalizedRows'] for s in targets),'checkpoints':[cp[s] for s in targets],'performanceComputed':False,'labelsComputed':False}
(D/'naver-history-sample-four-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in manifest.items() if k!='checkpoints'},ensure_ascii=False))
