# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "scikit-learn==1.9.1"]
# ///
import argparse, json, math, pathlib, hashlib

# Offline only: export-target-research.ts produces these point-in-time features.
# Fixed two-candidate comparison; choose on validation before opening final test.
parser = argparse.ArgumentParser(
    description="Reproduce the frozen v3 stock ranking experiment"
)
parser.add_argument("--input-dir", type=pathlib.Path, required=True)
parser.add_argument("--output-dir", type=pathlib.Path, required=True)
parser.add_argument("--final-test", action="store_true")
args = parser.parse_args()
import numpy as np
from sklearn.linear_model import LogisticRegression

ROOT = args.input_dir
OUT = args.output_dir
OUT.mkdir(parents=True, exist_ok=True)
NAMES = [
    "atrPercent14",
    "rsi14",
    "macdPercent",
    "sma20DistancePercent",
    "sma20Slope5Percent",
    "trendSlope20Percent",
    "trendR2_20",
    "adx14",
    "logVolumeRatio20",
    "volumePercentile60",
    "gapPercent",
    "signalReturnPercent",
    "closeLocation",
    "distanceFromHigh60",
    "position52w",
    "logTurnover20",
]


def vector(f):
    try:
        x = [
            f["atrPercent14"],
            f["rsi14"],
            f["macdHistogram"] / f["close"] * 100,
            f["sma20DistancePercent"],
            f["sma20Slope5"] * 100,
            f["trendSlope20"] * 100,
            f["trendR2_20"],
            f["adx14"],
            math.log1p(f["volumeRatio20"]),
            f["volumePercentile60"],
            f["gapFromPreviousClosePercent"],
            (f["close"] / f["open"] - 1) * 100,
            (f["close"] - f["low"]) / (f["high"] - f["low"])
            if f["high"] > f["low"]
            else 0.5,
            f["distanceFromHigh60"],
            f["position52w"],
            math.log1p(f["averageTurnover20"] / 1e8),
        ]
        return x if all(a is not None and math.isfinite(a) for a in x) else None
    except (TypeError, ValueError, ZeroDivisionError):
        return None


meta = json.loads((ROOT / "metadata.json").read_text())
dates = meta["evaluationDates"]
rows = {}
for line in (ROOT / "compact.ndjson").open():
    date, ps = json.loads(line)
    out = []
    for p in ps:
        x = vector(p["feature"])
        if x is None:
            continue
        p["x"] = x
        out.append(p)
    rows[date] = out
print(
    "LOADED",
    len(dates),
    dates[0],
    dates[-1],
    sum(len(rows[d]) for d in dates),
    flush=True,
)
train = dates[:80]
validation = dates[85:115]
test = dates[120:]
dev = dates[:115]
if len(dates) != 180:
    raise ValueError("Frozen experiment requires exactly 180 mature signal dates")
splits = {
    "train": [train[0], train[-1]],
    "validation": [validation[0], validation[-1]],
    "test": [test[0], test[-1]],
    "purgeTradingDays": 5,
}


def fit(ds, kind):
    ps = [
        p
        for d in ds
        for p in rows[d]
        if p["eligible"]
        and p["label"]
        and p["label"]["status"] in ["hit", "miss"]
        and p["entryBullish"] is not None
    ]
    x = np.array([p["x"] for p in ps])
    b = np.array([p["entryBullish"] for p in ps], dtype=int)
    t = np.array([p["label"]["touched"] for p in ps], dtype=int)

    def model(mask, y):
        xx = x[mask]
        yy = y[mask]
        lo = np.quantile(xx, 0.005, axis=0)
        hi = np.quantile(xx, 0.995, axis=0)
        xx = np.clip(xx, lo, hi)
        mean = xx.mean(axis=0)
        scale = xx.std(axis=0)
        scale[scale < 1e-10] = 1
        z = (xx - mean) / scale
        lr = LogisticRegression(C=1, max_iter=500, tol=1e-7, solver="lbfgs").fit(z, yy)
        return dict(
            featureNames=NAMES,
            lower=lo.tolist(),
            upper=hi.tolist(),
            mean=mean.tolist(),
            scale=scale.tolist(),
            coefficient=lr.coef_[0].tolist(),
            intercept=float(lr.intercept_[0]),
            trainingRows=len(yy),
            trainingPositiveRate=float(yy.mean()),
        )

    allmask = np.ones(len(ps), dtype=bool)
    models = (
        {"joint": model(allmask, b * t)}
        if kind == "directJoint"
        else {"entryBullish": model(allmask, b), "touchGivenBullish": model(b == 1, t)}
    )
    return {
        "kind": kind,
        "models": models,
        "trainedSignalFrom": ds[0],
        "trainedSignalThrough": ds[-1],
    }


def predict(m, x):
    z = (
        np.clip(x, np.array(m["lower"]), np.array(m["upper"])) - np.array(m["mean"])
    ) / np.array(m["scale"])
    v = np.clip(z @ np.array(m["coefficient"]) + m["intercept"], -700, 700)
    return 1 / (1 + np.exp(-v))


def evaluate(name, ds, artifact=None):
    recent = []
    daily = []
    picks = []
    for d in ds:
        pool = rows[d]
        excluded = {s for _, syms in recent[-20:] for s in syms}
        if name == "legacy":
            ranked = sorted(
                [p for p in pool if p["legacyRank"] is not None],
                key=lambda p: p["legacyRank"],
            )
        else:
            pool = [p for p in pool if p["eligible"] and p["symbol"] not in excluded]
            if name == "lowVolatility":
                ranked = sorted(
                    pool, key=lambda p: (p["feature"]["atrPercent14"], p["symbol"])
                )
            elif name == "highVolatility":
                ranked = sorted(
                    pool, key=lambda p: (-p["feature"]["atrPercent14"], p["symbol"])
                )
            elif name == "random":
                ranked = sorted(
                    pool,
                    key=lambda p: hashlib.sha256(
                        (d + ":J:" + p["symbol"]).encode()
                    ).hexdigest(),
                )
            else:
                x = np.array([p["x"] for p in pool])
                mm = artifact["models"]
                score = (
                    predict(mm["joint"], x)
                    if artifact["kind"] == "directJoint"
                    else predict(mm["entryBullish"], x)
                    * predict(mm["touchGivenBullish"], x)
                )
                ranked = [
                    pool[i]
                    for i in sorted(
                        range(len(pool)), key=lambda i: (-score[i], pool[i]["symbol"])
                    )
                ]
        pp = ranked[:3]
        recent.append((d, [p["symbol"] for p in pp]))
        day = []
        for p in pp:
            l = p["label"]
            valid = l is not None and l["status"] in ["hit", "miss"]
            bull = p["entryBullish"] is True
            touch = valid and l["touched"]
            joint = bull and touch
            r = {
                "date": d,
                "symbol": p["symbol"],
                "valid": valid,
                "bullish": bool(bull),
                "touch": bool(touch),
                "joint": bool(joint),
                "entryReturn": p["entryReturn"],
                "closeReturn": l["return5d"] if valid else None,
                "targetExitReturn": (0.1 if touch else l["return5d"])
                if valid
                else None,
                "mae": l["maxDrawdown"] if valid else None,
            }
            picks.append(r)
            day.append(r)
        daily.append(
            {
                "date": d,
                "bullish": sum(p["bullish"] for p in day) / 3,
                "touch": sum(p["touch"] for p in day) / 3,
                "joint": sum(p["joint"] for p in day) / 3,
            }
        )
    n = len(ds) * 3
    valid = [p for p in picks if p["valid"]]
    ret = [p["closeReturn"] for p in valid]
    target = [p["targetExitReturn"] - 0.003 for p in valid]
    summary = {
        "days": len(ds),
        "picks": len(picks),
        "slotCoverage": len(picks) / n,
        "dataErrors": len(picks) - len(valid),
        "bullishRate": sum(p["bullish"] for p in picks) / n,
        "touchRate": sum(p["touch"] for p in picks) / n,
        "jointRate": sum(p["joint"] for p in picks) / n,
        "meanEntryReturn": float(np.mean([p["entryReturn"] for p in picks if p["entryReturn"] is not None])),
        "meanCloseNetReturn": float(np.mean(ret)) - 0.003,
        "medianCloseNetReturn": float(np.median(ret)) - 0.003,
        "meanTargetExitNetProxy": float(np.mean(target)),
        "worstCloseNetReturn": min(ret) - 0.003,
        "meanMAE": float(np.mean([p["mae"] for p in valid])),
        "roundTripCostBps": 30,
    }
    return {"name": name, "summary": summary, "daily": daily, "picks": picks}


artifacts = {kind: fit(train, kind) for kind in ["directJoint", "conditionalJoint"]}
validationResults = [
    evaluate(n, validation, artifacts.get(n))
    for n in [
        "lowVolatility",
        "legacy",
        "random",
        "highVolatility",
        "directJoint",
        "conditionalJoint",
    ]
]
(OUT / "validation.json").write_text(
    json.dumps(
        {"splits": splits, "results": validationResults, "artifacts": artifacts},
        indent=2,
    )
)
for r in validationResults:
    print("VALIDATION", r["name"], json.dumps(r["summary"]), flush=True)
# Freeze selection on validation joint rate, then bullish rate, then target-exit proxy.
chosen = max(
    [r for r in validationResults if r["name"] in artifacts],
    key=lambda r: (
        r["summary"]["jointRate"],
        r["summary"]["bullishRate"],
        r["summary"]["meanTargetExitNetProxy"],
    ),
)["name"]
final = fit(dev, chosen)
final["selection"] = (
    "validation joint rate, then entry bullish rate, then target-exit proxy"
)
final["objective"] = "bullishThenTouch10Within5TradingDays"
final["version"] = "v3-2026-09-29"
final["trainedLabelsThrough"] = meta["tradingDays"][
    meta["tradingDays"].index(final["trainedSignalThrough"]) + 5
]
(OUT / "model.json").write_text(json.dumps(final, indent=2))
print("CHOSEN", chosen, flush=True)
if args.final_test:
    results = [
        evaluate(n, test, final if n == chosen else None)
        for n in ["lowVolatility", "legacy", "random", "highVolatility", chosen]
    ]
    report = {
        "splits": splits,
        "selected": chosen,
        "evaluationScope": "temporal_test_of_frozen_candidate_historical_dates_previously_researched_not_prospective",
        "caveats": [
            "Current master survivorship and historical status bias",
            "Same dates appeared in prior repository research",
            "30bps illustrative round-trip cost, no fill guarantee",
            "Overlapping five-day outcomes, daily picks correlated",
            "Cold-start cooldown at each evaluation boundary",
        ],
        "results": results,
    }
    (OUT / "test.json").write_text(json.dumps(report, indent=2))
    for r in results:
        print("TEST", r["name"], json.dumps(r["summary"]), flush=True)
    # Independent Python outputs consumed by the TypeScript inference parity test.
    golden = [
        {
            "feature": p["feature"],
            "score": float(predict(final["models"]["joint"], np.array(p["x"]))),
        }
        for p in rows[test[0]][:3]
    ]
    (OUT / "golden.json").write_text(json.dumps(golden, indent=2))
