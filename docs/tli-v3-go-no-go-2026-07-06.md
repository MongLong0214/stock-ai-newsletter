# TLI v3 Phase 2 Go/No-Go Decision

Status: Go (rev 2), Isaac approved 2026-07-07
Date: 2026-07-06 (rev 2: 2026-07-07)

## Decision

Go — offline 평가 게이트(T-205/T-206) 통과. M1을 challenger로 등록하고 prospective shadow 사이클(T-306)에 진입한다.

주의: 이 Go는 "shadow 진입 승인"이다. 프로덕션 확률 노출/champion 승격은 여전히 4주 prospective shadow + promotion gate(비중복 n_eff≥250, Brier 99% CI, ECE, P@10 guardrail)를 통과해야 한다.

### rev 1 (2026-07-06, No-Go) 판정 사유와 해소

rev 1은 M1 walk-forward 3개 fold 전부 학습 실패(coverage 0.0000)로 No-Go였다. 근본 원인은 build-features가 non-abstain 행에 null feature를 방출해 학습 입력이 pydantic 검증에서 전량 거부된 것(N1). N1 수정(유한값 imputation + finite guard + 회귀 테스트) 후 재평가에서 M1 학습 실패 0건으로 해소됐다.

## Evidence (rev 2)

Primary report:
- JSON: `docs/evidence/tli-v3-t205-offline-eval.json`
- Markdown: `docs/evidence/tli-v3-t205-offline-eval.md`

Evaluation window:
- 2026-01-07 to 2026-07-07 (전체 백필 윈도우, walk-forward 3 folds)
- fold test 구간: 03-23~04-21 / 04-22~05-26 / 05-27~06-29 (train은 항상 test보다 엄격히 과거)
- Final GT-A labels: 15,307 / Excluded: 14,938 (0.4773) / Censored: 0 / Pending: 1,052
- M1 training failures: 0

Model results (scored, raw n=8,941 / weekly non-overlap n=1,751):

| Model | raw n | weekly n | Brier | ECE | IC | Rising-P@10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| B-abl | 8,941 | 1,751 | 0.2448 | 0.2437 | -0.0571 | 0.2092 |
| M0 | 8,941 | 1,751 | 0.3960 | 0.4453 | -0.0362 | 0.2348 |
| M1 | 8,941 | 1,751 | 0.1775 | 0.0196 | 0.2173 | 0.4894 |

Brier delta CI (cluster bootstrap, 99%, 게이트 기준은 weekly non-overlap subset):

| Delta | mean | lower | upper | clusters | obs |
| --- | ---: | ---: | ---: | ---: | ---: |
| M1 vs B-abl (weekly) | -0.0547 | -0.0741 | -0.0353 | 164 | 1,289 |
| M1 vs M0 (weekly) | -0.2282 | -0.2540 | -0.2014 | 169 | 1,751 |
| M1 vs B-abl (overlapping raw, 참고용) | -0.0679 | -0.0837 | -0.0514 | 169 | 7,083 |
| M1 vs M0 (overlapping raw, 참고용) | -0.2185 | -0.2383 | -0.1969 | 170 | 8,941 |

### Go 조건 대조 (T-206)

| 조건 | 기준 | 실측 | 판정 |
| --- | --- | --- | --- |
| M1 > B-abl | 99% CI upper ≤ 0 | upper = -0.0353 | PASS |
| M1 > M0 | 99% CI upper ≤ 0 | upper = -0.2014 | PASS |
| 상대 개선 | ≥ 2% | 22.3% (0.0547/0.2448) | PASS |
| ECE | ≤ 0.08 | 0.0196 | PASS |
| Rising-P@10 guardrail | 하락 ≤ 5pp | +28.0pp (0.4894 vs 0.2092) | PASS |
| 표본 | 비중복 n ≥ 250 | 1,751 | PASS |

### 정직한 해석 (과대 해석 금지)

- M1의 Brier 개선분 상당 부분은 "보정(calibration)"에서 온다. B-abl은 GT-A 기준으로 심하게 미보정(ECE 0.24)이고 IC가 음수(-0.057)여서 현행 휴리스틱은 GT-A를 오히려 역방향으로 예측한다.
- M1의 랭킹 실력은 실재한다: IC 0.217, Rising-P@10 0.489 (B-abl 대비 2.3배). 이것이 제품 가치의 핵심 신호.
- 단, base rate 대비 Brier의 절대 우위는 크지 않다 — climatology(항상 base rate 예측) 대비 우위는 소폭. 확률 자체의 정보량보다 랭킹+보정이 강점이라는 뜻이며, 이는 offline 결과다. prospective shadow에서 재현되는지가 최종 관문(반사성 리스크 R9 포함).

## Required Follow-Up

1. M1을 model_registry에 challenger로 등록 (register_model_registry_challenger RPC, weekly-learn 경로).
2. T-306 prospective shadow 사이클 개시 — 최소 2주 관측 후 중간 점검, 4주 누적 비중복 n_eff≥250으로 promotion gate 평가.
3. T-401~T-404는 T-306 완료 전까지 계속 blocked.
4. rev 1의 feature-readiness backlog는 N1 수정으로 해소 — closed.

## Approval

Isaac approval: approved (2026-07-07).
