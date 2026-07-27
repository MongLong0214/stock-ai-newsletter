# TLI 앵커 스케일 회귀 — 진단·수정 기록 (2026-07-26)

> 계기: `tli-collect-data` run 30168741646 실패 (`예측 채점 적체 위험: 만기 미채점=609`).
> 그 게이트를 파고들다 **2026-07-07 앵커 투입이 일으킨 광범위한 스케일 회귀**를 발견했다.
> 이 문서는 무엇을 왜 고쳤는지, 무엇을 일부러 안 고쳤는지를 남긴다.
> 선행 상태 문서: [`docs/tli/SSOT.md`](./tli/SSOT.md) (당시 `tli-v3-status-2026-07-22.md`, 현재 SSOT로 통합됨)

---

## 0. 30초 요약

- **단일 근본 원인**: 2026-07-07 DataLab 앵커(`계산기`) 투입이 `interest_metrics.raw_value`의
  스케일을 약 7배 압축했다. `raw_value`를 **절대 임계값**으로 읽던 두 곳이 동시에 망가졌다 —
  GT-A 라벨러(`denominator_floor=4`)와 점수 계산기(`min_raw_interest=4`).
- **피해 실측**: GT-A final 수율 50% → 10%. B-Abl 대조군 채점 성공률 55% → 6%.
  `lifecycle_score` 중앙값 51~54 → 31. `/themes` visibleThemes 45+ → 38.
- **PR 분리**: 긴급도와 리스크가 달라 둘로 나눴다.
  - **이 PR** — ① 예측 채점 만기 기준 SSOT 위반 + 비거래일 고아 예측(파이프라인 실패 직접 원인)
    ② 로컬에서 영구히 깨져 있던 boundary manifest 테스트. 좁고, 프로덕션 dry-run 완료,
    **7/27 study 시계 시작일 전에 들어가야 한다.**
  - **별도 PR** — §5의 점수 계산기 척도 전환(사용자 화면 피해). 이 문서의 §5는 그 PR의
    설계·검증 기록이다.
- **일부러 안 고친 것**: GT-A `gta-v1`의 스케일 의존. PRD B-11상 새 `labeler_version` 발행이
  필요하고 기존 final 15,610건의 지표 축 분리는 Isaac 결정 사항이다. §6 참조.

---

## 1. 최초 증상과 실제 원인의 거리

CI가 죽은 지점은 `pipeline-steps.ts` step 7의 적체 게이트였다.

```
✅ v3 cutoff=2026-07-20, updates=217, metrics=0, skipped=609
❌ 예측 채점 적체 위험: 만기 미채점=609 (500 초과)
```

609건을 DB에서 분해하니 **성격이 다른 셋**이 섞여 있었다.

| prediction_date | 건수 | 정체 |
|---|---|---|
| 2026-07-12 (일, 휴장) | 228 | 라벨이 영원히 생기지 않는 고아 |
| 2026-07-19 (일, 휴장) | 196 | 같은 고아 |
| 2026-07-20 (월, 거래) | 185 | **아직 지평이 안 끝난 정상 대기** |

즉 게이트가 잡은 609건 중 절반 이상은 애초에 적체가 아니었다. 07-21~24 내내 228로
고정이던 숫자가 갑자기 609로 뛴 것이 단서였다.

---

## 2. 수정 1 — 예측 채점 만기 기준 SSOT (파이프라인 실패의 직접 원인)

### 2.1 두 cutoff가 비거래일에 어긋났다

| 위치 | 계산식 |
|---|---|
| 라벨 확정 (`daily-label-phase.ts`) | `addKoreanTradingDays(직전_완료_거래일, -5)` |
| 예측 채점 (`theme-predictions-v3-scoring.ts`) | `addKoreanTradingDays(today, -5)` |

거래일에는 같지만 비거래일에는 갈린다. 일요일 2026-07-26 기준:

```
라벨 cutoff = 2026-07-16   (07-16 + 5거래일 = 07-24, 지평 완료 ✓)
채점 cutoff = 2026-07-20   (07-20 + 5거래일 = 07-27, 아직 미래 ✗)
```

`addKoreanTradingDays('2026-07-26', -1)`은 일·토를 건너뛰고 07-24를 주지만,
`addKoreanTradingDays('2026-07-26', -5)`는 07-24부터 5거래일을 세어 07-20까지 내려간다.
채점 쪽만 2거래일 앞서 나가면서, GT-A 라벨이 존재할 수 없는 base_date의 예측을
"만기 미채점"으로 계상했다. 07-19+07-20의 381건이 그렇게 잡혀 228 → 609가 됐다.

**이건 신규 설계가 아니라 계약 위반이었다.** `scripts/tli/README.md` L55가 이미 명시한다:

> The maturity cutoff is five Korean trading days before the latest completed trading date.
> **On weekends and market holidays, the scheduler first anchors to the preceding trading date**;
> this keeps the cutoff symmetric with each labeler's `base date + 5 trading days` horizon.

수정: `lib/tli/trading-calendar.ts`에 `getLatestMaturedBaseDate()`를 두고 라벨·채점이
이것만 쓰게 했다. 회귀 테스트는 두 cutoff가 항상 같음을, 그리고 만기로 판정한 base_date의
지평이 실제로 끝나 있음을 7월 전 거래일에 대해 검증한다.

### 2.2 주말 크론이 채점 불가능한 예측을 매주 만들고 있었다

`0 17 * * 6` (일요일 KST 02:00) full 런이 비거래일 `prediction_date`로 legacy v3 예측을
스냅샷해 왔다. GT-A는 비거래일 base_date를 라벨 대상에서 제외하므로
(`exclude_reason='non_trading_base_date'`) 이 행들은 짝지을 라벨이 영원히 없다.
주말마다 ~190건씩 단조 증가한다 — 228(07-12)과 196(07-19)이 그것이다.

수정 2겹:

- **생성 차단** (`theme-predictions-v3.ts`): 비거래일이면 스냅샷을 건너뛴다.
  공개 서빙은 scientific 뷰(049 `tli_public_scientific_predictions_v3`)만 읽으므로
  이 legacy 행을 건너뛰어도 UI 영향이 없다.
- **자기치유** (`theme-predictions-v3-scoring.ts`): 이미 쌓인 행은 `excluded`로 닫는다.
  라벨 쪽 `closeNonTradingBaseDatePendingLabels()`와 같은 처리다.
  service_role은 `(actual_g, actual_y, scored_at, score_status)`만 UPDATE 권한이 있어
  (049 GRANT) `score_exclusion_reason`은 남기지 못한다.

### 2.3 프로덕션 데이터 dry-run (read-only)

```
today=2026-07-26 → cutoff 07-16, 228건 로딩 전부 고아 정리 → 잔여   0건  PASS
today=2026-07-27 → cutoff 07-20, 424건 정리 + 185건 채점 → 잔여 185건  PASS
```

수동 DB 정리는 필요 없다. 다음 실행에서 자동으로 빠진다.

### 2.4 주말 실행에 대한 판단

**끄면 안 된다.** `collect-and-score.ts:43`이 테마 발견을 **일/수 주 2회**로 돌리고,
그 일요일 슬롯을 이 크론이 담당한다. 라벨 백로그 재시도도 여기서 한 번 더 돈다
(`daily-label-phase-non-trading.test.ts`의 "recovers a failed Friday cutoff on Sunday").

문제는 "주말에 도는 것"이 아니라 **주말에 거래일 전용 산출물을 만든 것**이었고 §2.2에서 막았다.
끄려면 테마 발견 요일 게이트를 `일/수 → 수/금`으로 옮기고 크론을 news-only로 바꿔야 한다.

---

## 3. 근본 원인 — 2026-07-07 앵커 투입

### 3.1 DataLab은 요청 전체를 통틀어 정규화한다

`naver-datalab.ts` L84-90이 테마 4개 + 앵커 1개를 **한 요청**에 담는다.
네이버는 요청 안의 모든 키워드 그룹을 통틀어 최대=100으로 정규화한다.
앵커 `계산기`는 초대형 일반 검색어라 사실상 항상 100을 가져간다.

실측으로 확인했다 — 220개 테마 중 자기 30일 창에서 `raw_value=100`에 도달한 건 **4개(1.8%)**.
그룹별 정규화라면 100%여야 한다. 프로덕션 로그의 테마별 max ratio:

```
치아 치료(임플란트 등): 0.02317    NFT: 0.70304    AI 반도체: 39.71221
GTX: 3.09608    CCTV＆DVR: 0.09077    日제품 불매운동: 0.21245
```

여기에 `Math.round()`(`naver-datalab-observations.ts:27`)가 걸려 대부분 **0**이 된다.

### 3.2 데이터 경계가 정확히 앵커 첫 실행의 30일 창

`interest_metrics`는 매 실행마다 30일 창 전체를 다시 쓴다(`collection-pipeline.ts:63`,
`daysAgo(30)`). 첫 앵커 실행은 커밋 `c966e3c` (2026-07-07 10:19 KST), 요청 창 06-07~07-07.

```
time         zero%   p50   mean     anchor_scaled 적재
2026-06-06     16%     6   18.61      0     ← 앵커 이전
2026-06-07     59%     0    2.37      0     ← 소급 재기록됨
...
2026-07-05     59%     0    2.68      0
2026-07-06     50%     0    3.52    209     ← 앵커 적재 시작
```

스케일이 약 7배 압축된 채 고정됐다.

### 3.3 절대 임계값 두 개가 동시에 무너졌다

| 위치 | 상수 | 결과 |
|---|---|---|
| `lib/tli/labels/gt-a.ts` | `DENOMINATOR_FLOOR = 4` | GT-A final 수율 50% → 10% |
| `lib/tli/calculator.ts` | `min_raw_interest = 4` | 감쇠 대상 36.9% → 88.1% |

GT-A는 라벨이 t+5거래일에 확정되고 불변이라, 붕괴가 `base_date 2026-06-30`부터 나타난다
(06-29는 07-06에 = 앵커 직전 확정, 06-30은 07-07에 = 앵커 직후 확정).

```
base_date 2026-06-29   final=131  denominator_floor=72    → 50%
base_date 2026-06-30   final= 31  denominator_floor=173   → 12%
```

B-Abl 대조군(`theme_predictions_v3`, `model_version=b-abl-v1`)도 같이 죽었다:
채점 성공률 **앵커 이전 55% → 이후 6%**.

---

## 4. 왜 3주간 아무도 못 잡았나

### 4.1 유일한 정량 게이트가 스케일 불변량이었다

PRD `T-103`의 라벨 검증 게이트는 **base rate 20~50%** 하나다(PRD L203, L538 Q1).
base rate는 `y=1`의 비율 — 스케일이 7배 압축돼도 변하지 않는다.
실측 base rate는 지금도 **27.8%**로 게이트를 통과한다.
앵커가 망가뜨린 건 균형이 아니라 **수율**이었고, 수율에 대한 게이트는 어디에도 없다.

### 4.2 착수 순서가 백필과 앵커를 병렬로 놨다

PRD L1227: `T-101 → **T-102(백필) ∥ T-105(앵커)** → T-103(δ 검증 게이트)`.
라벨 기준선을 만드는 작업과 그 기준선의 원재료 스케일을 바꾸는 작업이 동시에 돌았고,
검증은 둘 다 끝난 뒤에 왔다. 실제로 두 티켓은 같은 커밋 `c966e3c`에 들어갔다.

### 4.3 앵커 감시가 크기가 아니라 안정성만 봤다

T-106 앵커 감시(`npm run tli:anchor:stability`)는 앵커 **자신의 CV**만 본다.
앵커 선정 근거(PRD Q2)도 *"유틸리티성 검색어는 이벤트·계절 스파이크가 거의 없음"* —
**안정성**만 따졌고 **크기가 테마를 짓누르는지**는 판정 항목에 없었다.

### 4.4 PRD가 성립할 수 없는 전제를 명시했다

PRD L859 (T-105): *"`anchor_scaled_value`를 interest_metrics upsert에 포함
(**raw_value는 절대 불변**)"*

그런데 같은 PRD L261이 그 전제가 왜 성립할 수 없는지를 이미 적어놨다 —
옵션 B를 기각한 논거다(Boomer B-10):

> **DataLab 상대값은 같은 요청 그룹 안에서만 비교 가능하므로**, 앵커 배치에 없는
> 나머지 배치들은 앵커와 연결 고리가 없다.

그룹을 하나 추가하면 나머지 4개의 정규화 기준이 바뀐다. 옵션 B를 죽인 바로 그 논거가
옵션 A에도 적용된다는 것을 놓쳤다.

### 4.5 이 버그는 5개월 전에 이미 한 번 고쳐졌다 — 다른 필드에서

`docs/TLI-WORK-LOG.md` Phase 3 (2026-02-06, 커밋 `57567ea`):

```
변경 전: normalized: dataPoint.ratio   // 배치 5개 테마 상대값 그대로
변경 후: normalized: ratio / themeMax * 100
→ "배치 구성 변경에 무관하게 테마 자체 피크 대비 0~100 스케일"
```

**앵커 투입이 바로 그 "배치 구성 변경"이다.** 2월에 면역을 준 `normalized`는 멀쩡했고,
일부러 원본으로 남긴 `raw_value`만 7월에 죽었다.

그리고 앵커를 제안한 리포트(`_research/reports/20260211_1810_tli_algorithm_quality_report.md` §4)는
`raw_value`가 배치 의존적이라는 것을 **정량으로 측정해놓고도**(r=0.501, "배치 내만"),
단점으로는 *"배치 처리량 20% 감소"*와 *"앵커 키워드의 계절적 변동"*만 적었다.

마지막 아이러니 — `docs/tli-algorithm-redesign-spec.md:393`:

```
// 주의: raw_value만 사용. normalized 값 사용 금지 (자기정규화 편향)
```

**스펙이 망가질 필드를 쓰라고 명령하고 있었다.** `calculator.ts`는 규칙을 성실히 지켰을 뿐이다.
2월엔 옳았던 규칙이 7월에 부채가 됐다.

---

## 5. 수정 2 — 점수 계산기를 앵커 척도로 전환 (별도 PR)

> 이 절은 **별도 PR**의 설계·검증 기록이다. 파이프라인 실패 수정(§2)과 긴급도·리스크가
> 달라 분리했다 — §2는 좁고 dry-run으로 끝났지만, 이 변경은 사용자 화면 점수를 바꾸므로
> 서두르지 않고 리뷰받아야 한다.

### 5.1 요구사항이 원래 둘인데, 필드도 이미 둘 다 있다

| 용도 | 필요 성질 | 맞는 필드 | 전환 전 |
|---|---|---|---|
| 테마 간 레벨 비교 (점수) | 절대 스케일 + 해상도 | `anchor_scaled_value` | ❌ `raw_value` |
| 테마 내 비율 (GT-A 라벨) | 배치 무관 | `normalized` | gta-v1 ❌ / gta-v2 ✅ |

`anchor_scaled_value = ratio × (1 / max(앵커 7일 중앙값, 1))`. 정수 반올림이 없고
앵커 기준이라 테마 간 비교가 성립한다. PRD L303이 `interest_level_pct`에 배정해둔 컬럼인데
점수 계산은 쓰지 않고 있었다. 2026-07-06부터 매일 전 테마 적재 중이다.

실측 비교 (최근 7일 평균, 활성 테마):

```
raw_value        : 0값 테마 48.2%,  p50=0.14,   p90=4.29
anchor_scaled    : 0값 테마  0.0%,  p50=0.00567, p90=0.05786
```

### 5.2 임계값을 임의로 정하지 않았다

`min_raw_interest = 4`를 단위 환산하면 앵커 도입으로 **이미 어긋난 감쇠율을 그대로 박제**한다.
그래서 **감쇠 대상 비율**을 기준으로 역산했다.

```
앵커 이전(base ≤ 2026-06-06) min_raw_interest=4 감쇠 대상 : 36.9%  ← 설계 의도
현재 raw_value 기준 감쇠 대상                              : 88.1%  ← 폭주
현재 앵커 척도에서 36.9%를 재현하는 임계값                  : 0.0031
채택값 MIN_ANCHOR_INTEREST                                : 0.003  (감쇠 대상 36.5%)
```

이 값은 앵커 키워드가 바뀌면 다시 역산해야 한다 (PRD §5.4.1 CV>0.3 앵커 교체 경로).

**인정할 트레이드오프**: `MIN_ANCHOR_INTEREST`도 여전히 **절대 임계값**이다. `계산기`의 검색량이
계절적으로 움직이면 모든 `anchor_scaled_value`가 이동하고 0.003이 다른 비율을 감쇠한다 —
이 문서가 비판하는 것과 같은 결합 구조다. 백분위 기반 감쇠면 완전히 없앨 수 있지만
"절대적으로 미미함"이라는 원 의미를 잃는다. 그래서 **결합을 줄였지 없애지는 않았다**:
앵커는 낮은 CV 기준으로 선정됐고(PRD Q2) CV>0.3 감시가 걸려 있어 raw_value보다 훨씬 안정적이다.
앵커 교체 시 재역산은 필수다.

### 5.3 척도는 런 단위로 한 번만 정한다

두 척도는 크기가 세 자릿수 다르므로 **한 백분위 모집단에 섞으면 안 된다**.
`lib/tli/interest-scale.ts`가 SSOT다:

- `resolveRunInterestScale()` — 테마 과반이 앵커 관측 3일 이상이면 `'anchor'`, 아니면 `'raw'`
- `resolveInterestLevel(window, scale)` — 해당 척도의 값만 읽고, 부족하면 `null`

`calculate-scores.ts`가 척도를 확정해 교차 모집단과 `calculateLifecycleScore(interestScale)`에
동일하게 넘긴다. **기본값은 `'raw'`** — 호출부가 명시할 때만 전환되므로 옵티마이저·기존 테스트
동작은 그대로다. 앵커 적재 이전 구간을 재계산하면 자동으로 `'raw'`로 남는다.

### 5.4 점수 영향 실측 (read-only dry-run, 2026-07-26)

```
런 척도 판정: anchor
percentile 모집단: raw=112개 → anchor=220개  (활성 테마 241)

지표            현재(raw)   수정후(anchor)
점수 p25            36            48
점수 p50            43            58
점수 p75            50            65
점수 p90            62            69
감쇠 대상 비율    87.8%         36.6%
감쇠계수 중앙값   0.036         1.000
```

감쇠 대상 36.6%는 역산 목표였던 앵커 이전 36.9%를 재현한다.
`/themes` visibleThemes 하락(45+ → 38, 당시 status 문서 §6 Watch 항목, 현 `docs/tli/SSOT.md`)의
원인이 이것이고, 이 수정이 그 항목의 답이다.

> 주의: 위 dry-run은 저장된 `smoothed_score`가 아니라 원점수 재계산이라
> 저장 값(현재 중앙값 31)과 직접 비교하면 안 된다. 봐야 할 것은 두 컬럼의 **차이**다.

### 5.5 stage 영향 실측 — 순차 재생

점수는 stage 판정으로 흘러가고, `determineStage`에는 `score >= 50` Peak 바이패스가 있다
(`stage.ts:75`). 중앙값을 15점 올리면 이 문턱을 넘는 테마가 늘어나므로 **사용자에게 보이는
라벨이 실제로 어떻게 바뀌는지**를 따로 측정해야 한다.

`prevStage` 없이 원점수만 넣은 1차 dry-run은 `Peak 36 → 115`라는 값을 냈지만 **이건 허상이다.**
프로덕션은 `resolveStageWithHysteresis`를 거친다 — `determineStage(smoothedScore, ..., prevStage,
dataGapDays)` + Markov 전이 제약 + 2일 연속 hysteresis.

저장된 2026-07-16 상태(stage·smoothed_score)를 시드로 8거래일을 순차 재생했다:

```
stage        실제저장(07-26)  재생:raw   재생:anchor
  Emerging           45          45            45
  Growth             49          49            49
  Peak              142         142           142
척도 전환으로 stage가 바뀌는 테마: 0 / 241
```

재생 결과가 실제 저장 분포와 **정확히 일치**하므로 재생 충실도가 검증됐고,
두 척도의 결과가 동일하므로 **stage 라벨은 단기간 전혀 움직이지 않는다.**
Markov 제약(`Emerging → {Growth, Dormant}`, `Peak → {Decline, Growth}`)과 hysteresis가
점수 변화를 흡수한다.

한계 — 이 재생이 보장하지 않는 것:
- 8거래일 구간만 확인했다. 더 긴 구간에서는 candidate 경로가 갈려 분포가 벌어질 수 있다.
- 재생의 `smoothed_score` 중앙값은 raw=41로 실제 저장값 31과 10점 차이가 난다
  (`recentSmoothed` 이력을 빈 배열로 시작하고 일중 다중 실행을 재현하지 않음).
  즉 **절대 수준은 근사이고, 신뢰할 수 있는 것은 두 척도의 차이다.**
- Peak 142는 앵커 이전 고득점기에 형성돼 Markov로 고착된 재고다. 이 PR이 만든 게 아니고
  해소하지도 않는다 — 별도 과제.

---

## 6. 일부러 고치지 않은 것 — GT-A `gta-v1`

`DENOMINATOR_FLOOR = 4`를 그냥 낮추면 안 된다. PRD Boomer B-11이 명시한다:

> **δ 변경은 새 labeler_version 발행으로만 가능하며, 서로 다른 labeler_version의 지표는
> 절대 동일 축에서 비교·보고하지 않는다.**

조용히 바꾸면 기존 final 라벨 15,610건과 섞여 모든 지표가 오염된다.

방향 자체는 이미 저장소 안에 있다. `lib/tli/labels/gt-a-v2.ts` L7·L13:

```
denominator_valid(t) = 1[past_mean > 0]   ← 정확히 이것만. 양수 absolute floor 금지.
scale invariance: 임의의 양수 상수 c를 곱해도 eligibility/ratio/growth/y가 모두 불변
```

그리고 `gta-v2`는 `raw_value`가 아니라 `tli_interest_observations.normalized`를 읽는다
(`gta-v2-daily.ts:115`) — 배치 스케일이 약분되는 필드다. **누군가 이미 정답을 만들어놨다.**

다만 `gta-v2`는 Monday origin manifest에 묶인 **주간 전향 연구 트랙**이라,
매일 돌며 `theme_predictions_v3` 채점과 `model_metrics_daily`를 먹이는 `gta-v1`을
대체하지 못한다. 전환하려면 결정이 필요하다:

1. 새 `labeler_version` 이름과 소급 재라벨 범위
2. 기존 `gta-v1` final 15,610건과의 지표 축 분리 방법
3. B-Abl 대조군 재채점 여부 (PRD §5.6의 라벨 교체 효과 분리 측정이 걸려 있음)

**Isaac 결정 대기.**

---

## 7. 수정 3 — boundary manifest 테스트 (부수)

`scripts/tli/__tests__/tli-boundary-manifest.test.ts`가 디스크를 훑어 매니페스트 키와
비교하는데, 매니페스트가 optimizer의 **gitignore된 생성물 2개**를 분류 대상에 넣어둬
클린 체크아웃에서 항상 실패했다 (CI에는 파일이 없어 통과, 로컬만 빨강).

- 탐색을 `readdirSync` → `git ls-files`로 교체 (추적 파일만, 실행 환경 무관)
- 매니페스트에서 `historical-data.json` / `optimized-params.json` 제거 —
  `.gitignore:64-65`가 이미 커밋을 막고 있고 `dump-data.test.ts`가 그 등록을 강제한다.
  저장소 파일이 아니므로 경계 매니페스트의 분류 대상이 아니다.

추적 파일 누락 감지라는 원래 목적은 그대로다.

---

## 8. 변경 파일

### 이 PR (파이프라인 실패 + 테스트)

| 파일 | 내용 |
|---|---|
| `lib/tli/trading-calendar.ts` | `getLatestMaturedBaseDate()` 신규 — 만기 기준 SSOT |
| `scripts/tli/labels/daily-label-phase.ts` | 위 함수 사용 |
| `scripts/tli/comparison/theme-predictions-v3-scoring.ts` | 같은 cutoff + 비거래일 고아 `excluded` 자기치유 |
| `scripts/tli/comparison/theme-predictions-v3.ts` | 비거래일 legacy 스냅샷 생성 차단 |
| `scripts/tli/batch/pipeline-steps.ts` | step 7 로그에 `비거래일 정리` 노출 |
| `scripts/tli/tli-boundary-manifest.ts` | gitignore 생성물 2건 제거 |
| `scripts/tli/__tests__/tli-boundary-manifest.test.ts` | `git ls-files` 기반 탐색 |
| `scripts/tli/__tests__/prediction-scoring-maturity.test.ts` | **신규** 회귀 8건 |
| `docs/tli-anchor-scale-regression-2026-07-26.md` | 이 문서 |

### 별도 PR (점수 척도)

| 파일 | 내용 |
|---|---|
| `lib/tli/interest-scale.ts` | **신규** — 척도 판정·값 추출 SSOT |
| `lib/tli/calculator.ts` | `interestScale` 입력 + 척도별 감쇠 임계값 |
| `lib/tli/constants/score-config.ts` | `MIN_ANCHOR_INTEREST` + `getNoiseFloor` + 캘리브레이션 상태 노출 |
| `lib/tli/constants/tli-params.ts` | `min_raw_interest` 미반영 경고 주석 |
| `lib/tli/types/db.ts` | `anchor_scaled_value`, `components.raw.interest_scale` |
| `scripts/tli/scoring/calculate-scores.ts` | 런 척도 확정 + 무시된 캘리브레이션 경고 |
| `lib/tli/__tests__/interest-scale.test.ts` | **신규** 회귀 10건 |

검증(두 PR 합산): `tsc` 0 · `eslint` 에러 0(경고 22건 전부 `scripts/tli/research/` 기존분) ·
`next build --turbopack` 성공 · `vitest` **271 파일 3,293 테스트 전부 통과**.
신규 회귀 테스트는 수정 전 코드에서 실패함을 확인했다
(예: `expected '2026-07-20' to be '2026-07-16'`).

---

## 9. 남은 감시 항목

| 시점 | 항목 | 판정 기준 |
|---|---|---|
| **7/27(월) 첫 실행** | step 7 로그 | `비거래일 정리=424`, 적체 게이트 통과 |
| 7/27 이후 | `Cross-theme percentile` 로그 | `척도=anchor`, 모집단 220 내외 |
| 7/27 이후 | `/themes` visibleThemes | 45+ 회복 여부 |
| 7/28경 | `gta-v2` 7/20분 라벨 확정 | pending 198 → final (07-22 문서 §6과 동일) |
| **상시 (미구현)** | **GT-A 일일 final 수율** | 게이트 없음 — §4.1이 이번 사고의 구조적 원인 |
| 앵커 교체 시 | `MIN_ANCHOR_INTEREST` | §5.2 절차로 재역산 필수 |

### 자기리뷰에서 나온 잔여 결합 (이 PR에서 처리)

점수 척도 전환을 자기리뷰하며 찾은 것들이다. 전부 "조용히 무효가 되는" 유형이라
드러나게 만들었다.

| 결합 | 상태 | 처리 |
|---|---|---|
| `load-calibrations` → `setMinRawInterest()`가 앵커 척도에서 무시됨 | 현재 DB에 `noise_threshold` 행 없어 휴면 | `describeNoiseFloorCalibration()` + 런 경고 추가 |
| 옵티마이저 `min_raw_interest`가 프로덕션에 미반영 | 옵티마이저는 앵커 이전 구간을 재생하므로 자연히 raw 척도 | `TLIParams`에 경고 주석 명시 |
| 옵티마이저가 `allThemesRawAvg` 미전달 → sigmoid 경로 | **이 PR 이전부터 존재하던 발산** | 미해결, 아래 권고 4 |

### 권고 (미착수)

1. **라벨 수율 게이트 신설.** 이번 사고가 3주간 조용했던 유일한 이유가 §4.1이다.
   일일 `final / (final+excluded)` 비율이 임계 아래로 떨어지면 실패시켜야 한다.
2. **`raw_value` 절대 임계값 전수 점검.** 이 두 곳 외에 남아 있는지 확인.
3. **앵커 척도 노이즈 임계값을 탐색 파라미터로 승격.** 현재 `MIN_ANCHOR_INTEREST`는
   `TLIParams` 32개 탐색 공간 밖의 상수다. 옵티마이저가 튜닝할 수 있게 하려면
   `param_space.py`까지 함께 넓혀야 한다.
4. **옵티마이저-프로덕션 levelScore 발산 해소.** `evaluate.ts`가 `allThemesRawAvg`를
   넘기지 않아 프로덕션(percentile)과 다른 경로(sigmoid)를 탄다. 이 PR 이전부터의 문제다.
5. **Peak 고착 재고 142건.** 앵커 이전 고득점기에 형성돼 Markov로 굳었다. 활성 테마의 60%가
   Peak인 상태는 사용자 신호로서 의미가 옅다. 이 PR 범위 밖.
6. **`docs/tli/scientific-rebuild-master-plan.md`(당시 .omo 경로) 부재.** 07-14/07-22 문서가
   "TLI 작업 전 반드시 Read"로 지정한 SSOT인데 저장소에도 홈 디렉토리에도 없다.
   26주 시계·게이트 기준의 원본이 현재 어떤 세션도 읽을 수 없는 상태다.
