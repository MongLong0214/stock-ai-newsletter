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
| **v6** | **2026-09-01** | **비교 화면 주장 무결성 수정** — 허위 정밀도·등급·pillar·순위·파생 ETA를 비노출하고 lane/검색 방식/실제 생성 버전을 명시, DTW 계약 위반 격리, 활성 피어 폴백 보존 |

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

## 0. 30초 요약 (2026-07-27 기준)

- **오늘부터 study 26주 시계 1주차.** study contract `tli-attention-study-v1` lock 완료(7/22, first_origin_date=2026-07-27). 오늘 18:00 KST cutoff의 Monday origin이 study 귀속 origin #1.
- **TLI v3 재구축 = 완료·배포·축적 국면.** 예측 API는 검증된 champion cycle 전까지 **의도적 empty** (`dataSource:"none"` = 정상). 승격/노출 플래그(`TLI_M1_PROMOTION_ENABLED`·`TLI_M1_REGISTRATION_ENABLED`·`TLI_PREDICTIONS_V3_EXPOSURE_ENABLED`) 전부 미설정 유지.
- **gta-v2 foundation 라벨(step 4.15)·B-Abl phase 수집(step 6.5) 가동 중.** origin·라벨·B-Abl이 매일 자동 축적된다.
- **점수는 anchor 척도로 전환됨** (PR #105, 7/27 머지) — 2026-07-07 앵커 투입이 일으킨 raw_value 스케일 붕괴의 근본 수정. 점수 p50 43→58 전망, visibleThemes 회복 예상.
- **예측 채점 만기 기준 SSOT 통일 + 비거래일 고아 자기치유** (PR #104, 7/27 머지) — 만기 미채점 609→185로 적체 게이트 통과 예상.
- **작업 규칙**: TLI 작업 전 master plan Read. 조기 승격·노출 우회는 어떤 이유로도 금지. 코드 변경 위임 정책은 `~/.claude/CLAUDE.md`.

## 1. 무엇을 예측하는가 (estimand 요약)

시점 t 한국 거래일 장마감 후, 그 시점까지 이용 가능했던 데이터만으로 **향후 5거래일 관심도 상승확률** `P(future5_mean / past5_mean ≥ 1.10)`을 예측한다. 가격·수익·투자알파가 아니다(GT-B는 별도, 미착수). denominator 계약은 정확히 `past_mean > 0`, y = `1[ratio ≥ 1.10]`, scale-invariant. 전체 계약은 master plan 참조.

**성숙도 사다리**: L2(누수 없는 retrospective) → L3(전향 16주+ 효능) → L4(제한 공개). 현재 L2 인프라 완비 + 축적 중. L3/L4는 신호가 실제로 존재해야만 도달 — 기준을 바꿔 성공으로 만들지 않는다.

## 2. 축적 시계 — 현재 위치와 캘린더

| 날짜 | origin | usable | study 귀속 | 비고 |
|---|---|---|---|---|
| 2026-07-13 | ✅ | 0 (전량 abstain) | ✗ | 수집 미성숙기. gta-v2 전량 excluded 확정 |
| 2026-07-20 | ✅ | 198 | ✗ | 첫 실질 origin. 라벨 198건 7/28경 final 전환 |
| **2026-07-27** | 오늘 | — | **✅ #1** | **study 시계 1주차** |
| 2026-08-17 (월) | 스킵 | — | — | 광복절 대체휴일 (`isTradingMonday` 자동 스킵) |
| 2026-10-05 (월) | 스킵 | — | — | 개천절 대체휴일 — 동일 |
| ~2027-02-01 | — | — | #26 | 26 clean origin 도달 예상 |

이후: Todo 16 candidate cycle(사전등록·전향 최소 16주) → L3 판정(~2027 중반) → L4 canary 4주.

- lock은 소급 불가(`locked_at < first_origin_date` RPC 강제) — 7/13·7/20은 universal 축적 전용.
- **"clean" 유지 조건**: 그 주 수집·라벨이 깨지면 해당 origin이 빠진다. **CI 그린 유지가 곧 시계 유지.**
- study 계약: id `8c7144f8-f685-4838-8bdc-251f1716e602`, babl_algorithm_version `comparison-v4-shadow-v1`, evidence `docs/evidence/tli-v3-scientific-rebuild/studies/8c7144f8-…/`. **contract_version UNIQUE — 재발행 불가.**

## 3. 운영 파이프라인

`collect-and-score` full 모드 단계:

```
1 DataLab 수집 → 2 뉴스 수집 → 3 종목 수집/활성화 → 3.5 교정
→ 4 점수 계산(anchor 척도) → 4.1 GT 라벨(legacy v1) → 4.15 gta-v2 foundation 라벨
→ 4.25 phase0 analog materialization → 4.5 임계값 튜닝 → 5 비교 분석
→ 6 예측 스냅샷(비거래일 스킵) → 6.5 B-Abl phase 스냅샷 → 6.6 Monday origin manifest
→ 7 예측 평가(만기 SSOT) → 8 비교 검증 → 9 IndexNow
→ [사후 gate] prediction-parity · watchlist-canary (exit 3만 workflow fail)
```

**크론** (`.github/workflows/tli-collect-data.yml`, UTC — 상습 60~90분 지연은 플랫폼 특성):

| cron | KST | 역할 |
|---|---|---|
| `30 7 * * 1-5` | 평일 16:30 | full 수집+점수 |
| `0 0 * * 1-6` | 월~토 09:00 | news 수집 (+origin backfill) |
| `0 17 * * 6` | 일 02:00 | 주말 full (테마 발견 슬롯 — 비거래일 예측 스냅샷은 스킵됨) |
| `30 9 * * 1` | 월 18:30 | Monday origin 생성 |

`tli-weekly-learn.yml`: 토 21:00 UTC (promotion/registration disabled로 zero-RPC).

**운영 특성**: 발화 안 하면 `gh workflow run tli-collect-data.yml -f mode=full|news-only` 수동 dispatch. Monday origin은 cron+backfill 이중 안전망(PIT-파생이라 늦은 생성도 payload 동일). 과학 런타임 고정: uv 0.9.25 + CPython 3.13.11 + frozen lockfile + PYTHONHASHSEED=0. **이중 lockfile**: 의존성 변경 시 `pnpm-lock.yaml`(Vercel)+`package-lock.json`(Actions) 동시 갱신.

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

**잔여 리스크**: 이번 주기 egress는 이미 초과라 되돌릴 수 없음. Phase A로 다음 주기부터 5GB 한도 내 복귀 → Fair Use 하드 제한 가능성 낮음. Pro 업그레이드는 Isaac이 거절.

**교훈 (불변 규칙 ⑭)**: 참조 데이터를 테마/엔티티 루프 안에서 로드하지 말 것 — base_date/전역 단위로 1회 로드 후 재사용. 루프 안 로드는 egress가 O(N)으로 조용히 폭증한다. 정기적으로 `supabase inspect db outliers|calls|traffic-profile`로 쿼리 프로파일을 점검.

### 사건 8 — 비교 이중 서빙·허위 정밀도·pillar 불일치 (9/1 화면 주장 차단)

**실측**: `analog_candidates_v1` 1,195건에서 `similarity_score` max=1.000, P95=0.893이었고, 희귀금속←무선충전기술·희귀금속←엔젤산업·리모델링/인테리어←무선충전기술이 100%, 니켈←엔젤산업이 89.9%로 표시됐다. 표본 1,000건 중 177건(17.7%)은 `similarity_score`가 화면에 표시하던 어떤 pillar와도 일치하지 않았다. 집계기가 승리 surface와 무관하게 `featureSim=max`, `curveSim=max`, `dtwDistance=min`을 합성하고, kNN(feature)·DTW(curve)·regime(feature/cosine 50:50)의 의미가 다른 점수를 한 순위로 노출한 것이 원인이다. 완결 analog가 없을 때 V2 활성 피어를 대신 서빙하는 이중 경로도 화면에서 구분되지 않았다. 정규화 곡선 계약상 `[0,1]`이어야 하는 `dtw_distance`가 1을 넘은 행은 5건(0.6%), max=15.83이었다.

**조치**: 후보 생성·저장·study contract(`comparison-v4-shadow-v1`)·PIT 빈티지는 동결했다. 화면과 상세 서빙에서 유사도 백분율·정성 등급·pillar bar·ordinal/top 표기·후보 기반 정점 ETA·종합 인사이트를 비노출하고, 카드는 이름순 최대 5개 자동 후보로만 제시한다. 완결 관측 후보와 진행 중 관측 후보 대체 표시를 별도 lane으로 명시하며, 사건 3의 좀비 곡선 필터와 V2 활성 피어 폴백은 보존한다. `retrieval_surface`와 실제 analog `retrieval_spec_version` 또는 V2 `algorithm_version`을 기존 쿼리 컬럼으로 읽어 노출한다. `dtw_distance`의 유한한 범위 밖 값만 데이터 오류로 격리하고 건수를 로그로 남기며, null 신호는 격리하지 않는다.

**미해결**: 이 조치는 오매칭 자체를 고친 것이 아니다. 니켈↔엔젤산업 같은 후보 쌍은 카드에 남을 수 있으며, 업종·사업 연관성이나 의미적 유사성을 주장하지 않을 뿐이다. 오매칭 해소에는 동결된 생성 계약을 별도 절차로 재설계한 뒤 전체 후보를 전면 재계산해야 한다.

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

## 7. 아키텍처 지도 (작업 진입점)

| 영역 | 경로 |
|---|---|
| 과학 계약 (동결) | `docs/tli/scientific-rebuild-master-plan.md` |
| 마이그레이션 | `supabase/migrations/045~055_*.sql` |
| 수집기 | `scripts/tli/collectors/` |
| origin 생성 | `scripts/tli/origins/` (`lock-study-contract.ts`는 **재실행 금지**) |
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
| **12월** | **2027 휴장일 테이블 추가 (필수)** | 누락 시 연말 라벨 창 계산 fail-loud (사건 2 계열) |
| 비차단 후속 | 완결 아날로그 곡선 materialize · 옵티마이저 anchor 척도 과제(#105 문서 권고) | — |
| 조사 종결 | ~~7/18 27테마 오비활성화~~ — **정상 확인(2026-07-29)**: 28개 비활성 테마 전부 lifecycle_scores 이력 0(truncation 피해 아님), 25개는 interest 데이터 전무, naver_seen_streak=1(<2 임계값). 저신호 테마의 정상 비활성이며 강제 재활성은 순손해(DataLab 낭비+즉시 재비활성). 조치 불필요. | — |

## 9. 성공/완료의 정의 (착각 금지)

- 테스트 green·좋은 retrospective metric·많은 pending prediction·예쁜 차트는 **완료 증거가 아니다.**
- L3(모델 효능)은 사전 고정된 전향 gate(최소 16주)를 **실제로** 통과해야만 인정. 실패 시 효능을 기각하고 L2 유지 — 기준을 바꾸거나 재탐색해 성공으로 만들지 않는다.
- 가격·수익·투자알파 주장은 GT-B(별도, 미착수) 전까지 금지.
