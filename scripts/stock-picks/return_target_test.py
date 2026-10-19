import unittest
from return_target import demeaned_tp7_net_targets


class ReturnTargetTest(unittest.TestCase):
    def test_exact_touch7_boundary_uses_round_half_up_integer_prices(self):
        touched = [[15000, 16050, 14000, 15000, 100]] * 5
        untouched = [[15000, 16049, 14000, 15000, 100]] * 5
        result = demeaned_tp7_net_targets([touched, untouched], '2026-10-16')
        self.assertAlmostEqual(result[0], .07 / 2)
        self.assertAlmostEqual(result[1], -.07 / 2)
        self.assertAlmostEqual(sum(result), 0)

    def test_caps_touch7_subtracts_d5_cost_and_demeans_each_strict_date(self):
        touched = [[10000, 10700, 9000, 9500, 100]] * 5
        untouched = [[10000, 10699, 9000, 9500, 100]] * 5
        # WHY: TP 도달 여부와 별개로 비용은 D5 종가의 매도 명목금액을 따른다.
        cost = (1.5 + 5 + (1.5 + 20) * .95 + 5) / 10000
        result = demeaned_tp7_net_targets([touched, untouched], '2026-10-16')
        net = [.07 - cost, -.05 - cost]
        self.assertAlmostEqual(result[0], net[0] - sum(net) / 2)
        self.assertAlmostEqual(result[1], net[1] - sum(net) / 2)
        self.assertAlmostEqual(sum(result), 0)
        different_exit = [[10000, 10600, 9000, 10000, 100]] * 5
        other = demeaned_tp7_net_targets([touched, different_exit], '2026-10-16')
        other_net = -(1.5 + 5 + 1.5 + 20 + 5) / 10000
        self.assertAlmostEqual(other[0], (net[0] - other_net) / 2)
        self.assertEqual(demeaned_tp7_net_targets([untouched], '2026-10-16'), [0])


if __name__ == '__main__':
    unittest.main()
