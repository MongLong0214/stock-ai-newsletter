"""Three actual Naver provider witnesses; no outcome or dataset fitting."""
import hashlib,json,pathlib
from extra_features import ObservedSetupFeatures,EXTRA_FEATURE_NAMES
BASE=pathlib.Path('/tmp/composite-score-experimental-20260930')
SOURCE=BASE/'naver-history/prices.ndjson'
rows={};line_hashes={}
with SOURCE.open() as f:
    for i,line in enumerate(f):
        symbol,rr=json.loads(line);assert symbol not in rows
        rows[symbol]={r['trade_date']:r for r in rr if r['trade_date']<='2026-09-29'}
        line_hashes[symbol]=hashlib.sha256(line.encode()).hexdigest()
        if i==2:break
assert set(rows)=={'KOSPI','KOSDAQ:000250','KOSDAQ:000440'}
calendar=sorted(rows['KOSPI']);assert calendar[-1]=='2026-09-29'
witnesses=[]
for symbol,rr in rows.items():
    assert all(r['source']=='naver-fchart' for r in rr.values())
    x=ObservedSetupFeatures(calendar,rr,expected_source='naver-fchart')
    at=calendar[-1];features=x.at(at);assert len(features)==32 and any(v is not None for v in features)
    prefix={date:dict(r) for date,r in rr.items()}
    cutoff=len(calendar)-320
    for date in calendar[:cutoff]:prefix[date]={'symbol':symbol,'trade_date':date,'source':'naver-fchart','open':500000000000,'high':900000000000,'low':1000000000,'close':800000000000,'volume':999999999999}
    assert x.at(at)==ObservedSetupFeatures(calendar,prefix,expected_source='naver-fchart').at(at)
    changed={date:dict(r) for date,r in rr.items()};asof=calendar[-30];index=calendar.index(asof)
    for date in calendar[index+1:]:changed[date]={'symbol':symbol,'trade_date':date,'source':'naver-fchart','open':500000,'high':900000,'low':1000,'close':800000,'volume':123456789}
    extended=calendar+['2099-01-01'];changed[extended[-1]]={'symbol':symbol,'trade_date':extended[-1],'source':'naver-fchart','open':2,'high':9,'low':1,'close':8,'volume':987654321}
    assert x.at(asof)==ObservedSetupFeatures(extended,changed,expected_source='naver-fchart').at(asof)
    rejected_default=False;rejected_mixed=False
    try:ObservedSetupFeatures(calendar,rr)
    except ValueError:rejected_default=True
    mixed={date:dict(r) for date,r in rr.items()};mixed[at]['source']='kis'
    try:ObservedSetupFeatures(calendar,mixed,expected_source='naver-fchart')
    except ValueError:rejected_mixed=True
    assert rejected_default and rejected_mixed
    witnesses.append({'symbol':symbol,'source':'naver-fchart','rows':len(rr),'first':min(rr),'last':max(rr),'calendarSessions':len(calendar),'asOf':at,'nonNullFeatures':sum(v is not None for v in features),'features':dict(zip(EXTRA_FEATURE_NAMES,features)),'sourceLineSha256':line_hashes[symbol],'futureSuffixMutationInvariant':True,'olderThan320PrefixMutationInvariant':True,'unconfiguredProviderRejected':True,'mixedProviderRejected':True,'sourceTagsUnchanged':True})
result={'samples':witnesses,'moduleSha256':hashlib.sha256((BASE/'extra_features.py').read_bytes()).hexdigest(),'inputPath':str(SOURCE),'sampleOnlySourceRowsNotRewritten':True,'labelsReadOrCalculated':0,'fits':0}
with (BASE/'naver-feature-audit.json').open('x') as f:json.dump(result,f,ensure_ascii=False,indent=2,allow_nan=False);f.write('\n')
print(json.dumps({'samples':[{k:v for k,v in w.items() if k!='features'} for w in witnesses],'moduleSha256':result['moduleSha256']}))
