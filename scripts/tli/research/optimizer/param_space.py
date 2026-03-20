"""TLI parameter search space — 20 params with tighter stage threshold bounds."""

WEIGHT_BOUNDS = {
    "w_interest": (0.25, 0.55),
    "w_newsMomentum": (0.20, 0.45),
    "w_volatility": (0.05, 0.20),
}
W_ACTIVITY_BOUNDS = (0.05, 0.25)


def suggest_core(trial):
    """20 params: weights + stage thresholds (tight) + scoring params."""
    params = {}

    # ── Weights (3) ──
    params["w_interest"] = trial.suggest_float("w_interest", 0.30, 0.50)
    params["w_newsMomentum"] = trial.suggest_float("w_newsMomentum", 0.25, 0.42)
    params["w_volatility"] = trial.suggest_float("w_volatility", 0.05, 0.18)

    # ── Stage thresholds (4) — tighter bounds around defaults to prevent gaming ──
    params["stage_dormant"] = trial.suggest_int("stage_dormant", 10, 20)
    params["stage_emerging"] = trial.suggest_int(
        "stage_emerging", max(params["stage_dormant"] + 10, 33), 48
    )
    params["stage_growth"] = trial.suggest_int(
        "stage_growth", max(params["stage_emerging"] + 5, 50), 65
    )
    params["stage_peak"] = trial.suggest_int(
        "stage_peak", max(params["stage_growth"] + 5, 60), 78
    )

    # ── Trend + Smoothing (3) ──
    params["trend_threshold"] = trial.suggest_float("trend_threshold", 0.05, 0.18)
    params["ema_alpha"] = trial.suggest_float("ema_alpha", 0.25, 0.55)
    params["min_raw_interest"] = trial.suggest_int("min_raw_interest", 3, 10)

    # ── Interest scoring (3) ──
    params["interest_level_center"] = trial.suggest_float("interest_level_center", 15, 50)
    params["interest_level_scale"] = trial.suggest_float("interest_level_scale", 8, 35)
    params["interest_level_ratio"] = trial.suggest_float("interest_level_ratio", 0.45, 0.75)

    # ── News scoring (2) ──
    params["news_log_scale"] = trial.suggest_float("news_log_scale", 25, 80)
    params["news_momentum_scale"] = trial.suggest_float("news_momentum_scale", 0.5, 1.8)

    # ── Activity + Volatility (3) ──
    params["activity_vs_sentiment_ratio"] = trial.suggest_float("activity_vs_sentiment_ratio", 0.55, 0.85)
    params["vol_center"] = trial.suggest_float("vol_center", 8, 25)
    params["decline_score_ratio"] = trial.suggest_float("decline_score_ratio", 0.75, 0.92)

    # ── Cautious Decay (1) ──
    params["cautious_floor_ratio"] = trial.suggest_float("cautious_floor_ratio", 0.82, 0.95)

    return params


# Keep for backward compatibility
def suggest_finetune(trial, fixed_core):
    return suggest_core(trial)


def validate_params(params):
    """Check computed w_activity is within bounds."""
    w_activity = 1.0 - (
        params["w_interest"] + params["w_newsMomentum"] + params["w_volatility"]
    )
    if w_activity < W_ACTIVITY_BOUNDS[0] or w_activity > W_ACTIVITY_BOUNDS[1]:
        return False
    return True
