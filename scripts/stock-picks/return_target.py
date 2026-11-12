from math import floor
from statistics import fmean
from trading_cost import estimate_round_trip_cost, reconstruct_exit_price

RETURN_TARGET = dict(version='demeaned-tp7-net-v1',
                     formula='touch7=floor(max(D1..D5 high)+.5)*100 >= floor(entry+.5)*107; net=(touch7 ? .07 : D5close/entry-1)-costBps/10000; y=net-dateMean(net)',
                     horizon=5, takeProfit=.07, cost='krx-realistic-v1',
                     demean='signal-date strict rows')
HIT_TARGET = dict(version='net-positive-d5-v1',
                  formula='hit = D5close/entry-1-costBps/10000 > 0',
                  horizon=5, cost='krx-realistic-v1', output='log-odds')


def _d5_return_and_cost(bars, sell_date):
    entry = float(bars[0][0]); d5_return = float(bars[-1][3]) / entry - 1
    cost = estimate_round_trip_cost(entry, reconstruct_exit_price(entry, d5_return), sell_date)['costBps']
    return entry, d5_return, cost


def demeaned_tp7_net_targets(rows, sell_date):
    net = []
    for bars in rows:
        entry, d5_return, cost = _d5_return_and_cost(bars, sell_date)
        touch7 = floor(max(bar[1] for bar in bars) + .5) * 100 >= floor(entry + .5) * 107
        net.append((.07 if touch7 else d5_return) - cost / 10000)
    mean = fmean(net)
    return [value - mean for value in net]


def net_positive_d5_targets(rows, sell_date):
    """v9 hit head label: 1 when the D5 close return net of realistic cost is positive (no take-profit cap)."""
    hits = []
    for bars in rows:
        _, d5_return, cost = _d5_return_and_cost(bars, sell_date)
        hits.append(1.0 if d5_return - cost / 10000 > 0 else 0.0)
    return hits
