"""Fixed objective for the two-head composite candidate; no score floor or daily rescale."""
import math

COMPOSITE_TARGET = dict(version='touch-nonloss-v1', formula='clip(touch)*clip(nonLoss)^2',
                        entry='next actual trading session open', horizon=5,
                        roundTripCostBps=30, nonLoss='D5close/entry-1-.003 >= 0',
                        touch10='Math.round(max(D1..D5 high))*100 >= Math.round(entry)*110')


def combine_heads(touch, non_loss):
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
               for v in (touch, non_loss)):
        raise ValueError('Head predictions must be finite numbers')
    return min(1, max(0, touch)) * min(1, max(0, non_loss)) ** 2
