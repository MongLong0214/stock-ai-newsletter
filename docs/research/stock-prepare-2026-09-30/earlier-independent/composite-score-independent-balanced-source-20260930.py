# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3"]
# ///
import hashlib,json,pathlib
import numpy as np
B=pathlib.Path('/tmp/composite-score-research-20260930')
keys=json.loads(pathlib.Path('/tmp/composite-score-independent-event-input-keys-20260930.json').read_text())
index={}
for i,(d,s) in enumerate(keys):index.setdefault(d,{})[s]=i
signals=np.full((len(keys),7),-1,dtype=np.int16);turnover=np.full(len(keys),np.nan)
score_keys=['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score','overall_score']
counts={'earlier':0,'outer':0}
for line in (B/'earlier-training/earlier-wide.ndjson').open():
    r=json.loads(line);i=index[r['date']].get(r['symbol'])
    if i is None:continue
    signals[i]=[r['signals'][k] for k in score_keys];turnover[i]=r['feature']['averageTurnover20'];counts['earlier']+=1
score_iter=iter((B/'current-signals.ndjson').open())
for path in [pathlib.Path('/tmp/upside-scored.ndjson'),pathlib.Path('/tmp/stock-research-fresh-mature-20260930/scored.ndjson')]:
    for line in path.open():
        d,pp=json.loads(line)
        for p in pp:
            ss=json.loads(next(score_iter));assert (ss['date'],ss['symbol'])==(d,p['symbol'])
            i=index[d].get(p['symbol'])
            if i is None:continue
            signals[i]=[ss['signals'][k] for k in score_keys];turnover[i]=p['feature']['averageTurnover20'];counts['outer']+=1
assert next(score_iter,None) is None
assert np.isfinite(turnover).all() and (turnover>=500000000).all() and (signals>=0).all() and (signals<=100).all()
np.savez('/tmp/composite-score-independent-balanced-source-20260930.npz',signals=signals,turnover=turnover)
report={'scope':'Observed source categories/current-overall and turnover bound to independently constructed actual runtime eligible input keys; no labels, fitting, policy tuning or production writes. Existing actual TypeScript-exported category scores are reused for causal warm seed and source integrity.','rows':len(keys),'counts':counts,'signalsSha256':hashlib.sha256(signals.tobytes()).hexdigest(),'turnoverSha256':hashlib.sha256(turnover.tobytes()).hexdigest()}
out=pathlib.Path('/tmp/composite-score-independent-balanced-source-20260930.json');out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report))
