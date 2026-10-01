"""Independent cached-model and exact-calendar Decimal FP checks of fixed KIS picks."""
import pathlib,json,hashlib,sys,math,datetime
import numpy as np
import joblib
DIR=pathlib.Path(__file__).resolve().parent;sys.path.insert(0,str(DIR.parent/'outcome-diagnostic'));from outcome_diagnostic import diagnose_five_session_outcomes

def sha(p):
    with pathlib.Path(p).open('rb') as h:return hashlib.file_digest(h,'sha256').hexdigest()
r=json.loads((DIR/'kis-report.json').read_text());assert all(sha(p)==h for p,h in r['sourceHashes'].items());feature_names=r['models'][next(iter(r['models']))]['provenance']['observedInputOrder'];models={}
a={'selectedInstances':0,'strictInstances':0,'unknownInstances':0,'FPHelperDifferences':0,'originalFloatDifferences':0,'modelPredictionDifferences':0,'publishedScoreDifferences':0,'sixCategoryDifferences':0,'selectedOrderDifferences':0,'cooldownViolations':0,'modelMaturityViolations':0,'sourceHashDifferences':0}
for name in ['kis-inner-ledger.json','kis-outer-ledger.json']:
    l=json.loads((DIR/name).read_text());assert l['sourceHashes']==r['sourceHashes']
    for run in l['policies']:
        recent=[]
        for day in run['days']:
            pp=day['picks'];a['selectedOrderDifferences']+=run['name']!='ATRbaseline' and pp!=sorted(pp,key=lambda p:(-p['signals']['overall_score'],-p['feature']['averageTurnover20'],p['symbol']));excluded={s for d in recent[-20:] for s in d};a['cooldownViolations']+=bool(excluded.intersection(p['symbol'] for p in pp));recent.append([p['symbol'] for p in pp])
            for p in pp:
                a['selectedInstances']+=1;bb=p['dailyBars'];o=p['outcome'];source=p['sourceSignals'];a['sixCategoryDifferences']+=any(p['signals'][k]!=source[k] for k in ['trend_score','momentum_score','volume_score','volatility_score','pattern_score','sentiment_score'])
                if day['modelActive']:
                    key=day['modelScope'];meta=r['models'][key]
                    if key not in models:assert sha(meta['joblibPath'])==meta['joblibSha256'];models[key]=joblib.load(meta['joblibPath'])
                    x=np.array([[p['rawFactors'][k] if p['rawFactors'][k] is not None else np.nan for k in feature_names[:meta['config']['inputCount']]]]);pred=float(models[key]['model'].predict(x)[0]);a['modelPredictionDifferences']+=pred!=p['nativeModelPrediction'] or np.clip(pred,0,1)!=p['expectedGoalUtility'];a['publishedScoreDifferences']+=int(math.floor(100*np.clip(pred,0,1)+.5))!=p['signals']['overall_score'];a['modelMaturityViolations']+=meta['provenance']['latestTrainingLabelMaturity']>=day['signalDate']
                if o['rawMarkValid']:
                    entry=bb[0]['open'];net=bb[-1]['close']/entry-1-.003;touch=max(v['high'] for v in bb)>=entry*110/100;a['originalFloatDifferences']+=net!=o['net5d'] or touch!=o['touch']
                if not o['strictLabelValid']:
                    a['unknownInstances']+=1;assert all(o[k] is None for k in ['T_safe','L0_FP','fpNet30bps','fpSameBarAmbiguous','fpExitReason','fpExitSession']);continue
                a['strictInstances']+=1;dates=[v['date'] for v in bb];bars={v['date']:{k:v[k] for k in ['open','high','low','close','volume']} for v in bb};z=diagnose_five_session_outcomes(dates,bars);assert z['status']=='known';lower=z['models']['targetStop']['conservative'];cost=z['costSensitivity'][0];a['FPHelperDifferences']+=o['T_safe']!=(lower['exitReason']=='target') or o['L0_FP']!=cost['targetStop']['allNegativePossible'] or o['fpNet30bps']!=cost['targetStop']['netReturnLower'] or o['fpSameBarAmbiguous']!=z['models']['targetStop']['sameDayAmbiguous'] or o['fpExitReason']!=lower['exitReason'] or o['fpExitSession']!=dates.index(lower['exitDate'])+1
assert a['selectedInstances']==3744 and a['strictInstances']==3736 and a['unknownInstances']==8
for k,v in a.items():
    if k.endswith(('Differences','Violations')):assert v==0,(k,v)
a={k:int(v) for k,v in a.items()}
a.update(passed=True,generatedAtUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),auditSourceSha256=sha(__file__),reportSha256=sha(DIR/'kis-report.json'),innerLedgerSha256=sha(DIR/'kis-inner-ledger.json'),outerLedgerSha256=sha(DIR/'kis-outer-ledger.json'),productMutations=0)
(DIR/'kis-selected-independent-audit.json').write_text(json.dumps(a,indent=2));print(json.dumps(a,indent=2))
