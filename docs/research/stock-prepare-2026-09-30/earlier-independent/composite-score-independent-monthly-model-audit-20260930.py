# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import collections,hashlib,json,pathlib,sys
import joblib,numpy as np
SRC=pathlib.Path('/tmp/composite-score-research-20260930/monthly-adaptive-study/bundles');OWN=pathlib.Path('/tmp/composite-score-independent-monthly-models-20260930');ia=json.loads(pathlib.Path('/tmp/composite-score-independent-monthly-input-audit-20260930.json').read_text());dates=ia['signalDates'];index={d:j for j,d in enumerate(dates)};data=np.load('/tmp/composite-score-independent-monthly-input-20260930.npz');X,Y,offsets=[data[k] for k in ['X','Y','offsets']];errors=collections.defaultdict(list);count=collections.Counter();bundles=[]
def error(k,v):
 count['difference:'+k]+=1
 if len(errors[k])<8:errors[k].append(v)
for path in sorted(SRC.glob('*.json')):
 name=path.stem
 if not (OWN/(name+'.json')).exists():continue
 own=json.loads((OWN/(name+'.json')).read_text());src=json.loads(path.read_text());ix=[]
 for d in own['trainDates']:
  lo,hi=offsets[index[d]:index[d]+2];ix.extend(np.arange(lo,hi)[Y[lo:hi,0]>=0].tolist())
 ix=np.array(ix);xx,yy=X[ix],Y[ix];ww=np.concatenate([np.full(c['strict'],len(ix)/(150*c['strict'])) for c in own['dateCounts']]);owner_hash=hashlib.sha256(xx.tobytes()+ww.tobytes()+b''.join(yy[:,h].astype(np.uint8).tobytes() for h in range(3))).hexdigest()
 expected={'bundleId':name,'scope':own['scope'],'activationClosedAsOf':own['activation'],'trainingSignalDates':own['trainDates'],'trainingWindowPanels':150,'trainingStrictCounts':{c['date']:c['strict'] for c in own['dateCounts']},'trainingRows':own['trainingRows'],'unknownLabelsExcludedOnlyTraining':sum(c['unknown'] for c in own['dateCounts']),'latestTrainingLabelMaturity':own['lastLabelMaturity'],'allTrainingLabelsMatureByActivation':True,'featureNames':ia['featureOrder'],'parameters':own['params'],'nativeMissingInputCount':sum(own['nativeNaNByFeature'].values()),'trainingInputSha256':owner_hash}
 for k,v in expected.items():
  if src[k]!=v:error('bundleMetadata',[name,k,v,src[k]])
 if abs(src['sampleWeightMean']-ww.mean())>1e-14:error('weightMean',name)
 if hashlib.file_digest(pathlib.Path(src['joblibPath']).open('rb'),'sha256').hexdigest()!=src['joblibSha256']:error('sourceModelHash',name)
 a,b=joblib.load(OWN/(name+'.joblib')),joblib.load(src['joblibPath'])
 for h,head in enumerate(['touch','D1bullish','loss5']):
  am,bm=a['heads'][head],b['models'][head];oh=own['headMetadata'][head];sh=src['heads'][head]
  if am.get_params()!=bm.get_params() or bm.n_iter_!=100 or bm.classes_.tolist()!=[0,1] or not np.array_equal(am._baseline_prediction,bm._baseline_prediction):error('headMetadata',[name,head])
  if sh['positiveCount']!=int(yy[:,h].sum()) or abs(sh['dateBalancedPrior']-oh['dateBalancedPrior'])>1e-14 or abs(src['trainPrior'][head]-oh['dateBalancedPrior'])>1e-14:error('rawLabelsPriors',[name,head])
  actualhash=hashlib.sha256(b''.join(t[0].nodes.tobytes() for t in bm._predictors)).hexdigest()
  if actualhash!=sh['structuredTreeNodesSha256'] or actualhash!=oh['allStructuredTreesSha256']:error('structuredTreeHash',[name,head,actualhash,sh['structuredTreeNodesSha256'],oh['allStructuredTreesSha256']])
  nodes=0
  for t,(ap,bp) in enumerate(zip(am._predictors,bm._predictors)):
   nodes+=len(bp[0].nodes);count['trees']+=1
   if ap[0].nodes.dtype!=bp[0].nodes.dtype or not np.array_equal(ap[0].nodes,bp[0].nodes):error('exactTreeNodes',[name,head,t])
  if nodes!=sh['nodeCount'] or sh['treeCount']!=100:error('treeCount',[name,head])
  count['heads']+=1
 count['bundles']+=1;count['trainingRowsAcrossOverlappingWindows']+=len(ix);bundles.append({'bundle':name,'trainingInputHashIncludingUInt8Labels':owner_hash,'exactTreeDifferences':0 if not errors else 'see differences','labelMaturity':own['lastLabelMaturity'],'trainPrior':src['trainPrior']})
partial='--allow-partial' in sys.argv
if not partial and count['bundles']!=15:error('missingBundles',count['bundles'])
out=pathlib.Path('/tmp/composite-score-independent-monthly-model-audit-20260930.json');j={'scope':'Independent exact refits of ONE frozen monthly150 family. Exact18 observed inputs, same3heads and all fixed parameters. Checks each150 actualpanel raw strictY/nativeNaN weights and training-source hashes, closed-asof maturity, freshly computed bundle priors and every node of each stored head. No alternative fits/hypergrid or policies. Owner labels uint8 vs independent int64 canonicalized for source digest; class labels and learnt trees directly compared.','partial':partial,'counts':dict(count),'differenceCounts':{k:v for k,v in count.items() if k.startswith('difference:')},'differences':dict(errors),'bundleAudits':bundles}
out.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'report':str(out),'partial':partial,'counts':dict(count),'differenceCounts':j['differenceCounts']}),flush=True)
if errors:raise SystemExit(1)
