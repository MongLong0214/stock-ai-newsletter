"""Optuna optimizer for TLI parameters — core-only + regularization + 5-fold CV."""
from __future__ import annotations

import json
import math
import subprocess
import sys
import os
import statistics

import optuna

from param_space import suggest_core, validate_params

EVALUATE_CMD = ["npx", "tsx", "scripts/tli/research/optimizer/evaluate.ts"]
TIMEOUT = 30
OUTPUT_PATH = "scripts/tli/research/optimizer/optimized-params.json"

# Default param values for regularization penalty — synced with DEFAULT_TLI_PARAMS (2026-03-17)
DEFAULTS = {
    "w_interest": 0.304148, "w_newsMomentum": 0.366408, "w_volatility": 0.104017,
    "stage_dormant": 10, "stage_emerging": 40, "stage_growth": 61, "stage_peak": 71,
    "trend_threshold": 0.163507, "ema_alpha": 0.416554, "min_raw_interest": 4,
    "interest_level_center": 45.793311, "interest_level_scale": 10.799847, "interest_level_ratio": 0.576366,
    "news_log_scale": 64.338194, "news_momentum_scale": 1.324128,
    "activity_vs_sentiment_ratio": 0.727894, "vol_center": 10.752023, "decline_score_ratio": 0.860943,
    "cautious_floor_ratio": 0.946661,
}

# Regularization strength — penalizes deviation from defaults
REG_LAMBDA = float(os.environ.get("REG_LAMBDA", "0.05"))


def run_evaluate(params: dict, split: str = "train") -> dict | None:
    """Run evaluate.ts and return full result dict. Returns None on failure."""
    cmd = EVALUATE_CMD + ["--params", json.dumps(params), "--split", split]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=TIMEOUT, shell=False,
        )
        if result.returncode != 0:
            return None
        output = json.loads(result.stdout.strip())
        if output.get("gdda") is None:
            return None
        return output
    except (subprocess.TimeoutExpired, json.JSONDecodeError, ValueError):
        return None


def regularization_penalty(params: dict) -> float:
    """L2 penalty for deviation from default values (normalized per param)."""
    penalty = 0.0
    for key, default in DEFAULTS.items():
        if key in params and default != 0:
            deviation = (params[key] - default) / max(abs(default), 1)
            penalty += deviation ** 2
    return penalty / len(DEFAULTS)


def objective_cv(trial) -> float:
    """Core params objective: full dataset evaluation + L2 regularization."""
    params = suggest_core(trial)
    if not validate_params(params):
        return float("nan")

    # Single evaluation on full dataset with L2 regularization toward defaults
    result = run_evaluate(params, "all")
    if result is None:
        return float("nan")

    gdda = result["gdda"]
    if gdda is None or (isinstance(gdda, float) and math.isnan(gdda)):
        return float("nan")

    # Regularization: penalize params far from defaults
    reg = regularization_penalty(params)
    regularized_gdda = float(gdda) - REG_LAMBDA * reg

    return regularized_gdda


def generate_ts_snippet(params: dict) -> str:
    """Generate TypeScript code snippet."""
    lines = ["// Optimized TLI params — paste into optimized-params.json"]
    lines.append("export const OPTIMIZED_PARAMS: Partial<TLIParams> = {")
    for key, value in sorted(params.items()):
        if isinstance(value, int):
            lines.append(f"  {key}: {value},")
        else:
            lines.append(f"  {key}: {round(value, 6)},")
    lines.append("}")
    return "\n".join(lines)


def main():
    n_trials = int(os.environ.get("OPTUNA_TRIALS", "200"))

    print(f"[optimize] Core-only optimization: {n_trials} trials")
    print(f"[optimize] Regularization lambda: {REG_LAMBDA}")
    print(f"[optimize] Params: 10 (core only, no fine-tune stage)")

    # Measure baseline
    print("[optimize] Measuring baseline...")
    baseline = run_evaluate({}, "all")
    baseline_gdda = baseline["gdda"] if baseline else None
    print(f"[optimize] Baseline GDDA: {baseline_gdda}")

    # Single-stage optimization with regularization
    seed = int(os.environ.get("OPTUNA_SEED", "42"))
    sampler = optuna.samplers.TPESampler(seed=seed)
    study = optuna.create_study(direction="maximize", study_name="tli-core-reg", sampler=sampler)
    study.optimize(objective_cv, n_trials=n_trials, show_progress_bar=True)

    best_params = study.best_params
    best_raw_gdda = study.best_value

    # Evaluate best without regularization for true GDDA
    true_result = run_evaluate(best_params, "all")
    true_gdda = true_result["gdda"] if true_result else None

    # Evaluate on val split for overfitting check
    val_result = run_evaluate(best_params, "val")
    val_gdda = val_result["gdda"] if val_result else None
    train_result = run_evaluate(best_params, "train")
    train_gdda = train_result["gdda"] if train_result else None

    print(f"\n{'=' * 60}")
    print(f"  Baseline GDDA (all):    {baseline_gdda}")
    print(f"  Optimized GDDA (all):   {true_gdda}")
    print(f"  Train GDDA:             {train_gdda}")
    print(f"  Val GDDA:               {val_gdda}")
    print(f"  Regularized objective:  {best_raw_gdda:.4f}")
    print(f"  Improvement:            {'+' if true_gdda and baseline_gdda and true_gdda > baseline_gdda else ''}"
          f"{((true_gdda - baseline_gdda) * 100):.1f}%p" if true_gdda and baseline_gdda else "  N/A")

    if train_gdda is not None and val_gdda is not None:
        gap = abs(train_gdda - val_gdda)
        if gap > 0.10:
            print(f"  [WARNING] Overfitting: train-val gap = {gap:.2f}")
        else:
            print(f"  [OK] Train-val gap = {gap:.2f} (< 0.10)")

    if baseline_gdda and true_gdda and true_gdda <= baseline_gdda:
        print(f"  [ERROR] No improvement over baseline")

    print(f"{'=' * 60}")

    # Save
    with open(OUTPUT_PATH, "w") as f:
        json.dump(best_params, f, indent=2)
    print(f"\nSaved to {OUTPUT_PATH}")

    # Details
    print(f"\nBest params:")
    print(json.dumps(best_params, indent=2))

    print(f"\n{generate_ts_snippet(best_params)}")

    # Compare with defaults
    print(f"\nParam changes from defaults:")
    for key in sorted(best_params):
        default = DEFAULTS.get(key)
        if default is not None:
            diff_pct = ((best_params[key] - default) / max(abs(default), 1)) * 100
            print(f"  {key}: {default} → {best_params[key]:.4f} ({diff_pct:+.1f}%)")


if __name__ == "__main__":
    main()
