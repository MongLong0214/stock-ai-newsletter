# BOOMER-6 Structural Critique: PRD v0.2 Phase 2 Round 2

**Reviewer**: BOOMER-CODEX (Codex CLI via Haiku Agent)
**Target**: /Users/isaac/WebstormProjects/stock-ai-newsletter/docs/prd/PRD-tli-parameter-optimization.md
**Version Analyzed**: v0.2 (2026-03-17)
**Focus**: Omissions (O) & Risks (R) from v0.1 → v0.2 delta

---

## Executive Summary

v0.2 introduces **3 structural improvements over v0.1**:
1. Walk-forward split (§4.9) + 7-day gap + --split flag for train/val isolation
2. GDDA raw_value foundation + pseudocode + Stage Stability Penalty
3. Cautious Decay majority-vote logic (2/3 binary signals) explicitly documented

**Assessment**: PROCEED_WITH_CAUTION (3 residual risks remain unsolved)

---

## Critical Findings

### [R1][BOOMER-R] — Naver DataLab Batch Normalization Hidden Risk

**Category**: Data Integrity (Omission)

**Premise**: 
- GDDA uses raw_value (Naver DataLab source) to avoid circular reference with normalized params
- Raw values are assumed **batch-invariant** across 7-day intervals
- No explicit guarantee that same theme's raw_value remains identical in separate batches

**Risk Exposure**:
- Naver DataLab API applies relative normalization within each batch
- Two identical queries 7 days apart may return different raw_values due to batch-wide normalization shifts
- This would invalidate GDDA forward comparison (current_avg vs future_avg)
- Example: Theme X has raw=50 on Day 1, but Day 8 batch returns same interest differently scaled → false direction detected

**Evidence**:
- §4.6 states "raw_value는 Naver DataLab 원본값으로 파라미터 독립적" but doesn't address API batch semantics
- No test fixture demonstrating raw_value stability across batches
- dump-data.ts loads Supabase interest_metrics.raw_value (line 1), but no validation of Naver source consistency

**Impact**:
- GDDA hitrate could be overstated if raw values drift silently
- Validation GDDA may not reproduce across re-dumps
- Baseline measurement (Step 0) becomes unreliable reference

**Mitigation**:
1. (Immediate) Add edge case E12: "Validate raw_value consistency across 7-day gaps in fixture. If drift > 5%, flag as data anomaly."
2. (Before dump-data.ts) Query Supabase twice (same theme, 7d apart) → verify raw_value identical. Log any drift.
3. (Long-term) Consider storing batch_id in interest_metrics to trace normalization scope.

**Recommendation**: 
- Add §5 edge case E12 validation
- Modify dump-data.ts to include `batch_consistency_check()` optional flag
- Baseline (Step 0) should re-run dump with validation enabled

---

### [R2][BOOMER-R] — Walk-forward Split Sufficiency: 7-Day Gap & 14-Day Val Minimum

**Category**: Statistical Design (Incomplete Specification)

**Premise**:
- §4.9 Walk-forward: "Gap: Day T+1 ── Day T+7 (7일 버퍼)"
- Forward window in GDDA: "future_avg = mean(interest_metrics[date+1..date+7])"
- Validation window: "Val 기간이 최소 14일 이상이 되도록 설정"

**Risk Exposure**:
1. **7-day gap sufficiency**: GDDA forward uses date+1..date+7 (7 future days). Gap ends at T+7.
   - Val starts at T+8. This means Val[0] = (theme.interest[T+8-6..T+8]).
   - The eval point T+8-6 = T+2, which is **within the gap** (Day T+1 to T+7).
   - Is this intentional isolation, or data leakage in the smoothed averages?

2. **14-day Val minimum**: "Train에서 Growth ≥ 50, Decline ≥ 20 판정이 나오는 최소 기간"
   - 14 days is heuristic, not data-driven
   - No statistical power calculation (e.g., "50 Growth judgments requires N days at historical rate X")
   - If data is sparse, 14 days may yield only 30 Growth + 8 Decline → inflated Growth Hit Rate by chance

3. **Train size implicit**: T = N - 14 - 7 is backward-computed, but total N is assumed > 60 days (§10.2).
   - If N = 65, Train = 44 days. 44 days' sample_penalty for Growth? Risk underspecification.

**Evidence**:
- No explicit formula: "If we measure Growth at rate R per day, 50 judgments requires T_min = 50/R days"
- No fixture showing Val window independence from Train (correlation check missing)
- evaluate.ts test stub doesn't verify data leakage absence

**Impact**:
- Over-optimistic GDDA in Val if temporal correlation exists
- Train overfitting undetectable (baseline too weak)
- 50 Growth / 20 Decline thresholds arbitrary without justification

**Mitigation**:
1. Add §4.9 subsection: "Statistical Power Calculation"
   - Historical Growth judgment rate (from 60-day archive): X per day
   - Minimum Val days = max(14, ceil(50 / X)) to ensure ≥50 Growth samples
   - Same for Decline (20 / Y)
2. Edge case E13: "If Val Growth < 50 or Val Decline < 20, flag warning: 'Insufficient samples for reliable GDDA. Consider extending data period.'"
3. Validate: Train & Val 日時 ranges have **zero overlap** in rolling averages (not just judgment dates)

**Recommendation**:
- Add E13 edge case
- Modify dump-data.ts to report: "Train length=X, Val length=Y, Estimated Growth/Decline samples"
- Before Step 1, measure N from dump, compute T_min, adjust split if needed

---

### [R3][BOOMER-R] — Cautious Decay Majority-Vote Threshold: 2/3 Unvalidated

**Category**: Algorithm Correctness (Documented Limitation, Unclear Verification Path)

**Premise**:
- §4.7 Step A: "confirmCount >= 2" (2 out of 3 signals) triggers normal score drop
- "다수결 원칙 (Majority Vote): 3개 독립 binary 신호 중 과반(2개+)이 하락을 확인"
- Note: "이 임계값(2)은 Step 1 최적화 후 cautious_floor_ratio와 함께 **후속 검증 대상**"

**Risk Exposure**:
1. **Threshold is hardcoded logic, not optimized**:
   - Majority vote (2/3) is coded directly in score-smoothing.ts Step A
   - cautious_floor_ratio (0.90) is in search space (§4.5), but threshold is not
   - If optimal threshold is 1/3 or 3/3, Stage Flip Rate improvement won't materialize

2. **Independence assumption unvalidated**:
   - 3 signals: interest_slope, newsThisWeek vs newsLastWeek, dvi
   - No correlation analysis: Are they truly independent?
   - If interest_slope + dvi are correlated (both market-driven), majority vote is biased

3. **"후속 검증 대상" → Production Deployment Risk**:
   - §9.1 Step 2 says: "Cautious Decay 코드 반영 → 테스트 통과 확인"
   - No explicit hold gate: "Do not merge Step 2 until validation shows Stage Flip Rate improvement"
   - PRD implies deploy first, verify later

**Evidence**:
- No ablation study: "If threshold = 1, 2, 3, how does Stage Flip Rate change?"
- Signals not justified: Why these 3? Missing: Recent volatility trend, relative volume change
- Test fixture (§8.3) mentions "신호 0/1/2/3개 확인 시 각각 올바른 분기" but doesn't validate 2/3 optimality

**Impact**:
- Stage Flip Rate may decrease <20% (Goal G2), calling optimization success into question
- Cautious floor locked at 0.90 during Stage 1 optimization may be suboptimal if threshold is wrong
- Rollback (§9.3) requires git revert; deploying untested threshold in production

**Mitigation**:
1. Add optional search space to §4.5: `cautious_decay_confirm_threshold: [1, 2, 3]` (ordinal search in Optuna)
   - Or: Hardcode 2/3 but add **mandatory post-Step-1 A/B test** before Step 2 merge
2. Add §5 edge case E14: "Validate signal independence via Pearson correlation in fixture. Reject if |corr| > 0.5"
3. Modify §9.1: "Step 1 → Step 2 gate: Measure Stage Flip Rate reduction. If <15% improvement, reconsider majority-vote threshold"

**Recommendation**:
- Either: (a) Add confirm_threshold to search space, or (b) Add mandatory validation gate before Step 2 code merge
- Include signal correlation analysis in testing strategy (§8.3)
- Explicit acceptance: "Stage Flip Rate must improve ≥ 15% post-Step-2, else revert"

---

### [O1][BOOMER-O] — Missing: Feature Flag Deployment Mechanism Detail

**Category**: Operational Omission

**Premise**:
- §9.2 Feature Flag: "환경변수 `TLI_PARAMS_VERSION=v1|v2`로 기본값(v1)과 최적화값(v2) 전환 가능"
- Claims: "이상 발견 시 env var 변경만으로 즉시 v1 복귀 (재배포 불필요)"

**Risk Exposure**:
- Vercel (hosting platform) requires redeployment for env var changes in serverless functions
- Or: Env vars are baked at build time → actual feature flag is config file, not env var
- Ambiguity: Does TLI scoring run at build time (next build) or runtime (API route)?

**Impact**:
- False promise: "재배포 불필요" may mislead Isaac into thinking production rollback is instant
- If rollback requires rebuild, incident response time is 5+ minutes (not immediate)

**Mitigation**:
1. Clarify: "TLI scoring location" (build-time in DataLab batch? runtime in API? daily CRON?)
2. If runtime: Confirm Vercel env var injection method (doesn't require redeployment)
3. If build-time: Update §9.2 to say "Env var change → `vercel deploy --prod` required (5-10min)"

**Recommendation**:
- Add subsection §9.2.1: "Feature Flag Runtime Mechanism"
  - Specify which server/function reads TLI_PARAMS_VERSION
  - Confirm reload method (hot-reload vs redeployment)
- If unsure, default to "assume redeployment required"

---

### [O2][BOOMER-O] — Missing: Parameter Sensitivity Analysis (No Tie-breaking Rule)

**Category**: Design Completeness (Unclear Priority)

**Premise**:
- Bayesian Optimization with Optuna will find a local maximum GDDA
- No explicit rule for **tied or near-tied GDDA values** (e.g., GDDA 67.2% vs 67.1%)
- No guidance on parameter "simplicity" as tiebreaker (e.g., prefer params closer to current values?)

**Risk Exposure**:
- If Stage 1 top-10 trials have GDDA within 1%p, which parameters are "fixed"?
- Non-deterministic tiebreaker could yield different results across optimization runs
- Makes reproducibility and verification harder for Isaac

**Evidence**:
- §4.5 "상위 10% trial의 median" but doesn't specify GDDA ranking method
- No guidance in evaluate.ts pseudocode on handling ties
- No test fixture with tied scores

**Impact**:
- Reproducibility unclear (optimize.py run #2 might select different top-10)
- Validation becomes subjective (which trial counts as "optimal"?)

**Mitigation**:
1. Add explicit tiebreaker in §4.5: "If GDDA ties (within 0.5%p), prefer parameter set with **minimum L2 distance from current config**"
2. Modify optimize.py: Add secondary objective `sum((param - param_current)^2)` with very low weight (e.g., 0.01)
3. Log top-10 trials with GDDA + distance, show selection rationale in stdout

**Recommendation**:
- Add tiebreaker rule to §4.5
- Update Optuna sampler config in optimize.py to include secondary objective
- Output: `optimize.py` prints "Trial #N selected (GDDA=X, distance=Y)"

---

### [O3][BOOMER-O] — Missing: computeAlpha Edge Case (firstSpikeDate Accuracy Dependency)

**Category**: Data Quality Assumption

**Premise**:
- §4.8 EMA Scheduling: "daysSinceSpike = daysBetween(firstSpikeDate, today)"
- firstSpikeDate is expected to be reliable (theme's first spike date in lifecycle)
- No validation of firstSpikeDate accuracy or source

**Risk Exposure**:
1. **firstSpikeDate derivation unknown**: Where does firstSpikeDate come from?
   - Theme creation date? First score > threshold?
   - If derived from score data, and scores are smoothed, firstSpikeDate is post-hoc computed (potential error)

2. **Retroactive firstSpikeDate assignment**: If theme data predates scoring code:
   - Old themes might have firstSpikeDate=null (correct) or firstSpikeDate=arbitrary past (wrong)
   - EMA alpha would then be permanently 0.3 for "old" themes, even if they recently re-spiked

3. **Cliff at 30 days**: 
   - alpha = 0.3 for daysSinceSpike >= 30
   - If theme hits spike on Day 31, alpha drops from 0.58 → 0.3 instantly (not smooth)

**Evidence**:
- No mention in File Map where firstSpikeDate is stored/computed
- No edge case for null vs invalid firstSpikeDate handling (other than default=0.4)
- Test spec (§8.3) mentions "daysSinceSpike = 0, 15, 30, 60" but no null handling test

**Impact**:
- Old themes may over-stabilize (alpha=0.3) when they should be responsive
- Re-awakening themes get locked into smoothing mode for 30 days post-spike

**Mitigation**:
1. Clarify in File Map: "firstSpikeDate source" (e.g., "lifecycle_scores.first_growth_date" column)
2. Add validation: "If firstSpikeDate > today, treat as null (set to current date, emit warning)"
3. Consider soft clamp: "alpha linearly interpolates to 0.3 by day 60, not day 30" (gradual stabilization)
4. Add E15 edge case: "firstSpikeDate in future → treat as null, alpha=0.4, log warning"

**Recommendation**:
- Add field definition to File Map or constants
- Include null/invalid validation in score-smoothing.ts + test
- Consider extending clamp from 30 to 60 days for smoother EMA decay

---

## Summary Table: v0.1 → v0.2 Improvements

| Issue | v0.1 Status | v0.2 Fix | Residual Risk |
|-------|-----------|---------|--------------|
| Dimension curse (33 params) | Not addressed | 2-stage hierarchical search | No (search strategy clear) |
| Overfitting detection | No baseline | Walk-forward split + gap | **R2**: 7-day gap timing ambiguous, 14-day min unvalidated |
| GDDA metric dependency | Normalized (circular) | raw_value (independent) | **R1**: Batch normalization stability unaddressed |
| Cautious Decay threshold | Not documented | Hardcoded 2/3 majority | **R3**: 2/3 unvalidated, deployed before verification |
| Feature flag mechanism | N/A | Env var (claimed instant) | **O1**: Vercel deployment mechanics unclear |
| Parameter tiebreaker | N/A | Not specified | **O2**: Reproducibility risk if tied GDDA |
| EMA scheduling | N/A | firstSpikeDate-based | **O3**: firstSpikeDate source & null handling unspecified |

---

## Verdict by Dimension

| Dimension | Score | Confidence | Recommendation |
|-----------|-------|-----------|-----------------|
| **O (Omissions)**: 3 issues | 60% | High | Add O1/O2/O3 subsections before coding |
| **R (Risks)**: 3 issues | 55% | High | R1 requires validation fixture; R2 needs power calc; R3 needs test gate |
| **Overall Coherence** | 75% | High | PRD improved; ready to code with mitigation patches |

---

## FINAL JUDGMENT

**PROCEED_WITH_CAUTION**

- ✅ **Go ahead with Step 0 (dump-data.ts + baseline)** — data pipeline is solid
- ✅ **Go ahead with Stage 1 & 2 optimization** — search strategy sound
- ⚠️ **HOLD on Step 2 (Cautious Decay) merge** until:
  1. Signal independence (E14) validated
  2. Post-Step-1 Stage Flip Rate gate established (≥15% improvement required)
  3. R2 mitigation (statistical power check) added to dump-data.ts
- ⚠️ **Mandatory checkpoint before production deploy**:
  1. Raw_value batch consistency (E12) verified
  2. Feature flag mechanism (O1) clarified
  3. firstSpikeDate validation (O3) implemented

**Isaac Action Items**:
1. Accept PRD as-is for Step 0/1 execution
2. Request engineer add R1/R2/R3 edge cases + O1/O2/O3 clarifications before Step 2/3 merge
3. Establish **validation hold gate** for Step 2: Stage Flip Rate must improve ≥15% post-Step-1

---

## Improvements vs v0.1

1. ✅ Walk-forward split concrete specification (§4.9)
2. ✅ GDDA raw_value foundation explicit (§4.6 pseudocode)
3. ✅ Cautious Decay majority-vote documented as "후속 검증 대상" (conservative)
4. ✅ Edge cases E1-E11 comprehensive

v0.2 demonstrates **maturation**; residual risks are now *documented limitations* rather than *hidden assumptions*.
