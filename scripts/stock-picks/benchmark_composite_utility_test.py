import importlib.util
import json
import pathlib
import unittest

spec = importlib.util.spec_from_file_location(
    'benchmark', pathlib.Path(__file__).with_name('benchmark-composite-utility.py'))
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)


def known(net, touch=True, bullish=True):
    return dict(known=True, net=net, touch=touch, bullish=bullish, mae=-.25, labelNullReason=None)


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


if __name__ == '__main__':
    unittest.main()
