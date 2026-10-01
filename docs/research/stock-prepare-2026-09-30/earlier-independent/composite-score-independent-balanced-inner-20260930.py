# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3"]
# ///
import collections, hashlib,json,math,pathlib
import numpy as np
B=pathlib.Path('/tmp/composite-score-research-20260930');W=B/'balanced-event-study';plan=W/'balanced-plan.txt'
assert hashlib.file_digest(plan.open('rb'),'sha256').hexdigest()=='f23a807dbbebb22086e4334cbd54a8a89bbc26e87308c3949f262f17d624bc15'
inputs=np.load('/tmp/composite-score-independent-event-input-20260930.npz');X,Y,offsets=[inputs[k] for k in ['X','Y','offsets']]
observed=np.load('/tmp/composite-score-independent-balanced-source-20260930.npz');signals,turnover=observed['signals'],observed['turnover']
keys=json.loads(pathlib.Path('/tmp/composite-score-independent-event-input-keys-20260930.json').read_text());dates=json.loads(pathlib.Path('/tmp/composite-score-independent-event-input-audit-20260930.json').read_text())['signalDates']
probs=np.load('/tmp/composite-score-independent-event-predictions-20260930.npz')['first150']
symbols=[s for d,s in keys];lambdas=[.2,.35,.5,.65,.8,1.]
model_hash=hashlib.file_digest((B/'event-composite-study/first150-model.joblib').open('rb'),'sha256').hexdigest();assert model_hash=='a8653b31385a9af2627378fc4d7baf09070ac77ab53ab2984da55edc036a8b94'
results={};selections={};roster_hashes={}
for penalty in lambdas:
    ss=np.floor(np.clip(100*(.8*probs[:,0]+.2*probs[:,1])-(100*penalty)*probs[:,2],0,100)+.5).astype(int)
    recent=[];picked=[];days=[];digest=hashlib.sha256()
    for j,d in enumerate(dates[:235]):
        active=j>=155;excluded={s for group in recent[-20:] for s in group}
        candidates=[i for i in range(offsets[j],offsets[j+1]) if symbols[i] not in excluded]
        chosen=sorted(candidates,key=lambda i:(-int(ss[i] if active else signals[i,6]),-turnover[i],symbols[i]))[:3] if len(candidates)>=3 else []
        recent.append([symbols[i] for i in chosen]);days.append({'signalDate':d,'modelActive':active,'afterCooldownCount':len(candidates),'picks':[{'symbol':symbols[i],'overall_score':int(ss[i] if active else signals[i,6]),'rowIndex':int(i)} for i in chosen]})
        digest.update((d+'\t'+'\t'.join(symbols[i] for i in chosen)+'\n').encode())
        if active:picked.extend(chosen)
    ii=np.array(picked);strict=ii[Y[ii,0]>=0];touch=float(Y[strict,0].mean());bull=float(Y[strict,1].mean());loss=float(Y[strict,2].mean());distance=(touch-.4)**2+(loss-.3)**2
    results[str(penalty)]={'lambda':penalty,'days':80,'picks':len(ii),'strictLabels':len(strict),'missingLabels':len(ii)-len(strict),'touchCount':int(Y[strict,0].sum()),'touchRate':touch,'D1bullCount':int(Y[strict,1].sum()),'D1bullRate':bull,'loss5Count':int(Y[strict,2].sum()),'loss5Rate':loss,'squaredTargetDistance':distance,'scoreMin':int(ss[ii].min()),'scoreMax':int(ss[ii].max()),'scoreMean':float(ss[ii].mean()),'scoreAtLeast70':int(np.count_nonzero(ss[ii]>=70)),'full3Days':sum(len(g['picks'])==3 for g in days[155:]),'all3ScoreAtLeast70Days':sum(all(p['overall_score']>=70 for p in g['picks']) and len(g['picks'])==3 for g in days[155:]),'touchWorstUnknownBound':float(Y[strict,0].sum()/len(ii)),'loss5WorstUnknownBound':float((Y[strict,2].sum()+len(ii)-len(strict))/len(ii))}
    selections[str(penalty)]=days;roster_hashes[str(penalty)]=digest.hexdigest()
choice=min(results.values(),key=lambda r:(r['squaredTargetDistance'],-r['D1bullRate'],r['lambda']))['lambda']
event=json.loads((B/'event-composite-study/inner-ledger.json').read_text());reference=next(p for p in event['policies'] if p['name']=='eventComposite')
lambda2diff=[]
for own,saved in zip(selections['0.2'],reference['days']):
    if [(p['symbol'],p['overall_score']) for p in own['picks']]!=[(p['symbol'],p['signals']['overall_score']) for p in saved['picks']]:lambda2diff.append(own['signalDate'])
report={'scope':'Independent replay ONLY the six already frozen balanced penalty policies from SAME saved first150 heads, independent feature/model/source arrays. Full235 current-overall warm seed plus purge included, first150 artifact only active after155. Selection uses actual integer then turnover then ASCII symbol and each own continuous20 cooldown. Inner80 strict raw labels only selectlambda; no outer choice/policy results evaluated.','planSha256':hashlib.file_digest(plan.open('rb'),'sha256').hexdigest(),'savedHeadModelSha256':model_hash,'results':results,'chosenLambda':choice,'lambda02OriginalEventDifferences':lambda2diff,'rosterHashes':roster_hashes}
out=pathlib.Path('/tmp/composite-score-independent-balanced-inner-20260930.json');out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');pathlib.Path('/tmp/composite-score-independent-balanced-inner-ledger-20260930.json').write_text(json.dumps({'policies':selections},ensure_ascii=False))
print(json.dumps(report,ensure_ascii=False),flush=True)
if lambda2diff:raise SystemExit(1)
