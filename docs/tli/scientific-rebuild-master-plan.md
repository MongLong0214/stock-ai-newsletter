# TLI v3 과학적 재구축 단일 실행 문서

## TL;DR (For humans)

**What you'll get:** 과거 테마 데이터로 향후 5거래일의 관심도 상승 확률을 재현 가능하게 학습·검증하고, 검증 전에는 절대 공개·승격되지 않는 하나의 end-to-end 시스템입니다. 이 문서만으로 현재 문제, 목표 구조, 구현 순서, 통계 기준, 테스트와 최종 판정까지 파악할 수 있습니다.

**Why this approach:** 현재 병목은 모델 복잡도가 아니라 과거 시점 데이터의 불변성, 동일한 라벨, 누수 없는 평가, 고정 전향 실험입니다. 안전한 서빙 골격은 보존하고 이 네 계약만 뿌리부터 다시 세우는 것이 목표에 가장 빠른 경로입니다.

**What it will NOT do:** 오염된 과거 성능을 복구된 것처럼 재사용하지 않습니다. 관심도 예측을 주가·초과수익 예측이나 인과효과로 포장하지 않습니다. 검증을 통과하기 전에 확률을 공개하거나 모델을 승격하지 않습니다.

**Effort:** XL
**Risk:** High - 과거 PIT 원천이 복구 불가능하므로 한 pre-outcome study에서 최소 26개 clean weekly origin을 먼저 축적하고, 그 뒤 16~52개 prospective origin과 L4용 4개 canary가 추가로 필요합니다.
**Decisions to sanity-check:** 첫 모델은 정규화 logistic, primary comparator는 학습구간 B-Abl phase 경험확률, primary metric은 paired Brier, 8주는 안전성만 보고 사전 power simulation으로 고정한 시점(최소 16주) 전에는 효능 판정을 하지 않습니다.

Your next move: 이 문서를 작업 기준으로 삼아 Todo 1부터 순서대로 실행합니다. Full execution detail follows below.

---

> TL;DR (machine): XL/high-risk scientific rebuild; immutable PIT source + gta-v2 + deterministic dataset + leakage-free inference + frozen planned-origin prospective cycle (minimum 16); GT-B remains isolated.

## Scope

### 이 문서의 권위

- 이 파일이 TLI v3 과학 재구축의 유일한 실행 source of truth다.
- `docs/prd/PRD-tli-v3-rebuild.md`와 `docs/tli-v3-early-promotion-preregistration.md`는 기존 의도와 연구 이력을 보존하는 참고 자료이며, 이 문서와 충돌하면 이 문서가 우선한다.
- `.debug-journal.md`와 `.omo/ulw-research/20260710-093810/*`는 판정 근거일 뿐 구현 명세가 아니다. 실행자는 결정을 다시 내리지 않고 아래 계약을 그대로 구현한다.

### 냉정한 현재 판정

| 대상 | 현재 판정 |
|---|---|
| 전체 증거 성숙도 | **L1.5 / 5**, 운영 가능한 초기 연구 프로토타입 |
| 핵심 과학 gate | 라벨·PIT·재현성·OOS·추론·전향증거·GT-B **0/7 통과** |
| 현재 M1 성능 수치 | 과학적 주장에 **사용 금지** |
| 현재 challenger 승격 | **NO-GO**, 성숙 outcome 0건 |
| 공개 attention probability | **NO-GO** |
| 과거 테마로 미래 관심도 예측 | **재설계 조건부 GO** |
| 가격·초과수익 예측 | **NO-GO**, 별도 GT-B 연구 필요 |

2026-07-10 실측 스냅샷은 champion `b-abl-v1`, challenger `m1-2026w28-a2`, challenger pending 421행·scored 0행, 7/10 non-abstain coverage 75.1%, probability interval 0/386이다. stable query 기준 final GT-A 15,433행 중 rescale suspect는 5,311행(34.4%), 현재 membership을 역사에 사용한 최소 누수는 2,464행(16.0%)이다. 무정렬 pagination 반복에서는 동일 31,297행 반환처럼 보이면서 6,791개 key가 중복되었다.

### 무엇을 예측하는가

시점 `t`의 한국 거래일 장 마감 후, 그때까지 플랫폼이 발견·적격 판정했고 그 시점에 실제 이용 가능했던 데이터만 사용해 다음을 예측한다.

```text
past_mean(t)   = base date를 포함한 직전 5개 한국 거래일의 동일 DataLab response 값 평균
future_mean(t) = base date 다음 정확히 5개 한국 거래일의 같은 response 값 평균
denominator_valid(t) = 1[past_mean(t) > 0]
ratio(t)       = future_mean / past_mean, denominator_valid일 때만 정의
growth(t)      = ratio(t) - 1
g_log_ratio(t) = -1.5 if future_mean=0 else clip(ln(ratio(t)), -1.5, 1.5)
y(t)           = 1[growth(t) >= 0.10] = 1[ratio(t) >= 1.10]
output         = P(y(t)=1 | information available at forecast cutoff)
```

모든 response 값은 finite/nonnegative여야 한다. `past_mean=0`만 `zero_denominator`로 제외하며 양수 denominator에 절대값 floor를 두지 않는다. 따라서 동일 10개 값에 임의의 양수 상수 `c`를 곱해도 eligibility, `ratio`, `growth`, `g_log_ratio`, `y`가 모두 같아야 한다. 정확한 5+5 날짜 미충족, source gap, keyword epoch break, rescale suspect도 confirmatory sample에서 excluded다. 작은 양수 denominator는 sensitivity stratum으로만 보고 primary sample에서 사후 제거하지 않는다. `growth`, `g_log_ratio`, `y`를 함께 보존하되 primary endpoint는 binary probability의 Brier score다. 따라서 로그값 `0.10`을 threshold로 써서 실제 10.52%를 예측하는 구현은 금지한다.

이 estimand는 신규 테마 전체의 발견율, TLI의 인과효과, 주가 상승, 초과수익, 절대 검색량을 뜻하지 않는다. Naver DataLab 값은 동일 요청 구간 안의 상대 scale로만 해석한다.

### 성숙도 도달 조건

| 단계 | 필요한 실제 증거 | 도달 판정 |
|---|---|---|
| debug journal H1/H2/H3·silent failure만 수정 | pagination·arrival·fixed-cycle·fail-closed 일부 복구 | **L1.5+**, L2 아님 |
| 전체 P0 계약 + clean immutable PIT OOS | 반복 hash 일치, leakage-free retrospective 결과 | **L2** |
| frozen candidate 최소 16개 weekly origin 통과 | 사전고정 paired prospective efficacy | **L3** |
| calibration·coverage·운영 안정성과 공개 gate 통과 | 제한 공개 가능한 attention probability | **L4 가능** |
| GT-B PIT·수정주가·비용·경제성 통과 | 거래 가능한 가치 | 별도 **L5**, 현재 범위로 주장 금지 |

파이프라인을 고치면 L2까지는 통제할 수 있다. L3/L4는 신호가 실제 존재하고 전향 gate를 통과해야만 얻는다. 유효한 검증에서 신호가 사라지면 시스템은 L2이고 모델 효능은 기각한다.

### 반드시 보존할 기존 자산

- `theme_predictions_v3` 단일 저장·채점·서빙 객체
- `model_registry` champion/challenger 원자성
- champion-only API와 `TLI_PREDICTIONS_V3_EXPOSURE_ENABLED` fail-closed 동작
- abstain, missing flags, model/label version 필드
- B-Abl phase snapshot 자체. 단, 0/1 예측확률이 아니라 기술적 상태 및 경험확률 baseline으로만 사용
- 기존 artifact와 실패 이력. 삭제하지 않고 과학적 주장 금지 상태로 보존

### 목표 아키텍처

```text
immutable collection run
  ├─ DataLab request/response, window, keyword hash, collected_at, source_max_date
  ├─ news as-of snapshot
  ├─ B-Abl phase snapshot
  └─ bitemporal theme-stock membership
                  │
                  ▼
forecast origin + pre-outcome study-origin lock
  └─ universal keyword/interest/news + fixed B-Abl contract and actual source pool
                  │
                  ▼
gta-v2 label snapshot
  └─ exact 5 past + 5 future trading dates, same response, version-pinned
                  │
                  ▼
dataset manifest
  └─ keyset pagination, as-of cutoff, canonical rows, SHA-256 content hash
                  │
                  ▼
PIT feature snapshot
  └─ calendar gaps preserved, freshness-aware, recoverable features only
                  │
                  ▼
nested temporal evaluation
  └─ fold-local preprocessing, time-blocked OOF Platt, exact outcome purge
                  │
                  ▼
frozen experiment_cycle
  └─ study/candidate/comparator/data/feature/label hashes immutable
                  │
                  ▼
preregistered trading-Monday origins, minimum 16
  └─ paired Brier + two-way dependence bootstrap + calibration/coverage gates
            ┌─────┴─────┐
            ▼           ▼
      GT-A attention   isolated GT-B economic research
```

### 고정 데이터 계약

1. **Forecast cutoff**: 모든 confirmatory forecast의 cutoff는 base date의 `18:00:00 Asia/Seoul`이다. collector가 그 뒤 끝났다면 해당 결과를 그날 forecast에 소급 사용하지 않는다. prediction `created_at`이 늦어도 feature `collected_at/computed_at <= cutoff`여야 한다.
2. **Collection run**: 요청 payload, 전체 response, query start/end, keyword-group spec/hash, source max date, expected-universe/key hash, expected/observed row count, timestamps, payload SHA-256를 append-only로 저장한다. `complete`는 expected key가 100% 관측된 경우뿐이며 run+observations를 한 transaction으로 insert한다. update/delete는 DB trigger로 거부한다.
3. **Interest observation**: `tli_interest_observations(id,collection_run_id,theme_id,trading_date,source,raw_value,normalized,anchor_scaled_value,keyword_epoch)`를 append-only로 두고 `UNIQUE(collection_run_id,theme_id,trading_date,source)`를 강제한다. forecast-manifest RPC가 cutoff 시점에 필요한 20거래일을 모두 가진 최신 **한 complete collection run**을 theme input에 고정하고 builder는 그 FK만 읽는다. 서로 다른 DataLab request의 날짜 행을 이어 붙이지 않는다. 기존 `interest_metrics`는 current cache일 뿐 학습 source가 아니다.
4. **News observation**: `tli_news_observations(id,collection_run_id,theme_id,article_date,article_count,query_hash,collected_at)`를 append-only로 두고 `UNIQUE(collection_run_id,theme_id,article_date)`를 강제한다. complete run은 expected theme×date마다 0건도 명시적 `article_count=0` row로 저장한다. forecast-manifest RPC는 cutoff 이하 각 theme/date 최신 `(collected_at,id)` 14개를 골라 ordered ids/hash로 theme input에 고정하고 builder는 재선택하지 않는다. row 부재는 0건이 아니라 source missing이다. 기존 `news_metrics`는 current cache이고 confirmatory source가 아니다.
5. **Outcome-independent B-Abl study lock**: 한 study의 첫 clean origin 전에, 그리고 그 study에 귀속될 origin의 `gta-v2` outcome·feature·coverage·metric이 생기기 전에 `tli_attention_study_contracts`를 append-only로 고정한다. `babl-contract-lock-v1`은 lock cutoff 시점의 단일 enabled `comparison_v4_control` row에서 `algorithm_version=production_version`을 취하고, code-pinned `comparison_spec_version`, `evaluation_horizon_days=14`, `candidate_pool_rule='source_prod_run_v1'`, control row canonical SHA, label/feature contract version·SHA를 저장한다. candidate pool은 outcome으로 고르는 상수가 아니라 각 theme의 그 exact prod run이 사전에 결정한 값을 그대로 받는다. caller가 tuple을 선택하거나 그 study의 OOS 결과 뒤 lock을 만들 수 없다. `tli_babl_phase_observations(id,collection_run_id,theme_id,snapshot_date,phase,algorithm_version,candidate_pool,comparison_spec_version,evaluation_horizon_days,source_prediction_snapshot_id,computed_at,payload_hash)`는 append-only이고 `UNIQUE(collection_run_id,theme_id,snapshot_date,algorithm_version,candidate_pool,comparison_spec_version,evaluation_horizon_days)`다. cycle-independent forecast manifest는 keyword/interest/news를 고정하고, 별도 immutable study-origin manifest가 그 forecast FK와 study-contract FK를 묶어 theme별 B-Abl observation id/hash/실제 pool을 고정한다. cutoff에 lock과 일치하는 exact prod observation이 0건/복수면 그 study-origin theme input은 B-Abl missing이다.
6. **Membership history**: `(theme_id, symbol, valid_from, valid_to, recorded_at, superseded_at)`로 business time과 system-known time을 모두 보존한다. 과거 행을 삭제하지 않고, 기존 version은 `valid_to/superseded_at`을 null에서 값으로 한 번 닫는 것만 허용하며 다른 field 수정과 재개방을 trigger로 거부한다.
7. **GT-A v2**: `labeler_version='gta-v2'`, past/future 날짜 배열 각 5개, `forecast_origin_manifest_id`, nullable `forecast_interest_run_id`, `label_source_run_id`, source cutoff/max date, request/response hash, 관측 개수, forecast keyword-group hash를 저장한다. finalizer는 현재 키워드가 아니라 cycle-independent forecast origin theme input에 고정된 정확한 keyword group으로 dedicated DataLab request를 보내고, non-abstain row는 그 spec이 forecast interest run과도 일치해야 한다. 그 **한 response**에서 5+5 값을 모두 얻고 post-cutoff theme 비활성화로 censor하지 않는다. confirmatory denominator 계약은 정확히 `past_mean>0`이며 양수 absolute floor나 future-window maximum에 따른 eligibility 분기를 금지한다. unique key는 labeler version을 포함한다. horizon date 뒤 2번째 한국 거래일까지 source가 덜 왔으면 pending을 유지하고, 3번째 거래일 18:00 KST에도 미달이면 `source_gap_sla`로 excluded한다.
8. **Dataset manifest**: query contract, as-of cutoff, 단일 `study_contract_id/SHA`, row count, unique count, min/max base date, label/feature version, source snapshot ids, ordered row SHA-256를 저장한다. 서로 다른 study contract의 origin을 섞지 않으며 같은 cutoff 재실행 hash가 다르면 즉시 실패한다.
9. **Prediction**: scientific row는 `experiment_cycle_id`, `experiment_origin_manifest_id`, `scientific_prediction_role IN ('candidate','comparator')`, role별 `model_version/model_artifact_sha256`, `labeler_version`, `feature_contract_hash`, `feature_snapshot_hash`, `forecast_cutoff`, `forecast_origin_week`을 저장한다. legacy row는 cycle/origin/role 세 scientific identity field가 모두 null이고 scientific row는 모두 non-null이어야 한다. scientific inference/provenance field는 insert 뒤 영구 불변이고 delete할 수 없다.
10. **Scoring**: 한 `experiment_cycle_id + experiment_origin_manifest_id` 안에서 candidate/comparator role을 각각 한 행 고른 뒤 label과 `theme_id + base_date + horizon_days + labeler_version + forecast_origin_manifest_id`로 exact join한다. 다른 cycle row를 결합하거나 null `actual_y`를 false로 바꾸지 않는다. scientific row는 DB RPC를 통한 단 한 번의 `pending→scored|excluded` terminal 전이에서만 outcome/provenance를 기록하고 이후 어떤 field도 바꾸지 않는다.
11. **Experiment cycle**: immutable study-contract ID/SHA, candidate, comparator, dataset, feature, label, calibration, primary endpoint, alpha, power simulation, planned origins, calendar start와 `initial_calendar_end`를 freeze한다. cycle은 OOS 이전에 고정된 study contract를 그대로 복사할 뿐 B-Abl lock을 다시 선택하지 않는다. planned origins는 16~52 범위에서 사전 power simulation으로 정하고 running 이후 hash 변경은 새 cycle만 허용한다. 운영 지연에 따른 종료일 변경은 cycle row를 수정하지 않고 append-only calendar-extension event로만 남긴다.
12. **Three-layer origin provenance**: cycle 이전부터 (a) universal `tli_forecast_origin_manifests`+theme inputs가 cutoff, expected universe, keyword/interest/news를 고정하고, (b) `tli_study_origin_manifests`+theme inputs가 한 study contract와 그 forecast FK에 대한 optional contract-matching B-Abl id/hash/actual pool을 고정한다. `gta-v2`는 universal forecast FK를, retrospective builder는 exact study-origin FK를 참조해 첫 candidate 전 clean PIT history를 축적한다. (c) experiment manifest는 cycle의 동일 study-origin/forecast FK를 참조하면서 immutable `enrollment_role`, sequence/canary, candidate/comparator, KOSPI provenance/regime을 추가 고정한다. prediction은 experiment manifest를 참조하고 scorer는 그 forecast FK가 label과 같은지 검증한다. outcome 뒤 입력을 재선택하지 않는다.
13. **Durable evidence**: pre-cycle `study_contract` canonical bytes는 `docs/evidence/tli-v3-scientific-rebuild/studies/<study-id>/study-contract.json`에 먼저 commit하고 study row 자체에 trusted Git attestation을 저장한다. cycle-scoped `preregistration`, `dataset_manifest`, `model_manifest`, `cycle_manifest`, experiment `origin_manifest`, `calendar_extension`, `safety_report`, `final_decision`, origin별 `public_canary`, `monitoring_hold`, `monitoring_resume`는 append-only evidence table에 저장한다. foundation forecast/study-origin manifest는 immutable DB source이고 dataset manifest가 ids/hash를 고정한다. experiment origin은 DB가 sequence를 부여한 뒤 canonical render→Git commit→attestation을 끝내야 `origin_manifest` evidence가 완성되며, 그 전에는 prediction insert를 금지한다. `cycle_manifest`는 frozen cycle row와 `initial_calendar_end`의 canonical contract/hash bundle이고 preregistration과 별도다. singleton은 `singleton`, origin/canary와 calendar extension은 ISO date, monitoring event는 release-event UUID를 key로 쓴다. `.omo/evidence`는 임시 실행 로그다.

`canonical-json-v1`은 RFC 8785 JCS의 UTF-8 bytes 그대로이며 trailing newline/BOM이 없다. timestamp는 UTC `YYYY-MM-DDTHH:mm:ss.sssZ`, date/UUID/SHA는 lowercase canonical string, set 성격 array는 각 계약의 key로 미리 정렬한다. nonfinite number와 중복 JSON key는 hard failure다. 모든 content SHA-256와 Git blob byte 검증은 이 exact bytes를 대상으로 한다.

### experiment cycle의 완전한 state machine

모든 전이는 service role 전용 `SECURITY DEFINER` RPC가 cycle advisory transaction lock을 잡고 수행한다. `freeze_tli_cycle`, `start_tli_cycle`, candidate archive, champion swap은 추가로 `pg_advisory_xact_lock(hashtextextended('tli-active-cycle-v1',0))` global lock을 먼저 잡으며 partial unique index가 최종 race guard다. PostgreSQL이 Git을 읽는다고 가정하지 않는다. trusted orchestrator는 상태 RPC 전에 clean worktree evidence를 commit하고 `git cat-file blob <commit>:<path>` bytes SHA-256를 재계산해 commit/blob/path/content/verifier attestation을 전달한다. RPC는 DB artifact/attestation과 대조한다. Git-first 후 DB rollback의 orphan Git evidence는 허용하지만 attestation 없는 상태 전이는 금지한다. direct update와 allowlist 밖 edge는 trigger가 거부한다.

1. `draft -> frozen`: `freeze_tli_cycle`은 data floor, power≥80%, planned 16..52, contract/runtime/lock/data/base-model/ensemble/prereg hash와 threshold가 모두 채워지고 preregistration/dataset/model/cycle-manifest의 DB artifact와 trusted Git attestation content SHA가 같을 때만 성공한다.
2. `frozen -> running`: `start_tli_cycle`은 frozen hash bundle과 네 artifact+attestation을 검증한다. 같은 transaction에서 cycle-linked model artifact를 `model_registry(status='challenger',scientific_claim_status='unvalidated',scientific_release_status='blocked',scientific_claim_reason='prospective_cycle_running')`로 정확히 한 행 insert하고 `running_at`을 기록한다. 기존 active challenger/active nonterminal challenger cycle이 있으면 자동 archive/replace하지 않고 전체 실패한다. prediction enrollment는 cycle이 `running`, `promoted_internal`, `public_approved` 중 하나일 때만 가능하다.
3. `running -> running | safety_hold`: sequence 1..8이 모두 eligible이 된 최초 한 번 `record_tli_safety_decision`을 호출한다. safety pass는 report를 append하고 status를 running으로 유지한다. catastrophe/critical incident면 cycle을 terminal `safety_hold`, linked challenger를 `archived/invalidated/blocked`로 같은 transaction에서 바꾼다.
4. `running -> ready_for_decision | rejected`: sequence `1..planned_origins`가 모두 eligible이어도, sequence 1..8의 immutable passing `safety_report` artifact+attestation과 non-null `safety_checked_at`이 먼저 존재해야 `record_tli_final_decision`을 정확히 한 번 호출할 수 있다. pass면 `ready_for_decision`; fail이면 cycle `rejected`와 linked challenger `archived/invalidated/blocked`를 함께 쓴다. `decision_at`과 sequence N의 date를 고정하며 N 이후 origin을 대체 표본으로 넣지 않는다.
5. `ready_for_decision -> promoted_internal`: `promote_tli_internal`은 linked row가 exact model hash의 유일한 challenger인지 검증하고 cycle을 `promoted_internal`, row를 **status는 challenger로 유지한 채** `eligible/internal`로 바꾸며 release event와 `promoted_internal_at`을 commit한다. 기존 public champion은 그대로 public champion으로 유지하고 API는 계속 그 모델만 제공한다. 첫 valid champion이 아직 없으면 API는 empty다.
6. `promoted_internal -> public_approved | safety_hold`: internal promotion 시각 뒤 첫 네 enrolled origin에 canary 1..4를 순서대로 부여한다. 각 origin은 probability interval completeness 100%, expected-universe coverage ≥70%, critical incident 0, candidate probability의 nonfinite/out-of-range 0, exact-paired candidate origin Brier ≤0.35를 모두 만족해야 한다. 네 origin의 exact paired row를 합친 fixed 10 equal-width-bin ECE도 point ≤0.10이고, 같은 theme × 2-week moving-block bootstrap 10,000회와 Hyndman-Fan type 7 q0.95로 계산한 upper95 ≤0.12여야 한다. 하나라도 fail하면 `record_tli_canary_failure`가 cycle `safety_hold`, linked candidate `archived/eligible/blocked`, evidence/event를 함께 쓰며 기존 champion은 유지한다. 네 개와 pooled gate가 모두 pass하면 `release_tli_public`이 기존 champion을 `archived/blocked/'superseded_by_validated_cycle'`, linked challenger를 `champion/eligible/public`으로 atomic swap하고 cycle/public evidence/event/timestamp를 함께 commit한다. canary를 건너뛰거나 교체하지 않는다.
7. `public_approved` 뒤에도 각 eligible Monday foundation을 role `monitoring`으로 계속 enroll·attest·predict·score한다. 새 challenger cycle이 `running/promoted_internal`이면 같은 foundation을 public champion cycle과 새 cycle에 각각 한 번 연결해 두 model lane을 cycle-scoped key로 병행한다. 운영 hold는 cycle status를 되돌리지 않고 registry release status만 `blocked`로 바꾼다. 동일 cycle/model/hash의 transient 원인만 verified monitoring-resume artifact와 별도 RPC로 `public` 복구할 수 있다. 과학 계약 변경은 항상 새 draft cycle이다. `rejected`와 scientific `safety_hold`에서 나가는 edge는 없다.

### 첫 confirmatory 모델 계약

- 고정 실행환경: `uv 0.9.25`, CPython `3.13.11`, `numpy==2.5.1`, `pydantic==2.13.4`, `scikit-learn==1.9.0`, `typer==0.26.8`. `train_m1.py`의 PEP 723 direct dependency를 이 버전으로 pin하고 동일 uv 버전의 `uv lock --script scripts/tli/learn/train_m1.py`로 생성한 lockfile을 commit한다. 모든 과학 실행은 `uv run --frozen --python 3.13.11`과 `PYTHONHASHSEED=0`, `OMP_NUM_THREADS=1`, `OPENBLAS_NUM_THREADS=1`, `MKL_NUM_THREADS=1`에서 수행한다. model manifest에는 uv/Python/모든 resolved package/OS/arch/BLAS 정보, script lock SHA-256, training code Git SHA를 기록한다.
- 모델: `LogisticRegression(penalty='l2', solver='lbfgs', fit_intercept=True, class_weight=None, max_iter=5000, tol=1e-8, C=<inner-selected>)`. 수렴 실패나 nonfinite coefficient는 hard failure다.
- 후보 C: `{0.01, 0.1, 1, 10}`; inner temporal validation mean Brier 최소값, 동률이면 더 작은 C
- 수치 처리: 10개 연속형 slot은 train fold에서 finite observed value가 하나 이상일 때만 `median`, `MAD=median(abs(x-median))`를 구해 missing을 median으로 채운 뒤 `(x-median)/(MAD if MAD>0 else 1)`로 변환한다. 어느 slot이든 train fold/replicate/full fit에서 finite observed value가 0개면 해당 fit과 cycle start를 hard fail하고 model artifact를 만들지 않는다. 10개 missing flag는 `{0,1}` 그대로 두고 scale하지 않는다. validation/test에는 train 통계만 적용한다.
- calibration: 선택된 C의 time-blocked cross-fitted OOF `decision_function` margin에 `LogisticRegression(penalty=None,solver='lbfgs',fit_intercept=True,class_weight=None,max_iter=5000,tol=1e-8)`을 fit한 Platt sigmoid 한 종류만 사용한다. origin별 총 sample weight가 1이 되게 행 weight를 `1/(그 origin의 OOF row 수)`로 두고, 출력은 `[1e-6,1-1e-6]`로 clamp한다. OOF에 positive/negative가 각각 30개 미만이면 candidate fit을 중단한다.
- 최종 estimator: 선택된 C와 full clean training data로 재학습하되 calibrator는 OOF margin/outcome으로만 fit
- prediction interval: cycle freeze 때 아래 `interval-ensemble-v2` 알고리즘으로 estimator/calibrator 정확히 500쌍을 한 번만 학습해 model manifest에 고정한다. 매 origin은 이 frozen ensemble을 그대로 쓴다. full-fit `p`와 ensemble quantile `q02.5/q97.5`에서 `lower=max(0,min(p,q02.5))`, `upper=min(1,max(p,q97.5))`인 `block_bootstrap_envelope_v1`을 outcome 이전에 저장한다.
- feature contract `tli-attention-v2-f1`:
  - `interest_slope_7d`
  - `interest_accel`
  - `dvi_7d`
  - `interest_return_10d`
  - `interest_drawdown_20d`
  - `news_volume_7d`
  - `news_momentum`
  - `babl_phase_signal`
  - `interest_source_age_days`
  - `news_source_age_days`
  - 위 10개 슬롯 각각의 missing flag
- exact feature formula: `r`은 single DataLab run의 날짜순 `raw_value`, `n`은 explicit zero를 포함한 날짜순 news count, `slope(x)`는 x축 `0..len-1`의 OLS slope다.

  | slot | formula |
  |---|---|
  | `interest_slope_7d` | `slope(r[-7:]) / max(mean(r[-7:]),1)` |
  | `interest_accel` | `slope(r[-3:])/max(mean(r[-3:]),1) - interest_slope_7d` |
  | `dvi_7d` | `delta_i=r[-7+i]-r[-8+i]` (`i=0..6`), `avg_up=sum(max(delta_i,0))/7`, `avg_down=sum(max(-delta_i,0))/7`, 값은 `avg_up/(avg_up+avg_down)`; 둘 다 0이면 0.5, avg_down만 0이면 1 |
  | `interest_return_10d` | `ln((mean(r[-3:])+1)/(mean(r[-13:-10])+1))` |
  | `interest_drawdown_20d` | `(max(r[-20:])-r[-1])/max(r[-20:])`; max가 0이면 missing |
  | `news_volume_7d` | `ln(1+sum(n[-7:]))`; 고정 global scale 상수로 나누지 않음 |
  | `news_momentum` | `(sum(n[-7:])-sum(n[-14:-7]))/max(sum(n[-14:-7]),1)` |
  | `babl_phase_signal` | rising=1, cooling=-1, 그 외=0; exact tuple missing도 0이지만 missing flag=true |
  | `interest_source_age_days` | source max date부터 base date까지 한국 거래일 수 |
  | `news_source_age_days` | news run source max date부터 base date까지 한국 거래일 수 |

  r은 20개, n은 14개 연속 한국 거래일 slot이 필요하며 관측 gap은 missing이지 압축 대상이 아니다. formula 결과가 nonfinite면 해당 slot을 missing으로 바꾸고, 수치 slot은 train-fold median으로만 impute한다. `normalized`와 `anchor_scaled_value`는 source diagnostics로만 남기고 confirmatory feature에는 쓰지 않는다.
- 제외: `interest_level_pct`, `basket_return_5d`, `basket_volume_ratio`, `episode_progress`, `market_regime` 및 base-date PIT를 입증하지 못한 모든 파생값
- calendar: 한국 거래일에 재색인하고 없는 날은 null로 유지한다. finite value를 당겨 붙이지 않는다.
- primary sources: interest와 news다. interest는 cutoff 이하 최신 complete **single run**이 동일 keyword group으로 20거래일을 모두 포함하고 source max date가 base date의 직전 거래일 이상(거래일 age ≤1)이어야 한다. news는 base date까지 expected date를 0 포함 전부 명시한 complete snapshot이 cutoff 이하에 있어야 한다. 둘 중 하나라도 없으면 abstain한다. B-Abl은 optional이며 foundation manifest의 study lock과 exact observation provenance가 맞지 않으면 value 0 + missing flag다. runtime cycle이나 OOS metric으로 B-Abl version/pool/spec를 다시 고르지 않는다.
- abstain: interest history 20거래일 미만, primary source freshness 위반, feature cutoff 이후 원천 포함, interest/news 중 하나라도 누락

### baseline과 평가 계약

- primary comparator: 단일 study contract의 clean training 구간에서만 구한 B-Abl `rising`, `cooling`, `other`, `missing` 네 strata별 경험확률. B-Abl observation이 study lock과 불일치하거나 0건/복수면 반드시 `missing` stratum을 쓰며 comparator는 이 사유로 abstain하지 않는다. 실제 candidate pool은 frozen `source_prod_run_v1`이 origin/theme별 사전에 정한 값이고 strata나 tuple을 outcome별로 고르지 않는다. 각 stratum은 Jeffreys smoothing `(positive + 0.5)/(n + 1)`; unseen stratum은 전체 train prevalence의 같은 smoothing 사용. outer fold마다 train-only로 fit하고 prospective cycle 시작 시 같은 study contract로 freeze한다.
- secondary: (a) test origin 직전 최대 26개 training origin의 전체 label에 Jeffreys smoothing을 적용한 climatology, (b) `interest_return_10d>0`, `<=0`, `missing` 세 train-only strata의 Jeffreys probability인 persistence, (c) `interest_slope_7d`와 `news_momentum`만 쓰되 동일 fold/preprocess/C/Platt 계약을 적용한 2-feature logistic이다. 26개 미만이면 사용 가능한 모든 prior origin을 쓰고 0개면 계산하지 않는다. 모두 diagnostic-only이며 promotion gate에 넣지 않는다.
- outer evaluation: 동일한 immutable study-contract ID/SHA의 clean eligible weekly origin만 오름차순 정렬하고 최초 13개를 initial train으로 둔다. 14번째부터 각 origin 하나를 test로 삼고 그 이전 origin만 train으로 쓰는 one-origin expanding fold를 만든다. candidate 시작에는 그 한 study contract의 clean origin 26개 이상과 따라서 OOS test origin 13개 이상이 필요하다. 같은 origin의 theme row는 절대 train/test로 나누지 않는다.
- inner/OOF split: outer train 또는 prospective full train의 distinct origin 수를 `N`이라 할 때, 마지막 `K=min(8,N-8)`개 origin을 각각 one-origin validation으로 삼고 그 이전 origin만 학습한다. `K<5`면 fold는 invalid다. 각 C의 fold Brier는 origin 안에서 평균한 뒤 K개 origin을 동일 가중 평균하며, calibration 전 probability 기준 최솟값 C를 고른다. 선택된 C에 대해 같은 K개 fold의 OOF margin을 한 번 생성해 위 Platt만 fit한다. split origin 목록과 SHA-256를 fold/model manifest에 저장한다.
- purge/availability: 각 train row의 `max(future_dates) < test origin date`이고, `gta-v2.finalized_at <= test forecast cutoff`이며, label source run `completed_at <= test forecast cutoff`인 경우만 train에 포함한다. 셋 중 하나라도 거짓이면 purge한다. outer/inner/OOF 모두 같은 predicate를 쓰고 정수 `-5` 휴리스틱을 금지한다.
- primary sample: candidate와 comparator가 모두 non-abstain이고 같은 `gta-v2` final label을 가진 exact paired rows.
- primary metric: `delta_brier = brier(candidate)-brier(comparator)`와 relative Brier improvement.
- secondary: log loss, calibration intercept/slope, ECE+CI, continuous-g daily Spearman, P@10, coverage.
- uncertainty: 고정 seed로 theme cluster와 2-week moving block을 독립 재표집하는 two-way paired bootstrap 10,000회. 99% upper bound를 primary gate에 사용한다.
- power: clean retrospective paired loss delta를 0으로 center한 뒤 minimum relevant effect `-0.02 × comparator Brier`를 더한다. theme × 2-week block 구조로 10,000회 simulate해 one-sided 99% upper bound가 0 미만일 확률 ≥80%가 되는 최소 weekly origins를 16~52에서 찾고 cycle에 freeze한다. 52에서도 미달이면 cycle을 시작하지 않는다.
- peeking: 효능 metric은 cycle 종료 전 promotion 의사결정에 노출하지 않는다. 8-origin review는 운영 완전성, critical incident, calibration catastrophe만 본다.

### 의존성 bootstrap·power simulation의 정확한 알고리즘

1. exact paired row마다 `d=(p_candidate-y)^2-(p_comparator-y)^2`를 만들고, unique theme 수를 `J`, 시간순 eligible origin 수를 `T`로 둔다.
2. replicate마다 `J`개의 theme id를 replacement로 뽑아 theme multiplicity를 만든다. 별도로 시작점 `0..T-2`에서 길이 2의 인접 origin block을 replacement로 뽑아 T개 이상 이어 붙인 뒤 정확히 T개에서 자르고 origin multiplicity를 만든다. row weight는 두 multiplicity의 곱이다. 동일 row의 candidate/comparator pair는 절대 분리하지 않는다.
3. weighted mean delta와 metric을 다시 계산한다. 유효 row weight가 0인 replicate는 전체 run 실패이며 버리고 재추첨하지 않는다. client-generated cycle UUID의 lowercase hyphenated canonical string을 UTF-8 encode한 bytes의 `SHA256`를 `cycle_seed_base`로 먼저 고정한다. 각 run은 `SHA256(cycle_seed_base_hex + '|' + metric + '|' + scope + '|bootstrap-v1')`의 앞 32bit big-endian을 PCG32 seed로 쓰고 정확히 10,000회 실행한다. power/cycle-manifest 결과 hash를 seed에 넣는 순환 정의를 금지한다.
4. quantile은 Hyndman-Fan type 7 선형보간이다. primary upper99는 replicate delta mean의 q0.99, ECE upper95는 replicate마다 fixed-bin ECE를 다시 계산한 q0.95, regime lower95는 해당 slice delta mean의 q0.05다.
5. power에서는 retrospective pooled comparator Brier를 `B0`, row delta mean을 `d_bar`라 한다. `d_null=d-d_bar`, `d_effect=d_null-0.02*B0`를 만든다. 각 `n=16..52`와 replicate에서 step 2처럼 J개 theme를 뽑고, time block만 정확히 n position이 되게 뽑아 같은 theme×time weights를 null/effect에 함께 적용한다. 정확히 10,000 paired means에서 `margin_n=q0.99(null_mean)`, `power_n=mean[effect_mean+margin_n<0]`를 계산하고 최초 `power_n>=0.80` n을 freeze한다. seed, B0, d_bar, 각 n의 margin/power와 raw replicate SHA-256를 prereg artifact에 저장한다.
6. final efficacy에서는 planned origin 전체를 정확히 한 번 사용하며 `mean(d)`, q0.99 upper, relative improvement를 계산한다. power simulation이나 8-origin safety 결과를 final 표본에 더하거나 threshold를 다시 맞추지 않는다.

### prediction interval ensemble의 정확한 알고리즘

1. cycle의 full clean training row에서 정렬된 unique theme 수를 `J`, origin 수를 `T`로 둔다. full-fit에서 선택·freeze한 C를 모든 replicate에 그대로 쓰며 재선택하지 않는다.
2. replicate `i=0..499`마다 attempt `a=0..1023`을 순서대로 시도한다. 각 attempt는 `SHA256(cycle_id + '|' + full_fit_estimator_sha256 + '|interval-ensemble-v2|' + zero_pad_3(i) + '|' + zero_pad_4(a))`의 앞 32bit big-endian을 PCG32 seed로 쓴다. final model manifest를 seed에 넣는 순환 hash를 금지한다. 같은 stream에서 theme id를 replacement로 정확히 J번 뽑고, 시작점 `0..T-2`의 길이 2 인접-origin block을 replacement로 이어 붙여 정확히 T position에서 자른다.
3. 원본 row의 weight는 해당 theme draw multiplicity × origin draw multiplicity다. 0 weight row는 제외하되 원래 시간순은 유지한다. 연속형 전처리 median/MAD는 이 weight만큼 row를 반복한 multiset과 정확히 같은 값으로 replicate별 재fit하고, base estimator는 고정 C와 같은 row weight로 full training data에 fit한다.
4. replicate Platt는 원본 시간순 `K=min(8,T-8)` OOF fold를 유지한다. 각 fold estimator는 그 validation origin보다 이른 nonzero-weight row만으로 전처리와 base estimator를 fit하고, validation의 nonzero-weight row에 margin을 만든다. Platt row weight는 theme×origin multiplicity를 사용하되 각 validation origin의 총 weight가 1이 되게 normalize한다. 같은 theme/origin row가 train과 validation 양쪽에 들어가면 안 된다.
5. attempt의 admissibility는 정확히 nonzero OOF origin 수≥5, OOF class별 distinct row≥30, 모든 OOF fold의 weighted train/validation nonempty, estimator/calibrator convergence, coefficient/probability finite다. 하나라도 실패하면 reason code와 sampled index bytes SHA-256를 기록하고 다음 `a`로 간다. 각 replicate는 prospective cycle outcome이나 outer-test outcome을 보지 않는 이 고정 순서에서 **최초 admissible attempt 하나만** 채택한다. 1,024개가 전부 실패하면 그 replicate를 생략하지 않고 cycle start 전체를 실패시킨다. 수동 seed 변경, attempt 재정렬, cap 연장, 성공 replicate만 골라 500개 미만으로 시작하는 것을 금지한다. manifest는 모든 rejected attempt의 index hash/reason, selected attempt index, preprocessing, estimator, calibrator hash를 replicate 순서대로 저장한다.
6. prediction 때 500개 calibrated probability를 전부 계산하고 Hyndman-Fan type 7의 q0.025/q0.975를 사용한다. 모델 누락, hash drift, 500 미만, outcome 이후 생성은 interval completeness failure이며 사후 재학습·보간·대체 interval을 금지한다.

### 통계·운영 gate의 정확한 정의

- **Enrolled/planned origin**: 거래 가능한 월요일 18:00 KST의 foundation manifest를 먼저 고정한다. `enroll_tli_origin`은 cycle별 advisory lock 아래 오름차순 origin에 단조 증가 `sequence_no`를 부여하며 허용 status는 정확히 `running`, `promoted_internal`, `public_approved`다. `running`에서는 sequence `1..planned_origins`가 `confirmatory`, 이후는 `predecision_diagnostic`이고 canary는 null이다. `promoted_internal`에서는 `forecast_cutoff > promoted_internal_at`인 첫 네 enrollment만 `public_canary`와 ordinal 1..4를 받고, 그 뒤 release 결정 전 origin은 `prepublic_diagnostic`/canary null이다. `public_approved`에서는 `forecast_cutoff > public_approved_at`인 origin을 `monitoring`/canary null로 둔다. `draft,frozen,ready_for_decision,rejected,safety_hold`는 거부한다. 같은 foundation manifest는 public champion cycle과 동시에 running/promoted challenger cycle 각각에 한 번씩 연결될 수 있다. trusted orchestrator가 DB canonical renderer bytes를 Git commit·검증하고 `attest_tli_origin`으로 matching role/sequence/canary artifact+attestation을 저장한 뒤에만 candidate/comparator prediction을 insert한다. planned set 결함과 first-four canary 결함은 건너뛰거나 교체하지 않는다. 월요일 휴장 주는 weekly manifest/enrollment/sequence를 만들지 않는다.
- **Eligible origin**: enrolled origin의 expected universe 전체가 이 문서의 terminal label accounting을 끝낸 상태다. planned final은 정확히 sequence `1..planned_origins` 모두가 eligible일 때 한 번 열리며 `>=N`개의 임의 표본을 고르지 않는다. post-cutoff 발견·비활성화는 universe를 바꾸지 않는다.
- **Exact paired sample**: 같은 cycle/theme/origin/label version/horizon에서 candidate와 comparator 모두 non-abstain이고 final outcome이 있는 row다. 모든 primary·calibration·P@10 metric은 이 표본을 사용한다.
- **Completeness/accounting**: prediction completeness는 expected universe 대비 candidate와 comparator가 모두 terminal row(non-abstain 또는 명시적 abstain)를 가진 비율이며 99% 이상이어야 한다. label accounting은 모든 predicted theme가 `final` 또는 사전정의 `excluded` terminal status여야 하며 100%다. `source_gap_sla`는 origin별 expected universe의 1% 이하여야 한다. coverage는 expected universe 중 candidate non-abstain 비율이다. `final`만 exact paired metric에 들어가고 모든 excluded reason/count는 공개한다.
- **Critical data incident**: 다음 중 하나라도 발생한 origin은 incident 1이다: immutable row update/delete 시도 성공, same-cutoff dataset hash 불일치, duplicate scientific key, post-outcome/mixed study contract, feature/source cutoff 위반, 서로 다른 DataLab run의 interest history 혼합, wrong label version/horizon 또는 cross-cycle role join, prediction completeness <99%, terminal label accounting <100%, `source_gap_sla` >1%, source run partial/failed가 expected universe에 영향, model/contract hash drift, null outcome의 scored 변환, gate/evidence artifact 누락. 단순 contract-matching B-Abl optional missing은 incident가 아니고 missing flag다.
- **8-origin calibration catastrophe**: exact paired row에서 probability 비유한/범위 밖이 1개라도 있거나, pooled Brier >0.35 또는 fixed-bin ECE >0.20이면 cycle을 `safety_hold`로 닫는다. baseline delta, P@10, IC, confidence interval, promotion verdict는 계산·공개하지 않는다.
- **ECE**: 10개 fixed equal-width bin `[0,.1),...,[.9,1]`; 빈 bin은 기여 0. point ECE는 exact paired row로 계산한다. 95% upper는 primary와 같은 theme × 2-week moving-block bootstrap 10,000회에서 ECE의 95 percentile이다. theme-only bootstrap은 금지한다.
- **P@10**: origin별 candidate probability 내림차순, 동률은 `theme_id` 오름차순으로 정렬해 상위 10개를 취한다. exact paired row가 10개 미만인 origin은 P@10에서 제외한다. 유효 origin 수가 `max(12,ceil(0.80*planned_origins))` 이상이어야 하며, origin별 precision을 동일 가중 평균한다. comparator도 자기 probability 순위와 같은 tie rule을 쓰며 candidate mean이 comparator보다 5%p 초과 낮으면 fail이다. 최소 수 미달은 final fail이지 연장 사유가 아니다.
- **Regime**: origin manifest에 forecast cutoff까지 실제 저장된 KOSPI base close와 20거래일 전 close/source ids/hash를 고정하고 그 수익률로 `risk_off <= -3%`, `neutral (-3%,+3%)`, `risk_on >= +3%`를 지정한다. 한 regime이 최소 4 eligible origins와 100 exact paired rows를 가지면 gate-eligible다. eligible regime에서 candidate relative Brier worsening ≥20%이고 paired two-way bootstrap 95% lower bound >0이면 catastrophic reversal이다. 작은 slice는 `insufficient_regime_sample`로 공개하되 pass/fail에 사용하지 않는다.

### prospective promotion gate

모두 충족해야 한다.

- 동일 pre-outcome study/candidate/comparator/data/feature/label/calibration hash
- terminal label accounting이 완료된 planned origin이 정확히 sequence `1..planned_origins`이며, `planned_origins >= 16`
- 모든 origin의 prediction expected-row completeness ≥99%
- planned origins 전체 expected universe를 분모로 한 pooled model non-abstain coverage ≥70%
- exact paired sample에서 `1 - Brier(candidate)/Brier(comparator) >= 0.02`
- two-way bootstrap `delta_brier` 99% upper bound < 0
- ECE point ≤0.10, upper95 ≤0.12
- P@10이 comparator보다 5%p 초과 악화되지 않음
- critical data incident 0
- 사전정의 regime 어느 하나에서도 Brier가 comparator 대비 20% 이상 악화되는 catastrophic reversal 없음

한 항목이라도 실패하면 champion 유지다. 사전고정 planned eligible origin에 도달하기 전 운영 지연은 효능을 열지 않은 채 append-only calendar-extension event로 effective calendar end만 늦출 수 있다. 이 event는 `initial_calendar_end`, planned count, 모든 contract/model hash를 바꾸지 않는다. planned count에서 final을 연 뒤 metric 표본 부족이 확인되면 그 cycle은 실패이며 사후 연장하지 않는다. 재학습·feature 변경·label 변경은 반드시 새 cycle이다.

### L4 이후 운영 계약

- public champion도 매 origin 동일 manifest→predict→label→score evidence를 계속 만든다. nonfinite/out-of-range, interval completeness <100%, prediction completeness <99%, terminal label accounting <100%, source-gap >1%, critical incident 1이면 release status를 즉시 `blocked`로 바꾸고 API는 empty response를 낸다. 자동으로 B-Abl이나 이전 모델에 fallback하지 않는다.
- 최근 8 eligible origins의 pooled Brier >0.35 또는 fixed-bin ECE >0.20, 혹은 한 origin coverage <70%도 `monitoring_hold`다. threshold를 넘은 뒤의 조사/수정은 새 artifact와 새 cycle에서만 하고 기존 outcome을 재채점하지 않는다.
- 모니터링 수치는 safety/diagnostic일 뿐 새 모델의 효능 승격 자료가 아니다. champion 재학습·recalibration·feature 변경·threshold 변경은 in-place로 하지 않는다.
- active challenger cycle은 최대 1개다. 마지막 candidate freeze 뒤 최소 13개의 새 clean eligible origins가 쌓였고 운영자가 명시적으로 시작할 때만 새 candidate를 만들며, Todo 16의 data floor·power simulation과 Todo 17의 전체 prospective gate를 새 cycle id로 다시 통과한다. champion은 challenger 실패와 무관하게 유지된다.
- release 재개는 원인이 제거된 새 verified artifact가 있고, 동일 public-approved cycle/model hash의 transient 운영 문제였음이 증명될 때만 explicit RPC로 가능하다. model/data/feature/label/calibration hash가 바뀌면 재개가 아니라 새 cycle이다.

### Must have

- immutable PIT 원천, versioned exact-five label, deterministic dataset hash
- pre-outcome study contract와 cycle/role-scoped origin·prediction identity
- leakage-free temporal training/calibration/purge와 dependence-aware paired inference
- frozen prospective lifecycle, fail-closed promotion/exposure/scoring
- 테스트와 runtime evidence가 각 과학 계약을 직접 반증 가능하게 검증
- 기존 안전한 registry/API 구조와 실패 artifact 보존

### Must NOT have (guardrails, anti-slop, scope boundaries)

- `gta-v1`, `rescale_suspect`, source gap, keyword break를 confirmatory dataset에 섞지 않는다.
- 과거 `interest_metrics.raw_value` 또는 current `theme_stocks.is_active`로 historical PIT를 꾸미지 않는다.
- 전체 dataset에 scaler/imputer/calibrator를 먼저 fit하지 않는다.
- null outcome을 음성으로 변환하지 않는다.
- row 수만 비교하고 dataset 동일성을 주장하지 않는다.
- 8주 safety review나 repeated checkpoint에서 효능 승격하지 않는다.
- 기존 invalid metric, B-Abl hard 0/1, 방향이 뒤집힌 M0를 comparator로 쓰지 않는다.
- OOS outcome·coverage로 B-Abl study lock을 고르거나 서로 다른 cycle의 candidate/comparator row를 pair하지 않는다.
- GT-B가 준비되기 전 가격·수익 예측 문구를 API/UI/홍보에 노출하지 않는다.
- GT-B 데이터 vendor·portfolio/cost 계약과 구현은 이 실행에서 시작하지 않는다. GT-A L4 이후 별도 decision-complete plan으로만 열며, 그 전 status는 `foundation_only/no-go`다.
- unrelated comparison level-4, `.serena/project.yml`, `mcp/.serena/project.yml`, `DESIGN.md`를 수정하지 않는다.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: 라벨 날짜·as-of·purge·hash·cycle immutability·promotion 같은 subtle boundary는 **TDD**, 나머지는 tests-after. TypeScript는 Vitest, Python은 pytest, DB는 migration SQL contract test + local Supabase가 있으면 transaction smoke test를 사용한다.
- 정적 gate: `npx tsc --noEmit`, 변경 파일 대상 `npx eslint`, `git diff --check`.
- 핵심 회귀: `npx vitest run lib/tli scripts/tli app/api/tli/predictions`.
- Python: 위 고정 thread env에서 `uv run --frozen --python 3.13.11 pytest scripts/tli/learn/__tests__/test_train_m1.py -q` 및 고정 fixture training driver.
- Workflow: `actionlint .github/workflows/tli-collect-data.yml .github/workflows/tli-weekly-learn.yml`가 설치돼 있으면 실행하고, 없으면 YAML parse + Vitest workflow contract test를 필수로 한다.
- DB/runtime: read-only live audit script로 duplicate 0, hash repeat equality, exact-five, version join, pending/scored counts를 JSON에 고정한다. production write smoke는 `--dry-run` 또는 rollback transaction만 허용한다.
- Manual QA gate: 실제 CLI surface에서 dataset build를 같은 cutoff로 2회 실행하고 hash byte equality를 관측한 뒤, 한 source snapshot을 의도적으로 누락한 fixture가 fail-closed하는지 실행한다. frozen cycle dry-run은 8-origin promote 시도를 거부하고 planned=16/planned=24 fixture가 각자 고정 count에서만 `would_promote`를 출력해야 한다.
- Evidence: 각 Todo는 `.omo/evidence/tli-v3-scientific-rebuild/task-N/`에 명령/exit/stdout/stderr/JSON을 저장한다. 이는 local QA 로그다. study-contract/prereg/cycle/model/dataset/experiment-origin/calendar-extension/safety/final/canary/monitoring evidence는 tracked Git canonical bytes를 먼저 commit·검증하고 같은 SHA의 DB row/artifact+trusted attestation으로 연결한다. secret/PII를 기록하지 않는다.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

사용자 RAM 제약 때문에 **실행 동시성 기본값은 1**이다. 아래 wave는 의존성 묶음이지 동시 에이전트 수가 아니다. 하위 작업은 순차 실행하고, 가벼운 read-only review 하나만 필요할 때 재사용한다.

- Wave 0, containment and authority: Todo 1-3
- Wave 1, immutable data and label contract: Todo 4-7
- Wave 2, reproducible features and evaluation: Todo 8-11
- Wave 3, frozen prospective lifecycle: Todo 12-15
- Wave 4, evidence accumulation and public decision: Todo 16-17
- GT-B는 이 plan의 실행 Todo가 아니다. GT-A L4 이후 별도 계획에서만 시작한다.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2-17 | none; containment first |
| 2 | 1 | 12-17 | 3 |
| 3 | 1 | 16 | 2 |
| 4 | 1 | 5-11 | none |
| 5 | 4 | 6-11 | none |
| 6 | 4,5 | 7,9,12 | none |
| 7 | 5,6 | 8-17 | none |
| 8 | 7 | 9-11 | none |
| 9 | 7,8 | 10-11,13 | none |
| 10 | 9 | 11,13-17 | none |
| 11 | 8-10 | 12-17 | none |
| 12 | 2,6,11 | 13-17 | none |
| 13 | 10-12 | 14-17 | none |
| 14 | 12,13 | 15-17 | none |
| 15 | 12-14 | 16-17 | none |
| 16 | 3,15 | 17 | none; time-gated |
| 17 | 16 | none | none |

## Todos
> Implementation + Test = ONE todo. Never separate.

- [ ] 1. 검증 전 승격·공개를 fail-closed로 동결한다
  What to do / Must NOT do: `supabase/migrations/045_tli_scientific_containment.sql`을 만든다. `model_registry`에 `scientific_claim_status TEXT NOT NULL DEFAULT 'unvalidated' CHECK(scientific_claim_status IN ('unvalidated','eligible','invalidated'))`, `scientific_release_status TEXT NOT NULL DEFAULT 'blocked' CHECK(scientific_release_status IN ('blocked','internal','public'))`, `scientific_claim_reason TEXT`, `invalidated_at TIMESTAMPTZ`, `experiment_cycle_id UUID NULL`을 추가한다. Todo 12 전 public 전이를 거부한다. `model_type='m1_logistic' OR model_version LIKE 'm1-%'`인 모든 legacy M1(a1, `m1-2026w28-a2`, 그 외)은 `invalidated/blocked/'legacy_non_pit_evidence'`로, 그중 `status='challenger'`는 `archived`로 backfill한다. `model_type='b_abl' OR model_version LIKE 'b-abl-%'`는 `unvalidated/blocked/'descriptive_phase_only'`로 둔다. legacy register/promote/rollback RPC execute를 revoke하고 cycle RPC 외 registry 변경을 trigger로 거부한다. `theme_labels`에는 exact scientific use status/reason을 추가하고 gta-v1을 exploratory-only로 고정한다. `run-weekly-learn.ts`는 `TLI_M1_PROMOTION_ENABLED === 'true'`일 때만 `promote_tli_internal`을 호출하며 unset/false는 `promotion_disabled`와 RPC 0회다. API는 `TLI_PREDICTIONS_V3_EXPOSURE_ENABLED === 'true'` **그리고** registry row가 `status='champion' AND scientific_claim_status='eligible' AND scientific_release_status='public'`이고 prediction이 그 registry의 exact `experiment_cycle_id`+model version+role `candidate`일 때만 출력한다. Todo 12 column이 배포되기 전 중간 상태는 validated row가 없으므로 무조건 empty이고, Todo 12에서 exact cycle/role join을 활성화한다. legacy rollback, 다른 cycle의 same-date row, env 하나만으로 노출하지 않는다. dry-run은 DB write를 하지 않는다.
  Parallelization: Wave 0 | Blocked by: none | Blocks: 2-17
  References: `scripts/tli/learn/run-weekly-learn.ts:143-224`; `scripts/tli/learn/model-registry.ts`; `app/api/tli/predictions/prediction-loader.ts:76-146`; `app/api/tli/predictions/route.test.ts`; `supabase/migrations/036_create_model_registry.sql`; `supabase/migrations/040_fix_model_registry_challenger_rpc_ambiguity.sql`.
  Acceptance criteria: exact columns/defaults/CHECK/backfill 뒤 a1과 `m1-2026w28-a2`를 포함한 M1 전부 invalidated/blocked, active legacy challenger 0, B-Abl public 0, gta-v1 confirmatory 0이다. legacy registry RPC/direct update가 거부된다. promotion flag unset/false에서 passing final도 `promotion_disabled`, RPC 0회다. exposure flag false/unset, champion/eligible/public 중 하나 false, registry와 prediction cycle/model/role 불일치면 API/rollback fixture는 empty다. 모든 조건이 true인 validated champion-cycle candidate row만 Todo 17 이후 출력 가능하다.
  QA scenarios: migration SQL contract + promotion/model-registry/API tests; failure flag unset/false, exposure-only, DB-only, legacy champion, 다른 challenger cycle same-date row, comparator role, direct public, invalidated challenger, exploratory label, rollback bypass, dry-run이 각각 zero-RPC/no-write/no-exposure. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-1/`.
  Commit: Y | `fix(tli): freeze unvalidated prediction promotion`

- [ ] 2. workflow mode·Python runtime·canary 실패 의미를 바로잡는다
  What to do / Must NOT do: collect mode는 wall-clock `date -u`가 아니라 `github.event.schedule` 또는 dispatch input으로 결정한다. `00:00` cron만 news-only, 나머지 cron은 full이다. workflow의 uv를 `0.9.25`, Python과 PEP 723를 CPython `3.13.11` 및 위 direct dependency 버전에 맞추고 script lockfile을 commit한다. 과학 실행은 `uv run --frozen`, 고정 hash seed, BLAS single-thread만 허용한다. `extend`/not-due에서 새 challenger를 학습하지 않는다. scientific parity/watchlist 결과는 artifact로 남기고 critical contract failure는 workflow success로 숨기지 않는다. 일반 경고와 과학 gate 실패를 구분한다.
  Parallelization: Wave 0 | Blocked by: 1 | Blocks: 12-17
  References: `.github/workflows/tli-collect-data.yml:1-106`; `.github/workflows/tli-weekly-learn.yml:1-100`; `scripts/tli/learn/train_m1.py:1-4`; `scripts/tli/learn/run-weekly-learn.ts:170-224`.
  Acceptance criteria: 3개 schedule string과 2개 dispatch mode fixture가 정확한 mode를 만든다. 60분 늦은 cron simulation도 schedule 기준 mode가 유지된다. workflow Python 3.13.11에서 frozen-lock training help/fixture가 실행되고 model manifest에 runtime/lock/code SHA가 모두 존재한다. 동일 input·code·runtime의 고정 fixture를 2회 실행한 canonical model artifact SHA-256가 같다. extend result에서 train/register step은 skip된다.
  QA scenarios: happy workflow contract Vitest + YAML parse + frozen-lock double-run; failure delayed-start fixture가 기존 wall-clock 오분류를 재현한 뒤 새 resolver에서 news-only를 유지하고, Python 3.11·unpinned dependency·lock drift·BLAS multi-thread guard fixture는 각각 실행 전 명시적 incompatibility를 반환. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-2/`.
  Commit: Y | `fix(tli): make workflow scheduling and runtime deterministic`

- [ ] 3. 기존 문서와 artifact의 권위를 이 master plan에 정렬한다
  What to do / Must NOT do: 기존 PRD와 early-promotion preregistration 맨 위에 superseded-for-scientific-claims banner를 추가하고 이 master plan 경로를 적는다. 과거 수치와 실패 이력은 삭제하거나 재작성하지 않는다. 운영 runbook에는 exposure/promotion frozen 상태와 해제 조건을 적는다. 새 문서를 분산 생성하지 않는다.
  Parallelization: Wave 0 | Blocked by: 1 | Blocks: 16
  References: `docs/prd/PRD-tli-v3-rebuild.md`; `docs/tli-v3-early-promotion-preregistration.md`; `docs/tli-ops-runbook.md`; `docs/tli-v3-status-2026-07-07.md`; 이 plan의 Scope/Promotion gate.
  Acceptance criteria: `rg`로 세 문서에 master-plan path와 `superseded_for_scientific_claims`가 존재하고, 기존 수치/실패 section diff 삭제가 0이다. 중복된 새 권위 문서가 없다.
  QA scenarios: happy link/path checker가 모든 참조를 resolve; failure 기존 PRD를 단독 source of truth로 표시한 문구가 있으면 checker 실패. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-3/`.
  Commit: Y | `docs(tli): establish scientific rebuild authority`

- [ ] 4. append-only interest/news/B-Abl source snapshot schema를 만든다
  What to do / Must NOT do: `supabase/migrations/046_tli_immutable_source_snapshots.sql`을 만든다. `tli_collection_runs`는 `id UUID PK, source CHECK('naver_datalab','naver_news','babl_phase'), contract_version TEXT, request_window_start DATE, request_window_end DATE, request_payload JSONB, response_payload JSONB, request_sha256 TEXT, response_sha256 TEXT, keyword_group_hash TEXT, expected_universe_hash TEXT, expected_keys_sha256 TEXT, expected_row_count INTEGER, observed_row_count INTEGER, source_max_date DATE, requested_at TIMESTAMPTZ, collected_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, status CHECK('complete','partial','failed'), failure_summary JSONB`를 가진다. `complete`는 expected/observed key가 정확히 같을 때만 허용하고 terminal insert 뒤 update하지 않는다. observation unique는 정확히 interest `UNIQUE(collection_run_id,theme_id,trading_date,source)`, news `UNIQUE(collection_run_id,theme_id,article_date)`, B-Abl `UNIQUE(collection_run_id,theme_id,snapshot_date,algorithm_version,candidate_pool,comparison_spec_version,evaluation_horizon_days)`이며 세 table 모두 update/delete 거부 trigger를 가진다.

  같은 migration에 `tli_attention_study_contracts(id UUID PK,contract_version TEXT NOT NULL UNIQUE CHECK(contract_version='tli-attention-study-v1'),locked_at TIMESTAMPTZ NOT NULL,first_origin_date DATE NOT NULL,babl_algorithm_version TEXT NOT NULL,babl_comparison_spec_version TEXT NOT NULL,babl_evaluation_horizon_days INTEGER NOT NULL CHECK(babl_evaluation_horizon_days=14),babl_candidate_pool_rule TEXT NOT NULL CHECK(babl_candidate_pool_rule='source_prod_run_v1'),babl_control_row_id UUID NOT NULL FK ON DELETE RESTRICT,babl_control_sha256 TEXT NOT NULL,labeler_version TEXT NOT NULL CHECK(labeler_version='gta-v2'),label_contract_sha256 TEXT NOT NULL,feature_contract_version TEXT NOT NULL CHECK(feature_contract_version='tli-attention-v2-f1'),feature_contract_sha256 TEXT NOT NULL,payload_sha256 TEXT NOT NULL,git_commit_sha TEXT NOT NULL,git_blob_sha TEXT NOT NULL,repo_relative_path TEXT NOT NULL,verifier_version TEXT NOT NULL,verifier_code_sha TEXT NOT NULL,verified_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`를 append-only로 만든다. trusted client는 client-generated study UUID로 canonical payload를 먼저 Git commit·blob verify한 뒤 `lock_tli_attention_study_contract`을 호출한다. RPC는 `locked_at < first_origin_date 18:00 KST`이고 아직 그 study row/origin이 0개일 때만, DB의 단일 enabled control row와 code-pinned `comparison-v4-spec-v1`/14일/`source_prod_run_v1`, exact label/feature version, canonical content SHA와 trusted attestation을 직접 대조해 row를 insert한다. path는 `docs/evidence/tli-v3-scientific-rebuild/studies/<study-id>/study-contract.json` exact다. RPC input과 query에는 theme outcome, feature, coverage, score, OOS metric이 없으며 caller-supplied B-Abl 대안을 허용하지 않는다. 모든 SHA는 lowercase 64-hex다.

  cycle-independent `tli_forecast_origin_manifests(id UUID PK,manifest_version TEXT,origin_date DATE,forecast_cutoff TIMESTAMPTZ,expected_theme_ids JSONB,expected_theme_count INTEGER,expected_universe_sha256 TEXT,keyword_group_manifest_sha256 TEXT,payload_sha256 TEXT,created_at TIMESTAMPTZ,UNIQUE(manifest_version,origin_date))`와 `tli_forecast_origin_theme_inputs(forecast_origin_manifest_id UUID FK,theme_id UUID FK,keyword_group_spec JSONB,keyword_group_sha256 TEXT,forecast_interest_run_id UUID FK NULL,forecast_interest_response_sha256 TEXT NULL,news_observation_ids JSONB,news_input_sha256 TEXT NULL,input_status TEXT CHECK(input_status IN ('usable','abstain')),abstain_reason TEXT NULL,PRIMARY KEY(forecast_origin_manifest_id,theme_id))`를 만든다. `create_tli_forecast_origin_manifest`은 거래 가능한 월요일마다 cutoff를 해당 date 18:00 KST로 고정하고 expected ids와 child keys가 정확히 같은지 검증한다. usable child는 complete single interest run 20 slots, ordered explicit-zero news rows 14 slots가 cutoff 이하이고 spec/hash가 맞아야 한다. parent+모든 child를 한 transaction으로 insert하고 동일 version/date/payload retry만 기존 id를 반환한다.

  `tli_study_origin_manifests(id UUID PK,study_contract_id UUID NOT NULL FK ON DELETE RESTRICT,forecast_origin_manifest_id UUID NOT NULL FK ON DELETE RESTRICT,payload_sha256 TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(study_contract_id,forecast_origin_manifest_id))`와 `tli_study_origin_theme_inputs(study_origin_manifest_id UUID NOT NULL FK ON DELETE RESTRICT,theme_id UUID NOT NULL FK ON DELETE RESTRICT,babl_observation_id UUID FK NULL,babl_input_sha256 TEXT NULL,babl_candidate_pool TEXT NULL,babl_missing_reason TEXT NULL CHECK(babl_missing_reason IN ('no_matching_observation','multiple_matching_observations','source_run_not_complete','source_after_cutoff','source_pool_mismatch')),PRIMARY KEY(study_origin_manifest_id,theme_id))`도 append-only다. CHECK은 B-Abl id/hash/pool이 모두 non-null이고 missing reason은 null이거나, 세 값이 모두 null이고 위 missing reason은 non-null인 두 상태만 허용한다. `bind_tli_study_origin`은 forecast cutoff 전에 이미 locked된 study만 받고 parent expected themes와 child keys가 정확히 같게 한 transaction으로 만든다. 각 theme는 study algorithm/spec/horizon과 source prod run이 정한 pool에 맞는 cutoff 이하 B-Abl observation이 정확히 한 건이면 FK/hash/pool을, 아니면 null과 exact missing reason을 저장한다. forecast/study 두 parent와 모든 child는 update/delete 불가이며 model·cycle·outcome을 요구하지 않는다.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 5-11
  References: `supabase/migrations/003_create_tli_tables.sql:132-190`; `supabase/migrations/016_comparison_v4_foundation.sql:83-120`; `supabase/migrations/033_create_theme_labels.sql:52-62`; `scripts/tli/shared/data-ops.ts:75-105`; RLS pattern `supabase/migrations/035_create_theme_predictions_v3.sql`.
  Acceptance criteria: migration contract test가 source 4개, study contract 1개, forecast manifest 2개, study-origin 2개 table의 exact PK/FK/UNIQUE/RLS/revoke/immutable trigger/index를 확인한다. outcome query 없이 study lock이 먼저 생기고 모든 retrospective origin이 같은 study ID/SHA를 전달한다. expected key가 빠진 complete run/manifest, usable child의 wrong/future/partial interest, 14개가 아니거나 unordered/wrong-date인 news ids, wrong B-Abl lock/hash/pool, parent universe와 다른 child key, 세 scientific-key duplicate와 모든 mutation이 거부된다. cycle row가 0개여도 valid Monday forecast+study-origin manifest와 이후 gta-v2 FK를 만들 수 있다.
  QA scenarios: happy pre-outcome study lock→exact source runs→193-theme forecast/study-origin manifests atomic insert/as-of query; failure label/metric을 먼저 읽은 call order, caller-supplied algorithm/spec/pool, two enabled controls, count-only key match, missing zero-news, wrong child theme, cutoff+1초 run, incomplete child, wrong study binding, same-date different-payload, mutation/duplicate가 SQLSTATE와 함께 rollback. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-4/`.
  Commit: Y | `feat(tli): add immutable source snapshot schema`

- [ ] 5. theme-stock bitemporal membership history 수집을 시작한다
  What to do / Must NOT do: `supabase/migrations/047_tli_membership_history.sql`에 `theme_stock_membership_history(id,theme_id,symbol,valid_from,valid_to,recorded_at,superseded_at,source,collection_run_id,relevance,market)`를 추가하고 과거 version을 보존한다. collector diff에서 신규는 open row, 제거/변경은 기존 row의 `valid_to/superseded_at`을 null에서 값으로 한 번만 닫고 새 version을 append한다. trigger는 close 외 field 수정, close timestamp 재수정, closed row 재개방, delete를 거부한다. as-of query는 `valid_from <= base_date < valid_to-or-infinity`와 `recorded_at <= cutoff < superseded_at-or-infinity`를 모두 만족해야 한다. 과거 history를 `created_at`으로 추정 backfill하지 않는다.
  Parallelization: Wave 1 | Blocked by: 4 | Blocks: 6-11
  References: `supabase/migrations/003_create_tli_tables.sql:89-127`; `scripts/tli/shared/data-ops.ts:115-198`; `scripts/tli/themes/theme-keywords.ts`; `scripts/tli/features/load-feature-inputs.ts:135-160,259-270`.
  Acceptance criteria: add/remove/reactivate fixture의 네 시점 as-of query가 예상 membership을 반환한다. current `is_active` 변경이 과거 as-of 결과를 바꾸지 않는다. unknown pre-history는 absent이며 fabricated backfill 0건이다.
  QA scenarios: happy bitemporal fixture query; failure current active table만 사용하려는 loader contract test가 실패. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-5/`.
  Commit: Y | `feat(tli): record bitemporal theme membership`

- [ ] 6. collectors가 immutable snapshot을 쓰고 current cache와 분리되게 한다
  What to do / Must NOT do: DataLab/news collector는 API call마다 canonical request/response SHA-256, keyword-group/expected-key hash, source max date를 계산하고 terminal run + observations를 하나의 DB transaction/RPC로 append한 뒤, 그 성공 후에만 current cache를 갱신한다. count가 같아도 expected key set이 다르면 complete가 아니다. DataLab batch별 request를 별도 run으로 보존하고, news는 expected theme×date의 0건 row도 명시한다. B-Abl collector는 각 pre-outcome study lock의 algorithm/spec/horizon과 exact prod run이 정한 actual pool로 cutoff 시점 observation provenance를 저장하고 runtime/OOS metric으로 contract를 선택하지 않는다. partial failure는 complete로 위장하지 않는다. 첫 clean origin 전 `lock_tli_attention_study_contract`을 실행한다. 매 거래 가능한 월요일 cutoff 뒤 runner는 cutoff 시점 membership/keyword와 cutoff 이하 source만 읽어 universal forecast manifest를 먼저 만들고, lock 시각과 first-origin 조건을 만족하는 각 study에 `bind_tli_study_origin`을 호출한다. cycle 0개여도 두 manifest를 계속 쌓고 missing interest는 forecast child abstain, missing B-Abl은 study child missing으로 명시한다. 과거 snapshot/manifest를 overwrite하지 않는다.
  Parallelization: Wave 1 | Blocked by: 4,5 | Blocks: 7,9,12
  References: `scripts/tli/collectors/naver-datalab.ts`; `scripts/tli/collectors/naver-news.ts`; `scripts/tli/collectors/datalab-anchor.ts`; `scripts/tli/shared/data-ops.ts:43-105`; `scripts/tli/batch/collect-and-score.ts`; `scripts/tli/comparison/snapshot-predictions.ts`; `supabase/migrations/017_comparison_v4_control.sql`; `scripts/tli/comparison/v4/shadow.ts:360-390`.
  Acceptance criteria: 같은 API fixture를 두 번 수집하면 별도 immutable runs, 같은 response hash, overwrite 0이다. snapshot transaction failure는 run/observation 모두 0이고 cache write도 0이다. news 0/missing과 cutoff가 정확히 구분된다. B-Abl은 study contract별 exact 1건만 저장하고 pool은 source prod run 값을 그대로 쓴다. cycle 0 fixture에서도 Monday forecast manifest 1개+forecast child 193개와 study-origin manifest 1개+study child 193개가 생기고 동일 retry는 같은 id/hash다. current cache 실패가 commit된 snapshot/manifest를 손상시키지 않는다.
  QA scenarios: happy mocked interest/news/B-Abl end-to-end atomic insert와 18:00 cutoff query; failure study lock 전 origin, outcome 기반 tuple override, expected key swap, missing zero-news row, transaction 중 observation insert error, 3번째 theme API error, 18:00:01 news, wrong algorithm/spec/horizon, source와 다른 pool, duplicate B-Abl config가 각각 rollback/partial/missing/fail-closed를 생성. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-6/`.
  Commit: Y | `feat(tli): persist immutable collection vintages`

- [ ] 7. `gta-v2` exact-five/versioned label 계약을 구현한다
  What to do / Must NOT do: `supabase/migrations/048_tli_gta_v2.sql`에서 label unique key에 `labeler_version`을 포함하고 `past_dates/future_dates`, nullable `forecast_origin_manifest_id UUID FK`, nullable `forecast_interest_run_id UUID FK`, nullable `label_source_run_id UUID FK`, source cutoff/max date, request/response hash, observation counts, forecast keyword-group hash를 추가한다. 세 FK는 Todo 4의 foundation/source table에 즉시 연결한다. trigger는 gta-v2 pending/final row에 matching forecast manifest+theme child를 필수로 하되 legacy v1은 null을 허용한다. pending insert는 반드시 `scientific_use_status='exploratory_only', scientific_use_reason='pending_gta_v2'`다. exact-five/spec/source/cutoff와 `past_mean>0` 계약을 모두 검증한 finalizer RPC만 같은 transaction에서 `pending→final`과 `confirmatory_eligible/'gta_v2_exact_contract'`를 설정할 수 있다. `past_mean=0`은 exact `zero_denominator`로 excluded하고, 양수 `past_mean`에 `4` 같은 absolute floor를 두거나 future maximum에 따라 eligibility를 바꾸지 않는다. `excluded`는 계속 exploratory-only이고 reason을 exact exclusion code로 남긴다. status/reason 직접 수정, terminal 재판정은 금지한다. finalizer는 forecast theme input의 frozen keyword group으로 dedicated 한 response의 exact 5+5를 만들며 current keyword/response stitch/post-cutoff censor를 금지한다. cycle이 없어도 foundation labels를 생성하고 v1 row는 보존한다.
  Parallelization: Wave 1 | Blocked by: 5,6 | Blocks: 8-17
  References: `lib/tli/labels/gt-a.ts`; `scripts/tli/labels/label-gt-a.ts`; `scripts/tli/labels/daily-label-phase.ts`; `supabase/migrations/033_create_theme_labels.sql`; `supabase/migrations/034_fix_theme_labels_gt_b_final_check.sql`; `lib/tli/trading-calendar.ts`.
  Acceptance criteria: final v2는 exact 5+5, 동일 response/run, theme-input keyword/hash, source max gate와 세 FK를 만족하고 `past_mean>0`일 때만 confirmatory eligible이다. pending, source-gap/zero-denominator/spec excluded, v1은 exploratory-only다. 양수지만 4 미만인 denominator도 eligible이고 임의의 양수 scale multiplier 전후 eligibility와 target bytes가 같다. gta-v2 null/wrong-date/wrong-theme manifest, wrong run, direct scientific-status update는 거부된다. cycle 0 + 26 foundation Monday fixture가 label 가능하지만 현재 keyword/history 소급 생성은 불가하다. forecast 뒤 변경에도 frozen group을 쓰며 censor 0이고 grace/terminal immutability가 유지된다.
  QA scenarios: happy exact 5+5/frozen-keyword finalizer와 ratio 1.10→positive, future mean 0→`g_log_ratio=-1.5`, 양수 denominator 3.999, 동일 10개 값에 `c∈{0.01,100}`을 곱한 scale-invariance golden; failure ratio 1.099999→negative, past 5개 all-zero→`zero_denominator`, absolute-floor 재도입, future maximum만 바꿔 eligibility를 바꾸는 구현, log threshold 0.10 대체, grace boundary, mixed response/current keyword/missing spec/post-cutoff censor attempt가 각각 지정 결과를 낸다. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-7/`.
  Commit: Y | `feat(tli): introduce exact-five gta-v2 labels`

- [ ] 8. keyset pagination과 content-addressed dataset manifest를 구현한다
  What to do / Must NOT do: offset/range pagination을 `(base_date,theme_id,id)` stable keyset 또는 동일 계약의 DB RPC로 교체한다. loader input은 pre-outcome `study_contract_id`; 그 study의 origin binding이 있는 row만 읽는다. `gt_a`, `gta-v2`, horizon 5, final, `scientific_use_status='confirmatory_eligible'`, `scientific_use_reason='gta_v2_exact_contract'`, rescale false, non-null outcome, `finalized_at <= as_of_cutoff`, joined label source run `completed_at <= as_of_cutoff`를 모두 필터한다. study/forecast manifest와 source provenance를 join해 canonical row sort/serialization SHA-256, query contract, cutoff, study ID/SHA, counts, versions, snapshot ids를 manifest에 저장한다. 다른 study origin을 섞거나 row count만으로 통과시키지 않는다.
  Parallelization: Wave 2 | Blocked by: 7 | Blocks: 9-11
  References: `scripts/tli/learn/offline-eval-data.ts:62-160`; `scripts/tli/learn/offline-eval-window.ts`; `scripts/tli/shared/supabase-batch.ts`; `supabase/migrations/043_tli_hot_query_indexes_and_bridge_lockdown.sql`.
  Acceptance criteria: 같은 study ID와 immutable cutoff를 3회 load한 ordered row bytes와 hash가 동일하다. 31,297+ row synthetic fixture에서 duplicate/missing key 0이고 manifest의 모든 row가 exact study SHA를 가진다. 중간 insert가 cutoff 밖이면 hash 불변, cutoff 안 mutation은 DB trigger가 거부한다.
  QA scenarios: happy runtime driver 3회 hash equality; failure mixed study IDs, post-outcome study lock, exploratory v1/v2, excluded/pending, reason mismatch, late final/source, unordered pagination fixture가 각각 dataset 배제 또는 explicit failure를 증명. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-8/`.
  Commit: Y | `fix(tli): make training datasets content deterministic`

- [ ] 9. PIT·calendar·freshness-aware confirmatory feature builder를 만든다
  What to do / Must NOT do: `tli-attention-v2-f1` 별도 feature names와 builder를 추가한다. builder input은 exact `study_origin_manifest_id`; 여기서 immutable study contract와 universal forecast manifest를 함께 resolve하며 cutoff는 forecast base date 18:00 KST다. interest는 forecast theme input에 고정된 **단일** complete run의 20거래일만, news는 ordered observation ids 14개만 읽고, B-Abl은 study theme input의 optional row가 pre-outcome lock의 algorithm/spec/horizon과 source-selected pool을 만족할 때만 쓴다. cycle이나 runtime latest row를 참조해 tuple/input을 다시 고르지 않는다. 모든 시계열을 한국 거래일에 reindex해 gap을 null로 보존하고 study/forecast/source ids/age/hashes를 output에 넣는다. confirmatory feature 10개와 missing flags만 허용하고 level/basket/episode/market을 제외한다. batch loader는 study+forecast manifest를 한 번 읽고 theme별 pure assembly를 호출한다.
  Parallelization: Wave 2 | Blocked by: 7,8 | Blocks: 10-11,13
  References: `lib/tli/features/build-features.ts`; `scripts/tli/features/load-feature-inputs.ts`; `scripts/tli/comparison/theme-predictions-v3.ts:145-222`; `lib/tli/trading-calendar.ts`.
  Acceptance criteria: gap fixture에서 관측을 연속일로 압축하지 않는다. manifest 생성 뒤 cutoff 이하처럼 보이는 late/backfill row와 cutoff+1초 source를 추가해도 vector/hash 불변이다. 서로 다른 scale의 두 DataLab run이 있어도 frozen run의 20일만 쓰며 stitched vector 0이다. news ids 순서/개수/hash mismatch, interest age >1, history <20은 abstain이다. B-Abl study-lock mismatch는 value 0 + missing flag이며 단독 abstain 사유가 아니다. builder output의 study ID/SHA가 dataset, 모든 outer fold, power, full fit과 cycle에서 같다. 193-theme fixture에서 DB query count가 O(1) batch다. [CTO 해석 2026-07-11: 테마 수에 대한 anti-N+1을 의미하며, page-bounded keyset 스케일링은 허용 — 근거·실측은 docs 외 evidence의 cto-decision-o1-interpretation.md. 2026-07-13 Isaac 위임 확인으로 확정]
  QA scenarios: happy forecast→study-origin manifest→pure builder golden vector + batch integration; failure builder에 forecast ID만 전달, runtime/cycle tuple 선택, mixed-study fold, latest-row reselection sentinel, mixed-scale stitch, future/late-backfill row, missing/stale interest, missing-vs-zero news, wrong B-Abl lock/pool이 각각 지정된 failure/immutable result/abstain/missing을 낸다. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-9/`.
  Commit: Y | `feat(tli): build point-in-time attention features`

- [x] 10. baseline을 올바른 확률·train-only 계약으로 교체한다
  What to do / Must NOT do: 방향이 뒤집힌 M0와 B-Abl hard 0/1을 retire한다. input은 dataset의 immutable study-contract ID/SHA이며 primary와 세 secondary를 위 exact train-only strata/window/model 계약으로 구현한다. B-Abl algorithm/spec/horizon/pool rule은 study lock에서만 받고 fold/OOS outcome으로 선택하지 않는다. 각 outer fold와 prospective cycle에서 study ID/SHA가 포함된 primary artifact/hash를 저장하고 secondary는 diagnostic으로 분리한다. test prevalence를 사용하지 않는다.
  Parallelization: Wave 2 | Blocked by: 9 | Blocks: 11,13-17
  References: `lib/tli/model/baselines.ts`; `lib/tli/__tests__/baselines.test.ts`; `scripts/tli/learn/offline-eval.ts:94-204`; `docs/prd/PRD-tli-v3-rebuild.md`의 T-202는 superseded 대상.
  Acceptance criteria: four-strata primary와 three-strata persistence가 exact Jeffreys golden 값을 내고 missing/unseen은 지정 global fallback을 쓴다. climatology는 직전 최대 26 origin만 쓴다. test labels 또는 candidate pool coverage를 변경해도 study lock과 fitted train artifact는 불변이고 probability는 `(0,1)`이다. secondary 결과와 mixed-study input을 gate schema가 거부한다.
  QA scenarios: happy fixed-study phase/persistence/climatology/2-feature golden cases; failure OOS-best B-Abl tuple 선택, mixed-study fold, reversed-M0, 27번째 과거 origin 포함, test-prevalence leakage, secondary-as-primary mutation이 실패. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-10/`.
  Commit: Y | `fix(tli): replace invalid scientific baselines`

- [ ] 11. leakage-free training·calibration·walk-forward·통계 추론을 구현한다
  What to do / Must NOT do: 한 study-contract ID/SHA로 고정된 dataset에서 이 문서의 13-origin initial train, one-origin expanding outer fold, `K=min(8,N-8)` inner/OOF split을 그대로 구현한다. outer fold마다 median/MAD, imputation, C 선택을 train 내부에서 fit한다. train fold/replicate/full fit의 연속형 slot 하나라도 finite observed value가 0개면 그 fit은 artifact 없이 hard fail하고 임의 0·전역 통계로 대체하지 않는다. 선택된 C의 inner time-block OOF margin으로 exact Platt를 fit하고 in-sample margin fit을 금지한다. estimator/calibrator는 이 문서의 exact `lbfgs` configuration만 허용하고 수렴·class-floor 실패를 숨기지 않는다. 모든 outer/inner/OOF train row는 `max(future_dates) < test origin date AND label.finalized_at <= test forecast cutoff AND label_source_run.completed_at <= test forecast cutoff`를 만족해야 하며 global dataset load 시점의 availability로 대신하지 않는다. continuous `g` IC와 binary metric을 분리한다. 같은 study lock의 primary paired delta에 10,000회 deterministic two-way theme × 2-week-block bootstrap/power를 구현하고 artifact마다 study ID/SHA를 넣는다. repeated look은 final 한 번만 허용한다.
  Parallelization: Wave 2 | Blocked by: 8-10 | Blocks: 12-17
  References: `scripts/tli/learn/train_m1.py:330-430`; `scripts/tli/learn/m1_calibration.py`; `scripts/tli/learn/m1_calibration_selection.py`; `lib/tli/eval/walk-forward.ts`; `lib/tli/eval/bootstrap.ts`; `lib/tli/eval/metrics.ts`; `scripts/tli/learn/offline-eval.ts`.
  Acceptance criteria: 한 study의 26-origin fixture가 정확히 13개 outer test fold를 만들고 N=13/26에서 inner K가 5/8이다. outer test 값이나 다른 B-Abl study 결과를 임의 변경해도 해당 fold study/preprocessing/C/calibrator/split hash가 불변이다. missing flag는 scale되지 않고, zero-finite train slot·OOF class floor 미달·수렴 실패는 model artifact 없이 hard fail한다. train future date가 test origin과 같거나 늦은 row, source는 끝났지만 label finalized가 cutoff 뒤인 row, final label이 있어도 source completed가 cutoff 뒤인 row가 각각 train에서 제외된다. IC는 `g_log_ratio`를 사용한다. same seed bootstrap bytes는 동일하고 theme/date 의존 fixture에서 naive CI보다 넓거나 같은 보수적 CI를 낸다. interval ensemble은 deterministic first-admissible attempt로 정확히 500개를 만들고 attempt ledger/hash가 재실행에서 byte-identical하다.
  QA scenarios: happy 26-origin split golden + synthetic known-signal driver가 positive skill을 회복하고 interval replicate의 attempt 0 support failure→attempt 1 acceptance가 두 실행에서 동일하다; failure shuffled/no-signal driver는 false promotion을 내지 않고, 25-origin start, K<5, 한 연속형 slot이 전부 missing인 train/replicate/full-fit, OOF minority<30, 1,024 attempts 모두 inadmissible, attempt cap/순서 변경, in-sample calibration, overlapping future-date, late finalized_at, late source completed_at, leakage sentinel fixtures가 contract test에서 차단된다. Python/TS parity golden artifact 포함. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-11/`.
  Commit: Y | `feat(tli): enforce leakage-free temporal evaluation`

- [ ] 12. immutable `experiment_cycle`과 prediction provenance schema를 만든다
  What to do / Must NOT do: `supabase/migrations/049_tli_experiment_cycles.sql`을 만든다. `tli_experiment_cycles`는 `id UUID PK`, exact status CHECK, `study_contract_id UUID FK`, `study_contract_sha256 TEXT`, `candidate_model_version TEXT`, `candidate_model_sha256 TEXT`, `comparator_version TEXT`, `comparator_artifact_sha256 TEXT`, `dataset_manifest_sha256 TEXT`, `feature_contract_version TEXT`, `feature_contract_sha256 TEXT`, `labeler_version TEXT`, `label_contract_sha256 TEXT`, `calibration_version TEXT`, `calibration_artifact_sha256 TEXT`, `babl_contract_sha256 TEXT`, `primary_endpoint TEXT CHECK(primary_endpoint='paired_brier_delta')`, `alpha NUMERIC CHECK(alpha=0.01)`, `thresholds JSONB`, `power_simulation_sha256 TEXT`, `power_simulation_result JSONB`, `planned_origins INTEGER CHECK(planned_origins BETWEEN 16 AND 52)`, `safety_origins INTEGER CHECK(safety_origins=8)`, `calendar_start DATE`, `initial_calendar_end DATE`, `frozen_at TIMESTAMPTZ`, `running_at TIMESTAMPTZ`, `safety_checked_at TIMESTAMPTZ`, `decision_at TIMESTAMPTZ`, `decision_origin_date DATE`, `promoted_internal_at TIMESTAMPTZ`, `public_approved_at TIMESTAMPTZ`, `preregistration_sha256 TEXT`, `preregistration_payload JSONB`를 가진다. draft에서는 contract field가 nullable일 수 있지만 `freeze_tli_cycle`은 모두 non-null이고 모든 SHA가 lowercase 64-hex인지 검증한다. freeze는 dataset/model/comparator/power manifest의 study ID/SHA가 exact 같은지 확인하며 새 B-Abl tuple 선택을 받지 않는다.

  `tli_cycle_calendar_extensions`는 `id UUID PK`, `cycle_id UUID NOT NULL FK ON DELETE RESTRICT`, `previous_end DATE NOT NULL`, `new_end DATE NOT NULL`, `reason_code TEXT NOT NULL CHECK(reason_code IN ('source_maturity_delay','market_calendar_delay','operational_outage'))`, `evidence_artifact_id UUID NOT NULL FK UNIQUE ON DELETE RESTRICT`, `evidence_sha256 TEXT NOT NULL CHECK(lowercase 64-hex)`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `UNIQUE(cycle_id,new_end)`를 가진 append-only table이다. effective end는 `COALESCE(MAX(new_end),initial_calendar_end)`로만 계산한다. service-role `extend_tli_cycle_calendar`만 cycle lock 아래 `status='running'`, final decision 없음, sequence 1..planned가 아직 모두 eligible이 아님, `previous_end=현재 effective end`, `new_end>previous_end`, same planned count/hash bundle인 경우 canonical `calendar_extension` Git artifact+attestation과 extension row를 한 transaction에 넣는다. cycle row, cycle-manifest SHA, planned count, model/contract hash는 갱신하지 않는다.

  `tli_experiment_origin_manifests`는 `id UUID PK`, `cycle_id UUID FK`, `study_origin_manifest_id UUID FK`, `forecast_origin_manifest_id UUID FK`, `sequence_no INTEGER NOT NULL CHECK(sequence_no>0)`, `enrollment_role TEXT NOT NULL CHECK(enrollment_role IN ('confirmatory','predecision_diagnostic','public_canary','prepublic_diagnostic','monitoring'))`, `public_canary_no SMALLINT NULL CHECK(public_canary_no BETWEEN 1 AND 4)`, `candidate_model_sha256 TEXT`, `comparator_artifact_sha256 TEXT`, KOSPI provenance/regime, `created_at TIMESTAMPTZ`를 가진다. `public_canary_no`는 role이 `public_canary`일 때만, 그리고 반드시 non-null이며 다른 role은 null이다. cycle+study-origin, cycle+forecast, cycle+sequence, cycle+non-null canary ordinal을 unique로 하고 update/delete를 거부한다. study-origin은 forecast FK와 cycle study ID/SHA가 같아야 한다.

  `enroll_tli_origin`만 cycle advisory lock 아래 exact status와 foundation cutoff를 검증해 다음 sequence/role/canary를 원자적으로 부여한다. `running`: next sequence≤planned이면 `confirmatory`, 초과면 `predecision_diagnostic`, canary null. `promoted_internal`: cutoff가 `promoted_internal_at` 뒤이고 기존 `public_canary`가 0..3개면 다음 ordinal의 `public_canary`, 이미 4개면 `prepublic_diagnostic`/null. `public_approved`: cutoff가 `public_approved_at` 뒤이면 `monitoring`/null. 나머지 status는 전부 거부한다. 같은 forecast/study-origin은 서로 다른 public champion cycle과 active challenger cycle에 각각 enroll 가능하지만 한 cycle에는 한 번뿐이다. 이 1단계는 prediction을 만들지 않는다. trusted orchestrator는 experiment+study+forecast row를 `origin-manifest-v1` canonical payload로 render·Git commit·verify한 뒤 `attest_tli_origin`을 호출한다. 이 RPC는 payload의 ids/study/role/sequence/canary/universe/keyword/input/model/comparator/KOSPI/regime hash를 DB와 대조하고 ISO origin-date key의 origin artifact+attestation을 insert한다. prediction trigger는 matching artifact+attestation이 없으면 거부한다. attestation 실패 origin을 삭제·교체·건너뛰지 않는다.

  `theme_predictions_v3`의 기존 `labeler_version TEXT NOT NULL`과 `model_version TEXT NOT NULL`은 재사용하고 column을 다시 만들지 않는다. 새로 `experiment_cycle_id UUID FK`, `experiment_origin_manifest_id UUID FK`, `scientific_prediction_role TEXT NULL CHECK(scientific_prediction_role IN ('candidate','comparator'))`, `model_artifact_sha256 TEXT`, `feature_contract_hash TEXT`, `feature_snapshot_hash TEXT`, `forecast_cutoff TIMESTAMPTZ`, `forecast_origin_week DATE`, `actual_label_id UUID NULL FK ON DELETE RESTRICT`, `score_payload_sha256 TEXT NULL`, `score_exclusion_reason TEXT NULL`을 추가한다. migration은 기존 table-level `UNIQUE(theme_id,prediction_date,horizon_days,model_version)` constraint를 drop하고, legacy용 `UNIQUE(theme_id,prediction_date,horizon_days,model_version) WHERE experiment_cycle_id IS NULL` partial index와 scientific용 `UNIQUE(experiment_cycle_id,experiment_origin_manifest_id,theme_id,prediction_date,horizon_days,scientific_prediction_role) WHERE experiment_cycle_id IS NOT NULL` partial index로 분리한다. CHECK/trigger는 cycle/origin/role 세 field가 모두 null이거나 모두 non-null이어야 하고 scientific row의 lowercase 64-hex model artifact SHA를 요구한다. origin이 cycle에 속하며 role `candidate`의 version/SHA는 cycle `candidate_model_version/candidate_model_sha256`, `comparator`는 `comparator_version/comparator_artifact_sha256`와 exact 일치해야 한다. 따라서 같은 Monday/theme/comparator version도 public champion cycle과 새 challenger cycle에 각각 한 row를 가질 수 있지만 동일 cycle/role duplicate는 불가능하다.

  scientific insert는 compatibility-only `serving_role='shadow'`, `score_status='pending'`이고 `actual_g,actual_y,actual_label_id,score_payload_sha256,score_exclusion_reason,scored_at`이 모두 null이어야 한다. scientific serving authority는 immutable prediction row의 `serving_role`이 아니라 registry의 exact champion cycle/model과 `scientific_prediction_role='candidate'` join이다. 따라서 기존 `uniq_predictions_v3_champion`은 legacy row에만 실질 적용되고 scientific promotion 때 prediction row를 수정하지 않는다. DB trigger는 scientific row DELETE를 항상 거부하고 UPDATE에서는 `id,theme_id,prediction_date,horizon_days,serving_role,p_rise,ci_lower,ci_upper,abstain,abstain_reasons,features,model_version,labeler_version,param_version,experiment_cycle_id,experiment_origin_manifest_id,scientific_prediction_role,model_artifact_sha256,feature_contract_hash,feature_snapshot_hash,forecast_cutoff,forecast_origin_week,created_at`의 `IS DISTINCT FROM` 변경을 모두 거부한다. service-role도 direct UPDATE/DELETE를 revoke하고 `finalize_tli_scientific_prediction_score` SECURITY DEFINER RPC만 row lock 아래 단 한 번 `pending→scored|excluded`를 허용한다. `scored`는 exact final `gta-v2` label FK, finite `actual_g`, non-null `actual_y`, lowercase canonical score SHA, null exclusion reason, non-null `scored_at`을 원자적으로 설정한다. `excluded`는 exact terminal excluded label FK, null `actual_g/actual_y`, exact exclusion reason/SHA, non-null `scored_at`을 설정한다. scientific `censored`, terminal→terminal, outcome/provenance 개별 수정은 금지하며 terminal row는 모든 field가 영구 불변이다. legacy row의 기존 scoring 동작은 별도 legacy path로 유지한다.

  Todo 1에서 이미 추가한 `model_registry.experiment_cycle_id` column에는 이 migration에서 `tli_experiment_cycles(id) ON DELETE RESTRICT` FK와 UNIQUE constraint만 추가하고 column을 다시 만들지 않는다. 기존 one-challenger/one-champion partial unique를 유지한다. `CREATE UNIQUE INDEX uniq_tli_active_cycle ON tli_experiment_cycles ((true)) WHERE status IN ('frozen','running','ready_for_decision','promoted_internal')`로 서로 다른 cycle의 concurrent freeze/start도 막는다. prediction trigger는 experiment→study→forecast manifest와 prediction universe/theme/date/cutoff를 검증한다. label foundation FK는 Todo 7 것을 유지하고 scorer는 prediction experiment의 forecast FK와 label FK가 같아야 한다.

  `tli_model_release_events(id UUID PK,model_registry_id UUID FK,cycle_id UUID FK,from_status TEXT,to_status TEXT,reason_code TEXT,evidence_sha256 TEXT,created_at TIMESTAMPTZ)`는 append-only다. `tli_evidence_artifacts`는 정확히 `id UUID PK`, `cycle_id UUID NOT NULL FK ON DELETE RESTRICT`, `experiment_origin_manifest_id UUID NULL FK ON DELETE RESTRICT`, `artifact_type TEXT NOT NULL CHECK(artifact_type IN ('preregistration','dataset_manifest','model_manifest','cycle_manifest','origin_manifest','calendar_extension','safety_report','final_decision','public_canary','monitoring_hold','monitoring_resume'))`, `artifact_key TEXT NOT NULL`, `content_sha256 TEXT NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$')`, `payload JSONB NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `UNIQUE(cycle_id,artifact_type,artifact_key)`를 가진다. `origin_manifest/public_canary`만 non-null experiment-origin FK를 요구하고 그 외 type은 null을 요구하며, 두 origin type에는 `(cycle_id,artifact_type,experiment_origin_manifest_id)` partial UNIQUE도 둔다. `tli_evidence_attestations`는 정확히 `id UUID PK`, `artifact_id UUID NOT NULL FK UNIQUE ON DELETE RESTRICT`, `git_commit_sha TEXT NOT NULL`, `git_blob_sha TEXT NOT NULL`, `repo_relative_path TEXT NOT NULL`, `content_sha256 TEXT NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$')`, `verifier_version TEXT NOT NULL`, `verifier_code_sha TEXT NOT NULL`, `verified_at TIMESTAMPTZ NOT NULL`를 가진다. 두 evidence table은 update/delete 거부 trigger, RLS enable, service-role-only policy와 public/authenticated execute·DML revoke를 적용하며 attestation content SHA는 artifact SHA와 같아야 한다. path는 `docs/evidence/tli-v3-scientific-rebuild/<cycle-id>/` 아래 canonical file만 허용한다. singleton key는 `singleton`, origin/canary와 calendar extension key는 ISO date, monitoring key는 release-event UUID다.

  state transition RPC는 정확히 `freeze_tli_cycle`, `start_tli_cycle`, `record_tli_safety_decision`, `record_tli_final_decision`, `promote_tli_internal`, `record_tli_canary_failure`, `release_tli_public`, `hold_tli_public_release`, `resume_tli_public_release`다. evidence-only RPC는 `attest_tli_origin`, calendar-only RPC는 `extend_tli_cycle_calendar`다. 위 edge와 same-transaction evidence/attestation/registry/release side effect만 허용한다. `start_tli_cycle`은 model-manifest hash와 같은 candidate row를 정확히 한 번 insert하고 기존 challenger를 자동 교체하지 않는다. reject/safety는 linked row를 archive하고 internal은 challenger를 유지하며 public에서만 champion swap한다. running 뒤 contract mutation은 모두 금지하고 effective end만 위 append-only event로 제한적으로 늦춘다.
  Parallelization: Wave 3 | Blocked by: 2,6,11 | Blocks: 13-17
  References: `supabase/migrations/035_create_theme_predictions_v3.sql`; `supabase/migrations/036_create_model_registry.sql`; `supabase/migrations/040_fix_model_registry_challenger_rpc_ambiguity.sql`; `scripts/tli/learn/model-registry.ts`; `lib/tli/predictions-v3-contract.ts`.
  Acceptance criteria: exact graph과 registry lifecycle을 만족한다. active challenger cycle은 최대 1개고 cycle당 registry row는 1개다. 같은 foundation을 public champion monitoring cycle과 active challenger cycle에 동시 enroll해 각 cycle candidate/comparator 2행이 충돌 없이 생기며, 동일 cycle/origin/role duplicate는 거부된다. running planned/diagnostic, promoted first-four/prepublic, public monitoring role·sequence·canary가 exact하고 terminal status enrollment는 0이다. enroll 뒤 matching origin artifact+attestation 전 prediction은 0개다. study/role/origin payload와 DB/hash가 같고 duplicate/tampered/missing attestation이 거부된다. scientific prediction의 inference/provenance update와 delete는 0건이고 exact RPC의 pending→terminal 한 번만 성공하며 그 뒤 row bytes가 불변이다. exact evidence columns/FK/unique/RLS/revoke/immutability가 contract test를 통과한다. calendar extension 전후 cycle row와 cycle-manifest/model/contract/planned hash bytes는 같고 effective end와 append-only event/evidence만 증가한다. final RPC는 passing safety artifact+attestation와 `safety_checked_at` 없이는 실행되지 않는다. internal/public/reject/safety 원자성, foundation FK/scoring/immutability도 유지된다.
  QA scenarios: happy forecast+study-origin→cycle/start→running planned/diagnostic enroll→attest/predict→exact-label scoring RPC→calendar-extension→safety/final→internal first-four/prepublic→public monitoring을 실행하고, 동시에 기존 public champion+새 running challenger가 같은 foundation/comparator version을 저장한다. failure mixed study, existing challenger/cycle race, two concurrent freeze/start, stale auto-replace, terminal/ready enrollment, wrong role/canary/time boundary, same-cycle scientific duplicate, legacy/scientific null 혼합, non-pending scientific insert, unattested prediction, origin artifact tamper, DB payload mismatch, wrong foundation link, sequence race/N+1 substitution, direct `p_rise`/interval/features/hash/role/outcome update, scientific delete, duplicate score, terminal rewrite, censored scientific score, wrong label FK/hash, duplicate/tampered evidence, direct evidence mutation, extension의 wrong previous end/non-increasing end/hash·planned 변경/final 뒤 호출, **all N labels가 있어도 safety 전 final**, state skip, prediction-label FK mismatch, 3-canary release를 rollback한다. final reject/canary fail이 linked candidate만 archive하는지도 실행한다. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-12/`.
  Commit: Y | `feat(tli): freeze prospective experiment cycles`

- [ ] 13. prediction scoring을 version-exact·complete·fail-closed로 만든다
  What to do / Must NOT do: scorer는 한 experiment cycle/origin에서 role `candidate`와 `comparator`를 각각 정확히 한 행 요구하고 prediction과 label의 theme/base-date/horizon/labeler-version exact key를 맞춘다. `prediction.experiment_origin_manifest_id → experiment.forecast_origin_manifest_id == label.forecast_origin_manifest_id`와 experiment study-origin/cycle study 일치를 필수로 한다. matching origin artifact+attestation과 role별 model/feature/cutoff hash도 검증한다. 다른 cycle의 동일 theme/date/model-version row를 결합하지 않는다. match 0/복수, version/role 없는 join, null actual은 score하지 않고 run을 fail한다. exact label과 canonical scoring payload를 만든 뒤 Todo 12의 RPC로만 candidate/comparator 각각을 한 번 terminal 처리한다. theme 오류가 하나라도 있으면 partial이며 completeness<99%면 gate input을 만들지 않는다. interval은 outcome 전 insert 시점에 frozen exact 500-model ensemble로만 만들고 origin별 재학습, 사후 수정, 대체 interval을 금지한다.
  Parallelization: Wave 3 | Blocked by: 10-12 | Blocks: 14-17
  References: `scripts/tli/comparison/theme-predictions-v3.ts:152-222`; `scripts/tli/comparison/theme-predictions-v3-scoring.ts:102-243`; `scripts/tli/learn/gate-input-from-db.ts:10-118`; `scripts/tli/comparison/theme-predictions-v3-records.ts`; `lib/tli/predictions-v3-contract.ts`.
  Acceptance criteria: v1/v2 공존 시 v2만 score한다. public champion과 challenger의 same theme/date/comparator version row가 함께 있어도 requested cycle의 candidate/comparator만 exact pair가 된다. exact label 또는 role 0/복수, study/forecast FK mismatch, unattested origin은 score 0/run fail이다. null outcome은 음성이 아니다. scoring 성공 뒤 exact label FK/SHA/outcome/time만 채워지고 inference/provenance bytes는 insert 시점과 같으며 두 번째 score는 거부된다. partial completeness가 명시되고 gate input이 실패한다. non-abstain interval completeness 100%, `0≤lower≤p≤upper≤1`, prediction/interval timestamp/hash는 label finalization 전이다.
  QA scenarios: happy mixed-version+two-cycle DB fixture exact cycle/role join과 pending→scored/excluded one-shot RPC; failure cross-cycle comparator capture, zero/duplicate role, zero/duplicate exact label, null actual_y, wrong study/version, scoring SHA mismatch, direct outcome update, second score, terminal rewrite, one-theme scorer exception, missing interval fixture가 mutation 또는 promotion input을 차단. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-13/`.
  Commit: Y | `fix(tli): score prospective predictions by frozen contract`

- [ ] 14. 8/planned-origin 고정 lifecycle과 promotion gate를 구현한다
  What to do / Must NOT do: checkpoint는 immutable sequence로만 계산한다. sequence 1..8이 모두 eligible일 때 safety를 한 번 평가·attest하고, 그 passing artifact와 `safety_checked_at`이 존재하며 sequence 1..planned도 모두 eligible일 때만 final을 한 번 평가한다. 8 origin에서는 calibration catastrophe와 critical incident만 보고 promote action을 만들지 않는다. planned set 전에는 `insufficient_origins`로 관찰하며 N+1로 빈 sequence를 대체하지 않는다. final에서만 exact paired/ECE/P@10/regime/primary gate를 적용한다. final fail은 reject이고 extension/재학습을 금지한다. 모든 input/hash/bootstrap/gate reason을 machine-readable artifact에 남긴다.
  Parallelization: Wave 3 | Blocked by: 12,13 | Blocks: 15-17
  References: `scripts/tli/learn/promotion-gate.ts`; `scripts/tli/learn/gate-input-from-db.ts`; `scripts/tli/learn/run-weekly-learn.ts`; `.github/workflows/tli-weekly-learn.yml`; `scripts/tli/learn/__tests__/promotion-gate.test.ts`.
  Acceptance criteria: planned=16 fixture에서 7/8/15 origin은 promote 불가, 8은 safety-only, 16 passing은 would-promote, 16 one-gate-fail은 keep/reject다. planned=24 fixture는 23에서 불가하고 24에서만 판정한다. holiday Monday 없는 주는 origin으로 세지 않는다. calendar extension 뒤에도 cycle row/manifest/model hash/planned count와 registry challenger는 byte-identical하고 effective end/event count만 변한다. gate evaluation invocation은 final 1회뿐이다. ECE는 fixed 10-bin + two-way bootstrap, P@10은 theme-id tie break/최소 표본, regime은 지정 KOSPI threshold/최소 slice를 사용하며 theme-only bootstrap은 contract test에서 거부된다.
  QA scenarios: happy planned=16과 planned=24 safety→final fixtures; failure safety artifact/attestation 없이 N labels batch 완료, 8-origin efficacy-positive, preplanned-count, nonfinite probability, pooled Brier/ECE catastrophe, final ECE/P@10/regime/incomplete/hash/bootstrap 위반이 지정된 hold/reject/no-promotion을 낸다. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-14/`.
  Commit: Y | `feat(tli): enforce frozen prospective promotion gates`

- [ ] 15. end-to-end dry-run과 retrospective engineering gate를 통과시킨다
  What to do / Must NOT do: pre-outcome study lock → clean forecast/study-origin snapshots → gta-v2 → single-study dataset hash → feature snapshot → train → evaluate → cycle freeze → role-scoped predict → label → score → gate를 fixture/local stack에서 한 번 관통한다. 같은 cutoff 두 번의 manifest/hash가 동일해야 한다. no-signal synthetic과 missing-source path도 실제 CLI로 실행한다. 기존 invalid data나 outcome-selected B-Abl contract로 좋은 metric을 만드는 것을 성공으로 보지 않는다.
  Parallelization: Wave 3 | Blocked by: 12-14 | Blocks: 16-17
  References: `package.json` TLI scripts; `scripts/tli/batch/collect-and-score.ts`; `scripts/tli/learn/run-offline-eval.ts`; `scripts/tli/learn/run-weekly-learn.ts`; Todo 4-14 artifacts.
  Acceptance criteria: full happy fixture exit 0, duplicate/missing 0, exact-five 100%, hash repeat equality, future leakage sentinel 0, v1 mix 0, coverage/completeness metrics present. no-signal fixture no-promotion, missing snapshot fixture fail-closed. test/build/lint/type gates green.
  QA scenarios: happy one-command local driver + output JSON; failure three separate bad fixtures executed, each expected nonzero or explicit no-go code. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-15/`.
  Commit: Y | `test(tli): certify scientific rebuild end to end`

- [ ] 16. clean history가 충분할 때 한 개의 candidate cycle을 사전등록·시작한다
  What to do / Must NOT do: OOS outcome 이전부터 존재한 **한 study-contract ID/SHA**의 최소 26 distinct clean weekly origins, retrospective OOS exact-paired row 800개 이상, 그 OOS positive y=1 100개 이상, duplicate 0, critical incident 0을 먼저 확인한다. 이 시점에 B-Abl algorithm/spec/horizon/pool rule을 선택·변경하지 않는다. 통과 즉시 client에서 lowercase canonical cycle UUID와 `cycle_seed_base=SHA256(UUID UTF-8 bytes)`를 만들되 DB row는 아직 만들지 않는다. 그 seed로 같은 study의 clean OOS power simulation을 실행해 planned 16~52를 정하며 52에서도 power<80%면 시작하지 않는다. 같은 UUID/study로 full-fit estimator/calibrator와 exact `interval-ensemble-v2` first-admissible 500쌍을 frozen runtime에서 학습한다. preregistration/dataset/model/cycle-manifest canonical bytes 모두에 study ID/SHA를 넣어 tracked evidence에 commit하고 trusted verifier로 Git blob attestation을 만든다. 그 뒤 한 DB transaction에서 같은 UUID의 fully populated draft, 같은 bytes DB artifacts/attestations를 insert하고 `freeze_tli_cycle`을 호출한다. 어느 검증도 실패하면 transaction 전체를 rollback한다. 성공한 frozen cycle에만 별도 `start_tli_cycle`을 호출해 running으로 바꾼다. 기존 a2를 재사용하지 않는다.
  Parallelization: Wave 4 | Blocked by: 3,15 and time/data floor | Blocks: 17
  References: Todo 12 cycle schema; Todo 15 engineering evidence; `docs/tli-v3-early-promotion-preregistration.md`는 history-only; `scripts/tli/learn/train_m1.py`; `scripts/tli/learn/model-registry.ts`.
  Acceptance criteria: preflight가 study lock이 first origin/outcome보다 빠르고 dataset/OOS folds/comparator/power/full fit/cycle의 ID/SHA가 하나임을 먼저 증명한 뒤 26 origins/OOS 800/OOS positive 100/duplicate 0/incident 0과 power≥80%, planned 16..52를 증명한다. interval ensemble은 정확히 500 accepted replicate와 각 0..1023 attempt ledger를 가지며 같은 input 재실행 hash가 같다. frozen hash/training/simulation이 재생되고 네 manifest가 DB/Git/attestation에 byte-identical하다. start 성공 시 linked challenger/unvalidated/blocked가 정확히 1개다. 하나라도 false, active challenger/cycle, ensemble attempt cap exhaustion, power/attestation mismatch면 running/registry insert 0회다.
  QA scenarios: happy fixed-study planned=16 및 planned>16 synthetic fixtures와 deterministic rejected-attempt ledger; failure post-outcome study lock, mixed study IDs, OOS-best tuple substitution, 25 origins, OOS 799, OOS positive 99, full-data positive 100이나 OOS 99, duplicate 1, incident 1, 52-week power<80%, 한 replicate의 1,024 inadmissible attempts가 각각 creation을 거부. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-16/`.
  Commit: Y | `ops(tli): preregister first clean prospective cycle`

- [ ] 17. 8-origin safety와 planned-origin 단일 최종 결정을 수행한다
  What to do / Must NOT do: cycle을 변경 없이 관찰한다. 8 origin에는 safety만, sequence 1..planned 뒤에는 frozen final을 한 번만 생성한다. report는 Git commit→trusted attestation→DB artifact/state RPC 순서다. final pass여도 app/workflow가 `TLI_M1_PROMOTION_ENABLED === 'true'`일 때만 internal RPC를 호출하며 false/unset은 `promotion_disabled`/zero RPC다. internal은 candidate를 challenger/eligible/internal로 바꾸고 기존 public champion serving을 유지한다. 첫 champion이 없으면 API는 empty다. workflow는 status별 `enroll_tli_origin`을 계속 호출해 running의 planned/diagnostic, promoted의 first-four canary/prepublic diagnostic, public champion의 monitoring을 정확히 만든다. 기존 public champion과 새 challenger가 겹치면 동일 foundation을 두 cycle에 각각 enroll하고 role-scoped prediction을 쓴다. internal 뒤 첫 canary 1..4 각각은 interval completeness 100%, expected-universe coverage ≥70%, critical incident 0, candidate probability의 nonfinite/out-of-range 0, exact-paired candidate origin Brier ≤0.35를 만족해야 한다. 네 origin pooled exact-paired ECE는 fixed 10 equal-width bin point ≤0.10, 같은 two-way bootstrap 10,000회 type-7 upper95 ≤0.12여야 한다. 이 exact gate 뒤에만 public RPC가 atomic champion swap하지만 API 출력은 별도로 `TLI_PREDICTIONS_V3_EXPOSURE_ENABLED === 'true'`여야 한다. 하나라도 fail하면 candidate만 archive하고 기존 champion을 보존한다. L4 hold/resume/one-active guard를 구현하며 second look, canary 교체·건너뛰기, final 이후 calendar 연장을 금지한다.
  Parallelization: Wave 4 | Blocked by: 16 and actual label maturity | Blocks: none
  References: Todo 13-16; `scripts/tli/learn/promotion-gate.ts`; `scripts/tli/learn/model-registry.ts`; `app/api/tli/predictions/prediction-loader.ts`; `docs/tli-ops-runbook.md`.
  Acceptance criteria: safety/final evidence와 exact status별 enrollment 계약을 만족한다. promotion flag false/unset이면 final pass도 zero RPC이고 true일 때만 candidate가 challenger/eligible/internal이 된다. first-four 각 origin의 5개 gate와 pooled ECE point/upper95 gate가 모두 exact 통과한 뒤에만 champion/public swap되고, exposure flag false/unset이면 여전히 API empty이며 true+champion+eligible/public에서만 출력된다. public 승인 뒤 monitoring origin이 계속 score되고 새 challenger와 same-date rows가 cycle별 공존한다. canary/final fail은 기존 champion을 보존한다. 운영 hold는 blocked+empty, same-hash resume만 성공한다. concurrent active challenger와 in-place retrain은 거부된다.
  QA scenarios: happy planned=16/planned>16 passing, failing, insufficient fixtures, planned 이후 predecision diagnostic, exact 4-origin canary+prepublic diagnostic, public monitoring, old champion+new challenger same-origin 동시 저장, transient hold/resume를 실제 CLI로 실행; failure terminal enrollment, cycle-scoped unique collision/cross-cycle scoring, cycle hash drift, second-look, 3-canary exposure, canary별 interval/coverage/incident/nonfinite/Brier 각각의 boundary fail, pooled ECE point 0.100001, type-7 upper95 0.120001, canary replacement/skip, nonfinite/low-coverage/rolling-calibration hold, changed-hash resume, second active challenger 시도가 거부됨. 실제 production outcome은 artifact로 보존. Evidence `.omo/evidence/tli-v3-scientific-rebuild/task-17/`.
  Commit: Y | `ops(tli): decide frozen attention forecast cycle`

## Final verification wave
> Runs sequentially F1→F4 after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: 모든 Todo acceptance와 evidence path를 독립 대조하고 Must NOT 위반 0을 확인한다.
- [ ] F2. Code quality/security review: strict types, schema/RLS/immutability, secret redaction, silent failure, query complexity, migration rollback 가능성을 검사한다.
- [ ] F3. Real manual QA: 동일-cutoff double build, missing-source fail-closed, 8-origin no-promote, preplanned-count wait, planned-origin pass/fail CLI를 실제로 실행한다.
- [ ] F4. Scope fidelity: 기존 comparison level-4와 unrelated dirty files diff 0, legacy evidence 보존, GT-B 격리를 확인한다.

RAM 정책: skill 기본 병렬 검증 대신 사용자 지시에 따라 F1→F4를 순차 실행하거나 동일 reviewer를 재사용한다. 판정 기준은 낮추지 않고 동시성만 1로 제한한다. 네 항목 모두 unconditional APPROVE여야 완료다.

## Commit strategy

- Todo별 commit 1개를 기본으로 하며 migration+그 migration contract test는 같은 commit이다.
- 순서: containment → schema → collectors → labels → dataset/features → stats/model → cycle/scoring → workflows/e2e → operations.
- generated runtime logs와 secrets는 commit하지 않는다. `.omo/evidence`는 local QA log로만 쓴다. study contract는 `docs/evidence/tli-v3-scientific-rebuild/studies/<study-id>/`, cycle-scoped preregistration/manifest/calendar-extension/safety/final/public-canary/monitoring은 `docs/evidence/tli-v3-scientific-rebuild/<cycle-id>/`에 redacted canonical artifact로 commit하며 append-only DB의 동일 payload SHA-256와 대조한다.
- unrelated pre-existing changes를 stage하지 않는다. 각 commit 전에 `git diff --cached --name-only`로 scope를 확인한다.
- schema가 배포된 뒤 consumer를 배포하고, consumer 전환 후에도 legacy tables/columns를 drop하지 않는다. destructive cleanup은 별도 승인 범위다.

## Success criteria

### 구현 완료

- Todo 1-15가 완료되고 모든 정적/단위/통합/manual QA가 통과한다.
- study/source→label→dataset→feature→model→cycle/role prediction→score→gate의 모든 객체가 hash와 as-of cutoff로 연결된다.
- 동일 cutoff dataset hash가 반복 실행에서 완전히 일치한다.
- `gta-v2` final row는 exact 5+5/source-arrival/version 계약 100%를 만족한다.
- future leakage, current membership leakage, post-outcome/mixed study, cross-cycle role join, v1/v2 혼합, null-to-false, automatic challenger replacement가 0이다.
- promotion과 exposure는 명시적 flag + frozen-cycle pass 없이는 불가능하다.

### L2 판정

- clean immutable PIT data에서 leakage-free retrospective engineering gate를 통과한다.
- 이 단계의 성능은 후보 선별 근거일 뿐 public prediction claim이 아니다.

### L3 판정

- Todo 16-17의 동일 frozen candidate가 사전 power simulation으로 고정한 최소 16개 이상의 eligible weekly origins와 모든 prospective gate를 실제 통과한다.
- 결과가 fail이면 모델 효능은 기각하고 L2에 남는다. 기준을 바꾸거나 같은 결과를 재탐색해 성공으로 바꾸지 않는다.

### L4 판정

- L3 pass 이후 같은 model의 첫 추가 4개 eligible Monday canary에서 각 origin의 probability interval completeness 100%, expected-universe coverage ≥70%, critical incident 0, candidate probability의 nonfinite/out-of-range 0, exact-paired candidate origin Brier ≤0.35를 모두 만족해야 한다. 네 origin pooled exact-paired ECE는 fixed 10 equal-width bin point ≤0.10이고 같은 theme × 2-week moving-block bootstrap 10,000회, Hyndman-Fan type 7 q0.95 upper95 ≤0.12여야 한다. 교체·건너뛰기 없이 이 gate와 즉시 rollback을 실제 API에서 검증한다.
- 사용자 문구는 “향후 5거래일 관심도 상승 확률”로 한정한다.

### 완료가 아닌 것

- 테스트만 green, 좋은 retrospective metric, 많은 pending prediction, 모델 복잡도 증가, B-Abl보다 예뻐 보이는 chart는 완료 증거가 아니다.
- GT-B는 이 plan의 완료 범위가 아니다. 별도 plan과 검증 전에는 가격·초과수익·투자 알파에 대한 어떤 성공 주장도 완료로 간주하지 않는다.
