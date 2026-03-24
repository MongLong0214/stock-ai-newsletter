# Pipeline Status: Crash Prediction Enterprise

**PRD**: docs/prd/PRD-crash-prediction-enterprise.md
**Size**: L
**Current Phase**: 7 (완료)

## Tickets

| Ticket | Title | Size | Status | Review | Depends | Notes |
|--------|-------|------|--------|--------|---------|-------|
| T1 | VIX 레짐 감지 | S | Done | PASS | None | 9 tests |
| T2 | 방향 정합성 매트릭스 | M | Done | PASS | None | 13 tests |
| T3 | 가중 시그널 스코어링 | M | Done | PASS | T1, T2 | 12 tests. korea_specific KOSPI 0.8→1.2 튜닝 |
| T4 | 동적 Confidence + Resolve | M | Done | PASS | T3 | 7+3 tests. resolve 전면 교체 |
| T5 | 프롬프트 통합 | S | Done | PASS | T4 | 스코어링 컨텍스트 섹션 추가 |
| T6 | 역사적 백테스트 31개 | L | Done | PASS | T1-T4 | 31/31 시나리오 통과, 정확도 100% |

## Dependency Graph
```
T1 (VIX Regime) ──┐
                   ├──→ T3 (Scoring) ──→ T4 (Confidence) ──┬──→ T5 (Prompt)
T2 (Coherence) ───┘                                        └──→ T6 (Backtest)
```

## Build Verification
- tsc --noEmit: PASS
- next build: PASS
- vitest: 76/76 PASS

## Review History

| Phase | Round | Verdict | P0 | P1 | P2 | Notes |
|-------|-------|---------|----|----|-----|-------|
| 2 | 1 | HAS ISSUE | 0 | 4 | 3 | crashScore공식, 임계값, coherence 로직 |
| 2 | 2 | HAS ISSUE | 0 | 3 | 6 | regimeMultiplier, coherent_normal, clamp |
| 2 | 3 | PRD v0.3 Approved | 0 | 0 | 0 | 전수 수정 |
| 4 | 1 | HAS ISSUE | 0 | 3 | 3 | AC-4 책임, T5 fallback, T6 의존성 |
| 4 | 2 | 수정 완료 | 0 | 0 | 0 | 전수 수정 |
| Final | 1 | ALL PASS (3/3) | 0 | 0 | 0 | strategist+guardian+boomer 만장일치 |
