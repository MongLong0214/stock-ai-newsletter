[OBJECTIVE]
Design a scientifically grounded, operationally feasible roadmap from current TLI level-4 certification status toward stable level-4 operations, level-4.5 experimentation, and level-5 model transition.

[DATA]
Primary evidence sources reviewed:
- 11 explicit weight tuning reports
- 1 latest calibration report
- 1 latest drift report
- 1 latest certification report
- Report observation span: 5.60 hours on 2026-03-12

[FINDING]
Under the current feature/weight surface, baseline remains the dominant certified choice.
[STAT:effect_size] Baseline selected in 11/11 explicit weight tuning reports (selection rate = 1.00)
[STAT:ci] 95% Wilson CI: [0.741, 1.000]
[STAT:p_value] One-sided exact binomial p = 0.00049 versus null p = 0.5
[STAT:n] n = 11 weight-tuning selections

[FINDING]
Calibration evidence exists but the positive class remains relatively sparse, limiting fast iteration on challenger promotion.
[STAT:effect_size] Positive rate = 0.1427
[STAT:ci] 95% Wilson CI: [0.1260, 0.1612]
[STAT:n] n = 1514 calibration rows

[FINDING]
The drift surface is much larger than the calibration surface, but censoring remains operationally high and should be treated as a primary bottleneck for 4.5-stage experimentation.
[STAT:effect_size] Censoring rate = 0.3975; ECE = 0.0648; relevance base rate = 0.0679
[STAT:ci] Censoring 95% CI: [0.3821, 0.4131]; relevance-base-rate 95% CI: [0.0604, 0.0763]
[STAT:n] n = 3844 drift rows

[FINDING]
The certification checklist is internally complete, but the evidence window is too short to support claims of long-run operational stability.
[STAT:effect_size] 7/7 checklist items passed
[STAT:n] 24 local scientist reports spanning 5.60 hours

[LIMITATION]
The roadmap below is grounded in local artifacts generated on 2026-03-12 and does not yet include multi-week or multi-month operational evidence.

## Stage 4 Stabilization Roadmap

### Objective
Turn one-day certification success into repeatable, low-variance operations over a sustained window.

### Duration
2 to 4 weeks minimum, but measured by evidence not calendar alone.

### Workstreams
1. Reliability hardening
- Freeze artifact contracts for calibration, weight, drift, and control-row pinning.
- Add explicit failed terminal states for every queueable job.
- Enforce zero silent fallback on serving-critical paths.

2. Observability and SLOs
- Daily artifact-chain success SLO: >= 99.0% over trailing 30 days.
- Promotion success SLO: >= 99.5% over trailing 30 days.
- Serving pin mismatch SLO: exactly 0.
- Degraded-success response rate for critical TLI endpoints: exactly 0.
- Drift false-hold review cadence: weekly adjudication.

3. Evaluation-surface hygiene
- Increase native v2 eval share until bridge rows are a minority of evaluated evidence.
- Track daily native-vs-bridge ratio, censoring ratio, and stale queue size.

4. Governance
- Weekly rollback drill.
- Weekly control-row provenance audit.
- Daily drift artifact generation and weekly summary review.

### Exit criteria
- 30 consecutive days with Sev1/Sev2 = 0.
- Artifact-chain success >= 99.0% over trailing 30 days.
- Native-eval share >= 70% of newly added eval rows for 2 consecutive weeks.
- Serving/control-row artifact mismatch = 0 for 30 days.
- Rollback drill pass rate = 100% across at least 4 consecutive drills.

## Stage 4.5 Roadmap

### Objective
Build a validated experimentation system that can reject weak challengers quickly and promote only statistically credible non-baseline surfaces.

### Duration
4 to 8 weeks after stage-4 stabilization gates are met.

### Core principle
Do not tune weights first. Version feature families first, then compare surfaces.

### Experimental units
- Lifecycle family
- Sector family
- Keyword family
- Censoring/missingness family
- Market-regime family

### Required infrastructure
1. Versioned datasets
- Freeze replay/native-eval datasets by fold and report ID.
- Maintain train/validation/test lineage per candidate surface.

2. Champion/challenger evaluation
- Champion remains baseline.
- Each challenger must report:
  - global MRR, NDCG, Precision@3
  - segment metrics by sector, stage, horizon, and data-density bucket
  - calibration metrics by segment
  - drift/hold deltas relative to champion

3. Promotion thresholds
- Challenger promotion requires all of:
  - delta MRR lower bound > 0
  - delta NDCG lower bound > 0
  - Precision@3 non-inferiority margin >= -0.01
  - no worse drift hold profile than champion
  - no increase in degraded/failed operational paths

4. Sample-size gates
- Do not evaluate a challenger for promotion until:
  - native eval rows >= 5000
  - at least 8 distinct weekly run cohorts
  - censoring rate <= 0.30 or censoring-aware correction validated by segment

### Priority experiment order
1. Segment-aware lifecycle features
2. Censoring-aware scoring/labels
3. Sector-exposure features
4. Keyword-support/rarity and regime context
5. Model-based ranker prototype only after 1 to 4 are exhausted

### Exit criteria
- At least one non-baseline challenger beats baseline on replay and native eval simultaneously.
- Promotion metrics pass all CI gates in 2 consecutive evaluation cycles.
- Segment-level regressions absent in priority sectors/stages.
- This is the point where the system becomes a validated experimentation platform, not just a certified rules engine.

## Stage 5 Roadmap

### Objective
Move from a calibrated heuristic system to a model-native probabilistic decision system.

### Duration
2 to 4 months after a stable 4.5-stage experimentation program exists.

### Required transition
1. Replace heuristic similarity dominance with explicit predictive models:
- learning-to-rank for candidate ordering
- survival/event-time models for peak timing and decay timing
- hierarchical models for sector/theme family partial pooling

2. Model-native uncertainty
- Serve P(relevant), P(peak <= 14d), P(post-peak within 30d), and calibrated uncertainty directly.
- Bootstrap becomes an audit layer, not the primary uncertainty engine.

3. Data/ML operations
- Feature store
- model registry
- retraining cadence
- shadow deployment and rollback registry
- segment calibration dashboards

4. Online evaluation
- Offline metrics remain necessary but insufficient.
- Add operational/online metrics such as analyst acceptance, downstream usefulness, and editorial decision lift.

### Promotion criteria for stage-5 system
- Probabilistic outputs outperform heuristic champion on replay and native eval.
- Retraining, rollback, and registry are fully automated.
- Segment calibration remains within fixed tolerance bands.
- Heuristic baseline becomes fallback-only, not primary serving logic.

## Recommended execution order
1. Stabilize stage 4 first.
2. Reach stage 4.5 by building a trustworthy experimentation system.
3. Attempt stage 5 only after a non-baseline challenger wins repeatedly under stage-4.5 gates.
