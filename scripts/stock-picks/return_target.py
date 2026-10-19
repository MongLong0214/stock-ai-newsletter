from math import floor
from statistics import fmean
from trading_cost import estimate_round_trip_cost, reconstruct_exit_price

RETURN_TARGET = dict(version='demeaned-tp7-net-v1',
                     formula='touch7=floor(max(D1..D5 high)+.5)*100 >= floor(entry+.5)*107; net=(touch7 ? .07 : D5close/entry-1)-costBps/10000; y=net-dateMean(net)',
                     horizon=5, takeProfit=.07, cost='krx-realistic-v1',
                     demean='signal-date strict rows')


def demeaned_tp7_net_targets(rows, sell_date):
    net = []
    for bars in rows:
        entry = float(bars[0][0]); d5_return = float(bars[-1][3]) / entry - 1
        touch7 = floor(max(bar[1] for bar in bars) + .5) * 100 >= floor(entry + .5) * 107
        cost = estimate_round_trip_cost(entry, reconstruct_exit_price(entry, d5_return), sell_date)['costBps']
        net.append((.07 if touch7 else d5_return) - cost / 10000)
    mean = fmean(net)
    return [value - mean for value in net]
