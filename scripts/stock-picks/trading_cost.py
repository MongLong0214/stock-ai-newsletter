"""Round-trip sensitivity costs in entry-notional bps; twin of trading-cost.ts."""
import datetime
import math
import re


def _validate_number(value, positive=False):
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) \
            or (value <= 0 if positive else value < 0):
        raise ValueError('Expected a finite positive price' if positive else 'Expected a finite nonnegative assumption')


def reconstruct_exit_price(entry_price, gross_return):
    """Normalize return-derived prices so float error cannot change the tick band."""
    exit_price = float(f"{entry_price * (1 + gross_return):.6f}")
    _validate_number(exit_price, positive=True)
    return exit_price


def krx_tick_size(price):
    """Unified KRX common-stock tick table since 2023-01-25."""
    _validate_number(price, positive=True)
    for ceiling, tick in [(2000, 1), (5000, 5), (20000, 10), (50000, 50),
                          (200000, 100), (500000, 500)]:
        if price < ceiling:
            return tick
    return 1000


def sell_tax_bps(sell_date):
    """T+2 settlement-year tax, using verified first sell dates for each year."""
    if not isinstance(sell_date, str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', sell_date):
        raise ValueError('Expected an ISO date')
    datetime.date.fromisoformat(sell_date)
    if sell_date >= '2025-12-29':
        return 20
    if sell_date >= '2024-12-27':
        return 15
    if sell_date >= '2023-12-27':
        return 18
    raise ValueError('Unsupported sell trade date: '+sell_date)


def estimate_round_trip_cost(entry_price, exit_price, sell_date,
                             commission_bps_per_side=1.5, slippage_ticks_per_side=.5):
    entry_tick = krx_tick_size(entry_price)
    exit_tick = krx_tick_size(exit_price)
    # WHY: Typical online commission assumption; the actual account rate is unconfirmed.
    _validate_number(commission_bps_per_side)
    _validate_number(slippage_ticks_per_side)
    exit_ratio = exit_price / entry_price
    tax_bps = sell_tax_bps(sell_date)
    entry_slippage_bps = slippage_ticks_per_side * entry_tick / entry_price * 10000
    exit_slippage_bps = slippage_ticks_per_side * exit_tick / exit_price * 10000
    # Each component is in entry-notional bps, so the components sum to costBps.
    return dict(costBps=(commission_bps_per_side+entry_slippage_bps)
                    + (commission_bps_per_side+tax_bps+exit_slippage_bps)*exit_ratio,
                sellTaxBps=tax_bps*exit_ratio,
                commissionBps=commission_bps_per_side*(1+exit_ratio),
                slippageBps=entry_slippage_bps+exit_slippage_bps*exit_ratio)
