"""Optuna 2-stage hierarchical optimizer for TLI parameters."""
from __future__ import annotations

import json
import subprocess
import sys
import os
import statistics

import optuna

from param_space import suggest_core, suggest_finetune, validate_params

EVALUATE_CMD = ["npx", "tsx", "scripts/tli-optimizer/evaluate.ts"]
TIMEOUT = 30
OUTPUT_PATH = "scripts/tli-optimizer/optimized-params.json"


def run_evaluate(params: dict, split: str = "train") -> float | None:
    """Run evaluate.ts and return GDDA. Returns None on failure."""
    cmd = EVALUATE_CMD + ["--params", json.dumps(params), "--split", split]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
            shell=False,  # SECURITY: never shell=True
        )
        if result.returncode != 0:
            print(
                f"  [WARN] evaluate.ts failed: {result.stderr[:200]}", file=sys.stderr
            )
            return None

        output = json.loads(result.stdout.strip())
        gdda = output.get("gdda")
        if gdda is None:
            return None
        return float(gdda)
    except subprocess.TimeoutExpired:
        print(f"  [WARN] evaluate.ts timeout ({TIMEOUT}s)", file=sys.stderr)
        return None
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  [WARN] evaluate.ts parse error: {e}", file=sys.stderr)
        return None


def stage1_objective(trial):
    params = suggest_core(trial)
    if not validate_params(params):
        return float("nan")

    gdda = run_evaluate(params, "train")
    if gdda is None:
        return float("nan")
    return gdda


def make_stage2_objective(fixed_core):
    def objective(trial):
        params = suggest_finetune(trial, fixed_core)
        if not validate_params(params):
            return float("nan")
        gdda = run_evaluate(params, "train")
        if gdda is None:
            return float("nan")
        return gdda

    return objective


def extract_top_core(study, top_pct=0.10):
    """Extract median core params from top trials."""
    completed = [
        t
        for t in study.trials
        if t.state == optuna.trial.TrialState.COMPLETE and t.value == t.value
    ]  # filter NaN
    completed.sort(key=lambda t: t.value, reverse=True)
    top_n = max(1, int(len(completed) * top_pct))
    top_trials = completed[:top_n]

    core_keys = [
        "w_interest",
        "w_newsMomentum",
        "w_volatility",
        "stage_dormant",
        "stage_emerging",
        "stage_growth",
        "stage_peak",
        "trend_threshold",
        "ema_alpha",
        "min_raw_interest",
    ]

    fixed = {}
    for key in core_keys:
        values = [t.params[key] for t in top_trials if key in t.params]
        if values:
            if isinstance(values[0], int):
                fixed[key] = round(statistics.median(values))
            else:
                fixed[key] = statistics.median(values)

    return fixed


def generate_ts_snippet(params):
    """Generate TypeScript code snippet for score-config.ts."""
    lines = [
        "// Optimized TLI params (paste into score-config.ts or optimized-params.json)"
    ]
    lines.append("export const OPTIMIZED_PARAMS: Partial<TLIParams> = {")
    for key, value in sorted(params.items()):
        if isinstance(value, int):
            lines.append(f"  {key}: {value},")
        else:
            lines.append(f"  {key}: {value:.6f},")
    lines.append("}")
    return "\n".join(lines)


def main():
    n_stage1 = int(os.environ.get("OPTUNA_STAGE1_TRIALS", "80"))
    n_stage2 = int(os.environ.get("OPTUNA_STAGE2_TRIALS", "120"))

    print(f"[optimize] Stage 1: {n_stage1} trials (core params)")
    study1 = optuna.create_study(direction="maximize", study_name="tli-stage1")
    study1.optimize(stage1_objective, n_trials=n_stage1, show_progress_bar=True)

    fixed_core = extract_top_core(study1)
    train_gdda_s1 = study1.best_value
    print(f"[optimize] Stage 1 best train GDDA: {train_gdda_s1:.4f}")
    print(f"[optimize] Fixed core params: {json.dumps(fixed_core, indent=2)}")

    print(f"\n[optimize] Stage 2: {n_stage2} trials (fine-tune)")
    study2 = optuna.create_study(direction="maximize", study_name="tli-stage2")
    study2.optimize(
        make_stage2_objective(fixed_core), n_trials=n_stage2, show_progress_bar=True
    )

    best_params = study2.best_params
    best_params.update(fixed_core)
    train_gdda = study2.best_value

    # Validation
    print("\n[optimize] Running validation...")
    val_gdda = run_evaluate(best_params, "val")
    baseline_gdda = run_evaluate({}, "all")

    print(f"\n{'='*50}")
    print(f"Baseline GDDA (all): {baseline_gdda}")
    print(f"Train GDDA:          {train_gdda:.4f}")
    print(f"Val GDDA:            {val_gdda}")

    if val_gdda is not None and train_gdda is not None:
        gap = abs(train_gdda - val_gdda)
        if gap > 0.10:
            print(
                f"[WARNING] Overfitting detected: train-val gap = {gap:.4f} > 0.10"
            )
        if baseline_gdda is not None and val_gdda < baseline_gdda:
            print(
                f"[ERROR] Val GDDA ({val_gdda:.4f}) < baseline ({baseline_gdda:.4f}). Optimization may have failed."
            )

    print(f"{'='*50}")

    # Save
    with open(OUTPUT_PATH, "w") as f:
        json.dump(best_params, f, indent=2)
    print(f"\nSaved to {OUTPUT_PATH}")

    # TS snippet
    print("\n" + generate_ts_snippet(best_params))


if __name__ == "__main__":
    main()
