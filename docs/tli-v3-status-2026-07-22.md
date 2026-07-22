# TLI v3 현황 인수인계 (2026-07-22)

> **맨땅 세션용 단일 상태 문서.** 이 파일 하나로 TLI v3의 현재 상태·유지보수·코드 작업 진입점을 파악한다.
> `docs/tli-v3-status-2026-07-14.md`를 승계(supersede)한다. 최신 HEAD: `b07e05c` · 프로덕션 배포 완료.
> 원 계획서(SSOT): `.omo/plans/tli-v3-scientific-rebuild-master.md` — **TLI 작업 전 반드시 Read.**

---

## 0. 30초 요약

- **Study contract lock 완료 (2026-07-22 10:05 KST).** `tli-attention-study-v1`, first_origin_date=**2026-07-27**. **study 귀속 26주 시계는 7/27(월)부터 공식 시작.** 그 전 origin(7/13·7/20)은 universal 축적 전용이며 study 26개 카운트에 들어가지 않는다 (lock 소급 불가).
- **gta-v2 foundation 라벨이 이제 매일 돈다** (step 4.15, 이번에 배선). 그 전까지는 구현만 있고 진입점이 없어 라벨이 0건이었다 — 이대로면 origin 26개가 쌓여도 outcome이 없어 Todo 16 게이트를 영원히 계산 못 하는 갭이었다.
- **B-Abl phase 수집(step 6.5)이 lock과 동시에 자동 활성화됨.** lock 전에는 설계상 no-op이었다.
- **2026-07-17 제헌절 공휴일 재지정**(18년 만의 부활, 법 확정)이 하드코딩 휴장일 테이블에 없어 Monday origin 생성이 반복 실패했다. 2겹 수정 후 **7/20 origin usable=198** (첫 실질 origin — 플랜 예상 8월 초보다 빠름).
- 예측 API는 여전히 **의도적 empty** (containment, `dataSource:"none"` = 정상). 승격/노출 플래그 전부 미설정 유지.
- **작업 규칙**: 코드 변경 위임 정책·팀 규칙은 `~/.claude/CLAUDE.md` 기준. 조기 승격·노출 우회는 어떤 이유로도 금지.

---

## 1. 2026-07-18 ~ 07-22 사건·조치 상세 타임라인

### 1.1 비교 차트 회귀 — "비교선이 안 나옴" (7/18 발생, 7/20 수정 배포)

**증상**: 테마 상세에서 유사 패턴 카드를 선택해도 차트에 비교선이 전혀 그려지지 않음. 카드에는 유사도(66% 등)가 정상 표시돼 사용자 오해 유발.

**타임라인 (전부 DB 타임스탬프 실측)**:

```
7/18 18:31:28  episode_registry_v1     사상 최초 생성   ← Phase0 materialization 첫 가동
7/18 18:31:31  query_snapshot_v1       사상 최초 생성
7/18 18:31:34  analog_candidates_v1    사상 최초 생성
```

**근본 원인 (2겹)**:
1. **서빙 우선순위**: `fetchPublishedComparisonRowsV4`는 완결 아날로그(`loadLatestCompletedAnalogRows`)를 1순위로 서빙하고, 있으면 v2 활성 피어 run을 건너뛴다. 7/18 Phase0 첫 가동으로 이 경로가 켜지면서, 비교 후보가 "곡선 있는 활성 피어" → "곡선 없는 완결 테마"로 갈아치워졌다.
2. **데이터 공백**: 완결 아날로그 풀 22개 테마는 관심도 데이터가 사실상 0(중앙값 0, 최대 2일치)이라 `lifecycle_scores`가 전부 0행. 차트 곡선 로더(`build-comparisons.ts` → `loadPastThemeCurves`)는 이 레거시 테이블만 읽으므로 그릴 점이 없었다. 이 테마들은 "네이버 금융 자동 발견 → DataLab 검색량 미미 → 점수 계산 불가(최소 데이터 미달) → 30일 무점수 좀비 정리로 비활성화"라는 정상 수명주기를 거친 것으로, 문제는 **데이터 존재 확인 없이 이들을 비교 후보로 승격**한 것.

**수정** (`b01b77a`): `comparison-v4-reader.ts`에 곡선 존재 필터 추가 — `lifecycle_scores`에 행이 실재하는 완결 아날로그만 서빙, 전량 탈락 시 v2 활성 피어로 폴백(7/18 이전 동작 복원). 조회 실패도 곡선 없음으로 간주(빈 선 서빙보다 피어 폴백이 안전).

**검증**: Playwright 실렌더 — GTX·온디바이스 AI·쿠팡(곡선 139일치) 3개 비교선 path 정상 드로잉. vitest 35/35(신규 2), tsc/eslint 0, next build 성공. **B-Abl 스냅샷 수집기는 이 리더를 쓰지 않음을 확인**(독립 파이프라인) — 과학 baseline 무영향.

**부수 수정** (같은 주): 비교 워크스페이스 토큰 스트립 x-스크롤 잘림(`min-w-0` 누락 + 가로 스크롤바 height 0) — `9dca671`.

**후속 과제(비차단)**: 완결 아날로그의 곡선 materialize(에피소드 곡선을 차트 조회 가능한 형태로 저장)하면 "완결 사례와 비교"라는 v4 원래 의도를 복원 가능. 22개 유령 완결 에피소드(reconstruction failed)의 발생 방지 게이트도 후보.

### 1.2 제헌절 재지정 → Monday origin CI 반복 실패 (7/20~21 발생, 7/21 수정 배포)

**증상**: `tli-collect-data` 7/20 12:00, 7/21 01:24 run 실패. 로그:
```
❌ Monday origin manifest 실패: create_tli_forecast_origin_manifest 실패:
   usable input requires the exact latest 20 Korean trading-date slots from one run
```
7/20(월) origin 생성이 실패하고 이후 모든 run이 backfill을 재시도하며 반복 실패.

**근본 원인 (2겹)**:
1. **2026년 제헌절(7/17, 금) 공휴일 재지정 미반영.** 2008년 제외 후 18년 만에 국회·국무회의 통과로 법정공휴일 확정(외부 검증: 농민신문·다음뉴스 보도). 실측: KIS 기준 7/17 **전 종목(512+) 시세 0건** = 실제 휴장. 그러나 `HOLIDAYS_2026` 하드코딩 테이블에 7/17이 없어 앱 캘린더는 거래일로 취급 → DataLab 관측이 7/17 trading_date로 reindex, 클라이언트 20-slot 창(6/22~7/17)과 RPC의 KOSPI 실측 창(6/19~7/16)이 어긋남 → RPC fail-closed 거부.
2. **창 계산 함수의 휴일 baseDate 처리.** 1차 수정(휴일 추가, `e37a0e6`)만으로는 복구 실패 — CI 재실행으로 실측 확인. `getKoreanTradingDateWindow`의 offset 0이 baseDate를 거래일 여부와 무관하게 그대로 반환해, source_max=7/17(휴장) run의 클라이언트 창이 `[6/22..7/16, 7/17]`로 계산돼 **오염된 관측과 정확히 일치** → 여전히 usable 최신으로 선택되고 RPC에서 거부. 2차 수정(`945014a`): `origin-sources.ts`의 `tradingDatesEndingAt`이 비거래일 baseDate를 직전 거래일로 내려 "baseDate 이하 최근 N 거래일"이라는 RPC(`stock_daily_prices trade_date <= baseDate LIMIT N`) 의미와 일치시킴.

**검증 방법의 교훈**: 1차 수정은 내 재유도로 검증해 실패했고, 2차는 **실제 프로덕션 로더(`loadForecastThemeSources`)를 통째로 dry-run**해 선택된 198개 usable 테마 전원을 RPC 조건으로 재검증(198/198 PASS) 후 배포 → 즉시 복구. 재유도 검증 금지, 실코드 경로 검증 필수.

**결과**: dispatch run 29797282503 success — `backfill=1, forecast child=198, usable=198`. 이후 스케줄 run 전부 그린. 회귀 테스트 추가(휴장일-오염 run 배제 시나리오). **부수 피해 없음 실측**: gta-v2 라벨 7/17 포함 창 0건, 오염 관측 run들은 양쪽 검증에서 자동 비적격(무해).

**미해결 관찰**: 7/18에 27개 테마가 네이버에 계속 노출 중임에도 일괄 비활성화된 이상 이벤트(같은 날 batchQuery 조용한-잘림 수정 #93 배포). 비교 회귀와는 별개 사안으로, 필요시 후속 조사.

### 1.3 Study contract lock — 26주 시계 공식 시작 (7/22 실행)

**왜 지금인가**: 마스터 플랜 L200 — 26개 clean weekly origin은 **"하나의 study contract에 귀속된" origin만 카운트**. lock은 소급 불가(RPC가 `locked_at < first_origin_date 18:00 KST` 강제)라, 잠그지 않은 채 지나가는 월요일마다 종점이 1주씩 밀린다. 수집이 플랜 예상(8월 초)보다 빨리 성숙(7/20 usable=198)했으므로 최속 시작점은 7/27.

**실행 내역**:
- study_id: `8c7144f8-f685-4838-8bdc-251f1716e602`
- contract_version: `tli-attention-study-v1` (UNIQUE — **재발행 불가, 단 1회**)
- first_origin_date: **2026-07-27** / locked_at: 2026-07-22T01:05:59Z (10:05 KST)
- babl_algorithm_version: `comparison-v4-shadow-v1` (lock 시점의 단일 enabled `comparison_v4_control` row에서 파생, RPC가 canonical SHA 대조)
- 절차: canonical payload를 `docs/evidence/tli-v3-scientific-rebuild/studies/8c7144f8-…/study-contract.json`에 commit(`bb9babd`) → push → `lockAttentionStudyContract`가 HEAD blob bytes 재대조 후 RPC 호출 (Git-first, fail-closed)
- **label/feature contract SHA 규약**: lock 커밋 시점 계약 소스 파일의 git blob SHA-256
  - label: `lib/tli/labels/gt-a-v2.ts` → `1a6a9d4b…5b15`
  - feature: `lib/tli/features/confirmatory-feature-types.ts` → `e0bdedb3…da17`
  - 재현: `git cat-file blob <commit>:<path> | shasum -a 256` (evidence README에 문서화)

**lock이 켠 것**: step 6.5 B-Abl phase 수집이 no-op에서 실동작으로 전환(활성화 실측 확인 — 당일 prod 스냅샷 생성 전이라 0건 append는 정상 타이밍, 매일 저녁 run에서 스냅샷(6단계)→B-Abl(6.5단계) 순서로 축적). 7/27부터 Monday origin이 study-origin manifest로 바인딩된다.

### 1.4 gta-v2 foundation 라벨 배선 — 축적 국면의 치명적 갭 봉합 (7/22 배포)

**발견**: Todo 7의 gta-v2 라벨 계약(pending 생성 함수 `createGtAV2PendingLabels`, 순수 판정 `resolveGtAV2Finalize`, 048 finalizer RPC, 테스트)은 전부 구현돼 있었으나 **프로덕션 어디에서도 호출되지 않았다** (import 전수 확인: 테스트·e2e 픽스처·boundary manifest 등록뿐). 일일 라벨 단계(4.1)는 legacy gta-v1만 돌린다. 이 상태로는 usable origin이 아무리 쌓여도 origin-bound outcome이 0 → retrospective OOS 게이트(paired ≥800, positive ≥100) 계산 불가 → **Todo 16이 영원히 unblock되지 않는 구조적 갭**.

**수정** (`b07e05c`): `scripts/tli/labels/gta-v2-daily.ts` 신규 + 파이프라인 **step 4.15** 배선.
- (1) origin_date가 지난 forecast manifest마다 theme child 전체에 pending gta-v2 라벨 append (멱등 upsert, `ignoreDuplicates`)
- (2) pending마다 048 finalizer payload 구성해 확정 시도 — 값 판정·제외 사유·grace/SLA는 전부 RPC가 서버 측 독립 재검증 (fail-closed)
- **날짜 창(past5+future5+grace)은 계산 캘린더가 아닌 `stock_daily_prices`(KOSPI) 실측에서 파생** — 1.2 사고와 같은 캘린더-실측 불일치 재발 경로를 원천 차단 (`deriveGtAV2Windows`, 단위 테스트에 7/17 휴장 시나리오 포함)
- abstain child → excluded/spec_mismatch 즉시 확정, usable child → horizon 커버하는 frozen keyword group 최신 complete run에서 5+5 관측 로드
- boundary manifest에 runtime 등록, 파이프라인 계약 테스트(analysis-snapshot-fail-loud)에 mock 추가

**프로덕션 1회 실행 실측** (배선 검증):
```
pendingCreated=398 (7/13 origin 200 + 7/20 origin 198)
finalized=200     (7/13 abstain 전량 → excluded/spec_mismatch, 설계대로)
keptPending=198   (7/20 usable — 미래 창 7/27 성숙 + 소스 도착(~7/28) 대기)
failures=0
```
DB 최종 상태: `2026-07-13 excluded/spec_mismatch: 200`, `2026-07-20 pending/pending_gta_v2: 198`.

---

## 2. 축적 시계 — 현재 위치와 캘린더

| 날짜 | origin | usable | study 귀속 | 비고 |
|---|---|---|---|---|
| 2026-07-13 | ✅ | 0 (전량 abstain) | ✗ | 수집 미성숙기, gta-v2 전량 excluded 확정 |
| 2026-07-20 | ✅ | **198** | ✗ | 첫 실질 origin. 라벨 198 pending → 7/28경 final |
| **2026-07-27** | 예정 | — | **✅ #1** | **study 시계 1주차.** B-Abl 관측 바인딩 첫 주 |
| 2026-08-17 (월) | 스킵 | — | — | 광복절 대체휴일 — `isTradingMonday`가 우아하게 스킵 |
| 2026-10-05 (월) | 스킵 | — | — | 개천절 대체휴일 — 동일 |
| **~2027-02-01** | — | — | **#26** | 26 clean origin 도달 예상 (매주 clean 성립 가정) |

이후: Todo 16 candidate cycle 사전등록·시작 → 전향 최소 16주 → L3 효능 판정(~2027 중반) → L4 canary 4주.

**"clean" 유지 조건**: 그 주의 수집·라벨이 깨지면 해당 origin이 빠진다. **CI 그린 유지가 곧 시계 유지** — 1.2 같은 사고가 재발하면 주 단위 손실.

---

## 3. 커밋 대장 (이번 주)

| 커밋 | 내용 |
|---|---|
| `9dca671` | fix(themes): 비교 토큰 스트립 x-스크롤 잘림 (min-w-0 + 가로 스크롤바 height) |
| `b01b77a` | fix(themes): 곡선 있는 완결 아날로그만 서빙, 전량 탈락 시 활성 피어 폴백 |
| `e37a0e6` | fix(tli): HOLIDAYS_2026에 2026-07-17 제헌절 추가 (1차 — 불충분했음) |
| `945014a` | fix(tli): origin 20-slot 창을 RPC(KOSPI 실측) 의미와 일치 (2차 — 근본) |
| `bb9babd` | docs(tli): study contract lock evidence (first origin 2026-07-27) |
| `b07e05c` | feat(tli): gta-v2 foundation 라벨 phase를 일일 파이프라인에 배선 (step 4.15) |

전부 main 배포·CI 그린 확인 완료. 게이트: vitest 3,244/3,244 · tsc/eslint 0 · next build 성공.

---

## 4. 운영 파이프라인 (변경 반영)

`collect-and-score` full 모드 단계 (변경분 굵게):

```
1 DataLab 수집 → 2 뉴스 수집 → 3 종목 수집/활성화 → 3.5 교정
→ 4 점수 계산 → 4.1 GT 라벨(legacy v1) → **4.15 gta-v2 foundation 라벨(신규)**
→ 4.25 phase0 analog materialization → 4.5 임계값 튜닝 → 5 비교 분석
→ 6 예측 스냅샷 → **6.5 B-Abl phase 스냅샷(lock으로 활성화됨)**
→ 6.6 Monday origin manifest → 7 예측 평가 → 8 비교 검증 → 9 IndexNow
```

cron/지연 특성·수동 dispatch·이중 lockfile 규칙은 07-14 문서 §3과 동일하게 유효.

---

## 5. 상태 점검 방법 (맨땅 세션이 바로 실행)

```bash
# CI 최근 실행
gh run list --workflow=tli-collect-data.yml --limit 3 --json status,conclusion,createdAt

# API 헬스 + containment(empty가 정상)
curl -s "https://stockmatrix.co.kr/api/tli/predictions" | grep -o '"dataSource":"[a-z]*"'   # → "none"

# ★ 테마 목록 실제 렌더 (API만 보지 말 것 — 07-14 P0 교훈)
curl -s "https://stockmatrix.co.kr/themes?v=$(date +%s)" | grep -oE 'visibleThemes\\":[0-9]+'
```

프로덕션 DB 실측(read-only)은 `scripts/tli/shared/supabase-admin` 재사용, 임시 스크립트는 실행 후 삭제. 핵심 쿼리:

```sql
-- study 시계: origin·study-origin·usable
SELECT origin_date, expected_theme_count FROM tli_forecast_origin_manifests ORDER BY origin_date;
SELECT count(*) FROM tli_study_origin_manifests;                     -- 7/27부터 ≥1
-- gta-v2 라벨 상태 분포
SELECT base_date, label_status, scientific_use_reason, count(*)
FROM theme_labels WHERE labeler_version='gta-v2' GROUP BY 1,2,3 ORDER BY 1;
-- B-Abl 축적 (lock 이후 매일 증가해야 함)
SELECT count(*) FROM tli_babl_phase_observations;
-- 계약 확인
SELECT id, first_origin_date, babl_algorithm_version, locked_at FROM tli_attention_study_contracts;
```

---

## 6. Watch 항목 / 예정 작업

| 시점 | 항목 | 판정 기준 |
|---|---|---|
| 매일 저녁 run | step 4.15 로그 + B-Abl observations | `실패=0`, observations 일 단위 증가 |
| **7/27(월)** | 첫 study origin 바인딩 | run 로그 `study-origin=1` |
| 7/28경 | 7/20분 gta-v2 라벨 확정 | pending 198 → final(+제외 사유별) 전환, `source_gap_sla` 급증 시 조사 |
| 수시 | `/themes` visibleThemes | 기준 45+ 대비 현재 38 — 하락 추세면 품질게이트 점수 조사 |
| **12월** | **2027 휴장일 테이블 추가 (필수)** | 누락 시 연말·연초 라벨 창 계산이 fail-loud로 깨짐 — 1.2 사고와 동일 계열, 예방 가능 |
| 후속(비차단) | 완결 아날로그 곡선 materialize / 7/18 27테마 오비활성화 조사 / F2 P2 잔여 | §1.1·§1.2 참조 |

---

## 7. 사고 이력에서 나온 불변 규칙 (07-14 §8에 추가)

6. **날짜 창은 계산 캘린더가 아니라 시장 실측(`stock_daily_prices` KOSPI)에서 파생하라.** 하드코딩 휴일 테이블은 법 개정(제헌절 재지정)을 모른다. RPC가 실측 기준으로 fail-closed 검증하므로, 클라이언트가 캘린더로 창을 만들면 어긋나는 순간 조용히가 아니라 시끄럽게 깨진다(그나마 다행) — 애초에 같은 원천을 쓰면 사고 자체가 없다. 신규 코드는 `deriveGtAV2Windows` 패턴을 따를 것.
7. **수정 검증은 재유도가 아니라 실코드 경로로.** 제헌절 1차 수정은 "이러면 되겠지" 재유도 검증으로 배포했다가 CI에서 실패했다. 2차는 실제 프로덕션 로더를 dry-run(198/198)한 뒤 배포해 한 번에 복구. 핵심 경로 수정은 실제 함수·실데이터로 검증 후 배포.
8. **"구현 완료"와 "가동 중"은 다르다.** gta-v2 라벨은 함수·RPC·테스트까지 전부 있었지만 진입점이 없어 몇 주간 0건이었다. 축적 국면의 각 구성요소(수집→origin→라벨→B-Abl)는 **DB 행 수로** 가동을 확인하라 — 코드 존재나 테스트 green으로 판단 금지.
9. **일회성·비가역 계약(lock)은 자유도를 최소화하고 fail-closed에 기대라.** study lock에서 사람이 정한 것은 first_origin_date 하나. 나머지는 DB·코드 pinned 값을 RPC가 대조한다. evidence(git blob)→RPC 순서 준수.

---

## 8. 아키텍처 지도 (07-14 §6에 추가된 진입점)

| 영역 | 경로 |
|---|---|
| gta-v2 일일 오케스트레이션 | `scripts/tli/labels/gta-v2-daily.ts` (step 4.15) |
| gta-v2 빌딩 블록 | `scripts/tli/labels/finalize-gt-a-v2.ts` (pending 생성·순수 판정·RPC 호출) |
| study lock | `scripts/tli/origins/lock-study-contract.ts` — **재실행 금지** (contract_version UNIQUE) |
| study 계약 evidence | `docs/evidence/tli-v3-scientific-rebuild/studies/8c7144f8-f685-4838-8bdc-251f1716e602/` |
| B-Abl 수집 | `scripts/tli/collectors/babl-phase-snapshot.ts` (step 6.5, lock 후 활성) |
| 휴장일 테이블 | `app/archive/_utils/market/_constants/holidays.ts` — **매년 12월 갱신 + 임시공휴일 즉시** |
| 비교 서빙 곡선 필터 | `app/api/tli/themes/[id]/comparison-v4-reader.ts` (`filterAnalogRowsWithCurveData`) |

나머지 지도·성공/완료의 정의(착각 금지)는 07-14 문서 §6·§9가 그대로 유효하다.
