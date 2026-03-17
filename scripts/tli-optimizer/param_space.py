"""TLI parameter search space for Optuna 2-stage hierarchical optimization."""

WEIGHT_BOUNDS = {
    "w_interest": (0.25, 0.55),
    "w_newsMomentum": (0.20, 0.45),
    "w_volatility": (0.05, 0.20),
}
W_ACTIVITY_BOUNDS = (0.05, 0.25)


# Stage 1: Core params (10)
def suggest_core(trial):
    params = {}
    # Weights: 3 suggest + 1 computed
    params["w_interest"] = trial.suggest_float("w_interest", 0.25, 0.55)
    params["w_newsMomentum"] = trial.suggest_float("w_newsMomentum", 0.20, 0.45)
    params["w_volatility"] = trial.suggest_float("w_volatility", 0.05, 0.20)

    # Stage thresholds (monotonic increase constraint)
    params["stage_dormant"] = trial.suggest_int("stage_dormant", 5, 25)
    params["stage_emerging"] = trial.suggest_int(
        "stage_emerging", max(26, params["stage_dormant"] + 1), 50
    )
    params["stage_growth"] = trial.suggest_int(
        "stage_growth", max(params["stage_emerging"] + 1, 45), 70
    )
    params["stage_peak"] = trial.suggest_int(
        "stage_peak", max(params["stage_growth"] + 1, 55), 85
    )

    params["trend_threshold"] = trial.suggest_float("trend_threshold", 0.03, 0.20)
    params["ema_alpha"] = trial.suggest_float("ema_alpha", 0.2, 0.7)
    params["min_raw_interest"] = trial.suggest_int("min_raw_interest", 2, 15)

    return params


# Stage 2: Fine-tune params (23 = core 10 fixed + fine 13 search)
def suggest_finetune(trial, fixed_core):
    params = dict(fixed_core)

    # Interest
    params["interest_level_center"] = trial.suggest_float(
        "interest_level_center", 10, 60
    )
    params["interest_level_scale"] = trial.suggest_float(
        "interest_level_scale", 5, 40
    )
    params["interest_momentum_scale"] = trial.suggest_float(
        "interest_momentum_scale", 0.5, 3.0
    )
    params["interest_level_ratio"] = trial.suggest_float(
        "interest_level_ratio", 0.4, 0.8
    )

    # News
    params["news_log_scale"] = trial.suggest_float("news_log_scale", 20, 100)
    params["news_momentum_scale"] = trial.suggest_float(
        "news_momentum_scale", 0.3, 2.0
    )
    params["news_volume_ratio"] = trial.suggest_float("news_volume_ratio", 0.4, 0.8)
    params["min_news_last_week"] = trial.suggest_int("min_news_last_week", 1, 7)

    # Volatility
    params["vol_center"] = trial.suggest_float("vol_center", 5, 30)
    params["vol_scale"] = trial.suggest_float("vol_scale", 3, 20)

    # Activity
    params["price_sigmoid_scale"] = trial.suggest_float("price_sigmoid_scale", 2, 10)
    params["volume_log_scale"] = trial.suggest_float(
        "volume_log_scale", 10_000_000, 200_000_000
    )
    params["coverage_days"] = trial.suggest_int("coverage_days", 7, 30)
    params["activity_vs_sentiment_ratio"] = trial.suggest_float(
        "activity_vs_sentiment_ratio", 0.5, 0.9
    )
    params["level_dampening_threshold"] = trial.suggest_float(
        "level_dampening_threshold", 0.05, 0.3
    )

    # Sentiment
    params["sent_price_weight"] = trial.suggest_float("sent_price_weight", 0.3, 0.7)
    params["sent_news_weight"] = trial.suggest_float("sent_news_weight", 0.1, 0.5)
    params["sent_volume_scale"] = trial.suggest_float("sent_volume_scale", 0.2, 1.0)

    # Stage Bypass
    params["peak_bypass_news"] = trial.suggest_int("peak_bypass_news", 15, 50)
    params["decline_score_ratio"] = trial.suggest_float(
        "decline_score_ratio", 0.70, 0.95
    )

    # Smoothing
    params["min_daily_change"] = trial.suggest_int("min_daily_change", 5, 20)
    params["cautious_floor_ratio"] = trial.suggest_float(
        "cautious_floor_ratio", 0.80, 0.95
    )

    return params


def validate_params(params):
    """Check computed w_activity is within bounds."""
    w_activity = 1.0 - (
        params["w_interest"] + params["w_newsMomentum"] + params["w_volatility"]
    )
    if w_activity < W_ACTIVITY_BOUNDS[0] or w_activity > W_ACTIVITY_BOUNDS[1]:
        return False
    return True
