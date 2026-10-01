# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3"]
# ///
import ast,hashlib,itertools,json,pathlib
import numpy as np
B=pathlib.Path('/tmp/composite-score-experimental-20260930');p=B/'fixed-models.py';text=p.read_text();tree=ast.parse(text)
functions={'target_value','grade_mapping','utility_array','fit_parameters','date_weights','scores'};assignments={'COMPLEXITY','LAMBDAS','CONFIGS'};nodes=[]
for n in tree.body:
 if isinstance(n,ast.FunctionDef) and n.name in functions:nodes.append(n)
 elif isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in assignments for t in n.targets):nodes.append(n)
scope={'np':np,'itertools':itertools};exec(compile(ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[])),str(p)+'#pure-mechanics-only','exec'),scope)
events=np.array([[t,b,l] for t,l,b in itertools.product([0,1],repeat=3)],dtype=np.uint8);diffs=[];checks=0;configs=scope['CONFIGS'];grade_sets={}
for c in configs:
 expected=np.array([(.8*t+.2*b+c['lambda']*(1-l))/(1+c['lambda']) for t,b,l in events]);got=scope['utility_array'](c,events);states,gains=scope['grade_mapping'](c)
 if not np.array_equal(expected,got) or len(gains)!=(7 if c['lambda']==1 else 8):diffs.append(['utility/grades',c['id']])
 for state in states:
  v=(.8*state['T']+.2*state['B']+c['lambda']*(1-state['L5']))/(1+c['lambda'])
  if state['V']!=v or gains[state['grade']]!=v:diffs.append(['stateGain',c['id'],state])
 params=scope['fit_parameters'](c);it,leaves,depth,minimum,l2=scope['COMPLEXITY'][c['complexity']]
 if c['family']=='A':
  exp={'max_iter':it,'max_leaf_nodes':leaves,'max_depth':depth,'min_samples_leaf':minimum,'l2_regularization':l2,'learning_rate':.05,'max_bins':255,'random_state':42,'early_stopping':False,'loss':'squared_error'}
  if params!=exp:diffs.append(['AParameters',c['id']])
 else:
  for k,v in {'n_estimators':it,'num_leaves':leaves,'max_depth':depth,'min_child_samples':minimum,'reg_lambda':l2,'learning_rate':.05,'max_bin':255,'random_state':42,'deterministic':True,'force_col_wise':True,'n_jobs':4,'lambdarank_norm':True,'lambdarank_truncation_level':6,'label_gain':gains,'subsample':1,'subsample_freq':0,'colsample_bytree':1,'metric':'None','objective':'lambdarank'}.items():
   if params[k]!=v:diffs.append(['BParameters',c['id'],k])
 checks+=1;grade_sets[str(c['lambda'])]=gains
groups,weights=scope['date_weights']([2,3,5]);wanted=np.array([10/(3*2)]*2+[10/(3*3)]*3+[10/(3*5)]*5)
if not np.array_equal(weights,wanted) or not np.isclose(weights.mean(),1) or any(not np.isclose(w.sum(),10/3) for w in np.split(weights,[2,5])):diffs.append(['equalDateWeights'])
raw=np.array([-1,0,.0049,.005,.4949,.495,.9949,.995,1,2]);expected=np.floor(100*np.clip(raw,0,1)+.5).astype(np.int32)
class FrozenWitnessMapping:
 def predict(self,v):return np.asarray(v,dtype=np.float64)
for family in ['A','B']:
 c=next(x for x in configs if x['family']==family);got,latent=scope['scores'](c,raw,{'model':FrozenWitnessMapping()})
 if not np.array_equal(got,expected) or not np.array_equal(latent,np.clip(raw,0,1)):diffs.append(['publishedIntegerScore',family])
out={'scope':'Pure functions of actual frozen-model helper extracted by AST; no sklearn/lightgbm imports, no fit/calibrator fit/data/labels read. 24config event-state utility/grade/gain/parameter mapping, date weighting and published integer score boundaries independently checked. Does not validate data caller or trained models.','sourcePath':str(p),'sourceSha256':hashlib.sha256(text.encode()).hexdigest(),'configurations':checks,'jointStatesPerConfiguration':8,'utilityStateChecks':checks*8,'lambdaGradeGains':grade_sets,'equalDateWeightFixture':[2,3,5],'publishedIntegerBoundaryFixture':expected.tolist(),'differences':diffs,'callerRequirements':['Rows and queryCounts must correspond to date-contiguous strict training keys; queryCount=len(trainingDates).','All OOFlabelfuture maturity/calibration state must be checked in runner; helper itself has no actual calendar.','Quarterly same460 training length requires activation-distinct directory or bundle key to avoid prefix-id collisions.']}
path=B/'independent-model-mechanics-audit.json';path.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'report':str(path),'configurations':checks,'utilityStates':checks*8,'differences':diffs}),flush=True)
if diffs:raise SystemExit(1)
