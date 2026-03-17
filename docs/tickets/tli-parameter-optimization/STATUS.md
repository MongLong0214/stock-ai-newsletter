# Pipeline Status: TLI Parameter Optimization

**PRD**: docs/prd/PRD-tli-parameter-optimization.md
**Size**: L
**Current Phase**: 6 (Final Review)

## Ticket Status

| Ticket | Title | Size | Status | Review | Depends | Notes |
|--------|-------|------|--------|--------|---------|-------|
| T1 | Prerequisites & Environment Setup | S | Done | PASS | None | .gitignore, Python env |
| T2 | Parameter Types & Config Extension | M | Done | PASS | T1 | TLIParams interface, env var |
| T3 | Parameterize Calculator/Stage/Sentiment | M | Done | PASS | T2 | Optional config args |
| T4 | Historical Data Dump Script | M | Done | PASS | T1 | Supabase → JSON |
| T5 | GDDA Evaluator (evaluate.ts) | L | Done | PASS | T3, T4 | Sequential State Machine |
| T6 | Python Optuna Optimizer | L | Done | PASS | T5 | 2-stage hierarchical |
| T7 | Cautious Score Decay | M | Done | PASS | T2 | Step A→B→C pipeline |
| T8 | EMA Momentum Scheduling | S | Done | PASS | T7 | computeAlpha, linear interp |

## Dependency Graph

```
T1 ──→ T2 ──→ T3 ──┐
  │                  ├──→ T5 ──→ T6
  └──→ T4 ──────────┘
       T2 ──→ T7 ──→ T8
```

## Execution Order

**Phase A (병렬 가능)**: T1
**Phase B (T1 후 병렬)**: T2, T4
**Phase C (T2 후)**: T3, T7
**Phase D (T3+T4 후)**: T5
**Phase E (T5 후)**: T6
**Phase F (T7 후)**: T8

## Review History

| Phase | Round | Verdict | P0 | P1 | P2 | Notes |
|-------|-------|---------|----|----|-----|-------|
| 2 | 1 | HAS ISSUE | 0 | 7 | 6 | v0.1 → v0.2 수정 |
| 2 | 2 | ALL PASS | 0 | 0 | 2 | v0.2.1 반영 후 승인 |
| 4 | 1 | HAS ISSUE | 2 | 5 | 3 | P0: T4 SELECT test, T5 E1 test. P1: T2 타입위치+v2테스트, T3 thresholds, T6 timeout, T7 naming+dvi |
| 4 | 1→fix | APPLIED | 0 | 0 | 0 | 10건 수정 반영 |
| 6 | - | Pending | - | - | - | |
