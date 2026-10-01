"""Descriptive uncertainty and tail diagnostics only; no fit/selection/tuning."""
import argparse,json,pathlib,hashlib,math,statistics
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--ledger',required=True);p.add_argument('--report',required=True);p.add_argument('--output',required=True);args=p.parse_args()
ledgerpath=pathlib.Path(args.ledger);reportpath=pathlib.Path(args.report);out=pathlib.Path(args.output)
def sha(p):
    with pathlib.Path(p).open('rb') as h:return hashlib.file_digest(h,'sha256').hexdigest()
data=json.loads(ledgerpath.read_text());report=json.loads(reportpath.read_text());policies={r['name']:r for r in data['policies']}
all_dates=[d['signalDate'] for d in data['policies'][0]['days']]
if 'primaryResults' in report:
    scopes={'all2023_2024':all_dates,'year2023':[d for d in all_dates if d[:4]=='2023'],'year2024':[d for d in all_dates if d[:4]=='2024']}
elif len(all_dates)==181:
    scopes={'allOriginal180':all_dates[:180],'validationReused':all_dates[85:115],'testReused':all_dates[120:180]}
else:scopes={'inner80':all_dates[155:]}
result={}
for scope,dates in scopes.items():
    n=len(dates);assert n>0;draws=1000;block=10;rng=np.random.default_rng(42)
    starts=rng.integers(0,n,size=(draws,math.ceil(n/block)));indices=((starts[:,:,None]+np.arange(block)[None,None,:])%n).reshape(draws,-1)[:,:n]
    result[scope]={}
    for name,run in policies.items():
        bydate={d['signalDate']:d for d in run['days']};aa=np.full((n,3,6),np.nan)
        for i,d in enumerate(dates):
            for j,pick in enumerate(bydate[d]['picks']):
                o=pick['outcome']
                if o['strictLabelValid']:aa[i,j]=[o['touch'],o['net5d']<=-.05,o['net5d']<0,o['entryBullish'],o['net5d'],o['targetNetProxy']]
        samples=aa[indices].reshape(draws,-1,6);sample_means=np.nanmean(samples,axis=1);means=np.nanmean(aa.reshape(-1,6),axis=0)
        names=['touchRate','loss5Rate','anyNegativeD5NetRate','D1bullishRate','meanD5Net','meanTargetOnlyExitProxy']
        ci={k:{'point':float(means[j]),'lower95':float(np.quantile(sample_means[:,j],.025)),'upper95':float(np.quantile(sample_means[:,j],.975))} for j,k in enumerate(names)}
        nets=aa[:,:,4][np.isfinite(aa[:,:,4])];quantiles={str(q):float(np.quantile(nets,q)) for q in [.01,.05,.10,.25,.50,.75,.90,.95,.99]}
        result[scope][name]={'selectedSlots':3*n,'strictKnown':int(np.isfinite(aa[:,:,0]).sum()),'futureUnknown':int(np.isnan(aa[:,:,0]).sum()),'bootstrapCircular10SignalDay1000DrawSeed42':ci,'netD5FixedQuantiles':quantiles,'worst5PercentConditionalMeanNetD5':float(nets[nets<=np.quantile(nets,.05)].mean())}
out.write_text(json.dumps({'descriptiveOnly':True,'noParameterSelectionOrPromotion':True,'confidenceLimitation':'Conditional on previously selected model and current observed dataset; does not correct configuration-search, currentmaster or adjustedvintage bias','sourceHashes':{str(ledgerpath):sha(ledgerpath),str(reportpath):sha(reportpath),str(pathlib.Path(__file__)):sha(__file__)},'scopes':result},ensure_ascii=False,indent=2,allow_nan=False))
print(out)
