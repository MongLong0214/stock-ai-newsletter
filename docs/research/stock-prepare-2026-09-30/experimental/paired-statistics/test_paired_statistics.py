"""Synthetic-only checks: never open primary outputs or raw price files."""
import tempfile, unittest
from pathlib import Path
import numpy as np
import paired_statistics as s

class StatisticsTests(unittest.TestCase):
 def test_weights_fixed_and_dependent(self):
  a=s.bootstrap_weights(61);b=s.bootstrap_weights(61)
  self.assertTrue(np.array_equal(a,b));self.assertTrue(np.all(a.sum(axis=1)==61));self.assertEqual(a.shape,(1000,61));self.assertEqual(s.bootstrap_weights(3).tolist(),[[1,1,1]]*1000)
 def test_no_selection_intersection_and_unknown_bound(self):
  dates=['2023-01-%02d'%i for i in range(1,22)];arrays={};metadata={}
  for name,success,known,unknown in [('currentOverall',1,3,0),('ATRbaseline',1,3,0),('L5-winnerA',1,1,2)]:
   row=[[success,known] for m in s.METRICS];row[s.METRICS.index('strictCoverage')]=[known,3];row[s.METRICS.index('all3Touch')]=[0,0 if unknown else 1]
   arrays[name]=np.array([row]*len(dates),dtype=float);metadata[name]=[{'selected':3,'strictKnown':known,'unknown':unknown,'all3KnownDays':int(not unknown),'all3UnknownDays':int(bool(unknown)),'shortfallDays':0}]*len(dates)
  r=s.scope_summary(arrays,metadata,dates,dates);a=r['policies']['L5-winnerA'];b=r['policies']['currentOverall']
  self.assertEqual(a['metrics']['touch']['point'],1);self.assertAlmostEqual(b['metrics']['touch']['point'],1/3)
  self.assertAlmostEqual(r['pairedCandidateMinusBaseline']['L5-winnerA minus currentOverall']['touch']['point'],2/3)
  self.assertEqual(a['unknownEventBounds']['touch']['unknown'],42);self.assertAlmostEqual(a['unknownEventBounds']['touch']['minimumTrueRateAllSelected'],1/3);self.assertEqual(a['unknownEventBounds']['touch']['maximumTrueRateAllSelected'],1)
  self.assertIsNone(a['metrics']['all3Touch']['point']);self.assertEqual(a['unknownEventBounds']['all3Touch']['maximumRateAllSignalDays'],1)
 def test_paired_identical_delta_zero(self):
  n=35;dates=['2023-%02d-%02d'%(1+i//28,1+i%28) for i in range(n)];rng=np.random.default_rng(6);a=np.ones((n,len(s.METRICS),2));a[:,:,0]=rng.normal(size=(n,len(s.METRICS)));a[:,:,1]=3
  meta=[{'selected':3,'strictKnown':3,'unknown':0,'all3KnownDays':1,'all3UnknownDays':0,'shortfallDays':0}]*n
  r=s.scope_summary({x:a for x in ['currentOverall','ATRbaseline','L5-winnerA']},{x:meta for x in ['currentOverall','ATRbaseline','L5-winnerA']},dates,dates)
  for z in r['pairedCandidateMinusBaseline']['L5-winnerA minus currentOverall'].values():self.assertEqual((z['point'],z['lower95'],z['upper95']),(0,0,0))
 def test_all_freezes_before_any_primary_access(self):
  with tempfile.TemporaryDirectory() as d:
   trap=Path(d)/'must-not-read.json';trap.write_text('invalid primary content')
   conf={'producerCompletionConfirmed':True,'ledgers':[{'kind':k,'path':str(trap)} for k in ['L5','L0','FP']],'freezes':{'L5':{'path':str(Path(d)/'missing-freeze'),'sha256':'x'}}}
   with self.assertRaises(FileNotFoundError):s.preflight(conf)
 def test_known_exact_percentile(self):
  z=s.ci(.5,np.arange(1000)/1000);self.assertEqual(z['point'],.5);self.assertAlmostEqual(z['lower95'],.024975);self.assertAlmostEqual(z['upper95'],.974025)
 def test_immutable_fp_and_unknown_from_synthetic_bars(self):
  import importlib.util,copy
  helper=Path('/tmp/composite-score-experimental-20260930/outcome-diagnostic/outcome_diagnostic.py')
  self.assertEqual(s.sha(helper),'5657a863fb6e7a2ba00e7cd5269e3507f3eb240307fe01901fe267d01061dea9')
  spec=importlib.util.spec_from_file_location('helper_synthetic',helper);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
  dates=['2023-01-03','2023-01-04','2023-01-05','2023-01-06','2023-01-09']
  bars=[{'date':d,'open':100,'high':111 if i==0 else 103,'low':94 if i==0 else 99,'close':101,'volume':100} for i,d in enumerate(dates)]
  pick={'symbol':'FAKE:001','dailyBars':bars,'recommendationDate':dates[0],'expectedD5date':dates[-1],'D1open':100,'signals':{'overall_score':70},'outcome':{'strictLabelValid':True,'touch':True,'net5d':.007,'entryBullish':True}}
  day={'signalDate':'2023-01-02','pickedCount':1,'picks':[pick]};vals,meta=s.row_stats(day,mod.diagnose_five_session_outcomes)
  self.assertEqual(vals['FPambiguous'],[1,1]);self.assertEqual(vals['FPtargetFirstLower'],[0,1]);self.assertEqual(vals['FPtargetFirstUpper'],[1,1]);self.assertAlmostEqual(vals['FPnetLower'][0],-.053);self.assertAlmostEqual(vals['FPnetUpper'][0],.097)
  bad=copy.deepcopy(day);bad['picks'][0]['dailyBars'][2]['volume']=0;bad['picks'][0]['outcome']['strictLabelValid']=False
  vv,mm=s.row_stats(bad,mod.diagnose_five_session_outcomes);self.assertEqual(vv['touch'],[0,0]);self.assertEqual(mm['selected'],1);self.assertEqual(mm['unknown'],1);self.assertEqual(vv['scoreAll3AtLeast70'],[0,1])
 def test_import_does_not_read_primary(self):
  self.assertEqual(s.SEED,42);self.assertEqual(s.DRAWS,1000);self.assertEqual(s.BLOCK,10)
if __name__=='__main__':unittest.main()
