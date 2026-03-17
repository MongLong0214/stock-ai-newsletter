# BOOMER-6 Ticket Review — TLI Parameter Optimization

**Date**: 2026-03-17  
**Reviewer**: boomer (BOOMER-CODEX REVIEW mode)  
**Scope**: 8 tickets (T1–T8) for TLI parameter optimization sprint  
**Verdict**: PROCEED_WITH_CAUTION (5 tickets require modifications; T1 requires rescope; T8 approved as-is)

---

## Executive Summary

This ticket batch presents a **well-intentioned research pipeline** (TLI params → data dump → evaluator → optimizer) but suffers from **premature abstraction, scope bloat, and testing gaps**. The core logic is sound, but the implementation plan creates unnecessary friction:

- **T1 is organizational overhead** — merge into T2 (2-min decision)
- **T2's env-var branching is YAGNI** — delete fallback logic (future-proofs for multi-version that doesn't exist)
- **T3's 3-file change is regression risk** — split for bisect safety OR accept with detailed checklist
- **T4 lacks schema validation** — add Zod parsing, fail fast
- **T5's state machine is undertested** — expand to 15+ cases with explicit state assertions
- **T6 is Python-in-TypeScript friction** — acceptable IF documented as research-only script
- **T7 + T8 need coordinated signature change** — batch in single PR

**Recommendation**: Option A (safer replan) with 6 escalation decisions for Isaac.

---

## Detailed Findings

### O1 — Omissions & Gaps

#### [P0] T1: Overstuffed prerequisite
**Issue**  
T1 is billed as P1 "prerequisite" with 1 test case and 2h estimate. But:
- AC-1 (gitignore pattern check) is a 10-line test
- AC-2-3 (.gitignore + requirements.txt) are declarative file creation, not blocker logic
- AC-4 (Python 3.10+ check) is just a README guide, no actual validation

**Why it matters**  
T1 adds ceremony without substance. It's a 1-commit prerequisite that could be "Step 0" of T2 in 15 minutes.

**Recommendation**  
**Delete T1. Fold into T2:**
- T2 now starts: "Step 0: Create scripts/tli-optimizer/ directory + add .gitignore pattern"
- Keep AC-1 (test for .gitignore) in T2
- Reduces ticket count 8→7, removes zero-value overhead

---

#### [P1] T2: Schema validation gap (+ premature versioning)
**Issue**  
T2 defines TLIParams interface but doesn't validate it against actual usage:
- No Zod schema to parse/validate T2's DEFAULT_PARAMS  
- No test that DEFAULT_PARAMS passes T5's Optuna constraints (monotonic stages, w_activity bounds)
- Test 5 ("stage thresholds are monotonically increasing") only checks defaults, not general case

**Second issue**: TLI_PARAMS_VERSION=v2 env-var branching (AC-4 + EC-1-2)
- **Problem**: T6 produces optimized-params.json *after* validation. T2 fallback for v2 is YAGNI (You Aren't Gonna Need It).
- T2 should define getTLIParams() for current params, not multi-version routing
- This is "future-proofing" for rollback support that doesn't exist in PRD

**Recommendation**  
**Remove AC-4 + EC-1/2 from T2.** Keep only:
- AC-1-3: TLIParams interface, DEFAULT_PARAMS, getTLIParams() with no env branching
- AC-5: Defaults match current hardcoded values
- **Add new AC-6**: DEFAULT_PARAMS parses under Zod schema matching T5 constraints (monotonic, bounds-checked)
- **Plan separate T2b ticket** (after T6) if multi-version support is actually needed

---

#### [P1] T4: No output schema validation
**Issue**  
T4 spec says Test 3: "output JSON has correct schema" but:
- No Zod schema defined for historical-data.json
- Mock-only testing; no actual type-guard
- EC-2 allows sparse data (newsMetrics: [] missing) — **how does T5 handle missing arrays?**

**Risk**  
T4 dumps JSON, T5 consumes it. Format mismatch discovered at T5 time = wasteful rework.

**Recommendation**  
**Add to T4 AC:**
- [ ] **AC-6**: Output historical-data.json structure validated via Zod schema (matches T5 HistoricalData type)
- [ ] **AC-7**: Test 3 refactored to parse output JSON via schema before asserting structure

---

#### [P0] T5: State machine undertested
**Issue**  
T5 is a **P0 Blocker** (L size: 4-8h) with only **10 test cases** for a sequential state machine. Critical gaps:

1. **State transition tests missing**  
   - Test 5 says "prevSmoothed continues across days" but doesn't verify day-to-day state mutation
   - No test for: state after day 1 → state after day 2 → state after day 3 (explicit before/after)

2. **Null-safety untested**  
   - calculateLifecycleScore can return null (EC-3 acknowledges this)
   - But no test: "what if score null on day 5? Does state persist?"
   - This is a **silent bug** path (state stuck, no error raised)

3. **Integration/unit blurred**  
   - Test 6 (train/val split) requires:
     - T4's historical-data.json loaded correctly
     - calculate-scores.ts functions available (not mocked)
     - Split logic working
   - This is **integration**, not unit. Should be separate.

4. **Mock setup incomplete**  
   - Spec: "기존 함수 실제 사용 (mock 없음)" — using real functions
   - But state machine is **isolable** (per-theme state doesn't cross themes)
   - Integration test should use real historical-data.json fixture, unit test should use hand-crafted state

**Recommendation**  
**Expand T5 tests to 15-20 cases:**

| # | Category | Test Name | What |
|---|----------|-----------|------|
| 1-4 | Unit | Growth/Decline/penalty cases | ✓ (exists) |
| 5 | **New** | State persistence day-to-day | state[day1], state[day2], state[day3] assertions |
| 6 | **New** | Null score handling | Day 5 score=null → state unchanged |
| 7 | Unit | train/val split boundary | state from day 1, eval from day T+1 |
| 8 | **New** | Flip rate calculation | 5 flips in 20 days → flipRate=0.25 |
| 9 | **New** | Stability penalty formula | flipRate=0.35 → penalty=0.8 |
| 10 | **New** | Graduated penalty (low decline count) | 3 decline samples → samplePenalty=0.6 |
| 11 | Integration | Full pipeline T4→T5 | real fixture JSON → GDDA |
| 12+ | Edge cases | Empty themes, all neutral, NaN params | error handling |

---

### O2 — Over-engineering

#### [P1] T2: Version branching is YAGNI
**Issue**  
AC-4 proposes TLI_PARAMS_VERSION env var:
- v1 → defaults (current hardcoding)
- v2 → optimized-params.json

**Why it's over-engineered**:
1. No PRD requirement for multi-version
2. T6 produces v2 once. Deploy v2. Done. No rollback scenario described.
3. Extra test (AC-6), extra edge case (EC-1: "v2 missing"), extra cognitive load during review
4. If rollback needed, strategist can manually revert commits (git revert)

**Recommendation**  
**Delete AC-4 + EC-1/2 from T2.** Simpler path: getTLIParams() returns current/optimized params, no env branching.

---

#### [P1] T3: 3-file change in one ticket
**Issue**  
T3 modifies three files (calculator.ts, stage.ts, sentiment-proxy.ts) in parallel:
- calculator.ts: 185 lines, 14 parameters extracted
- stage.ts: 122 lines, 7 parameters extracted
- sentiment-proxy.ts: unknown size, 4 parameters extracted

**Why it's over-engineering**:
- 33 existing test files depend on these three modules
- Single commit = can't bisect which file caused failure
- If calculator.ts change breaks a test, is it calculator, stage, or sentiment?
- Tight 2-4h window for 3 files + 33 regression tests

**Maintainability risk**:  
Code reviewer sees 300+ lines changed, 33 tests run, 1 failure. Which file? Revert all 3? Or debug 3-file interaction?

**Recommendation**  
**Split T3 into three sequential PRs:**
- **T3a**: Parameterize calculator.ts (AC-1 for calculateLifecycleScore) + run test suite → PR
- **T3b**: Parameterize stage.ts (AC-2 for determineStage) + regression test
- **T3c**: Parameterize sentiment-proxy.ts (AC-3) + regression test

**Alternative** (faster but riskier):  
Keep T3 as 3-file batch, **but add detailed regression checklist**:
```
[ ] Run: npm run test:lib -- calculator.test.ts (all pass)
[ ] Run: npm run test:lib -- stage.test.ts (all pass)
[ ] Run: npm run test:lib -- sentiment-proxy.test.ts (all pass)
[ ] Run: npm run test:lib -- tli/ (full suite, all 33 pass)
[ ] Bisect test: revert calculator.ts, run tests → pass
[ ] Bisect test: revert stage.ts, run tests → pass
[ ] Bisect test: revert sentiment-proxy.ts, run tests → pass
```
More work upfront, but catches issues immediately.

---

#### [P2] T6: Python in a TypeScript project
**Issue**  
T6 adds Python + Optuna subprocess automation to a 100% TypeScript codebase:
- optimize.py calls subprocess to run evaluate.ts
- No CI/CD integration specified (who runs this? manually? GitHub Action?)
- Brittle subprocess.run with 30s timeout — what if evaluate.ts OOM?
- Python devs unfamiliar with Optuna API will struggle to maintain

**Is it over-engineered?**  
Not inherently — Optuna is the right tool for Bayesian optimization. But:
1. **Unknown operator**: Who runs optimize.py? When? How often?
2. **No persistence**: Does Optuna study persist? Can you resume after interruption?
3. **No recovery**: If trial 50/200 times out, do all 200 fail?
4. **Type safety**: No type hints on param_space.py (Python 3.10+ should have strict typing)

**Recommendation**  
**T6 is acceptable IF it's a one-time research script.** But add ACs:
- [ ] **AC-7**: `param_space.py` includes type hints for all functions (Python 3.10+ conventions)
- [ ] **AC-8**: README documents:
  - When/how to run (one-time? scheduled? manual trigger?)
  - What success looks like (GDDA ≥ 0.65?)
  - How to resume after timeout (Optuna .optuna/ persistence)
  - Estimated runtime (80 trials × 30s each = ~40 min, + overhead)

---

#### [P2] T7 + T8: Signature creep
**Issue**  
applyEMASmoothing gains params across two tickets:
- **T7**: adds `components?: ScoreComponents` (for Cautious Decay signal extraction)
- **T8**: adds `firstSpikeDate?, today?: string` (for scheduling)

Every call site in calculate-scores.ts updated twice = merge conflict pain.

**Recommendation**  
**Batch T7 + T8 in a single PR.** Define full signature once:
```ts
function applyEMASmoothing(
  score: number,
  prevSmoothed: number | null,
  recentSmoothed: number[],
  components?: ScoreComponents,
  firstSpikeDate?: string | null,
  today?: string
): number
```
Implement both features in one pass.

---

### M — Maintainability Issues

#### [P1] T5: Fixture complexity
**Issue**  
T5 requires hand-crafted test fixtures:
- Test 5 (state continuity): 3 themes × 30 days of fake data
- Test 6 (train/val split): train/val boundary fixture
- Likely copy-paste across test cases = brittle, hard to refactor

**When T7 adds new signals** (interest_slope, newsThisWeek, dvi):
- All 10 fixtures need signal values added
- Maintenance burden explodes

**Recommendation**  
Create `fixtures/gdda-test-data.ts` with factory functions:
```ts
export function createHistoricalTheme(
  id: string,
  firstSpikeDate: string,
  metricsPerDay: MetricsInput[]
): HistoricalTheme

export function createTestData(
  themeCount: number,
  startDate: string,
  endDate: string,
  split?: { trainDays: number, valDays: number }
): HistoricalData
```
Factories generate data instead of hardcoding. When T7 adds signals, update one place.

---

#### [P2] T6: Python maintenance burden
**Issue**  
T6 adds long-term maintenance debt:
- optimize.py is unfamiliar to TypeScript team
- param_space.py defines constraints (monotonic thresholds, weight bounds)
- If Optuna API changes or PRD adds new constraint, who fixes it?
- No type hints → easy to break

**Recommendation**  
Add type hints to param_space.py:
```python
def create_stage_1_study(
    base_optuna_version: str = "3.0"
) -> optuna.Study:
    ...

def objective_stage_1(trial: optuna.Trial) -> float:
    ...
```

---

## Verdict by Ticket

| # | Verdict | Issue | Action |
|---|---------|-------|--------|
| T1 | ❌ RECONSIDER | Overstuffed prerequisite | Delete; fold into T2 Step 0 |
| T2 | ⚠️ PROCEED_WITH_CAUTION | YAGNI env-var branching + schema gap | Remove AC-4/EC-1-2; add Zod validation AC |
| T3 | ⚠️ PROCEED_WITH_CAUTION | 3-file change, regression risk | Split into T3a/b/c OR accept with detailed checklist |
| T4 | ⚠️ PROCEED_WITH_CAUTION | No schema validation | Add Zod parsing + schema AC |
| T5 | ⚠️ PROCEED_WITH_CAUTION | Undertested state machine | Expand tests 10→15+; separate unit/integration |
| T6 | ⚠️ PROCEED_WITH_CAUTION | Python/subprocess friction, unclear operator | Add type hints, README, persistence AC |
| T7 | ⚠️ PROCEED_WITH_CAUTION | Signature overlap with T8 | Batch T7+T8 in single PR |
| T8 | ✅ PROCEED | Well-scoped, clear tests | Ready; depends on T7 landing first |

---

## Cross-Ticket Risk Map

```
T1 → T2 → T3 → T4 → T5 → T6  (linear chain)
           ↓
       33 tests

T7 + T8 (coupled signature)
```

**Risk zones**:

1. **T1 → T2**: T1 deletion simplifies; T2 schema validation (new) must pass before T3 uses params
2. **T3 deep**: 33 tests depend; single flaky test kills entire batch
3. **T4 → T5**: Format mismatch (T4 JSON → T5 parse) discovered late
4. **T5 critical path**: State machine bugs are silent (null handling, boundary conditions)
5. **T6 isolation**: Python subprocess can hang; 30s timeout unclear if hard or soft limit
6. **T7 + T8 deadlock**: T8 needs T7 signature; can't land separately

**Mitigation**:
- Lock T2 validation (AC-6) before merging T3
- T4 must pass Zod test before T5 runs
- T5 integration test uses real T4 output
- T7 + T8 reviewed as single unit

---

## Recommended Replans

### Option A: Serial (Safer, +2-3 days)

```
Delete T1
T2* (no env-var branching; add Zod validation AC)
  → T3a (calculator)
    → T3b (stage)
      → T3c (sentiment)
T4 (add Zod validation AC)
T5 (expand tests to 15+; separate unit/integration)
T6 (add type hints, README, persistence AC)
T7 + T8 joint PR (single signature change)
```

**Pros**: Clear dependencies, safe regression testing, easy bisect  
**Cons**: +2-3 days vs original plan

---

### Option B: Aggressive (Fast, higher risk)

```
Delete T1
T2* (no env-var branching; add Zod validation AC)
T3 (3-file batch with detailed regression checklist)
  parallel: T4 (add Zod validation AC)
T5 (expand tests; separate unit/integration)
T6 (add type hints, README)
T7 + T8 joint PR
```

**Pros**: Faster if all checks pass  
**Cons**: If T3 fails, revert all 3 files; 33-test regression risk

---

## Escalation Questions for Isaac

1. **T1 scope**: Delete and fold into T2? (saves 1 ticket, 2h)

2. **T2 versioning**: Multi-version support in PRD? Or just deploy v2?

3. **T3 parallelism**: Split 3 files into separate PRs, or batch with regression checklist?

4. **T4 schema**: Add Zod validation before T5 tries to consume?

5. **T5 tests**: Expand to 15+ cases (add state transition + null-safety tests)?

6. **T6 ownership**: Who maintains optimize.py long-term? TS team or external?

7. **T7+T8 timing**: Can they land as single PR, or must T7 ship first?

---

## Summary Table

| Ticket | Size | Risk | Omissions | Over-eng | Maintain | Verdict |
|--------|------|------|-----------|----------|----------|---------|
| T1 | S | Low | — | **HIGH** | Good | **RECONSIDER** |
| T2 | M | Med | Schema | **YAGNI** | Good | **CAUTION** |
| T3 | M | High | Null? | 3-file | **BAD** | **CAUTION** |
| T4 | M | High | Schema | — | Good | **CAUTION** |
| T5 | L | **HIGH** | State gaps | — | **BAD** | **CAUTION** |
| T6 | L | **HIGH** | Persist? | Python | **BAD** | **CAUTION** |
| T7 | M | Med | — | — | Bad | **CAUTION** |
| T8 | S | Low | — | — | Good | **PROCEED** |

---

## Next Steps

1. **Isaac decision** (15 min): Approve Option A/B, answer escalation Qs
2. **Replan** (30 min): Update ticket descriptions per approved option
3. **Execute**: T2 first (test harness), then parallel T3a+T4, then T5, then T6, then T7+T8

---

**Reviewer**: BOOMER-CODEX REVIEW mode  
**Confidence**: HIGH (code structure reviewed, 3-pass analysis)  
**Recommendation**: **PROCEED_WITH_CAUTION** — Execute Option A for safety, or Option B with detailed Isaac review.
