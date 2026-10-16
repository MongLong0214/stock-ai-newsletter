import importlib.util
import json
import pathlib
import unittest

spec = importlib.util.spec_from_file_location(
    'benchmark', pathlib.Path(__file__).with_name('benchmark-composite-utility.py'))
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)


def known(net, touch=True, bullish=True, realistic_net=None, cost_bps=23):
    return dict(known=True, net=net, touch=touch, bullish=bullish, mae=-.25, labelNullReason=None,
                netRealisticCost=net+.003-cost_bps/10000 if realistic_net is None else realistic_net,
                appliedCostBps=cost_bps)


def unknown(reason):
    return dict(known=False, net=None, touch=None, bullish=None, mae=None, labelNullReason=reason)


def summarize(picks):
    assert len(picks) % 3 == 0
    return benchmark.summarize([dict(picks=picks[i:i+3]) for i in range(0, len(picks), 3)])


class CompositeBenchmarkTest(unittest.TestCase):
    def test_preserves_existing_metrics_for_known_labels(self):
        result = summarize([known(-.2, False, False), known(.1), known(.04)])
        for key, value in dict(dates=1, slots=3, picks=3, known=3, missing=0,
                               touchRate=2/3, bullishRate=2/3, lossRate=1/3,
                               meanNet=-.02, medianNet=.04, severeLossRate=1/3,
                               meanMae=-.25, worstNet=-.2).items():
            self.assertAlmostEqual(result[key], value, msg=key)
        self.assertAlmostEqual(result['lossRateConservative'], result['lossRate'])
        self.assertAlmostEqual(result['meanNetConservative'], result['meanNet'])

    def test_splits_unknowns_and_includes_only_suspended_in_conservative_denominators(self):
        result = summarize([known(-.2), known(.1), known(.04),
                            unknown('suspendedOrUntradeable'), unknown('suspendedOrUntradeable'),
                            unknown('immature'), unknown('immature'), unknown('dataError'), unknown(None)])
        self.assertEqual(result['unknownReasons'], dict(
            immature=2, suspendedOrUntradeable=2, dataError=1, unclassified=1))
        self.assertEqual(result['missing'], 6)
        self.assertAlmostEqual(result['lossRate'], 1/3)
        self.assertAlmostEqual(result['meanNet'], -.02)
        self.assertAlmostEqual(result['lossRateConservative'], 3/5)
        self.assertAlmostEqual(result['meanNetConservative'], (-.06-2*.2)/5)
        self.assertEqual(result['suspendedOrUntradeableNetAssumption'], -.2)

    def test_immature_labels_do_not_become_losses(self):
        result = summarize([known(.1), unknown('immature'), unknown('immature')])
        self.assertEqual(result['lossRateConservative'], 0)
        self.assertEqual(result['meanNetConservative'], .1)

    def test_positive_only_segment_still_imputes_a_loss(self):
        result = summarize([known(.1), known(.2), unknown('suspendedOrUntradeable')])
        self.assertEqual(result['suspendedOrUntradeableNetAssumption'], -.003)
        self.assertAlmostEqual(result['lossRateConservative'], 1/3)
        self.assertAlmostEqual(result['meanNetConservative'], (.1+.2-.003)/3)

    def test_no_known_labels_use_documented_total_loss_fallback(self):
        result = summarize([unknown('suspendedOrUntradeable'), unknown('suspendedOrUntradeable'), unknown('immature')])
        for key in ['bullishRate', 'lossRate', 'meanNet', 'medianNet', 'severeLossRate', 'meanMae', 'worstNet']:
            self.assertIsNone(result[key], msg=key)
        self.assertEqual(result['lossRateConservative'], 1)
        self.assertEqual(result['meanNetConservative'], -1.003)
        json.dumps(result, allow_nan=False)

    def test_legacy_null_reasons_remain_unclassified(self):
        legacy = dict(known=False, net=None)
        result = summarize([known(.1), legacy, unknown('unrecognized')])
        self.assertEqual(result['unknownReasons']['unclassified'], 2)
        self.assertEqual(result['unknownReasons']['immature'], 0)
        self.assertEqual(result['lossRateConservative'], 0)

    def test_empty_segment_has_no_invented_returns(self):
        result = benchmark.summarize([])
        self.assertEqual(result['picks'], 0)
        for key in ['touchRate', 'lossRate', 'meanNet', 'lossRateConservative', 'meanNetConservative']:
            self.assertIsNone(result[key], msg=key)
        self.assertEqual(sum(result['unknownReasons'].values()), 0)
        json.dumps(result, allow_nan=False)

    def test_realistic_outcome_uses_d5_sell_date_and_both_price_bands(self):
        calendar = ['2025-12-18', '2025-12-19', '2025-12-22', '2025-12-23',
                    '2025-12-24', '2025-12-26', '2025-12-29']
        label = dict(entry=1999, return5d=2000/1999-1)
        result = benchmark.realistic_outcome(label, calendar, 1)
        expected_cost = (.00015*(1999+2000)+.002*2000+3)/1999*10000
        self.assertAlmostEqual(result['appliedCostBps'], expected_cost)
        self.assertAlmostEqual(result['netRealisticCost'], 2000/1999-1-expected_cost/10000)
        previous = benchmark.realistic_outcome(label, calendar, 0)
        self.assertAlmostEqual(result['appliedCostBps']-previous['appliedCostBps'], 5*2000/1999)
        self.assertEqual(benchmark.realistic_outcome(None, [], 0),
                         dict(netRealisticCost=None, appliedCostBps=None))

        calendar = ['2026-01-02', '2026-01-05', '2026-01-06',
                    '2026-01-07', '2026-01-08', '2026-01-09']
        gross_return = 20000/17630-1
        result = benchmark.realistic_outcome(dict(entry=17630, return5d=gross_return), calendar, 0)
        self.assertAlmostEqual(result['appliedCostBps'], 42.906693136698806)
        self.assertAlmostEqual(result['netRealisticCost'], gross_return-42.906693136698806/10000)

    def test_realistic_summary_keeps_frozen_metrics_and_uses_per_pick_costs(self):
        result = summarize([known(.001, cost_bps=50), known(-.099, cost_bps=50), known(.02, cost_bps=20)])
        # Frozen 30bps results are unchanged, while two realistic outcomes become losses
        # and the -9.9% model-cost return crosses the -10% severe-loss boundary.
        self.assertEqual(result['lossRate'], 1/3)
        self.assertEqual(result['severeLossRate'], 0)
        self.assertEqual(result['lossRateRealisticCost'], 2/3)
        self.assertEqual(result['severeLossRateRealisticCost'], 1/3)
        self.assertAlmostEqual(result['meanNetRealisticCost'], (-.001-.101+.021)/3)
        self.assertAlmostEqual(result['medianNetRealisticCost'], -.001)
        self.assertEqual(result['meanAppliedCostBps'], 40)

    def test_realistic_conservative_metrics_use_realistic_worst_and_same_unknown_denominator(self):
        result = summarize([known(-.2, realistic_net=-.21), known(.1, realistic_net=.09),
                            unknown('suspendedOrUntradeable'), unknown('immature'),
                            unknown('dataError'), unknown(None)])
        self.assertEqual(result['suspendedOrUntradeableNetAssumptionRealisticCost'], -.21)
        self.assertEqual(result['lossRateConservativeRealisticCost'], 2/3)
        self.assertAlmostEqual(result['meanNetConservativeRealisticCost'], (-.21+.09-.21)/3)
        self.assertEqual(result['suspendedOrUntradeableNetAssumption'], -.2)

    def test_realistic_positive_only_and_no_observation_fallbacks_are_explicit(self):
        positive = summarize([known(.1, realistic_net=.11), known(.2, realistic_net=.21),
                              unknown('suspendedOrUntradeable')])
        self.assertEqual(positive['suspendedOrUntradeableNetAssumptionRealisticCost'], -.003)
        self.assertEqual(positive['lossRateConservativeRealisticCost'], 1/3)
        self.assertAlmostEqual(positive['meanNetConservativeRealisticCost'], (.11+.21-.003)/3)
        unknowns = summarize([unknown('suspendedOrUntradeable'), unknown('immature'), unknown('dataError')])
        self.assertEqual(unknowns['meanNetConservativeRealisticCost'], -1.003)
        self.assertEqual(unknowns['lossRateConservativeRealisticCost'], 1)
        for result in [unknowns, benchmark.summarize([])]:
            for key in ['lossRateRealisticCost', 'meanNetRealisticCost', 'medianNetRealisticCost',
                        'severeLossRateRealisticCost', 'meanAppliedCostBps']:
                self.assertIsNone(result[key], msg=key)
            json.dumps(result, allow_nan=False)

    def test_realistic_summary_excludes_immature_without_imputing_a_loss(self):
        result = summarize([known(.1, realistic_net=.11), unknown('immature'), unknown('immature')])
        self.assertEqual(result['meanNetConservativeRealisticCost'], .11)
        self.assertEqual(result['lossRateConservativeRealisticCost'], 0)


if __name__ == '__main__':
    unittest.main()
