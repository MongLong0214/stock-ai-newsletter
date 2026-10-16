import unittest

from trading_cost import estimate_round_trip_cost, krx_tick_size, reconstruct_exit_price, sell_tax_bps


class TradingCostTest(unittest.TestCase):
    def test_tick_boundaries(self):
        for ceiling, below, at in [(2000, 1, 5), (5000, 5, 10), (20000, 10, 50),
                                   (50000, 50, 100), (200000, 100, 500), (500000, 500, 1000)]:
            self.assertEqual(krx_tick_size(ceiling-1), below)
            self.assertEqual(krx_tick_size(ceiling), at)

    def test_sell_trade_date_thresholds(self):
        for date, tax in [('2023-12-27', 18), ('2024-12-26', 18), ('2024-12-27', 15),
                          ('2025-12-28', 15), ('2025-12-29', 20), ('2026-01-02', 20), ('2024-02-29', 18)]:
            self.assertEqual(sell_tax_bps(date), tax)

    def test_weights_sell_notional_and_each_tick(self):
        result = estimate_round_trip_cost(1999, 2000, '2025-12-29')
        self.assertAlmostEqual(result['costBps'], (.00015*(1999+2000)+.002*2000+3)/1999*10000)
        self.assertAlmostEqual(result['costBps'], sum(result[k] for k in ['sellTaxBps', 'commissionBps', 'slippageBps']))
        self.assertEqual(estimate_round_trip_cost(10000, 9000, '2024-12-27', 0, 0),
                         dict(costBps=13.5, sellTaxBps=13.5, commissionBps=0, slippageBps=0))

    def test_reconstructed_exit_at_tick_boundary(self):
        exit_price = reconstruct_exit_price(17630, 20000/17630-1)
        self.assertEqual(exit_price, 20000)
        self.assertEqual(krx_tick_size(exit_price), 50)
        self.assertAlmostEqual(estimate_round_trip_cost(17630, exit_price, '2026-01-02')['costBps'],
                               42.906693136698806)
        for gross_return in [-1, -2, float('nan'), float('inf'), -float('inf')]:
            with self.assertRaises(ValueError):
                reconstruct_exit_price(17630, gross_return)
        with self.assertRaises(ValueError):
            reconstruct_exit_price(.0000001, 0)

    def test_invalid_prices_and_overrides(self):
        for value in [0, -1, float('nan'), float('inf'), True, None, '100']:
            with self.assertRaises(ValueError):
                krx_tick_size(value)
            with self.assertRaises(ValueError):
                estimate_round_trip_cost(value, 10000, '2026-01-02')
            with self.assertRaises(ValueError):
                estimate_round_trip_cost(10000, value, '2026-01-02')
        for value in [-1, float('nan'), float('inf'), True, None, '1.5']:
            with self.assertRaises(ValueError):
                estimate_round_trip_cost(10000, 10000, '2026-01-02', commission_bps_per_side=value)
            with self.assertRaises(ValueError):
                estimate_round_trip_cost(10000, 10000, '2026-01-02', slippage_ticks_per_side=value)

    def test_invalid_or_unsupported_dates(self):
        for date in ['', None, 20260102, '2026-1-02', '2026-01-02T00:00:00Z', '2025-02-29',
                     '2024-02-30', '2026-13-01', '2026-01-00', '0000-01-01', '2023-12-26']:
            with self.assertRaises(ValueError):
                sell_tax_bps(date)
            with self.assertRaises(ValueError):
                estimate_round_trip_cost(10000, 10000, date)


if __name__ == '__main__':
    unittest.main()
