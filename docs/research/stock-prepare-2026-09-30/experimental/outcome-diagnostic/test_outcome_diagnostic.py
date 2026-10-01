"""Synthetic candles only. Expected values below are hand calculated constants."""
import copy
import hashlib
import json
from pathlib import Path
import unittest

from outcome_diagnostic import diagnose_five_session_outcomes

DATES = ["2026-09-17", "2026-09-18", "2026-09-21", "2026-09-22", "2026-09-23"]
SUMMARY = []


def bars_from(values):
    return {d: {"session": i + 1, "date": d, "source": "synthetic", "open": o,
                "high": h, "low": lo, "close": c, "volume": v}
            for i, (d, (o, h, lo, c, v)) in enumerate(zip(DATES, values))}


def neutral():
    return bars_from([(100, 109, 96, 102, 1000)] * 4 + [(100, 109, 96, 105, 1000)])


def diagnose(label, bars, **kwargs):
    result = diagnose_five_session_outcomes(DATES, bars, **kwargs)
    json.dumps(result, allow_nan=False)
    SUMMARY.append({"case": label, "status": result["status"],
                    "rawMarkStatus": result["rawMarkStatus"], "raw": result["raw"],
                    "targetOnly": result["models"]["targetOnly"],
                    "targetStop": result["models"]["targetStop"],
                    "costSensitivity": result["costSensitivity"],
                    "unknownReasons": result["unknownReasons"]})
    return result


class SyntheticOutcomeTests(unittest.TestCase):
    def test_no_barrier_uses_exact_fifth_calendar_close(self):
        result = diagnose("no_barrier", neutral())
        self.assertEqual(result["raw"], {"targetTouch10": False, "day1Bullish": True,
                                       "grossD5": 0.05, "full5Mae": -0.04})
        self.assertEqual(result["models"]["targetOnly"]["exitDate"], DATES[4])
        self.assertEqual(result["models"]["targetStop"]["conservative"]["grossReturn"], 0.05)
        self.assertEqual([x["rawMark"]["netD5"] for x in result["costSensitivity"]], [0.047, 0.044, 0.04])

    def test_target_touch_can_coexist_with_negative_fifth_close(self):
        bars = neutral()
        bars[DATES[2]] = {**bars[DATES[2]], "high": 112, "close": 108}
        bars[DATES[4]] = {**bars[DATES[4]], "open": 90, "high": 93, "low": 89, "close": 90}
        result = diagnose("touch_then_negative_d5", bars)
        self.assertEqual(result["raw"], {"targetTouch10": True, "day1Bullish": True,
                                       "grossD5": -0.10, "full5Mae": -0.11})
        self.assertEqual(result["models"]["targetOnly"]["grossReturn"], 0.10)
        self.assertEqual(result["models"]["targetStop"]["conservative"]["grossReturn"], 0.10)
        self.assertEqual([x["rawMark"]["netD5"] for x in result["costSensitivity"]], [-0.103, -0.106, -0.11])
        self.assertTrue(all(x["rawMark"]["allNegativeD5"] for x in result["costSensitivity"]))
        self.assertTrue(all(not x["rawMark"]["targetTouchAndD5NetNonnegative"] for x in result["costSensitivity"]))
        self.assertEqual([x["targetOnly"]["netReturn"] for x in result["costSensitivity"]], [0.097, 0.094, 0.09])

    def test_same_day_double_barrier_is_ambiguous_with_two_bounds(self):
        bars = neutral()
        bars[DATES[0]] = {**bars[DATES[0]], "high": 112, "low": 94, "close": 100}
        result = diagnose("same_day_double_barrier", bars)
        model = result["models"]["targetStop"]
        self.assertEqual(model["status"], "ambiguous")
        self.assertTrue(model["sameDayAmbiguous"])
        self.assertEqual(model["ambiguousDate"], DATES[0])
        self.assertEqual(model["conservative"]["grossReturn"], -0.05)
        self.assertEqual(model["optimistic"]["grossReturn"], 0.10)
        self.assertEqual([x["targetStop"]["netReturnLower"] for x in result["costSensitivity"]], [-0.053, -0.056, -0.06])
        self.assertEqual([x["targetStop"]["netReturnUpper"] for x in result["costSensitivity"]], [0.097, 0.094, 0.09])
        self.assertTrue(all(x["targetStop"]["allNegativePossible"] for x in result["costSensitivity"]))
        self.assertTrue(all(not x["targetStop"]["allNegativeCertain"] for x in result["costSensitivity"]))

    def test_stop_gap_uses_actual_open_and_precedes_later_high(self):
        bars = neutral()
        bars[DATES[1]] = {**bars[DATES[1]], "open": 90, "high": 115, "low": 87, "close": 104}
        result = diagnose("stop_gap_before_same_day_target", bars)
        model = result["models"]["targetStop"]
        self.assertEqual(model["status"], "known")
        self.assertFalse(model["sameDayAmbiguous"])
        self.assertEqual(model["conservative"]["exitReason"], "stop_gap")
        self.assertEqual(model["conservative"]["exitPrice"], 90)
        self.assertEqual(model["conservative"]["grossReturn"], -0.10)
        self.assertEqual(model["conservative"], model["optimistic"])
        self.assertTrue(result["raw"]["targetTouch10"])
        self.assertEqual(result["raw"]["full5Mae"], -0.13)
        self.assertEqual([x["targetStop"]["netReturnLower"] for x in result["costSensitivity"]], [-0.103, -0.106, -0.11])

    def test_late_high_after_prior_stop_is_not_a_winning_barrier_trade(self):
        bars = neutral()
        bars[DATES[0]] = {**bars[DATES[0]], "high": 106, "low": 94}
        bars[DATES[2]] = {**bars[DATES[2]], "high": 115}
        result = diagnose("late_high_after_prior_stop", bars)
        self.assertTrue(result["raw"]["targetTouch10"])
        self.assertEqual(result["models"]["targetOnly"]["exitDate"], DATES[2])
        self.assertEqual(result["models"]["targetStop"]["conservative"]["exitDate"], DATES[0])
        self.assertEqual(result["models"]["targetStop"]["conservative"]["grossReturn"], -0.05)

    def test_target_gap_cap_precedes_later_low(self):
        bars = neutral()
        bars[DATES[1]] = {**bars[DATES[1]], "open": 112, "high": 115, "low": 94, "close": 104}
        result = diagnose("target_gap_cap_before_same_day_stop", bars)
        model = result["models"]["targetStop"]
        self.assertEqual(model["status"], "known")
        self.assertFalse(model["sameDayAmbiguous"])
        self.assertEqual(model["conservative"]["exitPrice"], 110)
        self.assertEqual(model["conservative"]["grossReturn"], 0.10)
        self.assertEqual(result["models"]["targetOnly"]["grossReturn"], 0.10)

    def test_exact_decimal_target_and_stop_are_inclusive(self):
        bars = bars_from([(1001, 1101.1, 950.95, 1001, 1000)] * 5)
        result = diagnose("exact_decimal_barriers", bars)
        self.assertTrue(result["raw"]["targetTouch10"])
        self.assertEqual(result["models"]["targetStop"]["status"], "ambiguous")
        self.assertEqual(result["models"]["targetStop"]["conservative"]["grossReturn"], -0.05)
        self.assertEqual(result["models"]["targetStop"]["optimistic"]["grossReturn"], 0.10)

    def test_missing_calendar_bar_is_unknown_and_not_compressed(self):
        bars = neutral()
        del bars[DATES[2]]
        bars["2026-09-28"] = {"open": 100, "high": 200, "low": 99, "close": 200, "volume": 1000}
        result = diagnose("missing_d3_extra_d6", bars)
        self.assertEqual(result["status"], "unknown")
        self.assertEqual(result["rawMarkStatus"], "unknown")
        self.assertIsNone(result["raw"]["targetTouch10"])
        self.assertIsNone(result["models"]["targetStop"]["sameDayAmbiguous"])
        self.assertTrue(all(x["targetOnly"]["netReturn"] is None for x in result["costSensitivity"]))
        self.assertEqual(result["unknownReasons"], [{"date": DATES[2], "reason": "missing_bar"}])

    def test_marked_missing_record_does_not_become_false_touch(self):
        bars = neutral()
        bars[DATES[2]] = {"session": 3, "date": DATES[2], "missing": True}
        result = diagnose("marked_missing_d3", bars)
        self.assertIsNone(result["raw"]["targetTouch10"])
        self.assertIsNone(result["costSensitivity"][0]["rawMark"]["allNegativeD5"])

    def test_zero_volume_retains_observed_marks_but_not_exit_proxies(self):
        bars = neutral()
        bars[DATES[3]]["volume"] = 0
        result = diagnose("zero_volume_d4", bars)
        self.assertFalse(result["strictAll5PositiveOhlcv"])
        self.assertEqual(result["rawMarkStatus"], "known")
        self.assertEqual(result["raw"]["grossD5"], 0.05)
        self.assertEqual(result["costSensitivity"][0]["rawMark"]["netD5"], 0.047)
        self.assertEqual(result["models"]["targetOnly"]["status"], "unknown")
        self.assertTrue(all(x["targetStop"]["netReturnLower"] is None for x in result["costSensitivity"]))

    def test_invalid_and_nonfinite_ohlc_remain_unknown(self):
        for label, update in [("invalid_high", {"high": 99}), ("nonfinite_close", {"close": float("nan")}),
                              ("nonpositive_open", {"open": 0})]:
            with self.subTest(label=label):
                bars = neutral()
                bars[DATES[1]].update(update)
                result = diagnose(label, bars)
                self.assertEqual(result["rawMarkStatus"], "unknown")
                self.assertIsNone(result["raw"]["full5Mae"])
                self.assertEqual(result["models"]["targetOnly"]["status"], "unknown")

    def test_entry_mismatch_is_unknown(self):
        result = diagnose("mismatched_entry", neutral(), entry_open=101)
        self.assertEqual(result["rawMarkStatus"], "unknown")
        self.assertIsNone(result["entryOpen"])
        self.assertEqual(result["unknownReasons"], [{"date": DATES[0], "reason": "entry_open_mismatch"}])

    def test_exact_zero_net_differs_from_positive_and_five_pct_loss_inclusive(self):
        bars = neutral()
        bars[DATES[1]]["high"] = 110
        bars[DATES[4]]["close"] = 100.3
        result = diagnose("zero_net_at_30bps_after_target_touch", bars)
        raw = result["costSensitivity"][0]["rawMark"]
        self.assertEqual(raw["netD5"], 0)
        self.assertFalse(raw["allNegativeD5"])
        self.assertFalse(raw["targetTouchAndD5NetPositive"])
        self.assertTrue(raw["targetTouchAndD5NetNonnegative"])
        bars[DATES[4]].update({"open": 96, "high": 100, "low": 95, "close": 95.3})
        result = diagnose("loss_at_exact_5pct_net_30bps", bars)
        self.assertEqual(result["costSensitivity"][0]["rawMark"]["netD5"], -0.05)
        self.assertTrue(result["costSensitivity"][0]["rawMark"]["lossAtLeast5Pct"])

    def test_input_is_not_mutated_and_outside_dates_are_not_read(self):
        class ObservedMapping(dict):
            reads = []
            def get(self, key, default=None):
                self.reads.append(key)
                return super().get(key, default)
        bars = ObservedMapping(neutral())
        bars["2099-01-01"] = {"open": float("nan")}
        before = copy.deepcopy(dict(bars))
        result = diagnose("exact_calendar_reads_only", bars)
        self.assertEqual(bars.reads, DATES)
        self.assertEqual(dict(bars), before)
        self.assertEqual(result["status"], "known")

    def test_bad_calendar_and_date_mismatch_are_not_repaired(self):
        for dates in [DATES[:4], [DATES[0], DATES[0], *DATES[2:]], DATES[::-1]]:
            with self.subTest(dates=dates):
                result = diagnose_five_session_outcomes(dates, neutral())
                self.assertEqual(result["status"], "unknown")
                self.assertIsNone(result["raw"]["targetTouch10"])
        bars = neutral()
        bars[DATES[1]]["date"] = "2026-09-21"
        result = diagnose("bar_date_mismatch", bars)
        self.assertEqual(result["status"], "unknown")
        self.assertEqual(result["unknownReasons"], [{"date": DATES[1], "reason": "bar_date_mismatch"}])


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(SyntheticOutcomeTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    report = {"scope": "hand-calculated synthetic candles only; no production or NAVER outcomes read",
              "testsRun": result.testsRun, "passed": result.wasSuccessful(),
              "failures": len(result.failures), "errors": len(result.errors),
              "costConvention": "30/60/100 total round-trip bps; gross minus bps/10000",
              "moduleSha256": hashlib.sha256(Path(__file__).with_name("outcome_diagnostic.py").read_bytes()).hexdigest(),
              "cases": SUMMARY}
    Path(__file__).with_name("synthetic-report.json").write_text(json.dumps(report, separators=(",", ":"), allow_nan=False))
    print(json.dumps({key: value for key, value in report.items() if key != "cases"}, separators=(",", ":")))
    raise SystemExit(0 if result.wasSuccessful() else 1)
