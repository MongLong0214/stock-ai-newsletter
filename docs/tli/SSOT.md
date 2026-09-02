# TLI 상태·운영 SSOT

> **TLI의 현재 상태·운영·사건 이력에 대한 단일 진실 문서(single source of truth).**
> 맨땅 세션은 이 파일 하나로 현재 상태와 작업 진입점을 파악한다.
>
> **갱신 규칙**: 상태 변화·사건·계약 변경이 생기면 **새 파일을 만들지 말고 이 문서를 고치고**
> 아래 버전 이력에 한 줄을 추가한 뒤 커밋한다. 날짜 붙은 status 문서 생성은 금지 —
> 그 관행이 만든 3부작(07-07/07-14/07-22)을 이 문서가 흡수·대체했다.
> 세부 버전 관리는 git 이력이 담당한다 (`git log --follow docs/tli/SSOT.md`).

## 버전 이력

| 버전 | 날짜 | 요약 |
|---|---|---|
| v1 | 2026-07-07 | (흡수) 재구축 이전 상태·승격 로드맵 — 재구축으로 전면 대체됨 |
| v2 | 2026-07-14 | (흡수) 재구축 완료 선언, /themes P0 수정, 축적 국면 진입 |
| v3 | 2026-07-22 | (흡수) 제헌절 CI 사고, study lock, gta-v2 배선, B-Abl 활성화 |
| v4 | 2026-07-27 | 문서 통합 개시. PR #104(만기 SSOT)·#105(앵커 척도) 머지, study 시계 1주차 시작, master plan git 이동 |
| **v5** | **2026-07-29** | **Supabase egress 384% 초과 근본 수정** — 배치 feature 로더 per-theme 중복 로드 제거, 봇 방어 미들웨어, 뉴스 30일 보존 정리 |
| **v6** | **2026-09-01** | **검증되지 않은 유사 테마 표면 sunset** — 비교 UI만 숨기고 코드·API·파이프라인·데이터는 보존 |
| **v7** | **2026-09-02** | **전수 심층 리뷰(sol 적대 리뷰 포함) → P0 6건** — 8/10 origin false-clean 사건, origin universe fail-closed + `origin-eligibility-v2`, DataLab quota ledger/reuse/429 non-retry, 09:00 Vercel dispatch, legacy 예측 생성 중단, stale 정정(Pro·icn1·지연 실측) |

## 문서 지도

| 문서 | 역할 | 갱신 |
|---|---|---|
| **이 문서** (`docs/tli/SSOT.md`) | 상태·운영·사건 이력 SSOT | 살아있음 — 변화 시 즉시 |
| [`docs/tli/scientific-rebuild-master-plan.md`](./scientific-rebuild-master-plan.md) | v3 과학 재구축 실행 계약 (**동결**) — Todo 1~17, estimand, 통계 기준 | 동결 — 수정 금지. 2026-07-27 `.omo/plans/`에서 git으로 이동 (SHA-256 `641228fc…76fa`, 바이트 동일) |
| `scripts/tli/README.md` | 코드 트리 런타임 계약 (만기 규칙 등) | 코드와 함께 |
| `docs/tli-anchor-scale-regression-2026-07-26.md` | 앵커 척도 회귀 진단 전문 (사건 6 상세) | 기록 — 동결 |
| `docs/tli-ops-runbook.md`, `docs/prd/PRD-tli-v3-rebuild.md`, 기타 `docs/tli-*` | 역사 기록 (superseded 배너 유지) | 동결 — 참고용 |

과학적 주장·실행 기준은 master plan이 우선한다. 이 문서는 그 계약 아래의 **현재 위치**를 말한다.

---

## 0. 30초 요약 (2026-09-02 기준)

- **study 시계: clean origin 3개 확정(7/27·8/3·8/24) + 8/31 라벨 pending.** 8/10은 universe 붕괴(30/220)로 **ineligible** — 사건 9. #26 도달 예상 **~2027-02-15**(2027-02-08 설날 휴장으로 1주 추가 지연). study contract `tli-attention-study-v1` lock 7/22, first_origin_date=2026-07-27.
- **clean 판정은 CI 그린이 아니라 `origin-eligibility-v2`(§2)다.** roster 기준 usable coverage ≥70% + expected ⊆ roster + (성숙 후) label accounting 100%·source-gap ≤1%. 판정은 `tli_study_origin_eligibility`(append-only)에 기록되고 dataset/평가기는 eligible origin만 읽는다(판정 없는 origin도 제외 — fail-closed).
- **DataLab 1,000/일 한도 운영**: 1 full run = 299 요청. 09:00 Vercel dispatch(`/api/cron/tli-datalab` → `datalab-only`)가 먼저 수집하고 이후 run은 동일 요청을 **재사용**한다(9/2 실측 2회차: 재사용 267 / 재요청 32 — 재요청분은 DataLab에 직전 거래일 데이터가 아직 없는 저볼륨 테마로, 신선도 하한 미달분만 다시 받는 정상 동작). DB ledger 상한 900(env로 낮출 수만 있음), 429는 그 요청을 재시도하지 않고 실패로 기록한다(루프는 계속되며 총량은 ledger가 막는다). **수동 full dispatch는 기본 reuse — `datalab_refresh=force`는 남은 한도 확인 후에만.**
- **TLI v3 재구축 = 완료·배포·축적 국면.** 예측 API는 검증된 champion cycle 전까지 **의도적 empty** (`dataSource:"none"` = 정상). 승격/노출 플래그(`TLI_M1_PROMOTION_ENABLED`·`TLI_M1_REGISTRATION_ENABLED`·`TLI_PREDICTIONS_V3_EXPOSURE_ENABLED`) 전부 미설정 유지.
- **gta-v2 foundation 라벨(step 4.15)·B-Abl phase 수집(step 6.5) 가동 중.** origin·라벨·B-Abl이 매일 자동 축적된다.
- **점수는 anchor 척도로 전환됨** (PR #105, 7/27 머지) — 2026-07-07 앵커 투입이 일으킨 raw_value 스케일 붕괴의 근본 수정. 점수 p50 43→58 전망, visibleThemes 회복 예상.
- **예측 채점 만기 기준 SSOT 통일 + 비거래일 고아 자기치유** (PR #104, 7/27 머지) — 만기 미채점 609→185로 적체 게이트 통과 예상.
- **legacy `theme_predictions_v3` 신규 행 생성 중단**(9/2): champion/challenger가 invalidated/blocked면 행을 만들지 않는다. watchlist canary는 containment(challenger 부재·invalidated·blocked)나 stale 예측이면 리포트 대신 `blocked` JSON + exit 2를 남긴다(실E2E에서 challenger 행 자체가 없어 크래시하던 것을 교정). parity는 0건이어도 정상 JSON + exit 2 warning이며 blocked 아티팩트를 만들지 않는다. 공개 서빙은 scientific 뷰만 읽어 UI 영향 0.
- **인프라 현재값**: Supabase **Pro**(사건 7 당시 Free), DB 약 1.13GB(append-only 단조 증가 — 월간 증가율 P1), Vercel 리전 **`icn1`**(사건 7의 `sin1`은 `99ead71`에서 복귀), GitHub 스케줄 지연 실측 **2~10시간**(자정 spillover 3회 관측). Bot Protection Challenge는 curl류만 걸리고 Googlebot 통과(GSC 실측 9/2).
- **작업 규칙**: TLI 작업 전 master plan Read. 조기 승격·노출 우회는 어떤 이유로도 금지. 코드 변경 위임 정책은 `~/.claude/CLAUDE.md`.

## 1. 무엇을 예측하는가 (estimand 요약)

시점 t 한국 거래일 장마감 후, 그 시점까지 이용 가능했던 데이터만으로 **향후 5거래일 관심도 상승확률** `P(future5_mean / past5_mean ≥ 1.10)`을 예측한다. 가격·수익·투자알파가 아니다(GT-B는 별도, 미착수). denominator 계약은 정확히 `past_mean > 0`, y = `1[ratio ≥ 1.10]`, scale-invariant. 전체 계약은 master plan 참조.

**성숙도 사다리**: L2(누수 없는 retrospective) → L3(전향 16주+ 효능) → L4(제한 공개). 현재 L2 인프라 완비 + 축적 중. L3/L4는 신호가 실제로 존재해야만 도달 — 기준을 바꿔 성공으로 만들지 않는다.

## 2. 축적 시계 — 현재 위치와 캘린더

| 날짜 | origin | usable | study 귀속 | 비고 |
|---|---|---|---|---|
| 2026-07-13 | ✅ | 0 (전량 abstain) | ✗ | 수집 미성숙기. gta-v2 전량 excluded 확정 |
| 2026-07-20 | ✅ | 198 (final 197) | ✗ | 첫 실질 origin. universal 축적 전용 |
| 2026-07-27 | ✅ | 197/221 | **✅ #1** | eligible |
| 2026-08-03 | ✅ | 196/220 | **✅ #2** | eligible |
| **2026-08-10** | ✅(퇴화) | **30/220** | **✗ ineligible** | **사건 9** — 크론 지연으로 수집이 18:00 cutoff에 걸쳐 universe가 30으로 붕괴. manifest·라벨은 보존, study 시계에서만 제외 |
| 2026-08-17 (월) | 스킵 | — | — | 광복절 대체휴일 (`isTradingMonday` 자동 스킵) |
| 2026-08-24 | ✅ | 195/222 | **✅ #3** | eligible |
| 2026-08-31 | ✅ | 194/220 | **✅ #4 (pending)** | 라벨 final 전환 9/8경 → 성숙 후 재판정 |
| 2026-10-05 (월) | 스킵 | — | — | 개천절 대체휴일 — 동일 |
| 2027-02-08 (월) | 스킵 | — | — | 설날 연휴 |
| ~2027-02-15 | — | — | #26 | 26 clean origin 도달 예상 (8/10 제외 반영) |

이후: Todo 16 candidate cycle(사전등록·전향 최소 16주) → L3 판정(~2027 중반) → L4 canary 4주.

- lock은 소급 불가(`locked_at < first_origin_date` RPC 강제) — 7/13·7/20은 universal 축적 전용.
- **"clean" = `origin-eligibility-v2` eligible** (`scripts/tli/origins/origin-eligibility.ts`, 9/2 도입 — 사건 9). 판정 기준(outcome 비참조): ① roster(cutoff 이전 7일 내 complete single-theme DataLab run을 가진 테마, RPC `tli_origin_roster`) 대비 **usable coverage ≥70%** ② expected ⊆ roster ③ 성숙 후(horizon 5 + grace 3 거래일) expected 전 테마 label terminal(final/excluded) 100% + `source_gap_sla` ≤1%. 성숙 기준은 라벨 finalizer와 같은 함수·같은 시각이다 — KOSPI 실측에서 파생한 `deriveGtAV2Windows().graceDeadline`(horizon 뒤 3번째 거래일 **18:00 KST**). 판정은 `tli_study_origin_eligibility`에 append-only 기록, `tli_study_origin_eligibility_latest` 뷰가 최신값. dataset loader·평가기 origin schedule은 **eligible만** 읽고, 판정 행이 없는 origin도 제외한다(fail-closed). 파이프라인 6.6단계가 매 run **pending 범위**(판정 없음·미성숙·직전 ineligible·이번 origin)를 재평가하므로 라벨이 뒤늦게 완결되면 ineligible이 eligible로 회복된다. 심각도는 평가기 판정을 따른다 — 최근 7일 내 origin의 ineligible만 critical, 과거 origin의 최초 기록은 warning. **CI 그린 ≠ 시계 유지** — 이 판정이 시계다.
- study 계약: id `8c7144f8-f685-4838-8bdc-251f1716e602`, babl_algorithm_version `comparison-v4-shadow-v1`, evidence `docs/evidence/tli-v3-scientific-rebuild/studies/8c7144f8-…/`. **contract_version UNIQUE — 재발행 불가.**

## 3. 운영 파이프라인

`collect-and-score` 모드: `full` / `news-only` / `datalab-only`(9/2 신설 — DataLab interest·forecast만 수집 후 종료, 09:00 Vercel dispatch 전용).

`full` 모드 단계:

```
1 DataLab 수집 → 2 뉴스 수집 → 3 종목 수집/활성화 → 3.5 교정
→ 4 점수 계산(anchor 척도) → 4.1 GT 라벨(legacy v1) → 4.15 gta-v2 foundation 라벨
→ 4.25 phase0 analog materialization → 4.5 임계값 튜닝 → 5 비교 분석
→ 6 예측 스냅샷(비거래일 스킵; legacy v3는 containment면 생성 중단) → 6.5 B-Abl phase 스냅샷 → 6.6 Monday origin manifest + origin-eligibility-v2 판정
→ 7 예측 평가(만기 SSOT) → 8 비교 검증 → 9 IndexNow
→ [사후 gate] prediction-parity · watchlist-canary (exit 3만 workflow fail)
```

**크론** (`.github/workflows/tli-collect-data.yml`, UTC — GitHub 스케줄 지연 실측 **2~10시간**, 자정 spillover 관측 8/27·8/28·8/31. cutoff 민감 소스는 GitHub cron에 맡기지 않는다):

| cron | KST | 역할 |
|---|---|---|
| **Vercel** `0 0 * * 1-6` → `/api/cron/tli-datalab` | 월~토 09:00 | **DataLab 선수집** — `workflow_dispatch(mode=datalab-only, intended_kst_date, run_key)`. 사전 완료 판정은 두지 않는다(부분 완료를 완료로 오판하면 선수집이 통째로 사라진다). 중복은 재사용과 workflow concurrency가 막는다 |
| `30 7 * * 1-5` | 평일 16:30 | full 수집+점수 (DataLab은 09:00분 재사용, 신선도 미달분만 재요청) |
| `0 10 * * 1-5` | 평일 19:00 | full 이중화 (v6까지 문서 누락. 요청은 대부분 재사용으로 상쇄) |
| `0 0 * * 1-6` | 월~토 09:00 | news 수집 (+origin backfill) |
| `0 17 * * 6` | 일 02:00 | 주말 full (테마 발견 슬롯 — 비거래일 예측 스냅샷은 스킵됨) |
| `30 9 * * 1` | 월 18:30 | Monday origin 생성 |

`tli-weekly-learn.yml`: 토 21:00 UTC (promotion/registration disabled로 zero-RPC).

**DataLab quota 운영 (사건 9)**: 1 full run = 299 요청(interest 배치 60 + forecast 테마별 239), 한도 1,000/일(KST 자정 리셋 가정). ① 동일 `request_sha256`가 오늘 complete + fresh(source_max_date ≥ min(window end, 직전 거래일))면 API 호출 없이 저장 응답을 재사용 ② DB ledger `tli_datalab_quota_ledger` + RPC `reserve_tli_datalab_quota`가 **HTTP 시도 단위**로 원자 예약, 상한 `TLI_DATALAB_DAILY_CEILING`(기본이자 관리 상한 900 — env로 낮출 수만 있다) ③ 429 `Query limit exceeded`는 `NaverDatalabQuotaError`로 그 요청의 재시도를 중단(재시도 0)하고 실패로 기록한다 — 루프 자체는 계속되며 총량은 ledger가 막는다. **수동 dispatch는 기본 reuse** — `-f datalab_refresh=force`는 남은 한도를 확인한 뒤에만.

**운영 특성**: 발화 안 하면 `gh workflow run tli-collect-data.yml -f mode=full|news-only|datalab-only` 수동 dispatch(reuse 기본이라 quota 안전). Monday origin은 cron+backfill 이중 안전망(PIT-파생이라 늦은 생성도 payload 동일). 과학 런타임 고정: uv 0.9.25 + CPython 3.13.11 + frozen lockfile + PYTHONHASHSEED=0. **이중 lockfile**: 의존성 변경 시 `pnpm-lock.yaml`(Vercel)+`package-lock.json`(Actions) 동시 갱신.

## 4. 상태 점검 방법

```bash
# CI 최근 실행
gh run list --workflow=tli-collect-data.yml --limit 3 --json status,conclusion,createdAt

# API 헬스 + containment (empty가 정상)
curl -s "https://stockmatrix.co.kr/api/tli/predictions" | grep -o '"dataSource":"[a-z]*"'   # → "none"

# ★ 테마 목록 실제 렌더 (API만 보지 말 것 — 사건 1 교훈)
curl -s "https://stockmatrix.co.kr/themes?v=$(date +%s)" | grep -oE 'visibleThemes\\":[0-9]+'
```

프로덕션 DB 실측(read-only)은 `scripts/tli/shared/supabase-admin` 재사용, 임시 스크립트는 실행 후 삭제. 핵심 쿼리:

```sql
-- 시계: origin·study-origin
SELECT origin_date, expected_theme_count FROM tli_forecast_origin_manifests ORDER BY origin_date;
SELECT count(*) FROM tli_study_origin_manifests;                     -- 7/27부터 매주 +1
-- ★ clean 시계 (eligible만 셈 — 사건 9)
SELECT origin_date, verdict, usable_theme_count, roster_theme_count, usable_coverage, reasons
FROM tli_study_origin_eligibility_latest WHERE rule_version='origin-eligibility-v2' ORDER BY origin_date;
-- DataLab quota 사용량 (오늘)
SELECT * FROM tli_datalab_quota_ledger ORDER BY kst_date DESC LIMIT 7;
-- gta-v2 라벨 분포
SELECT base_date, label_status, scientific_use_reason, count(*)
FROM theme_labels WHERE labeler_version='gta-v2' GROUP BY 1,2,3 ORDER BY 1;
-- B-Abl 축적 (lock 이후 매일 증가)
SELECT count(*) FROM tli_babl_phase_observations;
-- 계약 확인
SELECT id, first_origin_date, babl_algorithm_version, locked_at FROM tli_attention_study_contracts;
```

마이그레이션 리허설: 로컬 스크래치 PG (`prod-schema.sql` 덤프 + postgres:17 컨테이너, `env -u JWT_SECRET`). 배포 순서: **스키마 먼저 → 앱 나중.**

## 5. 사건 이력 (누적)

### 사건 1 — /themes 빈 화면 P0 (7/14 수정, `dc3855b`)
SSR ranking 쿼리가 anon RLS statement_timeout으로 throw → 빈 initialData가 '신선'으로 하이드레이션 → 클라 refetch 차단 → 영구 빈 화면. API·CI만 보고 실제 렌더를 안 봐서 며칠 놓침. 수정: SSR service-role 전환 + 빈 initialData 하이드레이션 제외.

### 사건 2 — 제헌절 재지정 미반영, Monday origin 반복 실패 (7/21 수정, `e37a0e6`+`945014a`)
2026년부터 제헌절(7/17)이 18년 만에 공휴일 재지정됐으나 `HOLIDAYS_2026`에 누락 → 앱 캘린더 창(6/22~7/17) ≠ RPC의 KOSPI 실측 창(6/19~7/16) → "exact latest 20 slots" 예외 반복. 1차(휴일 추가)로 불충분 — `tradingDatesEndingAt`의 offset-0이 휴일 baseDate를 그대로 반환해 오염 run이 계속 선택됨. 2차로 비거래일 baseDate를 직전 거래일로 내려 RPC 의미와 일치. 검증은 재유도가 아니라 **실제 로더 dry-run(198/198)** 후 배포.

### 사건 3 — 비교 차트 빈 곡선 회귀 (7/20 수정, `b01b77a`)
7/18 Phase0 첫 가동으로 완결 아날로그 서빙이 켜졌는데, 후보 22개가 관심도 데이터 사실상 0인 좀비 테마(lifecycle_scores 0행) → 차트에 빈 비교선. 곡선 실재하는 후보만 서빙 + 전량 탈락 시 활성 피어 폴백.

### 사건 4 — B-Abl 고정 × 스냅샷 교체 충돌 (7/22 수정, `92085cc`)
study lock이 켠 스냅샷 고정(FK ON DELETE RESTRICT)과 v2 저장기의 교체 패턴(새 UUID upsert + 광역 delete)이 같은 날 재실행(cron 이중발화)에서 충돌 — 183건 FK 거부. fail-loud가 조용한 PIT 오염을 막아준 것. 수정: 23503을 "고정 행=PIT 원본 유지"로 처리(`deleteUnpinnedSnapshots` 등).

### 사건 5 — parity gate critical, 혼합 빈티지 (7/23 수정, `683a5ef`)
사건 4의 여진: 재실행이 후보는 교체하고 스냅샷은 고정 유지 → "스냅샷=f(저장 후보)" 재계산 계약이 성립 불가한 78행 박제 → parity gate가 8/5까지 매일 critical일 상황. 수정: 후보 created_at > 스냅샷 created_at인 행을 계약 대상에서 제외(`staleInputExcludedCount` 보고) + 고정된 run은 후보 교체도 스킵. **PIT 고정은 행 단위가 아니라 빈티지 단위.**

### 사건 6 — 앵커 척도 회귀: 점수 붕괴 + 채점 적체 (7/27 머지, PR #104 `6807ef4` · #105 `6bb2ec8`)
2026-07-07 DataLab 앵커 투입이 `raw_value` 스케일을 ~7배 압축(그룹 통합 max=100 정규화, 반올림에 48%가 0), 절대 임계값 기반 점수 계산이 붕괴 — 감쇠 대상 36.9%→88.1%, p50 51→31, visibleThemes 45+→38. 별개로 예측 채점 만기 기준이 라벨과 달라(비거래일 2거래일 어긋남) + 주말 크론이 라벨 불가능한 비거래일 예측을 매주 생성 → 만기 미채점 609건으로 게이트 폭발.
수정: **#104** 만기 기준 `getLatestMaturedBaseDate` SSOT 통일 + 비거래일 스냅샷 차단 + 고아 자기치유(excluded). **#105** 절대 수준을 `anchor_scaled_value`로 전환 — 척도를 런 단위 확정(`lib/tli/interest-scale.ts` SSOT), `MIN_ANCHOR_INTEREST=0.003`은 감쇠 대상 비율(36.9%) 역산, stage 8거래일 재생으로 0/241 변동 확인. 진단 전문: `docs/tli-anchor-scale-regression-2026-07-26.md`.

### 사건 7 — Supabase egress 384% 초과 (7/29 수정, `b6c391a` + DB 정리)

**증상**: Supabase Free 조직이 이전 주기 egress 초과(19.18/5GB=384%) → grace 종료 7/31, 이후 402 위험. DB도 670/500MB=141%.

**근본 원인 (CLI `inspect db`로 실측)**: public 트래픽·MCP 아님. **배치 코드**였다. `theme-predictions-v3`·`replay-audit-scoring`이 `loadFeatureInputsForBaseDate`를 테마별 루프에서 호출 → base_date에만 의존하는 interest/news/price/snapshot 20일 창을 테마 200개마다 중복 로드(O(themes)). stock_daily_prices가 전체 DB 시간 22%, interest_metrics 12.6% 차지. MCP는 `mcp_analytics` 마지막 이벤트 7/01·DB 직접 접근 0으로 무혐의.

**수정**: ①공유 로드를 base_date당 1회로 hoist(`loadSharedFeatureRows`/`loadThemeScopedFeatureRows` 분리, replay는 base_date별 메모이즈) → egress ~90%↓ ②봇 방어 미들웨어(악성 스크레이퍼 16종 엣지 403) ③`theme_news_articles` 30일 보존 정리(305,272행 삭제, display 전용이라 과학 PIT 무관) + `pruneStaleNewsArticles` 파이프라인 배선. DB VACUUM FULL 실행 완료(Management API, `docs/tli/db-vacuum-2026-07-29.sql`): 658→468MB. 이어서 미사용 인덱스 2개 드롭(056: idx_blog_posts_fts·candidate_run, index-stats 0 scans + 코드 미사용 확인) → **최종 455MB (141%→91%)**. 리전을 `sin1`로 이동(vercel.json, DB co-locate) → 테마상세 콜드 6~10초→0.56초. parity 게이트 lifecycle_scores 윈도우 바운드로 잔여 배치 egress 제거.

**잔여 리스크**: 이번 주기 egress는 이미 초과라 되돌릴 수 없음. Phase A로 다음 주기부터 5GB 한도 내 복귀 → Fair Use 하드 제한 가능성 낮음. Pro 업그레이드는 당시 Isaac이 거절.

**현재값 정정 (2026-09-02 실측)**: 이후 조직은 **Pro로 전환됨**. DB는 약 **1,134MB**(tli_interest_observations 236MB · stock_daily_prices 231MB · tli_news_observations 226MB · tli_collection_runs 86MB — 전부 append-only라 단조 증가, 월간 증가율 산출은 P1). 위 455MB·Free·`sin1`은 사건 당시 수치다. 리전은 SEO 감사 커밋 `99ead71`에서 **`icn1`로 복귀**했다.

**교훈 (불변 규칙 ⑭)**: 참조 데이터를 테마/엔티티 루프 안에서 로드하지 말 것 — base_date/전역 단위로 1회 로드 후 재사용. 루프 안 로드는 egress가 O(N)으로 조용히 폭증한다. 정기적으로 `supabase inspect db outliers|calls|traffic-profile`로 쿼리 프로파일을 점검.

### 사건 8 — 검증되지 않은 유사 테마 표면 sunset (9/1, v6)

**실측**: `analog_candidates_v1`에서 무관 테마 쌍에도 similarity 1.000이 표시됐다(희귀금속↔무선충전기술 등). 표본 1,000건 중 177건(17.7%)은 selection score가 표시 pillar와 불일치했다. 원인은 순위→백분율 변환(`exp(-DTW)`, Mutual Rank)과 3-surface max 집계다.

**계약 판정**: 3월 analog PRD는 역사 문서이며, master plan은 comparison L4를 범위 밖에 둔다. 자동 유사 테마 카드는 어느 현행 계약에도 미래 예측 계약이 없으므로 검증 전 노출 금지 원칙에 따라 sunset한다.

**조치**: 비교 카드 섹션·헤더 칩·선택 유사도 표시를 숨겼다. 코드·API·데이터는 보존해 git revert 한 번으로 복원 가능하다. 파이프라인 step 4.25, analog 테이블, study 경로는 변경하지 않았다.

**재개 조건**: L4 공개 gate 통과와 Isaac의 Layer 2 evidence UX 승인 후, analog가 Layer 2 확률에 incremental value를 갖는지 새 버전으로 검증한 뒤에만 복귀한다. raw similarity 노출은 영구 포기한다.

**재개 경로 상세 (2026-09-01 Isaac 확인 — "데이터가 차면 자동 부활"이 아니다)**:

이 기능은 TLI 데이터 수집이 완성되면 자동으로 살아나는 것이 아니라, 3단계 관문을 순서대로 통과해야 한다.

1. **데이터 축적 (필요조건, 자동 진행 중 — 추가로 켤 것 없음)**
   - 완결 episode 25 → **50** 필요. 테마가 죽어야(notSeen≥30d + 14d 저점수) 늘어난다.
     2026-07 백로그 일괄 25개 이후 6주간 +0 — 시장 국면(테마 사망률)에 종속된 무기한 지표다.
   - matured PIT-valid eval rows 264 → **5,000** 필요. 주간 origin 축적(~194~200테마/주,
     `tli_forecast_origin_manifests`, study용으로 이미 가동 중)이 재료다. 별도 snapshot builder는
     만들지 않는다(제2 PIT 저장면 금지 — 기존 immutable manifest 체계와 중복).
   - 앵커 backfill로 과거(7/07 이전)를 부풀리는 것은 불가 판정: raw_value가 정수 반올림값 +
     앵커는 당시 요청의 7일 중앙값 의존이라 정확 복원이 안 된다(규칙 12). 축적은 forward-only.
2. **검증 통과 (관문 — 자동 아님, 별도 작업)**
   - 누수 없는 미래 경로 라벨 구축: 단위는 (query episode, cutoff t), horizon 5/10/20거래일,
     candidate의 미래 20일이 query cutoff 이전에 전부 관측된 것만. rolling-origin, train-only 정규화,
     weekly cohort block bootstrap (analog PRD §12 계약 그대로).
   - retrieval gate(analog PRD §13.3, replay holdout 기준 — 당시 예측 저장 없이도 평가 가능):
     FuturePathCorr@5 하한 +0.02, PeakHit@5 하한 +0.03 (price-only kNN·legacy 양쪽 대비).
   - **여기서 떨어지면 영구 종료** — "곡선이 닮아 보임"에 미래 예측력이 없다고 판명되는 것이며,
     기준을 바꿔 통과시키지 않는다(§9).
3. **제품 복귀 (형태 변경)**
   - 옛 형태(유사도 %·등급·순위)로는 복귀하지 않는다. 복귀 형태는 L4 공개 예측 기능의
     **evidence 컴포넌트**(검증된 확률 + 근거 사례 + 불확실성) — analog PRD §2.1의 원래 계약.
   - 현실적 시점: 빨라야 2027(축적 ~2027-02 + L3 판정 ~2027 중반과 맞물림).

**폐기된 우회로 (재시도 금지, 각 사유 실증됨)**: ① composite.ts 섹터 패널티 수정 — 화면은
analog_candidates_v1을 읽어 무효 ② 서빙 단일화 + 분포기반 abstention — 125/239 빈 화면으로
사건 1·3 충돌(PR #170 폐기) ③ 부분 주장 제거만 — 선택 상태·헤더 칩·SEO 메타에서 누출 실증
④ 섹터 사전 확장 — analog 경로에 sectorMatch 자체가 없어 무효, 완결 corpus 25개 중 21개가 etc라
확장해도 대응 후보 부재.

### 사건 9 — 8/10 study origin universe 붕괴(false-clean) + DataLab 한도 초과 (9/2 수정, v7)

**실측**: 8/10 origin `expected_theme_count=30`(다른 주 194~198). 원인은 크론 지연 — 16:30 full run이 17:57에 시작해 테마별 forecast-interest 수집이 **18:00 cutoff에 걸쳤고**, origin builder(`origin-sources.ts`)가 "cutoff 이전 eligible run을 가진 테마"만 universe로 삼아 살아남은 30테마가 곧 universe가 됐다. completeness는 30/30=100%, 평가기 clean 판정(`!row.abstain`)도 통과 → **false-clean**. 8/24·8/31은 각각 당일 run 17:19 완료·주말 run 재사용으로 운 좋게 살았다. 별건으로 9/1에는 8/31 지연 크론의 자정 spillover(598) + 수동 run(299) + 정규 run이 겹쳐 DataLab 1,000 cap 도달, 256건 429 → critical #174(데이터 손실은 없음 — 수동 run이 이미 완료). 실측: 평일 16:30·19:00 full 크론이 **완전히 동일한 299개 요청을 두 번** 보내고 있었다(8/25 distinct sha 299 / total 598).

**계약 판정 (sol 적대 리뷰 합의)**: master plan은 expected universe 보존·전체 label accounting·source 결손 시 critical incident를 요구한다. 현 구현은 이 의미를 뒤집었으므로 **계약의 집행 수정**이며 study contract 재잠금 대상이 아니다. 8/10은 outcome과 무관하게 universe identity 결손으로 탈락한다. manifest·라벨은 삭제·수정하지 않는다.

**조치 (P0 6건, 브랜치 `fix/tli-p0-universe-quota-dispatch`)**:
1. **universe fail-closed** — roster(RPC `tli_origin_roster`: cutoff 이전 7일 내 complete single-theme run 보유 테마)에 있지만 eligible run이 없는 테마를 `interest_run_unavailable` abstain child로 manifest에 명시. expected universe ≈ roster(~220)로 안정화.
2. **`origin-eligibility-v2`** — §2 기준. 마이그레이션 059(`tli_study_origin_eligibility` + latest 뷰 + roster RPC) + 061(roster RPC가 관측 테마 1개뿐인 **배치** run을 single-theme으로 오인하던 것을 request payload의 비앵커 그룹 수=1 조건으로 교정 — 프로덕션 드라이런에서 발견). `npm run tli:origins:eligibility`로 전 origin 재판정(8/10만 ineligible, 나머지 coverage 87.8~89.1%). dataset loader·평가기 origin 목록은 eligible만. 6.6단계 직후 자동 판정, ineligible은 critical.
3. **DataLab quota** — 마이그레이션 060(ledger + 원자 예약 RPC), 동일 요청 재사용, 429 non-retry, 수동 dispatch 기본 reuse(`datalab_refresh=force` 예외).
4. **09:00 Vercel dispatch** — `/api/cron/tli-datalab` → `datalab-only`. intended_kst_date가 runner의 KST 날짜와 다르면(지연 발화) 워크플로를 실패시키지 않고 조용히 skip한다. cutoff와 9시간 거리.
5. **legacy 예측 생성 중단** — champion/challenger containment(invalidated/blocked)면 `theme_predictions_v3` 신규 행 0. watchlist·parity는 `blocked` 아티팩트(exit 2).
6. **SSOT 정정** — 본 v7.

**시계 영향**: clean 확정 3(7/27·8/3·8/24) + 8/31 pending. #26 = **2027-02-15**(기존 02-01 대비 2주 — 8/10 손실 1주 + 2027-02-08 설날 1주).

**최종 리뷰에서 추가로 걸러낸 것 (sol NO-SHIP → 수정 후 재판정)**: ①09:00 dispatch가 complete run 1건만 보고 선수집 전체를 생략하던 오판 → 사전 판정 제거(중복은 재사용·concurrency가 막는다) ②eligibility 성숙 판정이 계산 캘린더·날짜 단위라 계약(18:00 KST)보다 최대 9시간 일렀고 그 오판이 고착 → 라벨 finalizer와 동일한 KOSPI 실측 `graceDeadline` 사용 + 직전 ineligible도 재평가 대상 ③roster 파싱 실패를 warn 후 드롭 → fail-closed throw ④과거 origin의 최초 ineligible까지 무조건 critical → 평가기 severity 존중 ⑤challenger 행 부재 시 watchlist 크래시(실E2E 발견) → `challenger_missing` blocked. 덤으로 KOSPI 거래일 로더의 PostgREST 1,000행 절단 방어.

**교훈 (불변 규칙 ⑮⑯⑰)**: 분모는 "성공한 것"이 아니라 "의도한 것"이어야 한다. 외부 API 한도는 코드가 아니라 DB 원장으로 공유 관리한다. cutoff 민감 수집은 지연이 상습인 스케줄러에 맡기지 않는다.

## 6. 불변 규칙 (사고 이력에서 나온 것 — 재발 방지)

1. **실제 페이지 렌더를 확인하라** — API·CI green ≠ 사용자 화면 정상 (사건 1).
2. **fail-loud를 신뢰하되 근본을 봐라** — 경보가 잡은 원인은 복수일 수 있다.
3. **마이그레이션은 실 PG 리허설** — SQL 텍스트 테스트로 못 잡는 문법·trigger 바인딩.
4. **배포 순서: 스키마 먼저 → 앱 나중.**
5. **민감일엔 프로덕션 변경 게이트** — 단 원인 명확한 사용자 P0는 즉시.
6. **날짜 창은 계산 캘린더가 아니라 시장 실측(`stock_daily_prices` KOSPI)에서 파생하라** — 휴일 테이블은 법 개정을 모른다 (사건 2). 신규 코드는 `deriveGtAV2Windows` 패턴.
7. **수정 검증은 재유도가 아니라 실코드 경로로** — 실제 함수·실데이터 dry-run 후 배포 (사건 2).
8. **"구현 완료"와 "가동 중"은 다르다** — 각 구성요소의 가동은 **DB 행 수로** 확인 (gta-v2 배선 갭).
9. **일회성·비가역 계약(lock)은 자유도를 최소화하고 fail-closed에 기대라** (study lock).
10. **append-only 관측이 FK로 원본을 고정하기 시작하면 기존 writer 전수 점검** — 활성화 이벤트의 영향 범위는 "이제 금지되는 것"을 포함한다 (사건 4).
11. **PIT 고정은 빈티지 단위** — 스냅샷을 고정했으면 파생 입력도 함께 고정, 재계산 게이트는 고정 행을 명시적으로 제외(제외 수 보고) (사건 5).
12. **절대 임계값은 척도에 붙어 있다** — 데이터 척도를 바꾸는 변경(앵커 투입 등)은 그 척도로 교정된 모든 임계값·상수의 재역산을 동반해야 한다. 척도는 런 단위 SSOT로 한 번만 정한다 (사건 6).
13. **만기·마감 같은 시간 기준은 한 함수로** — 두 곳에서 각자 계산하면 비거래일에 어긋난다 (`getLatestMaturedBaseDate` SSOT) (사건 6).
14. **참조 데이터는 루프 밖에서 1회 로드** — base_date/전역 단위 데이터를 테마·엔티티 루프 안에서 읽으면 egress가 O(N)으로 조용히 폭증한다. `supabase inspect db outliers|traffic-profile`로 주기 점검 (사건 7).
15. **completeness의 분모는 intended universe다** — "성공한 소스"에서 universe를 파생하면 결손이 100%로 위장된다(false-clean). 결손 테마는 명시적 abstain으로 기록하고 coverage는 roster 대비로 판정 (사건 9).
16. **외부 API 일일 한도는 DB 원장으로 공유 예약** — runner·Vercel·수동 실행 사이에 프로세스 메모리·파일 카운터는 공유되지 않는다. 시도 단위 원자 예약 + 한도 오류는 재시도 금지 + 동일 요청 재사용 (사건 9).
17. **cutoff 민감 수집은 지연 상습 스케줄러와 분리** — GitHub cron은 2~10시간 밀린다. 다른 인프라(Vercel Cron)에서 dispatch하고 intended date를 함께 보내 잘못된 날짜 실행을 거부 (사건 9; 뉴스레터 체인과 동일 원칙).

## 7. 아키텍처 지도 (작업 진입점)

| 영역 | 경로 |
|---|---|
| 과학 계약 (동결) | `docs/tli/scientific-rebuild-master-plan.md` |
| 마이그레이션 | `supabase/migrations/045~061_*.sql` (059 origin eligibility·roster RPC, 060 DataLab quota ledger, 061 roster RPC dedicated-run 필터) |
| 수집기 | `scripts/tli/collectors/` |
| origin 생성 | `scripts/tli/origins/` (`lock-study-contract.ts`는 **재실행 금지**) |
| origin clean 판정 | `scripts/tli/origins/origin-eligibility.ts`(규칙) · `origin-roster.ts`(RPC) · `run-origin-eligibility.ts`(`npm run tli:origins:eligibility`) · `study-origin-eligibility-source.ts`(dataset/평가기 공용 필터) |
| DataLab quota/reuse | `scripts/tli/collectors/naver-datalab-quota.ts` · `naver-datalab-reuse.ts` · `naver-datalab-api.ts`(`NaverDatalabQuotaError`) |
| TLI dispatch (Vercel Cron) | `app/api/cron/tli-datalab/route.ts` · `lib/tli/datalab-collection-status.ts` · `vercel.json` crons |
| 라벨 gta-v2 | `lib/tli/labels/gt-a-v2.ts` · `scripts/tli/labels/finalize-gt-a-v2.ts` · `scripts/tli/labels/gta-v2-daily.ts`(step 4.15) |
| 만기 SSOT | `lib/tli/trading-calendar.ts` `getLatestMaturedBaseDate` |
| 점수 척도 SSOT | `lib/tli/interest-scale.ts` (+ `score-config.ts` `getNoiseFloor`) |
| B-Abl 수집 | `scripts/tli/collectors/babl-phase-snapshot.ts` (step 6.5) |
| 비교 서빙 (곡선 필터/고정 보존) | `app/api/tli/themes/[id]/comparison-v4-reader.ts` · `scripts/tli/comparison/v4/shadow.ts` |
| parity gate | `scripts/tli/comparison/prediction-parity-loader.ts` · `scripts/tli/ops/scientific-gate-exit.ts` |
| 휴장일 테이블 | `app/archive/_utils/market/_constants/holidays.ts` — **매년 12월 갱신 + 임시공휴일 즉시** |
| 예측 API (containment) | `app/api/tli/predictions/prediction-loader.ts` |
| 테마 목록 (사용자 화면) | `app/themes/(list)/page.tsx` → `useGetRanking` (SSR `get-ranking-server.ts`) |
| e2e 드라이버 | `npm run tli:e2e:dry-run` |
| study evidence | `docs/evidence/tli-v3-scientific-rebuild/studies/` |

## 8. Watch / 예정

| 시점 | 항목 | 판정 기준 |
|---|---|---|
| **오늘(7/27) 저녁** | full run: 채점 적체 게이트, 척도=anchor 로그, Monday origin `study-origin=1` | 만기 미채점 609→185(<500), 점수 p50 상승 |
| 7/28경 | 7/20분 gta-v2 라벨 확정 | pending 198 → final 전환, `source_gap_sla` 급증 시 조사 |
| 매일 | step 4.15 실패=0, B-Abl observations 일 단위 증가 | §4 쿼리 |
| 수시 | `/themes` visibleThemes 45+ 회복 (사건 6 수정 효과) | 미회복 시 재조사 |
| 8/5 이후 | parity `staleInputExcludedCount` 증가 정지 (사건 5 혼합 빈티지 창 이탈) | 계속 늘면 사건 5 재발 |
| **12월** | **2027 휴장일 KRX 공식 발표 대조** | 테이블은 이미 존재(잠정값) — 공식 발표와 diff |
| **매주 월요일 저녁** | `tli_study_origin_eligibility_latest` 최신 origin `eligible` | ineligible이면 critical 이슈 + 사건 9 재발 조사 |
| 매일 | `tli_datalab_quota_ledger` attempts ≤ 600 | 600 초과면 reuse 실패/spillover 조사 |
| 9/8경 | 8/31 origin 라벨 final → 성숙 후 재판정 eligible 유지 | `label_accounting_incomplete`면 라벨 파이프라인 조사 |
| P1 | legacy 4,880 exclusion reason backfill(추측 금지, 복원 불가는 명시) · flywheel consumer + GSC/GA4 귀속 · DB 월간 증가율 | — |
| 비차단 후속 | 완결 아날로그 곡선 materialize · 옵티마이저 anchor 척도 과제(#105 문서 권고) | — |
| 조사 종결 | ~~7/18 27테마 오비활성화~~ — **정상 확인(2026-07-29)**: 28개 비활성 테마 전부 lifecycle_scores 이력 0(truncation 피해 아님), 25개는 interest 데이터 전무, naver_seen_streak=1(<2 임계값). 저신호 테마의 정상 비활성이며 강제 재활성은 순손해(DataLab 낭비+즉시 재비활성). 조치 불필요. | — |

## 9. 성공/완료의 정의 (착각 금지)

- 테스트 green·좋은 retrospective metric·많은 pending prediction·예쁜 차트는 **완료 증거가 아니다.**
- L3(모델 효능)은 사전 고정된 전향 gate(최소 16주)를 **실제로** 통과해야만 인정. 실패 시 효능을 기각하고 L2 유지 — 기준을 바꾸거나 재탐색해 성공으로 만들지 않는다.
- 가격·수익·투자알파 주장은 GT-B(별도, 미착수) 전까지 금지.
