# PRD — TLI v3 전면 재구성: Closed-Loop Theme Intelligence

> **버전**: v2.0 (Phase 1~4 실행판) · **갱신**: 2026-07-06 · **작성**: Claude (오케스트레이터) + Explore 4기 + Boomer 수렴 (부록 C) + 문헌 리서치 3기 (부록 F) + 구현 계약 (부록 G)
> **상태**: **Phase 0 완료** (2026-07-06, CTO 리뷰 22건 수정 + 빌드 3종·테스트 2,317개 통과 + 커밋 `bed3040` — as-built 기록은 부록 H). **Phase 1 착수 가능** — 구현 에이전트는 [부록 H → 부록 E 해당 티켓 → 부록 G/D 참조] 순으로 읽고 티켓 단위로 작업하라
> **오픈 퀘스천**: Q1~Q6 전부 결정 완료 (§11)
> **범위**: `lib/tli/*`(85파일), `scripts/tli/*`, `.github/workflows/tli-collect-data.yml`, TLI 관련 DB 스키마(마이그레이션 003~028), `app/themes/*` + `app/api/tli/*` 노출면
> **비범위**: 뉴스레터 파이프라인(`lib/llm/korea`), 블로그/SEO, 구독 시스템

---

## 0. 이 문서의 지위

이 PRD는 아래 산재 문서들을 **대체하는 단일 상위 문서**다. 승인 시 아래 문서는 전부 `docs/archive/tli/`로 이동하고 역사 기록으로만 유지한다.

| 대체되는 문서 | 사유 |
|---|---|
| `docs/TLI_FINAL_PRD.md` | v1 설계. 자기참조 라벨 문제 미인지 |
| `docs/tli-algorithm-redesign-spec.md`, `docs/tli-evolution-strategy-v2.md` | 중간 세대 설계. 현행과 불일치 |
| `docs/comparison-v3-prd.md`, `docs/comparison-v4-prd.md`, `docs/comparison-v4-*.md` (5종) | v4 비교 엔진 문서군. §7 처분표로 흡수 |
| `docs/tli-comparison-level4-*.md` (6종), `docs/tli-comparison-level45-roadmap-prd.md` | Level4/4.5 인증 사다리. §7에서 대부분 폐기 결정 |
| `docs/prediction-improvement-plan.md` | v2 예측 계획. 진단(§2)은 계승, 처방은 본 문서로 대체 |
| `docs/prd/PRD-tli-parameter-optimization.md` | Optuna 최적화 PRD. 학습 루프(§5.7)로 흡수 |

> **문서 산재 자체가 증상이다**: TLI 재설계 문서가 14개 이상 존재하고 서로 다른 세대의 설계가 코드에 동시에 살아있다. v3의 문서 원칙: **PRD 1개 + 런북 1개 + methodology(자동 갱신) 1개**, 그 외 금지.

### 용어

| 용어 | 정의 |
|---|---|
| **TLI** | Theme Lifecycle Index. 테마별 관심도 생명주기 점수(0~100) |
| **raw_value** | Naver DataLab 원본 관심도(테마별 30일 창 내 상대값). 시스템이 변형할 수 없는 유일한 외부 관측치 |
| **GT (Ground Truth)** | 시스템 외부에서 관측되는 결과 라벨. §5.2 |
| **자기참조 라벨** | 시스템이 자체 파라미터로 만든 값(smoothed score, Stage)을 그 시스템의 예측 대상으로 쓰는 것 |
| **Point-in-time** | 시점 t의 예측에 t 이후 정보가 스며들지 않도록 하는 데이터 규율 |
| **GDDA** | Growth/Decline Direction Accuracy. raw_value 미래 방향으로 Stage 라벨을 채점하는 기존 지표 |
| **에피소드** | 테마의 활성 구간(spike~소멸). 완결 에피소드만 학습 라벨로 사용 |

---

## 1. Executive Summary

**진단.** TLI는 크론 3종(평일 장마감 후 full, 매일 아침 news-only, 주말 full)으로 데이터를 성실히 쌓고 있지만, 시스템이 좋아지지 않는 이유는 데이터 부족이 아니라 **구조**다. (1) 예측 대상이 자기 자신이 만든 라벨(Stage/Phase)이고 그 라벨은 스무딩 파이프라인 특성상 기억이 ~2일뿐이라 예측할 정보 자체가 없으며(14일 상호정보량 0.055bits, 자체 실측), (2) 쌓인 평가 데이터를 소비해 파라미터를 바꾸는 경로가 50개 파라미터 중 4개(월 1회)에만 연결돼 있고 정작 예측을 결정하는 상수들은 어떤 루프에도 연결돼 있지 않으며, (3) 데이터 규모(테마 ~87개, 점수 행 ~2,236 @ 3/17)가 도달할 수 없는 엔터프라이즈 게이트(eval 5,000행, live 쿼리 400건) 뒤에 신형 시스템이 영구 shadow로 잠들어 있고, (4) 사용자에게 보여주는 예측(클라이언트 실시간 재계산)과 정확도를 추적하는 예측(DB 스냅샷)이 서로 다른 객체라 개선이 일어나도 증명할 수 없다.

**처방.** 예측 대상을 시스템 외부의 관측치(raw_value 실현 성장, 테마 바스켓 초과수익)로 교체하고, 그 라벨을 향해 매주 자동으로 재학습·평가·승격되는 **닫힌 학습 루프**를 데이터 규모에 맞는 크기로 구축한다. 보여주는 값 = 저장하는 값 = 채점하는 값을 단일 객체로 강제하고, 규모에 맞지 않는 기계(TCAR 인증 사다리, Level4 승격 의례, 미결선 코드)는 삭제한다. 파라미터는 50개 → 20개로 감축하되(부록 B.1 합산), 남는 모든 파라미터는 "자동 루프 소속" 또는 "고정 상수 문서화" 둘 중 하나여야 한다.

**성공 기준 요약** (상세 §4): 활성 테마 80%+에 캘리브레이션된 확률 예측 제공(현 5.8%), ECE ≤ 0.08, 사람 개입 0의 자동 학습 루프(4주 사이클) 가동, 무음 실패 0, 실측 정확도의 사용자 노출.

---

## 2. 문제 정의 — 왜 데이터가 쌓여도 개선되지 않는가

> 이 장의 모든 주장은 2026-07-03 코드 기준 실측이다. 발견사항 전체 대장은 부록 A(46건).

### RC-1. 채점·최적화 라벨이 자기참조다 (설계 결함, 최상위)

> 정밀화 (Boomer 반론 B-1 반영): 자기참조는 "예측 생성 경로"가 아니라 **"채점 라벨"**에 있다. 경로별로 분리하면 —
> - **생성**: UI 카드의 Phase는 Stage가 아니라 아날로그 비교군의 day-ratio 휴리스틱으로 계산된다 (`prediction.ts:41`이 stage 인자를 `void _stage`로 버림 — v2가 "Stage-derived Phase"를 설계하고 구현은 포기한 흔적). 반면 `/api/tli/predictions` 목록 API는 `STAGE_TO_PHASE` 매핑을 쓴다 — **같은 "Phase"가 두 경로에서 다르게 만들어진다**는 것 자체가 별도 결함이다.
> - **채점**: `evaluate-predictions.ts`의 `phase_correct`는 예측 Phase를 **그 테마의 t+7 Stage**(자기 파이프라인 산출물)와 대조한다. 여기가 자기참조의 본체다.

채점 라벨(Stage)은 smoothed score의 파생물이고, smoothed score는 EMA(반감기 ~2일) + 히스테리시스(2일 확인) + Cautious Decay(`cautious_floor_ratio=0.9467`, 일 최대 ~5% 하락 제한) + Bollinger 클램프의 산물이다.

- 자체 실측(`docs/prediction-improvement-plan.md`): Stage 14일 지속률 **23.4%** (v1 가정 65~85%), Peak 14일 지속률 **0%**, 상호정보량 MI(Stage_t; Stage_t+14) = **0.055 bits (2.8%)** — Stage는 자기 미래에 대해 정보가 거의 없는 라벨이다.
- v2(2026-02-27)는 이 진단을 해놓고도 **같은 라벨의 채점 창만 14→7일로 단축**했다. 결과: 7일 3-Phase 지속률 51.4%, Rising 60.8%, **Cooling 38.0% — majority baseline(38.6%)보다 낮다**. 그대로 서빙 중이다.
- 스무딩이 라벨을 오염시킨다: 파이프라인이 인위적 자기상관(EMA)과 인위적 비대칭(Cautious Decay: 하락만 억제)을 주입한 산출물을 "정답"으로 삼으므로, 이 라벨 체계 아래서의 정확도는 **미래 관심도가 아니라 자신의 필터 특성**을 반영한다.
- 반례가 이미 저장소 안에 있다: GDDA(`scripts/tli/research/optimizer/evaluate.ts`)는 채점 기준을 **raw_value**(수집 원본)로 잡아 순환참조를 회피했고 66.6%를 얻었다. 즉 **외부 계열로 채점하면 배울 수 있다는 증거가 내부에 이미 존재**하며, v3의 GT-A는 이 검증된 사상을 예측 시스템 전체로 확장하는 것이다.

**결론 (정정된 강도)**: 현행 채점 라벨 체계를 유지하는 한 데이터 축적은 Phase 정확도 천장(≈51%)을 올리지 못한다. 이 주장은 반증 가능해야 하므로(Boomer B-2), **Phase 2에서 "현행 서빙 휴리스틱의 판정을 GT-A로 채점한 성능"(베이스라인 B-abl, §5.6)을 반드시 산출**해 라벨 교체 효과를 실험으로 분리 측정한다 — B-abl이 이미 충분히 좋다면 모델 교체 없이 라벨·루프 교체만으로 종료할 수 있다.

### RC-2. 학습 루프가 물리적으로 끊겨 있다 (운영 결함)

데이터 → 파라미터 갱신 → 서빙 반영의 각 연결 상태 (Explore-eval 전수 확인):

| 연결 | 상태 |
|---|---|
| 원천 수집(DataLab/뉴스/시세) → DB | ✅ 자동 (cron 3종) |
| 수집 → score/stage 계산 | ✅ 자동 |
| 예측 → 사후평가 적재 (`prediction_snapshots_v2.phase_correct` 등) | ✅ 자동 (매일) |
| 평가 → confidence **표시 라벨** 임계값 | 🟡 자동 (월 1회) — 예측 자체는 불변 |
| 평가 → noise threshold / entropy 가중 4개 | 🟡 자동 (월 1회) — 50개 중 4개 |
| 평가 → stage 임계값/EMA/sigmoid 등 19개 | ❌ 수동 (Python Optuna, **2026-03-17 단 1회 실행**, 자체 정책 "3개월 주기" 대비 3.5개월 초과, 초과를 알려줄 장치 없음) |
| 평가 → **phase 판정 상수** (`momentum_*`, `phase_rising_ratio` 등 예측을 직접 결정) | ❌ **경로 자체가 없음. 영구 하드코딩** |
| 평가 → 비교(analog) 가중치·승격 | ❌ 수동 CLI 의례 (`tli:level4:*`, `tli:v4:promote`), **운영 실행 이력 사실상 0회** (git 이력 3커밋 전부 초기 구축) |

물증 3건:

1. **Fallback만 정밀 튜닝**: Optuna가 6자리 소수로 튜닝한 `ema_alpha=0.416554`는 `score-smoothing.ts:13`에서 `firstSpikeDate`가 없을 때만 쓰이는 **fallback 분기**다. 대다수 테마가 타는 주경로는 `ema_alpha_fresh=0.6 / ema_alpha_mature=0.3`(수작업 예시값)인데 탐색공간에 들어간 적이 없다.
2. **최적화 결과 반영이 복붙**: `TLI_PARAMS_VERSION=v2` 로딩 분기(`tli-params.ts:182`)는 테스트 외 어디서도 설정된 적 없는 죽은 경로다. 3/17 결과는 사람이 `DEFAULT_TLI_PARAMS`에 손으로 붙여넣었다. 다음 최적화도 사람이 기억해야 실행된다.
3. **"Bayesian Optimized" 위표기**: `tli-params.ts`의 comparison 파라미터 5개(`curve_shape_weight` 0.35, `curve_derivative_weight` 0.30, `curve_dtw_weight` 0.35, `lifecycle_post_peak_weight` 0.6, `lifecycle_drawdown_weight` 0.4)는 "Bayesian Optimized (2026-03-17)" 블록 안에 있지만 `param_space.py` 탐색공간에 **존재한 적이 없다**. 수작업 값이 최적화된 것처럼 오표기돼 있어, 미래의 유지보수자는 이 값을 "검증됨"으로 오신한다.

### RC-3. 복잡도가 데이터 규모와 불일치한다 (경제 결함)

- **실데이터 규모** (`historical-data.json`, 2026-03-17 덤프): 테마 87개, 테마당 관심도 68일, lifecycle 점수 총 **2,236행**. 현재(7/3)는 추정 2~3배.
- **게이트 요구치** (`forecast/types.ts GATE_THRESHOLDS`): native eval **5,000행**, live 쿼리 **400건**, slice당 live 50건·eval 300행, prospective shadow 6주, weekly cohort 8개, 롤백 드릴 2회, 4주 연속 통과 후 cutover…
- 결과: TCAR-002 아날로그/서바이벌/캘리브레이션 파이프라인은 **완성됐지만 영원히 shadow**다. 최신 서빙 리더 `loadServedForecastBundle`(`forecast-reader.ts`)은 **레포 전체 호출부 0건**, Stage2 reranker(`analog/reranker.ts`)도 **자기 테스트 외 호출부 0건**, `v_comparison_v4_serving` 뷰는 anon GRANT까지 있는데 미사용, `forecast_control_v1.serving_enabled` 기본 false로 사람이 승격 의례를 수행하지 않는 한 영구 비활성.
- 4세대 스키마 공존: 레거시(028에서 DROP) → v2 비교(운영) → Level4 아티팩트(수동) → TCAR-002(미서빙). 유지보수·온보딩 비용은 4세대분인데 사용자 가치는 1세대분이다.
- 파라미터 50개 중: Optuna 대상 19개(1회 실행), 월간 자동 4개, **나머지 27개는 어떤 검증·루프에도 속하지 않음**.

### RC-4. 검증하는 값과 보여주는 값이 다르다 (신뢰 결함)

- 사용자가 보는 예측: `app/themes/[id]/_components/theme-prediction/index.tsx`가 **요청 시마다 `calculatePrediction()`을 라이브 재계산**. 정확도가 추적되는 예측: 배치가 저장한 `prediction_snapshots_v2`. **서로 다른 객체**라, 시스템이 자신의 실측 적중률을 사용자에게 증명할 방법이 구조적으로 없다.
- 정교한 지표를 만들고 조악한 지표를 노출: Level4 보정 확률(`relevanceProbability` + Wilson CI)이 API까지 전달되지만 UI는 미보정 `similarity_score`를 28px 헤드라인으로 표시. 부트스트랩 90% CI(`predictionIntervals`)는 매 요청 계산되고 렌더링 0회. `ScoreConfidence`(데이터 커버리지)는 quality-gate의 **무음 필터**로만 쓰여 사용자는 테마가 왜 사라졌는지 알 수 없다.
- 공개 methodology는 "GDDA ~66%"를 내세우지만 사용자가 실제로 보는 Rising/Hot/Cooling의 실측은 47~51%다. 서로 다른 지표를 같은 "정확도" 언어로 노출 중이다. v2 계획의 "배포 7일 후 실측 재확인 → 55% 미달 시 Binary 전환" 체크포인트는 **4개월째 미이행**이다.

### RC-5. 데이터 위생 결함이 라벨·피처를 조용히 오염시킨다 (품질 결함)

1. **무음 스크래퍼 실패**: DataLab에만 품질 게이트(커버리지<70%, 제로값≥90%)가 있고, Naver 금융 HTML 스크래퍼(테마 목록·종목)는 셀렉터가 깨져 0건이 돼도 "0건 upsert 성공"으로 통과한다.
2. **부분 upsert 실패 무시**: `batchUpsert`의 `failedCount`를 호출부(`pipeline-steps.ts`)가 버린다. 2026-02-10 관심도 전량 유실 사고(INTEGER 반올림)와 동일 유형이 재발 가능한 구조 그대로다.
3. **결측 백필 부재 + EMA 갭 왜곡**: 일별 점수 백필 스크립트가 없고, `applyEMASmoothing`은 직전 레코드를 무조건 1스텝 전으로 가정해 결측일을 보정하지 않는다. 하루 실패가 스무딩 계열을 영구 왜곡한다.
4. **휴장일 미반영**: 종목 수집이 요일(1~5)로만 게이팅된다. 공휴일의 정체된 시세가 "당일 시그널"로 activity 점수에 유입된다. (뉴스레터 파이프라인에는 `korean-trading-calendar`가 이미 있는데 TLI는 미사용.)
5. **좀비 테마**: 점수 행이 0개인 테마는 비활성화 조건 검사를 `continue`로 건너뛰어 영구 활성 잔류 — 매일 API 자원만 소모.
6. **월간 재교정 스킵 버그**: full 모드는 토요일에 실행되지 않으므로 매월 1일이 토요일이면 그 달 재교정이 통째로 스킵된다(연 ~1.7회).
7. **뉴스 원문 미보존**: `news_metrics`는 집계 카운트만 저장. 관련도 필터를 바꾸면 과거 카운트는 재계산 불가(API 1,000건 한계). `theme_news_articles`는 "최근 10건 유지" 의도인데 삭제 로직이 없어 무한 누적.
8. 기타: 타임존 로직 3중 구현, first-spike 과집중 필터 결과 무보고 폐기, stale 점수가 비교/예측에 구분 불가 유입(비차단 파이프라인), 평가 스텝은 warning-only라 순환 임계값 튜닝이 표본 기아 상태로 고착돼도 무알림.

### RC-종합: 인과 사슬

```
자기참조 라벨(RC-1)            → 배울 대상이 없음 → 정확도 천장 ~51%
   + 루프 단절(RC-2)           → 있는 데이터도 파라미터에 반영 안 됨
   + 규모 불일치 게이트(RC-3)   → 개선판이 완성돼도 영구 shadow
   + 검증≠노출(RC-4)           → 개선돼도 증명 불가, 지표 혼용 노출
   + 위생 결함(RC-5)           → 라벨·피처가 조용히 오염
= "데이터가 쌓여도 전혀 유효한 방향으로 개선되지 않는다"
```

---

## 3. 재구성 원칙 (Design Principles)

| # | 원칙 | 조작적 정의 (위반 판정 가능해야 함) |
|---|---|---|
| **P1** | **외부 Ground Truth 최우선** | 예측·평가·최적화의 라벨은 시스템 파라미터가 값을 바꿀 수 없는 관측치만 허용 (raw_value, 주가, 에피소드 실측 경계) |
| **P2** | **복잡도 예산** | 모델·게이트·프로세스의 표본 요구치는 "현재 보유 데이터의 50% 이하"여야 도입 가능. 연 라벨 생산량(≈15,000 테마·일)을 초과 가정하는 설계 금지 |
| **P3** | **Serve what you measure** | 사용자 노출값 = DB 스냅샷 = 사후 채점 대상, 단일 객체. 클라이언트 재계산 금지 |
| **P4** | **Fail-loud** | 모든 수집·적재·평가 단계는 정량 게이트를 갖고, 실패는 GitHub Issue로 승격. "warning으로만 남는 실패" 금지 |
| **P5** | **단일 세대** | 신구 시스템 병존은 기한부(최대 4주 shadow)만 허용. 기한 내 승격 못 하면 신형을 삭제한다 (레거시가 아니라) |
| **P6** | **루프 없는 파라미터 금지** | 모든 상수는 ① 자동 재추정 루프 소속 ② "고정 상수 + 근거 주석 + 연 1회 리뷰" 둘 중 하나. "Optimized" 라벨은 탐색공간 포함 이력이 있는 값에만 허용 |
| **P7** | **재현성** | 서빙 산출물마다 model_version + labeler_version + param_version 핀 + **입력 피처 벡터 원본 보존**(features JSONB — 코퍼스 의존 피처의 재현은 저장된 벡터로 보장, 전체 코퍼스 스냅샷 핀은 이 규모에서 과설계라 채택하지 않음). 과거 예측을 현재 코드로 재검증 가능해야 함 |

---

## 4. 목표 / 비목표

### 4.1 정량 목표 (v3 출시 + 90일 기준)

| ID | 지표 | 현재 | 목표 | 측정 방법 |
|---|---|---|---|---|
| **G1** | 예측 커버리지 (활성 테마 중 유효 예측 비율) | 5.8% | **≥ 80%** (abstain 포함 시 100% 상태 표시) | 일일 스냅샷 집계 |
| **G2** | 캘리브레이션 ECE (quantile 5-bin, bin n≥30) | 미측정 | **≤ 0.08 (point) + upper95 ≤ 0.12** | 승격 체크포인트 리포트 |
| **G3** | Rising 신호 정밀도 (P(상승 실현) 상위 10 테마의 GT-A 실현율) | 미측정 (유사 지표 60.8%) | **majority baseline +15pp 이상** | 주간, 클러스터 부트스트랩 CI |
| **G4** | 랭킹 유효성 (일일 확률 랭킹 vs GT-A 실현, Spearman IC) | 미측정 | **IC > 0.10, 26주 중 18주+ 양수** | 주간 |
| **G5** | 학습 루프 자동화 | 4/50 파라미터·월 1회 | **재학습→shadow 평가→승격/롤백 4주 사이클 완전 자동, 사람 개입 0** | 워크플로우 감사 |
| **G6** | 무음 실패 | 다수 (§2 RC-5) | **0** — 모든 실패는 GH Issue | 월간 감사 |
| **G7** | 실측 정확도 사용자 노출 | 0 (정성 문구만) | methodology + 테마 상세에 **최근 90일 실측 자동 게시** | UI 확인 |
| **G8** | 파라미터 수 | 50 (+ 산재 매직넘버 30+) | **≤ 20 (부록 B.1 합산과 일치) + 고정상수 문서화** | 코드 감사 |

> G3/G4의 절대 수치는 Phase 2 백필 평가(§8) 후 1회 조정 가능. 조정 이력은 본 문서에 기록한다. **미조정 시 이 값이 게이트다.**

### 4.2 비목표

- 개별 종목 매수/매도 추천 (뉴스레터 파이프라인의 영역, TLI는 테마 레벨만)
- 장중 실시간 갱신 (일 1~3회 배치 유지)
- LLM 기반 예측 (비용·재현성 문제. 뉴스 요약 등 표시 레이어는 별도 논의)
- 신규 데이터 소스 대량 추가 (v3는 기존 소스의 위생·활용 극대화가 우선)
- 백테스트 기반 "수익률 보장" 마케팅 (법적 리스크, 절대 금지)

---

## 5. TLI v3 아키텍처

### 5.1 개념 모델

```
┌─ Ingest ────────┐  ┌─ Feature Store ─┐  ┌─ Serve ──────────────┐
│ DataLab (앵커)   │→ │ point-in-time    │→ │ TLI Score (표시용)     │
│ News (원문보존)  │  │ theme×day 피처   │  │ P(상승실현)+CI (예측)   │→ UI/API
│ 시세 (KIS 일봉)  │  │ (스무딩 없음)     │  │ Stage (상태 서술)      │   (스냅샷만)
└─────────────────┘  └───────┬─────────┘  └──────────┬───────────┘
                             │                        │ 스냅샷 저장
                     ┌───────▼────────────────────────▼───────────┐
                     │ Label Store: GT-A/B/C (t+5 확정, 소급 백필)  │
                     └───────┬────────────────────────────────────┘
                     ┌───────▼───────────────────────────────┐
                     │ Learn (주간): walk-forward 재학습        │
                     │ → 평가 → 승격 게이트 → 자동 승격/롤백      │
                     └───────────────────────────────────────┘
```

핵심 전환 3가지:
1. **예측과 서술의 분리**: Stage/TLI 점수는 "현재 상태 서술"(예측 주장 제거), 예측은 별도의 캘리브레이션된 확률 하나로 통일.
2. **스무딩의 격하**: EMA/클램프는 **표시 레이어 전용**. 피처·라벨·평가는 전부 raw 계열에서 계산.
3. **라벨 소급 생산**: `interest_metrics.raw_value`가 2026-01-07부터 보존돼 있으므로 GT-A 라벨은 승인 즉시 **~6개월치 소급 생성 가능** → Phase 2에서 곧바로 walk-forward 평가가 돌아간다. 콜드스타트가 없다.

### 5.2 Ground Truth 스펙 (P1)

#### GT-A: 관심도 실현 성장 (주 라벨 — **proxy label**)

- **정의**: 테마 i, 기준일 t(영업일)에 대해
  `g(i,t) = log( mean(raw_value[t+1 .. t+5 영업일]) / mean(raw_value[t-4 .. t 영업일]) )`
  - 이진 라벨: `y = 1 if g ≥ δ else 0`. **δ = +0.10 확정** (≈+10.5% 실질 성장, `labeler_version='gta-v1'`에 박제 — Q1 결정). 백필 리포트(T-103)는 확정이 아니라 **검증**: base rate가 20~50% 범위 이탈 시 재검토 Issue. **δ 변경은 새 labeler_version 발행으로만 가능하며, 서로 다른 labeler_version의 지표는 절대 동일 축에서 비교·보고하지 않는다** (Boomer B-11).
- **외부성의 정확한 한계 (Boomer B-3 반영)**: raw_value는 "순수 외부 불변 라벨"이 아니라 **proxy label**이다 — 스코어링·예측 파라미터가 값을 바꿀 수 없다는 점에서 자기참조는 없지만(GDDA의 검증된 통찰), DataLab 30일 요청 창의 상대 스케일, 테마 키워드 구성, 정수 반올림 저장(`data-ops.ts`)에 의존한다. 따라서:
  - **테마 키워드 셋 변경은 라벨 단절 이벤트**: 키워드 변경일 이전/이후 라벨은 다른 계열로 취급 (theme_keywords 변경 감지 → 해당 테마 라벨에 `keyword_epoch` 태그, 걸친 창은 excluded)
  - 정수 반올림: 분모 하한(≥4)과 로그비 정의가 반올림 노이즈를 상대적으로 완충하나, 저값 구간(raw<10) 라벨은 `low_signal` 플래그로 민감도 분석 대상
- **위생 규칙**:
  - 분모 `mean ≥ min_raw_interest(4)` 미만이면 라벨 제외 (0-분모/노이즈 방지)
  - t+5 영업일 경과 후에만 확정 (`label_status: pending → final`), 휴장일은 `korean-trading-calendar`로 정렬
  - 윈저라이즈: g를 [-1.5, +1.5]로 클립 (DataLab 스파이크 아티팩트 방어)
  - 에피소드 우측 절단: 테마 비활성화로 t+5 데이터가 없으면 `censored`로 표기, 학습 제외 (음성 라벨로 쓰지 않음 — `episode-policy.ts`의 기존 규율 계승)
- **라벨 자기상관의 명시적 처리** (일일 라벨은 5일 창이 겹쳐 인접일 라벨이 강하게 상관):
  - 학습: 전 라벨 사용 (표본 효율) + 클래스 가중
  - **평가·게이트·CI: 테마 클러스터 부트스트랩이 기본이고, 추가로 게이트 판정용 val 지표는 비중복 창(주 1 기준일: 매주 월요일 스냅샷만) 서브셋으로 병행 산출** — 겹침 낙관 편향을 이중으로 차단
  - 유효 표본 보고 의무: 모든 리포트에 raw n과 비중복 n을 병기
- **DataLab 30일 롤링 윈도우 비정상성 방어**: raw_value는 "최근 30일 내 최대=100" 상대값이라 윈도우 안에 거대 스파이크가 있으면 이후 값이 눌린다. g(성장률)는 분자·분모가 같은 스케일 체제에 있을 때만 유효 → **스파이크 직후 리스케일 감지 규칙**: 윈도우 내 최대값 갱신일로부터 5영업일 이내의 라벨은 `rescale_suspect` 플래그를 달고 **기본 학습·평가에서 제외**한다. 민감도 분석(포함 시 성능 비교)으로만 복귀 검토 (Boomer B-3 대안 채택 — 초안의 "기본 포함"에서 보수 방향으로 정정)
- **censored 제외의 편향 감시 (Boomer B-12)**: 우측 절단 라벨의 제외가 "죽은 테마의 실패 사례"를 학습에서 지워 정밀도를 부풀릴 수 있다 → 주간 리포트에 **censored율을 의무 게시**하고, 분기별로 conservative(censored→y=0 간주) / optimistic(제외) 두 시나리오의 지표 격차를 산출한다. 격차가 5pp를 넘으면 라벨 정책 재심 Issue 자동 발행

#### GT-B: 테마 바스켓 초과수익 (보조 라벨, 금융 유효성 검증용)

- **정의**: `r(i,t) = mean_j( P_j(t+5)/P_j(t) - 1 ) - r_KOSPI(t, t+5)`, j = 테마 i의 `theme_stocks` 상위 5종목(시총순, is_active)
- **데이터 제약 (실측)**: 현재 일별 주가 이력 테이블이 없다 (`theme_stocks.current_price`는 덮어쓰기, `stock_price_cache`는 TTL 캐시). → Phase 1에서 `stock_daily_prices` 테이블 신설 + **KIS 일봉 API로 과거 백필** (뉴스레터 파이프라인의 KIS 통합 재사용). 백필 실패 시 GT-B는 전향적 수집만으로 시작.
- **운영 명세** (Boomer B-14 반영):
  - 대상 종목: 활성 테마의 theme_stocks 상위 5종목 합집합, 중복 제거 시 추정 300~600 심볼
  - 호출 예산: 일일 증분 = 심볼당 1콜 ≈ 최대 600콜/일, 백필 = 심볼당 기간조회 1~3콜 (KIS 일봉 API는 1콜당 최대 100영업일) — **일 상한 1,000콜, 레이트리밋 초당 2콜, 야간 배치 시간대 실행** (뉴스레터의 KIS 사용과 시간 분리)
  - 약관: KIS OpenAPI 시세 조회는 기존 뉴스레터 파이프라인에서 이미 사용 중인 범위 내 (재배포 아님, 내부 파생 지표 산출용)
  - 실패 시 동작: 해당일 GT-B 라벨은 `pending` 유지 (다음 실행이 소급 기입), 3영업일 연속 실패 시 Issue. **GT-B 부재가 T1 서빙을 막지 않는다** (검증 라벨이므로)
- **용도와 기대치**: 주 학습 라벨이 아니라 **검증 라벨** — "관심도 예측이 금융적으로 의미 있는가"를 분기별 리포트로 답한다 (IC(P(상승실현), r) 추적). 사용자 노출 문구("관련주 동행률")의 근거.
  **기대치는 낮게 설정한다**: 관심도→가격 효과는 문헌상 작고(수십 bp), 단기 상승 후 반전하며, 방향조차 연구마다 엇갈린다 (미국 개별주 + / 한국 지수 − / Wikipedia − — 부록 F). GT-B에서 유의미한 동행이 안 나와도 T1(관심도 예측)의 제품 가치는 독립적으로 성립하며, **어떤 경우에도 가격 예측력을 사용자에게 약속하지 않는다**.

#### GT-C: 에피소드 실측 경계 (저빈도 라벨)

- 피크 도달일, 총 지속일, 사후 드로우다운 — **기존 `episode_registry_v1`/`label_table_v1`/`episode-policy.ts`의 라벨 위생(observed/inferred/censored 구분, 감사 규칙)을 그대로 계승**한다. 이 부분은 현행 시스템에서 가장 잘 설계된 자산이다.
- 용도: Analog 카드(설명 레이어)의 "과거 유사 테마는 평균 N일 만에 정점" 문구 + 모델 피처(days-since-spike 대비 코호트 위치).

### 5.3 예측 문제 재정의

| Task | 정의 | 산출물 | 노출 |
|---|---|---|---|
| **T1 (핵심)** | P( GT-A 상승 실현 \| 피처(t) ) | 테마×일 확률 + CI + abstain | "5일 내 관심도 상승 확률 68% (±9)" |
| **T2 (랭킹)** | T1 확률의 일일 내림차순 랭킹 | Top-K 리스트 | `/themes` 정렬·하이라이트 |
| **T3 (서술)** | Stage(현재 상태) + Analog(과거 유사 사례) | 설명 카드 | "현재 Growth 단계 · 유사 테마 평균 정점까지 N일" — **예측 주장 문구 금지** |

- **Phase(Rising/Hot/Cooling) 폐지 — 단, 공개 계약 호환 절차 준수** (Boomer B-7): `rising/hot/cooling` enum은 `/api/tli/predictions` OpenAPI 스펙과 MCP 도구(`get-predictions`)에 공개돼 있어 즉시 삭제는 외부 클라이언트 파괴다.
  - 전환기(6주): 기존 필드는 T1 확률에서 파생한 호환값으로 서빙 (`p_rise≥0.6→rising`, `0.4~0.6→hot(중립)`, `<0.4→cooling`) + 응답에 `deprecation` 메타 필드 + OpenAPI `deprecated: true`
  - MCP 도구는 새 확률 필드 추가 후 Phase 필터를 deprecated 표기, 6주 후 제거
  - **Cooling "예측 문구"는 즉시 중단** (baseline 미달 신호) — 필드는 유지하되 UI 카피에서 제거
- **예측 지평 5영업일 고정**: 시상수 분석(반감기 ~2일 → 예측 가능 지평 3~5일) + 뉴스레터 제품(5일 내 10%)과 정합.
- **1 테마 = 1 예측 객체**: T1 결과만이 "예측"이라는 단어를 쓸 수 있다.

### 5.4 데이터 레이어

#### 5.4.1 DataLab 앵커 정규화 (교차 테마 비교 복원)

현행: 테마별 자기 정규화 → 니치 테마의 자기 고점이 대형 테마의 80% 수준보다 "높게" 보이는 왜곡 (`calculator.ts`의 cross-theme percentile이 왜곡된 입력 위에서 동작).

| 옵션 | 방법 | 비용 | 판정 |
|---|---|---|---|
| **A. 전 배치 앵커 (채택)** | 모든 배치에 앵커 키워드 1슬롯 고정 (앵커1+테마4) → 배치별 스케일 팩터 = 앵커값 역수 → 전 테마가 동일 앵커 축으로 정규화. `interest_metrics.anchor_scaled_value` 추가 (raw_value 불변 보존) | 배치 수 +26.7% (테마 150개 기준 30→38배치/일, DataLab 일 한도 대비 무해) | **채택** |
| ~~B. 일일 앵커 브리지~~ | 일 1회 앵커 배치(앵커+테마4)로 스케일 추정 | 쿼리 +1배치/일 | **기각 — 설계 결함** (Boomer B-10): DataLab 상대값은 같은 요청 그룹 안에서만 비교 가능하므로, 앵커 배치에 없는 나머지 배치들은 앵커와 연결 고리가 없다. 초안의 채택안이었으나 정정 |
| C. 현행 유지 | 성장률 라벨만 쓰므로 레벨 비교 포기 | 0 | 레벨 피처·랭킹 품질 포기라 기각 |

- 앵커 키워드 (Q2 결정): 주 후보 **"계산기"**, 예비 **"번역"·"지도"** — 유틸리티성 검색어는 요일 주기 외 이벤트·계절 스파이크가 거의 없음 ("날씨"는 태풍·장마 스파이크로 제외). T-106의 14일 CV 비교에서 최저 변동 후보로 자동 확정 (기본 "계산기"). 변경은 마이그레이션+`anchor_epoch` 태그로만.
- **앵커 자체의 계절성·드리프트 방어**: `anchor_scaled_value`는 앵커의 7일 중앙값으로 나눠 산출 (단일일 앵커 노이즈 완충). 앵커 일간 변동성이 2주 연속 임계(CV>0.3) 초과 시 앵커 교체 검토 Issue 자동 발행. 스케일 불확실성의 모델 반영(그래프 캘리브레이션)은 이 규모에서 과설계로 판단해 기각하고 모니터링으로 대체한다 — 근거를 부록 C에 기록.

#### 5.4.2 원시 보존 원칙

- 뉴스: `theme_news_articles`에 수집 기사 메타(제목·링크·일자) **전건 영구 보존** (현행 10건 제한 폐지, `(theme_id, link)` 유니크 유지. 본문 미저장이라 별도 아카이브 잡 불필요 — Q5 결정, 용량은 분기 재감사에서 리뷰). → 관련도 필터 변경 시 카운트 재계산 가능.
- 시세: `stock_daily_prices(symbol, date, close, volume)` 신설 (GT-B·피처 공용).
- 점수: `lifecycle_scores`에 raw/smoothed 병존(현행 유지). 스무딩 파라미터 변경 시 raw에서 전체 재계산 가능해야 함 (P7).

#### 5.4.3 위생 (RC-5 전면 해소)

1. 모든 수집기에 정량 게이트: Naver 금융 스크래퍼에 "직전 실행 대비 행수 70% 미만 → critical" 게이트 신설 (DataLab 게이트와 대칭).
2. `batchUpsert` 실패 집계를 파이프라인 exit code + GH Issue로 전파 (2026-02-10 사고 재발 차단).
3. 일별 점수 백필 스크립트 신설 + EMA는 결측일 수만큼 α를 보정(또는 raw-only 재계산이므로 자연 해소).
4. `korean-trading-calendar`를 TLI 게이팅에 통합 (공휴일 종목 수집 스킵, 라벨 영업일 정렬).
5. 좀비 테마: "점수 행 0개 + 30일 경과" 자동 비활성화 분기 추가.
6. 월간 잡을 요일 조건에서 분리 (매월 첫 **실행일**에 수행).
7. 타임존 유틸 단일화 (`lib/tli/date-utils.ts`로 통일).
8. first-spike 과집중 필터 결과 로그 + 임계 초과 시 Issue.

#### 5.4.4 스키마 처분 (상세 §7)

핵심 신설 2 + 개편 1: `theme_labels`(GT-A/B/C 통합, point-in-time), `stock_daily_prices`, `theme_predictions_v3`(T1 스냅샷 = 서빙 = 채점 단일 객체, model_version/labeler_version/param_version 핀 + 피처 벡터 보존 — P7).

### 5.5 스코어 레이어 (표시용 재정의)

- TLI 점수(0~100) 4-컴포넌트 구조(interest/news/volatility/activity)는 **유지** — 사용자에게 익숙하고 서술 가치가 있다. 단:
  - **Cautious Decay 폐지** (비대칭 왜곡의 주범), Bollinger 클램프 폐지, EMA는 단일 α(표시 전용) — "점수가 예측 라벨"이 아니게 됐으므로 스무딩의 통계적 부작용이 사라진다.
  - 레벨 피처는 앵커 보정값 기반 percentile로 교체.
  - 파라미터: 50 → **20** (부록 B.1 처분표 합산). 감축분은 삭제 또는 고정상수 문서화.
- Stage 5단계 + Markov + 히스테리시스는 표시 안정성 장치로 **유지하되**, methodology와 UI에서 "현재 상태 분류이며 예측이 아님"을 명시.

### 5.6 예측 레이어 (T1)

#### 피처 v1 (10개, 전부 point-in-time, raw 계열)

| # | 피처 | 소스 |
|---|---|---|
| 1 | interest_slope_7d (raw_value 7일 회귀 기울기 / 평균) | interest_metrics |
| 2 | interest_level_pct (앵커 보정 cross-theme percentile) | anchor_scaled_value |
| 3 | interest_accel (slope_3d - slope_7d) | interest_metrics |
| 4 | dvi_7d (방향성 지수, 기존 `calculateDVI` 재사용) | interest_metrics |
| 5 | news_volume_7d (log) | news_metrics |
| 6 | news_momentum (주간비, 기존 산식 재사용) | news_metrics |
| 7 | basket_return_5d (동일가중, 초과수익) | stock_daily_prices |
| 8 | basket_volume_ratio (5d/20d) | stock_daily_prices |
| 9 | days_since_spike / cohort_peak_median (GT-C 기반 진행률) | episode 라벨 |
| 10 | market_regime (KOSPI 5d 수익률 부호) | KIS |

결측 처리: 피처별 결측 플래그 + 중앙값 대치. 결측 >30% 또는 데이터 나이 <7일 → **abstain** ("데이터 수집 중" 상태로 노출, 무음 제외 금지).

#### 모델 사다리 (P2)

| 단계 | 모델 | 도입 조건 |
|---|---|---|
| **B-abl** | **현행 시스템 ablation**: 현행 서빙 휴리스틱의 "rising" 판정(아날로그 day-ratio Phase)을 GT-A로 채점 — 라벨 교체 효과의 분리 측정 (Boomer B-2). 모델이 아니라 대조군 | Phase 2 필수 산출물 |
| **M0** | 룰 베이스라인: `slope_7d > 0 AND news_momentum > 1` → 고정 확률(historical base rate). 새 피처 체계의 최소 기준선 | 즉시 (비교 기준선) |
| **M1** | 로지스틱 회귀 (10피처, L2, 클래스 가중) + **Platt 캘리브레이션** | 백필 라벨 n ≥ 2,000 (승인 즉시 충족 예상). **B-abl과 M0 양쪽을 CI 기준으로 이겨야 서빙 후보** |
| **M2** | Gradient Boosting (얕은 트리 ≤3 depth) | M1 대비 val Brier 상대 5%+ 개선이 클러스터 부트스트랩 95% CI에서 확인될 때만 |
| — | M3 이상 (딥러닝, 시퀀스 모델) | **금지 — 단 조건부 재평가 트리거 명문화**: 누적 유효 라벨 20,000 도달 시 자동 Issue로 재평가 발의 (P6 "사람 기억 의존 금지"와 정합. 무기한 봉인이 아니라 데이터 규모 연동 게이트) |

- 학습 단위: (theme, day) 쌍. **클러스터 = 테마** — 분할·부트스트랩·CI 전부 테마 단위 (자기상관·pseudo-replication 방지, 기존 `comparison-stats.ts`의 `clusterBootstrapPairedDelta` 재사용).
- 분할: walk-forward, purge gap 5영업일 (라벨 창 겹침 누수 차단).
- 전처리: 피처별 robust z-score (median/MAD, `normalize.ts` 기존 함수 재사용), **통계량은 train 구간에서만 적합** (val 누수 차단). 클래스 불균형은 class weight로 처리 (리샘플링 금지 — 캘리브레이션 왜곡).
- 모델 승격 단위는 **artifact 전체** (스케일러 통계량 + 계수 + 캘리브레이터 + 피처 스키마를 하나의 불가분 번들로 고정). 계수 단위 혼합(EMA 등)은 **금지** — 스케일러가 다른 두 모델의 계수 평균은 수학적으로 무의미하다 (Boomer B-5로 초안의 계수 EMA 조항 폐기). 노이즈 체이싱 방어는 §5.7의 4주 누적 승격 게이트가 담당한다.
- 구현: 학습은 Python(scikit-learn, 4주 배치라 허용), 서빙은 순수 TS 함수. **아티팩트 SSOT는 DB(`model_registry.coefficients`)** — 배치 예측 스크립트가 champion 아티팩트를 DB에서 로드해 순수 함수로 추론한다 (Next.js는 예측 테이블만 읽고 모델을 모름). 로컬 JSON 파일 경로 의존 금지 — `TLI_PARAMS_VERSION=v2` 죽은 경로(F-09)의 재발 방지. Git 커밋은 감사용 사본(선택). 상세 규약: 부록 G.3.

#### Analog 시스템의 재배치

- Analog 검색(완결 에피소드 유사 사례)은 **T3 설명 카드 + 피처 9번 공급자**로 격하. 예측 헤드(forecast/model.ts의 확률 산출)와 Phase 파생은 폐지.
- 유사도는 현행 v2 엔진(Mutual Rank 중심)을 유지하되 §7의 방법론 정리(가짜 3-Pillar 정리, population 스냅샷 핀) 적용. reranker 등 미결선 코드는 삭제.

### 5.7 학습 루프 (G5 — 이 PRD의 심장)

#### 일일 (기존 cron에 추가, `tli-collect-data.yml` 확장)

1. 라벨 확정: t-5 영업일의 pending 라벨에 raw_value/주가 결과 기입 → `final`
2. 예측 스냅샷 채점: `theme_predictions_v3`의 만기 예측에 GT-A 실현값 기입
3. 모니터링 적재: 일일 Brier/커버리지/abstain율 → `model_metrics_daily`
4. **전 단계 fail-loud**: 실패 시 GH Issue 자동 생성 (`actions/github-script` — 기존 워크플로우의 이슈 알림 패턴 재사용, 발행 규칙은 §9 알림 소음 방지 정책 준수)

#### 4주 사이클 (신규 워크플로우 `tli-weekly-learn.yml` — 매주 일요일 실행, 승격 판정은 4주 체크포인트에서만)

**사이클 구조 (prospective shadow — 챌린저는 "실전 4주 성적"으로만 심판받는다):**

```
체크포인트 C(n):
  1) 판정: 챌린저(n-1)의 지난 4주 실전 shadow 실적(theme_predictions_v3의
     serving_role='challenger' 기록)을 게이트로 심판 → 승격 or 기각
  2) 후보 생성: 전체 라벨로 walk-forward 학습 → 오프라인 사전 필터
     (holdout Brier가 챔피언 이하일 때만) 통과 시 챌린저(n)로 고정
  3) 챌린저(n)는 다음 4주간 매일 shadow 예측 기록 → C(n+1)에서 심판
비체크포인트 주(週): 모니터링·리포트만 (재학습·판정 없음)
```

> 설계 근거: "매주 재학습 + 누적 판정"의 조합은 (a) 어느 챌린저를 어떤 표본으로 심판하는지가 모호해지고 (b) 매주 확인 자체가 peeking이 된다 (Johari et al. 2017, Optimizely 실측 거짓 승자 최대 57% — 부록 F). 4주 사이클 통일은 판정 대상(고정된 챌린저 1개)과 판정 표본(그 챌린저의 실전 4주 shadow)을 1:1로 못 박는다. 1인 운영 단순성도 확보.

**승격 게이트** (전부 코드, 사람 없음. 판정은 사전 고정된 체크포인트에서만 — 연 ~13회, **연간 승격 상한 6회**):

- **표본 요건**: 4주 누적 비중복(주 1 기준일) shadow 라벨 `n_eff ≥ 250`. **라벨 모집단은 quality-gate 노출(~70테마)이 아니라 전체 활성 테마(~150)다** — 150테마 × 4주 × 유효율 50%+ ≈ 300으로 충족 가능. **미달 시 판정을 다음 체크포인트로 자동 연장(누적 최대 8주), 8주에도 미달이면 보류 + 표본 부족 Issue** (만성 보류가 조용히 반복되는 것을 방지)
- `Brier(챌린저) < Brier(챔피언)` point estimate **및** 클러스터(테마) 부트스트랩 **99% CI** 상한 ≤ 0 (반복 검정 보정) **및** 상대 개선폭 ≥ 2% (통계적 요행 차단)
- `ECE point ≤ 0.08 AND 부트스트랩 upper95 ≤ 0.12` — binning: 동일 빈도(quantile) 5-bin, bin당 n ≥ 30, 미달 시 bin 수 자동 축소 (`forecast/calibration.ts` computeECE를 이 정책으로 감싼 wrapper 신설. point 단독 판정은 binning ECE의 체계적 과소추정(Kumar et al. 2019, 편향≈B/n≈2%p) 때문에 불충분)
- guardrail: Rising-P@10이 챔피언 대비 -5pp 초과 악화 금지
- 클러스터 불균형 방어: 테마별 라벨 수 상위 5%가 전체의 30% 초과 시 wild cluster bootstrap으로 전환 (MacKinnon & Webb 2017)

**승격·롤백 집행:**

- 통과 → **artifact 번들**(스케일러 통계량+계수+캘리브레이터+피처 스키마)을 `model_registry`에 등록(SSOT)하고 `serving_role` 교대. 실패 → 기각 리포트만.
- **자동 롤백** (매주 검사): 서빙 챔피언의 롤링 4주 비중복 Brier가 직전 버전 동기간 대비 +10% 악화 시 이전 artifact 자동 복원 + Issue. *승격(99% CI)과 롤백(point)의 기준 비대칭은 의도적* — 잘못된 롤백의 비용(검증된 직전 챔피언 복귀)은 잘못된 승격의 비용보다 훨씬 낮으므로 안전 방향으로 민감하게 둔다.
- **레짐 급변 서킷브레이커** (일일): 단일일 Brier가 챔피언 90일 분포의 상위 1% 초과 또는 abstain율 2배 급증 시 → 즉시 Issue + 보수 모드(신규 예측 CI 하한 표기 강화). 4주 체크포인트 사이의 노출 구간을 커버하는 자동 안전망.

#### 월간

- 피처 드리프트 리포트 (PSI, 피처별) + 라벨 분포 변화 → 임계 초과 시 Issue (사람 리뷰 트리거, 자동 조치 없음)
- 파라미터 처분표(부록 B) 준수 감사: "루프 밖 파라미터" 신규 유입 0 확인

#### 게이트 표본 수 근거 (P2 검증, B-4·리서치 반영판)

- **표본 산정은 비중복 n 기준**: raw 일일 라벨은 5일 창이 겹쳐 유효 표본을 과대평가한다. **실측 팽창률은 기계적 겹침(5배)보다 큰 ~7배** (B-4: raw 725 → 비중복 104. 5일 창 겹침에 더해 g 자체의 시계열 지속성(lag-1 0.858)이 얹히기 때문). 게이트의 n_eff=250(비중복)은 Wilson 95% CI 기준 정밀도 지표 ±~6%p — 4주 누적으로 이 수준을 확보한다.
- 연간 라벨 생산 추정: 활성 ~150테마 × 250영업일 × 유효율 ~40% ≈ raw 15,000/년 → 주 1 비중복 ~3,000 → **실측 팽창률(7배) 기준 유효 독립 표본 ~2,100/년** (보수 추정. 주 1 간격에서도 잔여 자기상관이 남기 때문) — M1(파라미터 ~11개)엔 여전히 충분(Riley 최소표본 기준은 anticipated R²에 의존하므로 Phase 2에서 파일럿 R² 실측 후 `pmsampsize` 공식으로 재확인), M2엔 경계, M3엔 부족. 모든 리포트는 raw n과 비중복 n을 병기한다.
- **IC/IR 해석 규칙**: Fundamental Law(IR≈IC×√Breadth)의 Breadth는 "독립 베팅 수"다. raw 3,000을 대입하면 IR이 비현실적으로 부풀므로(IC 0.05 → IR 2.7, 역사상 최상위 매니저 초과), **breadth는 유효 독립 표본(~400/년 수준)으로 보수화해 해석**한다. IC 0.05~0.1 자체는 업계 기준 "우수" 구간이며 G4 목표의 근거.

### 5.8 서빙·노출 레이어 (RC-4 해소)

1. **단일 객체 원칙**: UI·API는 `theme_predictions_v3` 스냅샷만 읽는다. `calculatePrediction()` 클라이언트 호출 제거.
2. 예측 카드 구성: 확률 + CI 밴드 + abstain 사유 + **"이 모델의 최근 90일 실측: 상위 신호 정밀도 XX% (n=YY)"** 자동 문구.
3. methodology 페이지: 정적 수치 서술 금지 → `model_metrics_daily` 집계를 읽는 동적 섹션 (GDDA 66% 같은 비노출 지표의 마케팅 인용 중단).
4. quality-gate 필터 → "표시 안 함" 대신 "데이터 수집 중 (D+n)" 상태 노출.
5. 유사도 카드: 보정 확률(`relevanceProbability` + CI)을 주 지표로 승격, raw similarity는 보조 표기로 강등.
6. 법적 가드: 확률 문구에 "관심도 예측이며 투자 수익 예측이 아님" 고지 유지.

---

## 6. 기존 자산 처분표 (요약 — 파일 단위 상세는 부록 B)

| 처분 | 대상 | 사유 |
|---|---|---|
| **KEEP** | `episode-policy.ts`(라벨 위생), `comparison-stats.ts`(클러스터 부트스트랩), `mutual-rank.ts`(근거 있는 유일한 튜닝), DataLab 수집기+게이트, `normalize.ts` 통계 유틸, GDDA의 raw_value 채점 사상, `korean-trading-calendar` | 검증된 자산. v3의 부품 |
| **REFACTOR** | `calculator.ts`(파라미터 감축+앵커 레벨), `score-smoothing.ts`(표시 전용 단순화), `quality-gate.ts`(상태 노출), 수집기 3종(fail-loud), `tli-params.ts`(20개 체제+위표기 정정), evaluate/snapshot 스크립트(GT-A 채점으로 전환) | 골격 유지, 역할 재정의 |
| **DELETE** | `analog/reranker.ts`·`targets.ts`(미결선), `forecast-reader.ts`+`forecast/model.ts`·`survival.ts`(호출 0/Phase 폐지), `prediction.ts`+`prediction-helpers.ts`+`prediction-bootstrap.ts`(구 Phase 체계 — API deprecation 완료 후), Level4 인증·승격·드리프트·auto-hold 스크립트군(수동 의례), `v_comparison_v4_serving`(reader에 view-mode 분기가 남아있으므로 분기 제거와 동시에), `sentiment_score` 컬럼, v1 5-phase 잔존 분기, `TLI_PARAMS_VERSION` v2 분기, bridge/certification 계열 | 호출 0 또는 규모 불일치 또는 대체됨 |
| **MIGRATE** | `episode_registry_v1`·`label_table_v1` → GT-C 라벨 소스로 계승, `prediction_snapshots_v2` → 읽기 동결 후 `theme_predictions_v3`로 대체, `calibration_artifact`의 bin_summary 사상 → M1 캘리브레이션 리포트 포맷으로 계승 | 데이터·사상은 살리고 기계는 교체 |

삭제 규모 추정: **lib/tli + scripts/tli 코드의 40~50% 감축**. 삭제는 Phase 4에서 일괄 (그 전까지 동결 태그).

**삭제 집행 규율** (Boomer B-8 반영):
1. 삭제 전 **import graph + 런타임 매니페스트(`tli-runtime-surface.ts`, `tli-boundary-manifest.ts`)로 "실사용 0" 증명**을 티켓 AC에 포함 — grep 호출 0은 필요조건일 뿐 충분조건이 아니다 (예: `v_comparison_v4_serving`은 reader에 view-mode 분기 코드가 존재하되 하드코딩으로 미도달 — "죽음"의 정의를 코드 경로 기준으로 문서화하고 분기부터 제거)
2. **재사용 가치 유틸은 삭제 전 이식**: fail-closed 서빙 컨트롤 패턴(`forecast-serving.ts`), 게이트 판정 구조(`promotion-gate.ts`의 guardrail 프레임), `calibration-artifact.ts`의 readback 검증 — v3 학습 루프(§5.7)의 부품으로 각각 흡수 (부록 B.2에 이식 목록 명시)
3. 데이터 테이블은 DROP 대신 rename 보존 30일 (R8)

---

## 7. 마이그레이션 로드맵

> 각 Phase 종료 = Isaac 게이트 (Level 2 동기 승인). 롤백 전략 명시. 전체 7~9주 (1인 운영 전제, 병행 작업 없음 가정).

### Phase 0 — 위생 + 계측 ✅ **완료 (2026-07-06, 커밋 `bed3040`)**

> 실제 구현이 계획과 달라진 지점은 **부록 H (as-built)** 참조 — Phase 1+ 에이전트 필독.
> 잔여 꼬리: ① KIS 30일 백필 1회 실행 (T-008 AC 마감, 수동) ② parity 14일 측정 대기 (자동) ③ T-010은 parity SLA 통과 후 착수.

<details><summary>원 계획 (기록용)</summary>

| 작업 | AC |
|---|---|
| 스크래퍼 정량 게이트 + batchUpsert 실패 전파 + GH Issue 알림 | 임의 수집기 강제 실패 시 Issue 생성 E2E 확인 |
| 휴장일 캘린더 통합, 좀비 테마 정리 분기, 월간 잡 요일 분리, 타임존 단일화 | 유닛 테스트 + 다음 공휴일 로그 확인 |
| `stock_daily_prices` 신설 + 일일 적재 시작 + KIS 일봉 백필 시도 | 30일 백필 성공률 리포트 |
| **예측 parity 리포트**: 클라 재계산값 vs `prediction_snapshots_v2` 스냅샷의 일치율·freshness·coverage 14일 측정 (전환은 하지 않음 — Boomer B-9) | parity 리포트 산출. 전환 자체는 SLA(coverage≥90%, freshness≤1영업일) 통과 후 Phase 1에서 |
| Cooling **예측 문구** 노출 중단 (필드는 호환 유지, §5.3) | UI 확인 |
| **롤백**: 전 항목 개별 revert 가능 (스키마는 additive만) | |

</details>

### Phase 1 — Ground Truth 파이프라인 (1~2주)

| 작업 | AC |
|---|---|
| `theme_labels` 테이블 + GT-A 일일 라벨링 잡 + **2026-01-07부터 소급 백필** | 백필 라벨 ≥ 2,000건, 라벨 감사(절단/분모/윈저) 통과 |
| GT-B: stock_daily_prices 기반 라벨링 (백필 성공 범위) | 커버리지 리포트 |
| δ=+0.10 검증 리포트: 백필 base rate 20~50% 범위 확인 (Q1 결정 — 이탈 시 재검토 Issue) | 리포트 산출 |
| 전 배치 앵커 슬롯 전환(옵션 A) + `anchor_scaled_value` 적재 시작 | 앵커 스케일 팩터 안정성 14일 관찰 (T-106) |
| **롤백**: 신규 테이블·잡만 제거하면 현행 무영향 | |

### Phase 2 — 베이스라인 모델 + 평가 하네스 (2주)

| 작업 | AC / Go·No-Go |
|---|---|
| M0/M1 구현 + 백필 라벨로 walk-forward 오프라인 평가 | 평가 리포트 자동 생성 (Brier/ECE/IC/P@10, 클러스터 CI) |
| **Go/No-Go 게이트**: M1이 B-abl·M0 양쪽 대비 Brier 개선 (클러스터 CI 기준) | **Go** → Phase 3. **No-Go** → 더 나은 쪽(B-abl or M0)으로 T1 서빙 + 루프는 가동 (루프 자체가 자산), 피처 개선 백로그로 |
| `theme_predictions_v3` 스키마 + shadow 서빙 (기록만, 노출 없음) | 스냅샷 무결성 검사 |

### Phase 3 — 자동 루프 + 서빙 전환 (2주)

| 작업 | AC |
|---|---|
| `tli-weekly-learn.yml` 주간 재학습→게이트→승격→롤백 E2E | 드라이런 2회 (모의 승격+모의 롤백 각 1회) 성공 |
| T1 확률 UI 전환 (§5.8), Phase 체계 제거, 실측 자동 게시 | shadow 2주 → 노출 전환. 노출 후 1주 모니터 |
| 일일 채점·모니터링 적재 가동 | `model_metrics_daily` 7일 연속 적재 |
| **롤백**: 서빙 플래그 1개로 Phase 0 상태(스냅샷 기반 구 예측) 복귀 | |

### Phase 4 — 감량 + 정리 (1~2주)

| 작업 | AC |
|---|---|
| DELETE 목록 실행 (부록 B), 스키마 정리 마이그레이션 | 빌드 3종 + 전 테스트 통과, 참조 0 확인 (2차 검증 패스) |
| 파라미터 50→20 체제, "Optimized" 위표기 정정 | 파라미터 감사 문서 |
| 문서 아카이브 이동 + 런북 갱신 + methodology 동적화 | 문서 3개 체제 확인 |

---

## 8. 지표 정의 (정확한 수식)

- **Brier**: `mean( (p_i - y_i)^2 )`. 낮을수록 좋음. 챔피언/챌린저 비교는 테마 클러스터 부트스트랩(B=2,000) paired Δ의 **99% CI** (§5.7 승격 게이트와 단일 기준 — 반복 검정 보정).
- **ECE**: `Σ (n_b/N) · |mean(p_b) - mean(y_b)|`, **동일 빈도(quantile) 5-bin, bin당 n ≥ 30 (미달 시 bin 수 자동 축소)** — §5.7 게이트와 동일 정의. 기존 `forecast/calibration.ts::computeECE` 재사용 (bin 생성 wrapper 신설). 현행 `confidence-calibration.ts`의 "기대 정확도 0.8/0.5/0.2 하드코딩" 방식은 폐기.
- **IC**: 일별 Spearman(예측 확률 랭킹, g(i,t) 실현 랭킹)의 주간 평균. 주간 리포트에 26주 롤링 양수 비율 병기.
- **Rising-P@10**: 일일 확률 상위 10개 테마 중 y=1 비율. baseline = 전체 base rate.
- **Coverage**: 활성 테마 중 non-abstain 예측 비율. **Abstain율**은 별도 추적 (게이밍 방지: coverage와 정밀도를 항상 병기).
- **승격 게이트 판정문** (4주 체크포인트에서만 실행, §5.7과 단일 정의, 의사코드):
  ```
  # n_eff  = 챌린저의 실전 shadow 4주(연장 시 최대 8주) 비중복(주 1 기준일) 라벨 수
  # Δbrier = brier(challenger) - brier(champion), 테마 클러스터 부트스트랩 (B=2,000)
  if n_eff < 250:
      if cycle_extended_weeks >= 8: hold_and_issue('sample_starvation')
      else:                         extend_to_next_checkpoint()   # peeking 아님 — 판정 자체를 이월
  elif promotions_this_year >= 6:                    keep_champion  # 연간 승격 상한
  elif delta_brier_point >= 0:                       keep_champion  # 점추정 개선 실패
  elif delta_brier_point > -0.02 * brier_champion:   keep_champion  # 최소 실질 개선폭(상대 2%) 미달
  elif upper99(delta_brier) > 0:                     keep_champion  # 99% CI 개선 확인 실패
  elif ece_point > 0.08 or ece_upper95 > 0.12:       keep_champion  # (quantile 5-bin, bin n>=30)
  elif p_at_10_challenger < p_at_10_champion - 0.05: keep_champion  # guardrail
  else: promote_artifact(challenger)                 # 스케일러+계수+캘리브레이터+피처 스키마 번들
  ```

---

## 9. 운영 설계

| 주기 | 워크플로우 | 내용 | 실패 시 |
|---|---|---|---|
| 일 1~2회 (기존 크론 3종) | `tli-collect-data.yml` | 수집→피처→점수→예측 스냅샷→라벨 확정→채점 | critical → GH Issue + exit 1 |
| 주 1회 (신규) | `tli-weekly-learn.yml` | 모니터링·롤백 검사. **4주 체크포인트 주에만**: 챌린저 판정→승격/기각→새 챌린저 학습·고정 (§5.7) | Issue + 챔피언 유지 |
| 월 1회 | 동일 워크플로우 분기 | 드리프트 리포트(PSI), 파라미터 감사 | Issue |
| 분기 | 수동 (자동 Issue로 리마인드) | GT-B 금융 유효성 리포트, δ·게이트 수치 리뷰, **복잡도 재감사**(데드코드 스캔·"루프 밖 파라미터" 유입 0 확인 — 일괄 삭제는 이벤트, 부채 상환은 지속 문화라는 Sculley 2015 원칙), **반사성 분기 리포트**(R9) | — |

- **1인 운영 전제**: 온콜 없음 → 모든 실패는 "자동 안전 상태"(챔피언 유지, abstain 확대)로 수렴해야 하며 사람은 Issue로만 호출된다.
- **알림 소음 방지** (Boomer B-15): critical만 즉시 개별 Issue. warning은 실행 단위로 dedupe(동일 시그니처 1개)하고 일일 다이제스트 Issue 1건에 취합. 동일 시그니처 critical이 24시간 내 재발하면 기존 Issue에 코멘트 (신규 발행 금지). transient(네트워크 등)는 자체 재시도 소진 후에만 warning으로 승격.
- 재최적화 리마인드 같은 "사람 기억 의존" 정책 전면 폐지 — 전부 스케줄+Issue로 기계화.
- 런북: `docs/tli-ops-runbook.md` 1개로 통합 갱신.

---

## 10. 리스크 및 완화

| # | 리스크 | 완화 |
|---|---|---|
| R1 | GT-A가 DataLab 상대 정규화 아티팩트에 오염 | 로그비+윈저라이즈+분모 하한. 앵커 브리지로 레벨 왜곡 완화. 분기별 GT-B 대조로 외적 타당성 감시 |
| R2 | 소표본 과적합 (유효 독립 ~2,100/년) | 모델 사다리 상한(M2), 클러스터 99% CI 게이트, purge gap, 4주 prospective shadow 사이클 |
| R3 | Naver API/스크래핑 단절 | fail-loud 게이트(Phase 0) + abstain 자동 확대. 대체 소스(구글 트렌드)는 백로그로만 |
| R4 | 마이그레이션 중 노출 공백 | UI 전환은 Phase 3 마지막 + shadow 2주 + 플래그 롤백. Phase 0~2는 사용자 무감지 |
| R5 | 전 장 상승기에 GT-B 무의미화 | 초과수익(vs KOSPI) 정의로 통제 |
| R6 | 1인 리소스 초과 | Phase 0·1만으로도 독립 가치 (위생+라벨 자산). Phase 2 이후는 각 게이트에서 중단 가능하게 설계 |
| R7 | 확률 노출의 오해(투자 조언 오인) | 고지 문구 + "관심도" 명시 + 수익 보장성 문구 전면 금지 (§4.2). 한국 테마주는 개인 손실 집중이 실증된 영역(정치테마주 손실 계좌의 99.6%가 개인, 남길남 2017)이므로 "추격 매수 조장" 프레이밍 전면 금지 — 과열 구간에서는 오히려 경고를 강조 |
| R8 | 삭제 범위 과대 (되돌릴 수 없는 손실) | Phase 4 이전까지 삭제 대신 동결 태그. 삭제 커밋은 단일 PR로 격리, 데이터 테이블은 DROP 대신 rename 보존 30일 |
| **R9** | **반사성(performative prediction) — 자기 발행이 라벨을 오염** | 뉴스레터·사이트가 "뜨는 테마"를 노출 → 독자가 그 테마를 검색 → raw_value(GT-A 원재료) 왜곡. Zillow(자기 거래가→자기 라벨 재유입, $5억 손실)·Perdomo et al. 2020과 구조 동일. 상대 정규화 탓에 **니치 테마일수록 증폭**되고 GT-A/GT-B 동시 오염 가능. 현재 트래픽 규모에선 미미하나 성공할수록 커지는 리스크 → **탐지 우선**: ① 발행 전후 raw_value 이벤트 스터디 자동화(T-307) ② 분기별 "노출 상위 테마 vs 비노출 테마" 라벨 분포 비교 ③ 유의한 리프트 검출 시 노출 테마 라벨에 `exposure_suspect` 플래그 + 발행 보류 대조군(랜덤 지연 발행) 도입 검토 |
| R10 | 데이터 소스 두절 (비공식 스크래핑·API 정책 변경) | Twitter('23)·Reddit/Pushshift('23)·CrowdTangle('24) 전례: 실제 작동한 완화책은 관측성이 아니라 **사전 확보된 대체 경로**. 시세 경로는 T-008(KIS 일봉)로 이중화 완료. DataLab 두절 시: abstain 확대 → 레벨 피처 제외 모드(성장률 피처는 뉴스·시세로 부분 대체) 자동 전환 → Google Trends 어댑터는 스켈레톤만 선구현(T-405). 스크래퍼 게이트는 Volume 외에 **분포·스키마 검증**(파싱 성공률, 값 범위) 포함 (T-001 확장) |

---

## 11. 오픈 퀘스천 — 전부 결정 완료 (2026-07-03, Isaac 위임)

> Isaac이 "베스트 프랙티스 기준 공격적 결정"을 위임. 각 결정은 근거 + 자동 검증 장치와 함께 박제한다. 이후 변경은 본 표 개정으로만.

| # | 결정 | 근거 · 안전장치 |
|---|---|---|
| Q1 | **δ = +0.10 고정, `labeler_version='gta-v1'`에 박제** (분위 기반 기각) | 절대 임계는 해석 가능("관심도 +10.5% 실질 성장")하고 시간 불변 — 분위 기반은 라벨 의미가 분포를 따라 표류(B-11 원칙 위반)하고 시장 전체 상승일에도 70%를 강제로 0 처리하는 상대성이 주입됨. 시장 파동은 market_regime 피처의 몫. Boomer 근사 실측 base rate ~36.5%로 클래스 균형 양호. **안전장치**: T-103은 "확정"이 아니라 "검증" — 백필 base rate가 20~50% 이탈 시 재검토 Issue 자동 발행 |
| Q2 | **주 앵커 "계산기", 예비 "번역"·"지도"** — T-106의 14일 CV 비교에서 최저 변동 후보로 자동 확정 (기본값 "계산기") | 유틸리티성 검색어는 요일 주기만 있고 이벤트·계절 스파이크가 거의 없음 (요일 주기는 7일 중앙값 완충이 정확히 흡수). "날씨"는 검색량은 최대지만 태풍·장마 스파이크 리스크로 예비에서도 제외. **안전장치**: §5.4.1의 CV>0.3 2주 연속 → 앵커 교체 Issue |
| Q3 | **코드 완전 삭제 (Phase 4) + 데이터 테이블 30일 rename 보존 후 DROP** | git 이력이 영구 보존하므로 코드 "삭제"의 실질 손실은 0. 동결 보존은 RC-3(복잡도 부채)의 원인을 남기는 것. **안전장치**: §6 삭제 규율 (import graph 증명 + 재사용 유틸 이식 목록) 그대로 적용 |
| Q4 | **KIS 일봉 백필 승인 — 일 상한 1,000콜, 초당 2콜, 야간 배치** (§5.2 운영 명세와 통일) | 증분 수집만 최대 ~600콜/일이라 500 상한은 자체 모순. 1,000이면 증분+백필 분산(3~6일) 모두 수용. KIS REST 실한도(초당 20건) 대비 10% 수준으로 보수적. **안전장치**: 3영업일 연속 실패 시 Issue, GT-B 부재는 T1 서빙 비차단 |
| Q5 | **뉴스 메타 전건 영구 보존 확정** (90일 아카이브 잡 폐지 — 불필요) | 저장 대상이 제목·링크·일자 메타뿐이라 용량 영향 미미(본문 미저장). 별도 정리 잡은 복잡도만 추가. **안전장치**: 분기 복잡도 재감사(§9)에 테이블 용량 리뷰 포함 |
| Q6 | **`/themes` 기본 정렬 = TLI 점수 유지 + "상승 확률" 배지 병기. 단, 전환 트리거를 지금 박제**: 출시 후 90일 실측에서 G3(상위10 정밀도 baseline+15pp)·G4(IC>0.10) 동시 달성 시 확률 기본 정렬 전환 검토 Issue 자동 발행 | 미검증 확률로 기본 정렬을 즉시 바꾸는 것은 공격적이 아니라 무모 (L3 도달 확률 ~45%, 부록 F). 베스트 프랙티스 = staged rollout + 사전 박제된 승격 조건. "사람이 기억해야 하는 결정"을 남기지 않는 것이 이 PRD의 원칙(P6) |

---

## 부록 A. 발견사항 대장 (46건)

> 심각도: **P0** 제품 신뢰성 직접 훼손 / **P1** 유효성·운영 중대 / **P2** 부채·위생. RC = §2 근본 원인 매핑.

| ID | 심각도 | RC | 발견 | 근거 |
|---|---|---|---|---|
| F-01 | P0 | RC-1 | 예측 라벨이 자기참조 (Stage/Phase), MI 0.055bits | prediction-improvement-plan.md 실측 |
| F-02 | P0 | RC-1 | Cooling 실측 38.0% < majority 38.6%인데 서빙 중 | 동상 + prediction-helpers.ts |
| F-03 | P0 | RC-4 | 노출 예측(클라 재계산) ≠ 채점 예측(DB 스냅샷) | theme-prediction/index.tsx vs prediction_snapshots_v2 |
| F-04 | P0 | RC-2 | phase 판정 상수 5종, 어떤 루프에도 미연결 | tli-params.ts Prediction 블록 |
| F-05 | P0 | RC-2 | comparison 파라미터 5종 "Bayesian Optimized" 위표기 (탐색공간 밖) | tli-params.ts vs param_space.py |
| F-06 | P0 | RC-5 | batchUpsert 부분 실패 무시 — 2/10 유실 사고 재발 구조 | pipeline-steps.ts 호출부 |
| F-07 | P0 | RC-3 | TCAR 서빙 리더 호출부 0 (완성된 사장 코드) | forecast-reader.ts grep |
| F-08 | P1 | RC-2 | Optuna 튜닝 ema_alpha는 fallback 전용, 주경로 α는 미최적화 수작업값 | score-smoothing.ts:13 |
| F-09 | P1 | RC-2 | TLI_PARAMS_VERSION=v2 죽은 경로, 결과 반영은 수동 복붙 | tli-params.ts:182, 전 레포 grep |
| F-10 | P1 | RC-2 | 재최적화 3.5개월 초과, 감지·알림 장치 없음 | PRD 정책 vs 실행 이력 |
| F-11 | P1 | RC-2 | 정규화 앵커=직전 최적값 (자기강화, 드리프트 반영 저해) | optimize.py DEFAULTS |
| F-12 | P1 | RC-2 | Optuna 대상 19개 — PRD 서술(2-stage 33개)과 불일치, methodology도 구식 서술 | param_space.py vs 문서 |
| F-13 | P1 | RC-3 | 게이트 요구치(5,000행/400쿼리)가 실데이터(2,236행)와 불균형 | GATE_THRESHOLDS vs 덤프 |
| F-14 | P1 | RC-3 | reranker/targets 미결선 (테스트 외 호출 0) | analog/ grep |
| F-15 | P1 | RC-3 | Level4 승격 완전 수동 + 운영 이력 사실상 0 (git 3커밋) | ops/ + git log |
| F-16 | P1 | RC-4 | 보정 확률+Wilson CI 계산 후 UI 미노출, raw similarity가 헤드라인 | comparison-v4-reader → UI |
| F-17 | P1 | RC-4 | 부트스트랩 CI 매 요청 계산, 렌더 0회 | prediction.ts → UI |
| F-18 | P1 | RC-4 | ScoreConfidence 무음 필터 전용 (사용자 인지 불가) | quality-gate.ts:23 |
| F-19 | P1 | RC-4 | methodology "GDDA 66%" vs 실노출 Phase 51.4% 혼용 | methodology route |
| F-20 | P1 | RC-4 | "배포 7일 후 실측 재확인" 체크포인트 4개월 미이행 | improvement-plan 부록 B |
| F-21 | P1 | RC-5 | Naver 스크래퍼 무음 실패 (0건=성공) | collectors 게이트 부재 |
| F-22 | P1 | RC-5 | 일별 점수 백필 부재 + EMA 갭 미보정 영구 왜곡 | applyEMASmoothing |
| F-23 | P1 | RC-5 | 휴장일 미반영 — 정체 시세가 당일 시그널로 유입 | pipeline-steps dayOfWeek |
| F-24 | P1 | RC-5 | 좀비 테마 영구 잔류 (점수 0행 → 검사 스킵) | theme-lifecycle.ts |
| F-25 | P1 | RC-1 | Cautious Decay 비대칭(하락만 억제)이 라벨 오염 | score-smoothing.ts Step A |
| F-26 | P1 | RC-1 | percentile 레벨 비교가 자기정규화 입력 위에서 왜곡 | calculator.ts levelScore |
| F-27 | P1 | RC-5 | 비차단 파이프라인 — stale 점수가 비교·예측에 구분 불가 유입 | runAnalysisPipeline |
| F-28 | P1 | RC-5 | 평가 스텝 warning-only → 순환 임계값 튜닝 표본 기아 고착 무알림 | pipeline-steps Step7/8 |
| F-29 | P1 | RC-3 | "3-Pillar"가 실제 2-Pillar (wKeyword 전 분기 0.00) | composite.ts |
| F-30 | P1 | RC-3 | "정답" 정의 4종 병존 (corr 0.5/0.3/0.3+stage/peakGap) | auto-tune/evaluate/spec/targets |
| F-31 | P1 | RC-3 | 그리드서치 60+조합 다중비교 무보정 + 비열등 게이트 (노이즈 통과 용이) | tune-weights.ts |
| F-32 | P1 | RC-3 | 풀링 AUROC/Brier가 run 클러스터 무시 (2,600건/1,096run) | 실행 PRD 수치 |
| F-33 | P1 | RC-3 | Mutual Rank 모집단이 매일 변동 — 동일 페어 점수 비가역 변동 | enrich-themes 재계산 |
| F-34 | P2 | RC-3 | 이중 워핑(리샘플+DTW) 효과 미검증, 앙상블 가중 미최적화 | composite/dtw |
| F-35 | P2 | RC-3 | 신규 엔진이 z-score 없는 raw 유클리디안으로 회귀 (레거시 교훈 미계승) | baselines.ts |
| F-36 | P2 | RC-5 | 뉴스 원문 미보존 → 카운트 재계산 불가, top10 무한 누적 | naver-news + 테이블 |
| F-37 | P2 | RC-5 | 타임존 3중 구현 | utils vs date-utils vs 인라인 |
| F-38 | P2 | RC-5 | 월 1일=토요일이면 월간 재교정 스킵 (연 ~1.7회) | runCalibrationPhase |
| F-39 | P2 | RC-5 | first-spike 과집중 필터 결과 무보고 폐기 | calculate-scores 호출부 |
| F-40 | P2 | RC-7* | weight_version이 run에 미핀 — 과거 유사도 재현 불가 | runs_v2 스키마 |
| F-41 | P2 | RC-3 | 활성 이력 이원화 (state_history_v2 vs episode_registry_v1) SSOT 부재 | 스키마 |
| F-42 | P2 | RC-3 | prediction_snapshots_v2 status 인덱스 누락 (v1 대비 회귀) | 마이그레이션 007 vs 016+ |
| F-43 | P2 | RC-3 | 죽은 자산: v_comparison_v4_serving, sentiment_score 컬럼, v1 5-phase 분기 | 각 grep |
| F-44 | P2 | RC-3 | 매직넘버 30+ 무근거 (섹터 패널티 0.85, tier 컷 200/75, guardrail 8종 등) | explore-comparison §6 |
| F-45 | P2 | RC-5 | 보존 정책 전무 (전 테이블 DELETE/파티셔닝 0) + JSONB 누적 | 스키마 전수 |
| F-46 | P2 | RC-2 | 신뢰도 기대치 0.8/0.5/0.2 하드코딩 ECE (임의 기준 캘리브레이션) | confidence-calibration.ts |

*F-40의 RC-7은 재현성 원칙(P7) 위반 항목.

## 부록 B. 파라미터·파일 처분표

### B.1 TLIParams 50개 처분 (요약)

| 그룹 | 현행 | v3 처분 |
|---|---|---|
| Scoring weights 4 | Optuna 1회 | **유지 3+1계산** — 표시 점수용, 연 1회 재추정 루프 편입 |
| Stage thresholds 5 | Optuna 1회 | **유지 5** — 표시 분류용, 고정상수 문서화 |
| Smoothing 6 (ema 3종, cautious, bollinger 2) | 혼재 | **2로 감축** (단일 α + min_daily_change) — Cautious/Bollinger 폐지 |
| Interest/News/Vol 스케일 10 | Optuna 일부 | **6로 감축** — 앵커 도입으로 sigmoid 센터·스케일류 축소 |
| Activity/Sentiment-proxy 11 | 미검증 다수 | **4로 감축** — sentiment proxy 폐지(모델 피처로 대체) |
| Prediction 5 (momentum_*, phase_*) | **루프 없음** | **전부 삭제** — T1 모델이 대체 |
| Comparison 5 | **위표기** | **전부 삭제** — 유사도 엔진 상수는 별도 config로 이동+근거 주석 |
| Confidence 2 | 월간 | **삭제** — abstain 규칙으로 대체 |
| 합계 50 | | **20** (3+5+2+6+4) |

### B.2 파일 처분 (주요, 전체는 Phase 4 티켓에서 확정)

- DELETE: `lib/tli/prediction.ts`, `prediction-helpers.ts`, `prediction-bootstrap.ts`, `confidence-calibration.ts`, `sentiment-proxy.ts`, `forecast/`(6파일 — calibration.ts의 computeECE만 이식), `analog/reranker.ts`, `analog/targets.ts`, `scripts/tli/level4/`(14파일 중 calibration-artifact 사상만 이식), `scripts/tli/ops/`(promote/bridge/certification 계열), `app/api/tli/themes/[id]/forecast-reader.ts`
- KEEP+이식: `episode-policy.ts`, `stats/comparison-stats.ts`, `comparison/mutual-rank.ts`, `normalize.ts`, `date-utils.ts`
- 신설: `lib/tli/labels/`(GT 정의·라벨링), `lib/tli/model/`(M0/M1 서빙 함수 + 계수 로더), `scripts/tli/learn/`(주간 학습·게이트), `tli-weekly-learn.yml`

## 부록 C. Boomer(Codex) 반론 수렴 기록

> Round 1: 2026-07-03, codex-cli 0.142.5 (gpt-5.5, xhigh), 반론 15건 (HIGH 9 / MED 5 / LOW 1). Boomer는 자체적으로 `historical-data.json`을 수치 분석해 근거를 제시했다 (인접 라벨 동일률 84.0%, g lag-1 상관 0.858, 비중복 n=104).

| # | 심각도 | 반론 요지 | 처분 | 반영 위치 |
|---|---|---|---|---|
| B-1 | HIGH | RC-1 사실관계 오류 — Phase 생성은 Stage가 아니라 아날로그 day-ratio (`void _stage`), 자기참조는 채점 라벨에 있음 | **수용 (초안 오류 정정)** | §2 RC-1 재서술 |
| B-2 | HIGH | "라벨 안 바꾸면 개선 불가"는 과장 — GDDA가 반증. ablation 선행 필요 | **부분 수용** — 결론 강도 정정 + M0(현행 휴리스틱의 GT-A 채점)를 Phase 2 필수 산출물로 명시. 단 "재구성 근거는 RC-1 단독이 아니라 RC-1~5 복합"이므로 전면 재구성 방침은 유지 | §2 RC-1 결론, §5.6 M0 |
| B-3 | HIGH | GT-A는 순수 외부 라벨 아님 (30일 상대 스케일·키워드·정수 반올림 의존) | **수용** — proxy label로 격하, keyword_epoch 단절 규칙, rescale_suspect 기본 제외 전환, low_signal 플래그 | §5.2 GT-A |
| B-4 | HIGH | 겹침 라벨 자기상관으로 val n≥150이 검증력 과대평가 | **수용** — 게이트를 비중복 n_eff≥250 + 4주 누적 판정으로 재설계, raw/비중복 n 병기 의무 | §5.7, §8 |
| B-5 | HIGH | 계수 EMA는 스케일러 변동 하에서 수학적으로 무의미 | **수용 (초안 오류 폐기)** — artifact 번들 단위 승격으로 교체 | §5.6 |
| B-6 | HIGH | theme_predictions_v3 유니크 키가 챌린저/섀도 병존 불가 + CHECK 부재 | **수용** — model_version 포함 키 + serving_role + 범위 CHECK + champion 부분 유니크 인덱스 | 부록 D.3 |
| B-7 | HIGH | Phase 즉시 폐지는 공개 API(OpenAPI enum)·MCP 계약 파괴 | **수용** — 6주 deprecation + 호환 파생값 + MCP 갱신 티켓 | §5.3, T-010 |
| B-8 | HIGH | 삭제 목록이 코드 경로 의존성 무시 (v_comparison_v4_serving 분기 존재), 재사용 유틸 소실 위험 | **수용** — import graph+런타임 매니페스트 증명 의무화, fail-closed/게이트/readback 유틸 이식 목록 명시 | §6 삭제 집행 규율 |
| B-9 | HIGH | Phase 0의 UI 스냅샷 전환은 parity/freshness 검증 없이 성급 | **수용** — Phase 0은 parity 리포트만, 전환은 SLA 통과 후 (T-009/T-010 분리) | §7, 부록 E |
| B-10 | MED | 앵커 브리지(옵션 B)는 배치 간 연결 고리가 없어 성립 불가 | **수용 (초안 설계 결함 정정)** — 옵션 A(전 배치 앵커) 채택, 앵커 7일 중앙값 완충 + 드리프트 감시. 그래프 캘리브레이션은 규모 대비 과설계로 기각 | §5.4.1 |
| B-11 | MED | δ 가변 기준은 라벨 정의 드리프트 | **수용** — δ는 labeler_version 박제, 버전 간 지표 비교 금지, base-rate drift 별도 감시 | §5.2 |
| B-12 | MED | censored 제외가 실패 사례 삭제로 정밀도 부풀림 | **수용** — censored율 의무 게시 + conservative/optimistic 민감도 + 격차 5pp 초과 시 재심 Issue | §5.2 |
| B-13 | MED | ECE bin 정책 미정의 + 게이트 본문/의사코드 불일치 | **수용** — quantile 5-bin·bin n≥30 명시, point+CI 이중 조건으로 의사코드 정정 | §5.7, §8 |
| B-14 | MED | GT-B 호출량·약관·fallback 미비 | **수용(범위 내)** — 운영 명세(심볼 수·콜 예산·레이트리밋·실패 동작) 추가. "별도 PRD 분리"는 기각 (검증 라벨로 범위가 작고 T1 서빙을 막지 않음) | §5.2 GT-B |
| B-15 | LOW | "모든 실패 Issue"는 소음으로 무음을 대체 | **수용** — dedupe/다이제스트/재발 코멘트 정책 | §9 |

**기각·부분 기각 사유 요약**: B-2의 "전면 재구성 과잉" 주장과 B-14의 "별도 PRD 분리"만 부분/전체 기각했으며, 사유는 각 행에 기록. 나머지 13건 전부 수용.

> Round 2: 수렴 판정 **FAIL** — 잔여 이견 4건 (전부 반영 정합성 문제, 신규 방법론 반론 없음). 기각 2건(B-2 방침 유지, B-14 분리 기각)의 사유는 "방어 가능" 판정.

| # | 잔여 이견 | 처분 |
|---|---|---|
| R2-1 | M0 정의 불일치 (§2 "현행 휴리스틱 채점" vs §5.6 신규 룰) | 수용 — 베이스라인을 B-abl(현행 ablation 대조군)과 M0(룰 기준선)로 이원화, §2/§5.6/T-202 정합화. M1은 양쪽을 모두 이겨야 서빙 후보 |
| R2-2 | ECE 정의 충돌 (§8 "10 등간 bin" 잔존) | 수용 — §8을 quantile 5-bin·bin n≥30으로 통일 |
| R2-3 | T-105가 기각된 옵션 B 문구 잔존 | 수용 — 옵션 A(전 배치 앵커 슬롯)로 티켓 재작성 |
| R2-4 | 배치 증가율 산술 표기 (+25% → 실제 +26.7%) | 수용 — 정정 |

> Round 3 (최종): 수렴 판정 **PASS** — 2차 잔여 이견 4건 전부 반영 확인 (B-abl/M0 이원화 3개소 일관, ECE 정의 통일, T-105 옵션 A 재작성, 산술 정정). **Boomer 이견 0 — 수렴 완료 (2026-07-03)**.

### 프로덕션 레디 최종 감사 (v1.3, 2026-07-03)

전문 재독 정합성 감사 + Codex 2-라운드 프로덕션 레디 검증:

| 라운드 | 판정 | 내용 |
|---|---|---|
| 자체 감사 | 9건 수정 | **학습 사이클 모순 해소** (매주 챌린저+4주 판정의 판정 대상 모호 → 4주 prospective shadow 사이클로 통일), **게이트 표본 실현성** (라벨 모집단 = 전체 활성 ~150테마 명시 + 미달 시 8주 자동 연장), 파라미터 목표 15→**20** 정직 통일(7개소), 교차참조 오류 2건(§6.2→§5.2 등), Phase 1 앵커 옵션 B 잔재, Go/No-Go에 B-abl 누락, 티켓 수 33→36, 모델 아티팩트 SSOT=DB 확정 |
| Codex 1차 | NOT-READY (차단 5) | Brier CI 95/99 충돌, T-302 의존성 누락(T-303), D.1 컬럼 누락(low_signal·keyword_epoch), D.3 score_status에 excluded 부재, corpus_snapshot_id 스키마 불일치 |
| Codex 2차 | **READY (차단 0)** | 5건 해소 확인 + 파라미터 20·티켓 36 산술 검증 통과 + G.8 착수 순서와 의존성 그래프 무충돌 확인 |

## 부록 D. 신규 스키마 스펙 (DDL 수준)

> 전부 additive. 기존 테이블 변경은 컬럼 추가만. RLS: 전부 service_role 전용 — **031/032 as-built 패턴 복제** (`service_role_all_{table}` 정책 + `REVOKE ALL FROM anon, authenticated`, 부록 H.3). 서빙 노출은 API 경유만.
> **마이그레이션 번호 배정**: D.1+D.6 → `033` (T-101, themes.keyword_epoch/keyword_hash 포함) · D.3 → `034` (T-207) · D.4+D.5 → `035` (T-301). 031/032는 적용 완료.

### D.1 `theme_labels` — GT 통합 라벨 저장소

```sql
CREATE TABLE theme_labels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id      uuid NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  base_date     date NOT NULL,              -- 기준일 t (KST 영업일)
  label_type    text NOT NULL CHECK (label_type IN ('gt_a','gt_b','gt_c_peak')),
  horizon_days  int  NOT NULL DEFAULT 5,    -- 영업일 기준
  -- GT-A
  g_log_ratio   numeric,                    -- 윈저라이즈 후 값
  y_binary      boolean,                    -- g >= delta
  denominator   numeric,                    -- mean(raw t-4..t) — 하한 검증용 보존
  rescale_suspect boolean NOT NULL DEFAULT false,
  low_signal    boolean NOT NULL DEFAULT false,  -- denom < 10 (민감도 분석 분리축, G.2)
  keyword_epoch int NOT NULL DEFAULT 1,      -- 테마 키워드 셋 세대 (변경 시 라벨 단절, §5.2)
  -- GT-B
  basket_excess_return numeric,             -- vs KOSPI
  basket_size   int,
  -- 공통
  label_status  text NOT NULL DEFAULT 'pending'
                CHECK (label_status IN ('pending','final','censored','excluded')),
  exclude_reason text,                      -- 'denominator_floor' | 'episode_censored' | ...
  labeler_version text NOT NULL,            -- 라벨 산식 버전 핀 (P7)
  finalized_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (theme_id, base_date, label_type, horizon_days)
);
CREATE INDEX idx_theme_labels_pending ON theme_labels (label_status, base_date)
  WHERE label_status = 'pending';           -- 일일 확정 잡 스캔용 (F-42 교훈)
CREATE INDEX idx_theme_labels_final ON theme_labels (label_type, base_date)
  WHERE label_status = 'final';             -- 학습 로더용
```

### D.2 `stock_daily_prices` — 일봉 이력 (GT-B·피처 공용)

```sql
CREATE TABLE stock_daily_prices (
  symbol      text NOT NULL,
  trade_date  date NOT NULL,
  close       numeric NOT NULL CHECK (close > 0),
  volume      bigint,
  source      text NOT NULL DEFAULT 'kis', -- 'kis' | 'naver_backfill'
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, trade_date)
);
-- KOSPI 지수는 symbol='KOSPI'로 동일 테이블에 저장 (초과수익 계산 단순화)
```

### D.3 `theme_predictions_v3` — 단일 예측 객체 (서빙 = 스냅샷 = 채점, P3)

```sql
CREATE TABLE theme_predictions_v3 (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id        uuid NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  prediction_date date NOT NULL,            -- 예측 생성 기준일 (KST 영업일)
  horizon_days    int  NOT NULL DEFAULT 5,
  serving_role    text NOT NULL DEFAULT 'champion'
                  CHECK (serving_role IN ('champion','challenger','shadow')),
  p_rise          numeric CHECK (p_rise IS NULL OR (p_rise >= 0 AND p_rise <= 1)),
  ci_lower        numeric CHECK (ci_lower IS NULL OR (ci_lower >= 0 AND ci_lower <= 1)),
  ci_upper        numeric CHECK (ci_upper IS NULL OR (ci_upper >= 0 AND ci_upper <= 1)),
  abstain         boolean NOT NULL DEFAULT false,
  abstain_reasons text[],                   -- 'data_age_lt_7d' | 'feature_missing_gt_30pct'
  features        jsonb NOT NULL,           -- point-in-time 피처 벡터 (재현성·디버그)
  model_version   text NOT NULL,            -- artifact 번들 버전 핀
  labeler_version text NOT NULL,
  param_version   text NOT NULL,
  -- 사후 채점 (일일 잡이 기입)
  actual_g        numeric,
  actual_y        boolean,
  scored_at       timestamptz,
  score_status    text NOT NULL DEFAULT 'pending'
                  CHECK (score_status IN ('pending','scored','censored','excluded')),
                  -- excluded: 대응 라벨이 위생 규칙으로 제외된 경우 (G.2) — 채점 불가로 확정
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- 챔피언/챌린저/섀도가 같은 날 병존 가능해야 함 (Boomer B-6)
  UNIQUE (theme_id, prediction_date, horizon_days, model_version),
  CHECK (abstain OR p_rise IS NOT NULL),
  CHECK (ci_lower IS NULL OR ci_upper IS NULL OR ci_lower <= ci_upper)
);
-- 서빙 조회는 champion만: 부분 인덱스로 강제·가속
CREATE UNIQUE INDEX uniq_predictions_v3_champion
  ON theme_predictions_v3 (theme_id, prediction_date, horizon_days)
  WHERE serving_role = 'champion';
CREATE INDEX idx_predictions_v3_pending ON theme_predictions_v3 (score_status, prediction_date)
  WHERE score_status = 'pending';
CREATE INDEX idx_predictions_v3_serving ON theme_predictions_v3 (prediction_date DESC, theme_id);
```

### D.4 `model_registry` — 챔피언/챌린저 이력

```sql
CREATE TABLE model_registry (
  model_version   text PRIMARY KEY,          -- 'm1-2026w28'
  model_type      text NOT NULL,             -- 'm0_rule' | 'm1_logistic' | 'm2_gbm'
  coefficients    jsonb NOT NULL,            -- 계수 + 캘리브레이터 파라미터 + 피처 스키마
  train_range     daterange NOT NULL,
  val_metrics     jsonb NOT NULL,            -- {brier, ece, ic, p_at_10, n_raw, n_nonoverlap, ci}
  gate_result     jsonb NOT NULL,            -- 게이트별 pass/fail + 근거값
  status          text NOT NULL CHECK (status IN ('champion','challenger','rolled_back','archived')),
  promoted_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- 부분 유니크: champion·challenger는 각각 동시에 1개만 (4주 사이클 불변식)
CREATE UNIQUE INDEX uniq_model_champion ON model_registry (status) WHERE status = 'champion';
CREATE UNIQUE INDEX uniq_model_challenger ON model_registry (status) WHERE status = 'challenger';
```

### D.5 `model_metrics_daily` — 모니터링·자동 롤백·methodology 동적 게시 소스

```sql
CREATE TABLE model_metrics_daily (
  metric_date    date NOT NULL,
  model_version  text NOT NULL REFERENCES model_registry(model_version),
  brier          numeric, ece numeric, ic numeric, p_at_10 numeric,
  coverage       numeric, abstain_rate numeric,
  n_scored       int NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (metric_date, model_version)
);
```

### D.6 기존 테이블 변경 (additive만)

| 테이블 | 변경 |
|---|---|
| `interest_metrics` | `anchor_scaled_value numeric` 추가 (raw_value 불변) |
| `theme_news_articles` | 10건 제한 폐지, 메타 전건 영구 보존 (Q5 — 정리 잡 없음, 분기 용량 리뷰) |
| `prediction_snapshots_v2` | 변경 없음 — Phase 3 후 읽기 동결, Phase 4에서 rename 보존 30일 후 정리 |

## 부록 E. 티켓 실행 명세 (Phase별) — v2.0 실행판

> **구현 에이전트 계약**: 티켓 착수 전 [부록 H(as-built) → 이 티켓 → 참조된 부록 G/D 섹션]을 읽어라. 1 티켓 = 1 PR (부록 G.7 규약). 모든 신규 scripts/tli 파일은 `tli-boundary-manifest.ts` 등록 필수 (누락 시 테스트 실패). DB는 additive 마이그레이션만.
> 크기: S(≤반나절) / M(≤1일) / L(2~3일).

### Phase 0 — ✅ 완료 (2026-07-06, `bed3040`) — as-built는 부록 H

| ID | 티켓 | 결과 |
|---|---|---|
| T-001 | 스크래퍼 정량 게이트 | ✅ `naver-finance-theme-gates.ts` + 테마 격리 + 직전 DB 대비 70% |
| T-002 | batchUpsert fail-loud | ✅ `batch-upsert-failures.ts`, batchUpsert 기본 throw |
| T-003 | Issue 알림 정책 | ✅ 워크플로우 인라인 (critical 24h dedupe / warning digest) |
| T-004 | 휴장일 캘린더 | ✅ `lib/tli/trading-calendar.ts` (archive hours 위임, 2025~2027) |
| T-005 | 좀비 테마 정리 | ✅ `scoreless-zombie-themes.ts` + autoDeactivate 배선 |
| T-006 | 월간 재교정 분리 | ✅ `monthly-calibration-schedule/state.ts` |
| T-007 | 타임존 단일화 | ✅ `lib/tli/date-utils.ts` 위임 |
| T-008 | stock_daily_prices + KIS | ✅ 031/032 적용·검증, 기간조회+KOSPI+volume. **잔여: 백필 1회 실행** |
| T-009 | parity 리포트 + Cooling 문구 | ✅ 로더/리포트/배선. **잔여: 14일 측정 대기** |
| T-010 | UI 스냅샷 전환 + deprecation | ⏸ **보류** — T-009 SLA(coverage≥90%, freshness≤1영업일) 통과 후 착수 |

### Phase 1 — Ground Truth 파이프라인 (7티켓)

#### T-101 [L] `theme_labels` 스키마 + GT-A 라벨러 코어
- **목적**: 외부 ground truth 저장소와 라벨 산식의 순수 함수 구현 (P1 원칙의 물리적 기반)
- **의존**: 없음 (Phase 1 첫 티켓)
- **작업**:
  1. `supabase/migrations/033_create_theme_labels.sql` — 부록 D.1 DDL 그대로 + **다음 2개 추가**: ① `interest_metrics`에 `anchor_scaled_value numeric` (D.6, T-105가 사용) ② `themes`에 `keyword_epoch int NOT NULL DEFAULT 1`, `keyword_hash text` (keyword_epoch 단절 감지용, 아래 3). RLS는 031/032 패턴 (service_role 정책 + REVOKE anon/authenticated)
  2. `lib/tli/labels/gt-a.ts` — **순수 함수** `labelGtA(input)`: 부록 G.2 의사코드를 그대로 구현. 시그니처: `labelGtA(input: { pastRaw: number[]; futureRaw: number[]; keywordEpochAtBase: number; keywordEpochAtFinalize: number; windowMaxRenewalGapDays: number | null; deactivatedBeforeHorizon: boolean }): GtALabelResult`. δ=+0.10 상수, `labeler_version='gta-v1'` 상수 export. 윈저라이즈 [-1.5,+1.5], 분모 하한 4, `low_signal`(denom<10), `rescale_suspect`(갭≤5영업일)
  3. keyword_epoch 메커니즘: `scripts/tli/themes/theme-keywords.ts`의 키워드 upsert 경로에 "정렬된 키워드 목록의 해시를 `themes.keyword_hash`와 비교 → 다르면 `keyword_epoch+1` + hash 갱신" 추가. 라벨은 생성 시점 epoch을 기록하고, 확정 시점 epoch과 다르면 `excluded('keyword_epoch_break')`
  4. `scripts/tli/labels/label-gt-a.ts` — DB 어댑터: 활성 테마 × 기준일에 대해 `interest_metrics` 로드(영업일 정렬은 `trading-calendar.ts`) → `labelGtA` 호출 → `theme_labels` upsert(`batchUpsert`, onConflict `theme_id,base_date,label_type,horizon_days`). 생성 시 `label_status='pending'`
- **AC**: 마이그레이션이 원격 적용되고(`supabase db push`), 고정 픽스처(상승/하락/분모미달/절단/에폭단절/리스케일 6케이스)에 대해 라벨러가 스펙대로 판정
- **테스트**: `lib/tli/__tests__/gt-a-labeler.test.ts` — 6케이스 + 윈저라이즈 경계 + δ 경계(g=0.10 정확히 → y=true)

#### T-102 [M] GT-A 소급 백필 + 라벨 감사 리포트
- **의존**: T-101
- **작업**: `scripts/tli/ops/run-gt-a-backfill.ts` — 2026-01-07부터 어제까지 전 영업일 × 전 테마(비활성 포함, 당시 데이터 있으면) 라벨 생성. t+5 경과분은 즉시 `final` 확정. 완료 후 감사 리포트 JSON 출력: `{ totalLabels, finalCount, censoredRate, excludedByReason, rescaleSuspectRate, lowSignalRate, baseRate, gDistribution: {p10,p25,p50,p75,p90} }`. ops 스크립트 패턴(main().catch exit 1, 부록 H.9) 준수
- **AC**: 백필 라벨 ≥ 2,000건 final, 감사 리포트 산출. 멱등성: 2회 실행해도 행 수 불변
- **테스트**: 백필 로직의 날짜 경계(주말 시작일, 공휴일 낀 창) 단위테스트

#### T-103 [S] δ=+0.10 검증 리포트 (Q1 게이트)
- **의존**: T-102
- **작업**: T-102 리포트의 `baseRate`가 **20~50% 범위인지 판정**하는 스텝을 백필 러너에 포함. 범위 이탈 시 exit 1 + 리포트에 `deltaReviewRequired: true` — 이 경우 작업 중단하고 Isaac에게 보고 (labeler_version 개정은 Isaac 결정)
- **AC**: 리포트에 판정 필드 존재. 이탈 시 명확한 실패

#### T-104 [M] GT-B 라벨러 (검증 라벨)
- **의존**: T-101, T-008 백필 실행
- **작업**: `lib/tli/labels/gt-b.ts` 순수 함수 — `r(i,t) = mean_j(close_j[t+5]/close_j[t] − 1) − (KOSPI[t+5]/KOSPI[t] − 1)`, j = 해당 테마 `theme_stocks` 상위 5종목(is_active, relevance 순 — `selectTopThemeStockSymbols` 재사용). 종목 중 시세 결측이 2개 초과면 `excluded('insufficient_prices')`, KOSPI 결측이면 `pending` 유지. `scripts/tli/labels/label-gt-b.ts` 어댑터 + 커버리지 리포트(라벨 가능 비율)
- **AC**: 백필 구간 GT-B 커버리지 리포트 산출. **GT-B 실패가 GT-A 라벨링을 막지 않음** (독립 실행)
- **테스트**: 초과수익 산술 + 결측 처리 케이스

#### T-105 [L] DataLab 전 배치 앵커 (옵션 A) — ⚠️ 수집 파이프라인 변경, 이 Phase의 최고 리스크 티켓
- **의존**: T-101 (anchor_scaled_value 컬럼)
- **작업**:
  1. `scripts/tli/collectors/naver-datalab.ts` — 배치 구성을 5테마 → **앵커 1 + 테마 4**로 변경. 앵커 키워드 상수 `ANCHOR_KEYWORD = '계산기'` + `ANCHOR_CANDIDATES = ['계산기','번역','지도']` (Q2). 배치 수 +26.7% — 기존 배치 간 delay·재시도 로직 그대로
  2. 스케일 계산: 배치별 `scaleFactor = 1 / max(앵커의 7일 중앙값, ε)` — 앵커 시계열은 별도 버퍼에 누적 후 중앙값. `anchor_scaled_value = raw_value × scaleFactor`를 interest_metrics upsert에 포함 (**raw_value는 절대 불변**)
  3. 앵커 드리프트 감시: 일일 앵커 CV 계산 → 14일 롤링 CV > 0.3이 2주 연속이면 warning (기존 warning 경로 → digest Issue)
  4. **롤백 플래그**: `TLI_ANCHOR_ENABLED` env (기본 true) — false면 기존 5테마 배치로 즉시 복귀 (anchor_scaled_value는 null로 적재)
- **AC**: 배치 구성 변경 후에도 기존 DataLab 게이트(커버리지 70%/제로값 90%) 통과 유지. anchor_scaled_value가 적재되기 시작. 롤백 플래그 동작 확인
- **테스트**: 배치 구성 함수(앵커 삽입/테마 분할) + 스케일 산술 + 플래그 분기

#### T-106 [S] 앵커 안정성 14일 관찰 리포트
- **의존**: T-105 가동 14일 후
- **작업**: `scripts/tli/ops/run-anchor-stability-report.ts` — 3후보의 14일 CV 비교 (후보 2개는 T-105 가동 중 주 1회 별도 배치로 샘플링하거나, 데이터 부족 시 주 앵커만 리포트). 최저 CV 후보가 '계산기'가 아니면 교체 검토 Issue 발행 (교체 자체는 `anchor_epoch` 태그와 함께 Isaac 승인)
- **AC**: 리포트 산출 + 앵커 확정 기록 (본 PRD §11 Q2 행 갱신)

#### T-107 [M] 일일 라벨 확정 잡 파이프라인 편입
- **의존**: T-101
- **작업**: `pipeline-steps.ts`에 Step 4.1 신설 (부록 G.4 접합점): ① 오늘 기준일 라벨 생성(pending) ② t−5영업일 pending 라벨에 실현값 기입 → `final`/`censored`/`excluded` 확정. full 모드에서만. 실패는 warning 분류 (라벨 지연은 다음 실행이 소급 처리 — `idx_theme_labels_pending` 인덱스 활용). `collect-and-score.ts` 결과 요약에 라벨 카운트 추가
- **AC**: 파이프라인 2회 실행 시나리오 테스트에서 pending→final 전이 확인. 멱등성 (재실행 시 이중 확정 없음)
- **테스트**: `scripts/tli/__tests__/label-finalize-step.test.ts` — mock supabase로 전이·멱등성

### Phase 2 — 베이스라인 + 평가 하네스 (7티켓)

#### T-201 [L] 피처 빌더 (10피처, point-in-time)
- **의존**: T-105 (피처 2가 anchor_scaled_value 사용 — 축적 2주 미만이면 피처 2는 결측 플래그로 대체하고 진행)
- **작업**: `lib/tli/features/build-features.ts` — 부록 G.1 수식 10개를 순수 함수로. 시그니처: `buildFeatureVector(input: FeatureInputs): { values: number[]; missingFlags: boolean[]; abstain: boolean; abstainReasons: string[] }`. 재사용 의무: `linearRegressionSlope`/`calculateDVI`/`log_normalize`/`percentileRank`(normalize.ts), 영업일 산술(trading-calendar.ts). abstain 규칙: 결측 >3개 또는 관심도 이력 <7일. DB 로더 `scripts/tli/features/load-feature-inputs.ts`는 **기준일 t 이전 데이터만** 조회 (point-in-time — `calculated_at`/`time` 필터 명시)
- **AC**: 고정 픽스처에서 10피처 수식이 G.1과 일치 (수기 계산 대조 3케이스)
- **테스트**: 피처별 단위테스트 + point-in-time 위반 가드 테스트 (t 이후 데이터 주입 시 결과 불변)

#### T-202 [M] 베이스라인 2종 (B-abl + M0) + base rate
- **의존**: T-201, T-102
- **작업**: ① **B-abl**: 과거 `prediction_snapshots_v2`의 phase 판정('rising'=양성 예측)을 동일 (theme, date)의 GT-A final 라벨과 조인해 채점 — Brier/정밀도 산출 (현행 휴리스틱의 GT-A 성능 = 라벨 교체 효과의 대조군, §5.6). ② **M0**: `slope_7d > 0 AND news_momentum > 1` → p = train 구간 base rate (룰 히트 시), 아니면 1−base rate 보정. `lib/tli/model/baselines.ts`
- **AC**: 두 베이스라인의 Brier/P@10이 리포트로 산출
- **테스트**: M0 룰 분기 + B-abl 조인 로직

#### T-203 [M] M1 학습 스크립트 (Python) + 표본 충분성 검증
- **의존**: T-201
- **작업**: `scripts/tli/learn/train_m1.py` — sklearn LogisticRegression(L2, class_weight='balanced') + Platt(내장 sigmoid calibration, `CalibratedClassifierCV` prefit) 학습. 입력: T-204 하네스가 덤프한 학습 데이터 JSON (Optuna의 `dump-data.ts` 패턴 재사용 — 네트워크 의존 없는 파일 입력). 출력: **부록 G.3 아티팩트 JSON 스키마 그대로** (feature_schema 순서 고정, scaler median/MAD, coefficients, calibrator a/b, seed=42). 파일럿 Cox-Snell R² 산출 → Riley `pmsampsize` 공식으로 최소 표본 판정 (R²≥0.08 충족 / <0.05면 피처 축소 권고 출력)
- **AC**: 아티팩트 JSON이 스키마 검증 통과. R² 리포트 포함
- **테스트**: `test_train_m1.py` — 합성 데이터로 학습·직렬화 왕복

#### T-204 [L] 평가 하네스 (walk-forward + 클러스터 부트스트랩)
- **의존**: T-102
- **작업**: `lib/tli/eval/harness.ts` — ① walk-forward 분할 (purge gap 5영업일, 테마 클러스터 단위), ② 지표: Brier/ECE(quantile 5-bin·bin n≥30 wrapper — `forecast/calibration.ts::computeECE` 이식)/IC(일별 Spearman)/Rising-P@10, ③ CI: **테마 클러스터 부트스트랩 B=2,000** — `stats/comparison-stats.ts::clusterBootstrapPairedDelta` 재사용, ④ 비중복(주 1 기준일: 월요일) 서브셋 병행 산출, raw n·비중복 n 병기, ⑤ 클러스터 불균형 검사(상위 5% 테마가 라벨 30% 초과 → wild cluster bootstrap 전환)
- **AC**: §8 지표 정의와 수식 일치. 동일 시드 재현성
- **테스트**: 부트스트랩 결정성(시드 고정), purge gap 누수 가드, ECE wrapper bin 축소 분기

#### T-205 [M] 오프라인 평가 리포트 자동 생성
- **의존**: T-202, T-203, T-204
- **작업**: `scripts/tli/learn/run-offline-eval.ts` — B-abl/M0/M1 3자를 백필 라벨로 walk-forward 평가 → markdown+JSON 리포트 (지표×모델 표, 클러스터 CI, censored율 의무 게시 §5.2)
- **AC**: 리포트 1커맨드 재현 (`npm run tli:eval` — package.json 스크립트 추가)

#### T-206 [S] Go/No-Go 판정 + Isaac 게이트
- **의존**: T-205
- **작업**: 판정 문서 작성 — **Go 조건: M1이 B-abl과 M0 양쪽 대비 Brier 개선 (클러스터 99% CI 상한 ≤ 0)**. Go → Phase 3 진행 / No-Go → 더 나은 베이스라인으로 T1 서빙 + 피처 개선 백로그 (§7). 본 PRD에 결과 기록 후 Isaac 승인
- **AC**: 판정 근거가 T-205 리포트 수치로 추적 가능

#### T-207 [M] `theme_predictions_v3` + shadow 서빙 (기록만)
- **의존**: T-203 (Go/No-Go와 무관하게 shadow 기록은 선행 가능)
- **작업**: `supabase/migrations/034_create_theme_predictions_v3.sql` — 부록 D.3 DDL 그대로 (serving_role/CHECK/champion 부분 유니크 포함) + RLS 031/032 패턴. `lib/tli/model/predict.ts` — 아티팩트 JSON을 읽어 추론하는 순수 TS 함수 (G.3: robust-z → w·z+b → sigmoid → Platt). **Python 학습기와 골든 벡터 대조 테스트 (오차 <1e-6)**. `pipeline-steps.ts` Step 6에 v3 기록 추가 (기존 v2 스냅샷과 병행 — 대체는 Phase 3)
- **AC**: 마이그레이션 적용 + shadow 행이 일일 적재 + 골든 벡터 통과
- **테스트**: 추론 순수 함수 + CHECK 제약 위반 케이스

### Phase 3 — 자동 루프 + 서빙 전환 (7티켓)

#### T-301 [L] `tli-weekly-learn.yml` 4주 사이클 + model_registry
- **의존**: T-207
- **작업**: ① `supabase/migrations/035_create_model_registry.sql` — 부록 D.4 + D.5(model_metrics_daily) 함께, RLS 동일 패턴. ② 워크플로우: 부록 G.6 스펙 그대로 (일요일 KST 06:00, 잡 5단계, dry_run 입력, 기존 시크릿 재사용, Python 셋업). ③ 체크포인트 판정: §8 의사코드를 `scripts/tli/learn/promotion-gate.ts` 순수 함수로 (n_eff≥250, 8주 연장, 연 6회 상한, Brier point+99% CI+상대 2%, ECE 이중조건, P@10 guardrail, 불균형 폴백). ④ 승격 = model_registry 트랜잭션 (champion/challenger 부분 유니크가 원자성 보장)
- **AC**: 드라이런 2회 (모의 승격 1 + 모의 기각 1) 성공. 게이트 함수는 §8 의사코드와 분기 1:1
- **테스트**: promotion-gate 전 분기 단위테스트 (보류/연장/상한/각 게이트 실패/통과)

#### T-302 [M] 자동 롤백
- **의존**: T-301, T-303
- **작업**: weekly 워크플로우에 롤백 검사 스텝 — `model_metrics_daily`에서 서빙 챔피언의 롤링 4주 비중복 Brier vs 직전 버전 동기간, +10% 악화 시 이전 artifact 자동 복원(registry status 전환) + Issue. 드라이런 검증
- **AC**: 모의 악화 데이터로 롤백 드라이런 성공

#### T-303 [M] 일일 채점 + `model_metrics_daily` 적재
- **의존**: T-207
- **작업**: `pipeline-steps.ts` Step 7을 v3 채점으로 확장 (기존 v2 평가와 병행): 만기(t+5영업일) 예측에 GT-A 실현값 기입(`scored`/`censored`/`excluded` — D.3 score_status), 일일 Brier/coverage/abstain율 → model_metrics_daily. `idx_predictions_v3_pending` 활용
- **AC**: 7일 연속 적재 확인 (T-306 전환의 전제)
- **테스트**: 채점 전이 + 지표 산술

#### T-304 [L] T1 확률 UI (예측 카드 대체)
- **의존**: T-303 + T-206 Go
- **작업**: `app/themes/[id]/_components/theme-prediction/` — `calculatePrediction()` 라이브 호출 제거, `theme_predictions_v3` champion 스냅샷 조회 API로 교체 (P3: 노출=스냅샷=채점 단일 객체). 카드: 확률 + CI 밴드 + abstain 상태("데이터 수집 중 D+n") + **"최근 90일 실측: 상위 신호 정밀도 XX% (n=YY)"** 자동 문구 (model_metrics_daily 집계). §5.8 법적 고지 유지. **T-010 잔여分 흡수**: OpenAPI/MCP `phase` deprecation 표기 + 호환 파생값 (§5.3: p≥0.6 rising / 0.4~0.6 hot / <0.4 cooling, 6주 후 제거)
- **AC**: 노출값 = DB 스냅샷 diff 0. 기존 UI 컴포넌트 재사용 (신규 공용 컴포넌트 필요 시 중단·보고 — Isaac 대원칙 3)
- **테스트**: presentation 순수 함수 + API 계약 (부록 G.5)

#### T-305 [M] methodology 동적 섹션
- **의존**: T-303
- **작업**: `app/api/tli/methodology/route.ts` + methodology 페이지 — 정적 수치 서술(GDDA 66% 등) 제거, model_metrics_daily 90일 집계를 읽는 동적 섹션으로 교체 (§5.8-3)
- **AC**: 페이지 수치가 DB 집계와 일치, 정적 마케팅 수치 0

#### T-306 [S] shadow 2주 관찰 → 노출 전환
- **의존**: T-304
- **작업**: shadow 2주 지표 리포트 → 이상 없으면 서빙 플래그 전환 (v2 카드 → v3 카드). 플래그 1개로 즉시 롤백 가능 (§7 Phase 3 롤백). 전환 후 1주 모니터
- **AC**: 전환·롤백 왕복 검증

#### T-307 [M] 반사성 탐지 (R9)
- **의존**: T-303
- **작업**: `scripts/tli/ops/run-reflexivity-report.ts` — ① 뉴스레터 발행 시각 전후 노출 테마의 raw_value 이벤트 스터디 (발행일 D0 대비 D+1~D+3 상대 변화 vs 비노출 대조군), ② 분기 리포트: 노출 상위 vs 비노출 테마 라벨 분포 비교. 유의 리프트 시 `exposure_suspect` 플래그 제안 Issue (자동 조치 없음 — 탐지 우선)
- **AC**: 리포트 산출 + 분기 자동 Issue 리마인드 등록 (§9)

### Phase 4 — 감량 + 정리 (5티켓)

#### T-401 [L] DELETE 실행 (부록 B.2 목록)
- **의존**: T-306 (노출 전환 완료 후)
- **작업**: 삭제 규율(§6) 준수 — ① import graph + `tli-runtime-surface.ts`/`tli-boundary-manifest.ts`로 실사용 0 증명을 PR 본문에 첨부, ② 이식 선행: `forecast/calibration.ts::computeECE`(→ eval), fail-closed 패턴(forecast-serving), readback 검증(calibration-artifact), ③ B.2 DELETE 목록 실행 (prediction.ts 계열은 T-304 전환 완료가 전제), ④ manifest에서 삭제 항목 제거
- **AC**: 빌드 3종 + 전 테스트 통과 + 잔존 참조 0 (2차 검증 패스 — 벌크 변경 규칙)
- **테스트**: 기존 스위트 그린 유지가 곧 AC

#### T-402 [M] 파라미터 50→20 체제
- **의존**: T-401
- **작업**: `tli-params.ts` 재편 — 부록 B.1 처분표 그대로 (Prediction 5·Comparison 5·Confidence 2 삭제, Smoothing 6→2, Interest/News/Vol 10→6, Activity 11→4). "Bayesian Optimized" 위표기 정정 (탐색공간 포함 이력 있는 값만). 잔존 20개 각각에 근거 주석 (P6: 루프 소속 또는 고정상수 문서화)
- **AC**: 파라미터 감사 문서 (남은 20개 × 근거) + 전 테스트 통과

#### T-403 [M] 스키마 정리
- **의존**: T-401
- **작업**: `prediction_snapshots_v2` 등 대체 완료 테이블 rename 보존 30일 → DROP 마이그레이션, 죽은 컬럼(`sentiment_score`)·뷰(`v_comparison_v4_serving`) 제거. 각 DROP 전 참조 0 확인
- **AC**: 마이그레이션 적용 + 서빙 무영향 확인

#### T-404 [S] 문서 아카이브 + 최종화
- **의존**: T-403
- **작업**: §0 대체 문서 14종 → `docs/archive/tli/` 이동, `tli-ops-runbook.md` 갱신 (신규 운영 절차: weekly-learn·롤백·앵커·라벨), 본 PRD 최종 상태 갱신 (문서 3개 체제: PRD+런북+methodology)
- **AC**: docs/ 루트에 TLI 설계 문서 = 본 PRD 1개

#### T-405 [S] (옵션, R10) Google Trends 어댑터 스켈레톤
- **의존**: 없음
- **작업**: 인터페이스+인증 스켈레톤만 (실수집 없음) — DataLab 두절 시 대체 경로의 사전 뼈대

## 부록 H. Phase 0 As-Built 기록 (2026-07-06, 커밋 `bed3040`) — Phase 1+ 구현 에이전트 필독

> 계획(v1.3) 대비 실제 구현의 차이와, 후속 티켓이 의존하는 실코드 계약. **이 부록과 어긋나는 가정으로 코딩하지 마라.**

### H.1 거래일 캘린더 — 계획과 다른 소스 채택 (의도적)
- 계획: `lib/utils/korean-trading-calendar.ts` 재사용 → **실제: `lib/tli/trading-calendar.ts`가 `app/archive/_utils/market/hours.ts` + `_constants/holidays.ts`에 위임** (KRX 휴장일이 더 완전: 근로자의날·연말휴장 포함, 2025~2027 데이터). 뉴스레터의 korean-trading-calendar는 TLI에서 미사용.
- 공개 API: `isKoreanTradingDate(dateString)`, `shouldCollectTliStocks({mode, kstDate})`. noon-anchored 로컬 Date 패턴은 파일 주석의 WHY 참조 — **UTC 통일 리팩터링 금지**.
- 2028년 데이터는 2027년 12월에 추가 필요 (holidays.ts 주석의 갱신 절차).

### H.2 KIS 시세 클라이언트 — 사용 가능한 함수 4종
`app/archive/_utils/api/kis/client.ts`:
- `getDailyClosePrice(ticker, YYYYMMDD)` — 주식 단건 (FHKST03010100)
- `getIndexDailyClosePrice(indexCode, YYYYMMDD)` — 지수 단건 (FHKUP03500100, KOSPI='0001')
- `getDailyRangeClosePrices(ticker, start, end)` — **주식 기간조회 (1콜 최대 100영업일, close+volume)** ← 백필·일일 수집의 주 경로
- `getIndexDailyRangeClosePrices(indexCode, start, end)` — 지수 기간조회
- KOSPI 지수는 `stock_daily_prices.symbol='KOSPI'` 관례 (수집기가 '0001'로 자동 라우팅, 요청 목록 선두 고정 — 예산에 잘리지 않음).

### H.3 stock_daily_prices — 가동 중
- 마이그레이션 031(테이블)+032(REVOKE 락다운) **원격 적용·검증 완료** (anon `blocked`, service r/w ok). RLS 패턴: `service_role_all_{table}` 정책 + `REVOKE ALL FROM anon, authenticated` — **신규 테이블(033~035)은 이 패턴 복제**.
- 일일 적재: `collect-and-score.ts`에서 full+거래일 조건, 기간조회(당일~당일)라 **volume 실적재됨** (Phase 2 피처 8 데이터 기반 확보). 콜 예산 1,000, 레이트리밋 초당 2콜.
- 백필: `npx tsx scripts/tli/ops/run-stock-daily-price-backfill.ts` — 심볼당 기간조회 1콜, 날짜 커버리지 리포트 포함. **아직 1회 실행 안 됨 (T-008 잔여)**.

### H.4 수집 게이트 아키텍처 (T-001 as-built)
- `naver-finance-theme-gates.ts`: Zod strict 스키마(파싱률≥95%) + 값 범위(가격 1~1천만, 등락 ±30 경계포함, 거래량≤50억) + `shouldRejectStockCollection({prevCount, collectedCount})` (직전 DB 대비 70%, prevCount<50이면 스킵).
- 게이트 실패는 **테마 단위 격리** — 실패율 >30% 또는 전체 0건일 때만 집계 throw. 개별 테마 실패는 warn.
- `countActiveThemeStocks()`는 `data-ops.ts` 소속.

### H.5 fail-loud 계약 (T-002/T-003 as-built)
- `batchUpsert(table, rows, onConflict, label)`은 **기본 옵션에서 부분 실패 시 `BatchUpsertPartialFailureError`를 내부 throw** — 호출부에서 반환값으로 재검증하지 마라 (죽은 코드). 의도적 opt-out은 `{failOnPartial: false}` (v4/shadow.ts 참조 패턴).
- 파이프라인 결과 계약: `TLI_RESULT_PATH` env가 있으면 `tli-result.json`에 `{mode, criticalFailures, warningFailures, exitCode}` 기록 → 워크플로우의 critical(24h dedupe)/warning(daily digest) Issue 스텝이 소비. **Issue 정책은 워크플로우 인라인 JS가 유일 구현** (issue-policy.ts 모듈은 삭제됨 — 부활 금지).

### H.6 parity 리포트 (T-009 as-built)
- `prediction-parity-loader.ts`: snapshot_date **최근접(±1일) score 매칭**, 초과 시 `score_missing` 분류. 러너 `run-prediction-parity-report.ts` (`npm run tli:parity`), 워크플로우 full 모드에서 continue-on-error로 `$GITHUB_STEP_SUMMARY` 출력.
- T-010 전환 조건: 14일 측정에서 coverage≥90% AND freshness≤1영업일.

### H.7 월간 재교정·좀비·타임존
- 월간 재교정: `monthly-calibration-schedule.ts`(정책: 월 1회 첫 eligible 거래일) + `monthly-calibration-state.ts`(confidence_calibration 테이블에 실행 기록). 조회 실패 시 'deferred'(다음 실행 재시도).
- 좀비 정리: `scoreless-zombie-themes.ts`(점수 0행 + **≥30일**) — `autoDeactivate()` 안에서 자동 실행(dryRun:false, 실패 시 격리 warn). 수동 일괄: `run-zombie-theme-cleanup.ts` (TLI_ZOMBIE_CLEANUP_APPLY=true).
- 타임존: `lib/tli/date-utils.ts`가 단일 소스 (`getKSTDate`, `getKSTDateString(offsetDays)`). scripts/tli/shared/utils.ts는 위임 래퍼만.

### H.8 테스트·빌드 계약
- **모든 scripts/tli 신규 non-test 파일은 `tli-boundary-manifest.ts` 등록 필수** (runtime/ops/research 분류) — 미등록 시 `tli-boundary-manifest.test.ts` 실패.
- vitest는 `.omo/**`·`e2e/**` 제외 (vitest.config.ts). 머지 기준: tsc 신규 에러 0 + eslint 에러 0 + vitest 전체 + next build (부록 G.7).
- 기존 tsc 에러 3건(app/__tests__/og-image, robots)은 사전 존재 무관 항목 — 건드리지 말 것.

### H.9 ops 스크립트 관례
`process.env.DOTENV_CONFIG_QUIET` → dotenv(.env.local) → `main().catch(e => { console.error; process.exit(1) })` 패턴 + env 숫자 파싱은 양수 검증(불량 시 기본값). JSON 결과를 stdout에 출력.

### H.10 T-010 이연분의 귀속
UI `calculatePrediction()` 라이브 호출 제거와 OpenAPI/MCP `phase` deprecation은 **T-304에 흡수됨** (부록 E) — Phase 3 전까지 해당 코드를 건드리지 마라.

## 부록 F. 과학적 타당성 검토 — "이 재구성으로 유효·유용한 수준에 도달할 수 있는가"

> 2026-07-03, Isaac의 직접 질문에 대한 정직한 판정. 리서치: sonnet 에이전트 3기 병렬 (관심도 예측성 문헌 / 소표본 통계 방법론 / MLOps 성패 사례) — 전 항목 1차 문헌(원문 PDF/공식 문서) 직접 확인 원칙. 종합 판단: Fable(메인).

### F.1 질문의 조작적 정의

"유효하고 유용한 수준"을 4계층으로 분해해 각각 따로 답한다. 뭉뚱그린 "된다/안 된다"는 이 질문에 대한 정직한 답이 아니다.

### F.2 계층별 판정

| 계층 | 정의 | 도달 확률 (판단) | 핵심 근거 |
|---|---|---|---|
| **L1. 측정 가능한 정직한 시스템** | 캘리브레이션된 확률 + 실측 정확도 공개 + 자동 개선 루프 가동 | **~90% (거의 확실)** | 순수 엔지니어링 문제. 방법론이 문헌 표준과 정합 (F.3). 실패 요인은 실행 리스크뿐 |
| **L2. 통계적으로 유의한 예측력** | baseline 대비 CI 기준 개선: AUC 0.60~0.68, 비중복 IC 0.05~0.15 | **~70% (높은 확신)** | 내부 증거가 직접적: GDDA 66.6%(같은 데이터·유사 지평·외부 채점), g lag-1 자기상관 0.858, Rising 60.8%. 문헌은 "관심도의 단기 구조 존재"를 지지하되 5일 자기지속성 직접 연구는 공백 — 우리 백필 검증이 그 공백을 메우는 실험이 됨 |
| **L3. 사용자 체감형 강한 유용성** | 랭킹 상위가 꾸준히 맞는다는 인상, 재방문 가치 | **~45% (불확실)** | 라벨 노이즈 플로어(DataLab 정수 반올림·30일 리스케일), 일별 base rate 3.8~76.2% 요동(시장 전체 파동), 관심도 감쇠의 빠른 시상수. L2 달성해도 "틀리는 날"이 체감을 지배할 수 있음 — UI의 확률·CI 표현 품질이 좌우 |
| **L4. 가격 예측력 (GT-B)** | 관심도 예측이 바스켓 초과수익과 동행 | **~25% (기대 낮음)** | 문헌이 적극적으로 경고: 효과 수십 bp + 빠른 반전 + 방향 혼재(Da+ / Pyo− / Moat−) + 발표 후 알파 감쇠(McLean-Pontiff). 그래서 GT-B는 검증 라벨로만 설계했고 제품 약속에서 제외 |

**한 줄 결론**: L1은 설계대로 하면 나오고, L2는 내부 증거가 문헌 공백을 상쇄해 "높은 확신"이며, L3부터는 정직하게 불확실하다. 단 — **이 PRD의 가장 중요한 속성은 "믿음"이 필요 없다는 것**이다. 라벨 소급 백필 덕분에 L2 여부는 Phase 2(승인 후 ~4주 내)에 walk-forward 실측으로 판가름 나고, No-Go 시 손실은 위생 개선(Phase 0~1, 그 자체로 가치)에 국한된다. 이 질문은 2주 뒤 데이터가 답한다.

### F.3 방법론 적합성 (문헌 대조 8항목)

| 항목 | 판정 | 근거 |
|---|---|---|
| 로지스틱 표본 요건 | 경계→**Phase 2 실측으로 확정** | 고전 EPV=100(충족)이나 EPV 규칙 자체가 근거 박약(van Smeden 2019). Riley(2020) 공식은 anticipated R²에 의존 → T-203에 파일럿 R² 실측 편입 |
| Platt(비 isotonic) | **충족** | Niculescu-Mizil & Caruana 2005: calibration n<1,000에서 Platt 우위 — 우리 n_eff 250~ 구간과 정확히 일치 |
| ECE quantile 5-bin | **충족(보강됨)** | Nixon 2019 처방 그대로. Kumar 2019의 과소추정 편향(B/n≈2%p) 대응으로 CI 이중조건 추가 (v1.2) |
| 비중복 게이트 | **충족** | 소표본에서 HAC 보정보다 비중복 표본이 안전(Neuberger 몬테카를로: HAC 커버리지 80~87%로 붕괴). 정보 손실을 감수한 구성적 독립성 확보 |
| 테마 클러스터 부트스트랩 | **충족(보강됨)** | 클러스터 수 70~150 > Cameron-Miller 기준(50). 불균형 리스크(MacKinnon-Webb 2017)는 wild cluster bootstrap 폴백 추가 (v1.2) |
| 단순 모델 우선 | **충족** | Christodoulou 2019(임상 71편: ML이 LR 무이득, logit AUC Δ=0.00), M4 교훈, Rules of ML #21(1,000예제≈12피처). 우리 체급은 M5형 빅패널이 아니라 M4형 소량 |
| 주기 재학습+증거 게이트 분리 | **충족** | Gama 2014 + DDM의 최소표본 게이트 사상. 최신 문헌(Fujiwara 2026)이 동일 구조(감지·교체 분리)를 독립 재발명 — 소표본에선 트리거 단독보다 안전 |
| 반복 검정 보정 | 미달→**수정됨** | Johari 2017(peeking 시 거짓양성 5~10배), Optimizely 실측(57%) → 고정 4주 체크포인트 + 99% CI + 최소 효과 2% + 연간 승격 상한으로 재설계 (v1.2) |

### F.4 리서치가 촉발한 v1.2 변경 (요약)

1. 승격 게이트: 고정 체크포인트·99% CI·최소 효과·연간 상한 (peeking/다중비교)
2. ECE 게이트 CI 이중조건, 클러스터 불균형 폴백, 유효 표본 5배→실측 7배 갱신, IC/IR breadth 보수화(≤~400)
3. **R9 반사성 리스크 신설** + 이벤트 스터디 탐지(T-307): 자기 발행→검색 행동→라벨 오염 (Zillow·Perdomo 2020 구조)
4. R10 데이터 소스 두절 대응 구체화 (시세 경로 KIS 이중화 명시, 스크래퍼 분포·스키마 게이트, Trends 스켈레톤 옵션)
5. M3 금지→라벨 2만 도달 시 자동 재평가 트리거, 분기 복잡도 재감사, 레짐 서킷브레이커, 롤백 비대칭 근거 명문화
6. GT-B 기대치 하향 명문화 + 안티-추격매수 프레이밍 강화 (R7)

### F.5 참고문헌 (핵심)

**관심도→예측성**: Da·Engelberg·Gao 2011 (J. Finance — SVI 1SD↑→2주 +33.6bp 후 연내 반전) / Barber·Odean 2008 (RFS — 관심 이벤트 개인 순매수 +29.5%) / Preis·Moat·Stanley 2013 (Sci Rep) 및 재현 실패 Challet·Bel Hadj Ayed 2014 / Pyo 2017 (KIEP — 한국 지수 1주 음(−)) / 남길남 2017 (KCMI — 정치테마주 개인 손실 99.6%) / Moat et al. 2013 (위키 조회↑→주가↓) / Lazer et al. 2014 (Science — Google Flu: big data hubris + algorithm dynamics) / McLean·Pontiff 2016 (발표 후 알파 −58%)
**통계 방법론**: Peduzzi 1996·van Smeden 2019·Riley 2020 (표본 요건) / Niculescu-Mizil·Caruana 2005 (캘리브레이션) / Guo 2017·Nixon 2019·Kumar 2019 (ECE) / López de Prado 2018 (겹침 라벨·purged CV·backtest overfitting) / Hansen-Hodrick 1980·Newey-West 1987 / Cameron·Miller 2015·MacKinnon·Webb 2017 (클러스터) / Christodoulou 2019·Grinsztajn 2022·Hand 2006·Makridakis M4/M5 (모델 복잡도) / Grinold·Kahn (Fundamental Law) / Johari et al. 2017 (always-valid inference)
**MLOps·시스템**: Sculley et al. 2015 (Hidden Technical Debt) / Breck et al. 2017 (ML Test Score) / Zinkevich, Rules of ML / Perdomo et al. 2020 (Performative Prediction) / Obermeyer et al. 2019 (proxy label 실패) / NBER w29880 (Zillow) / Gama et al. 2014·Lu et al. 2018·Fujiwara 2026 (concept drift) / Google SRE Book (alert fatigue·toil)

## 부록 G. 구현 스펙 (개발 착수용 — 티켓과 함께 읽는 계약)

### G.1 피처 정확 수식 (T-201)

> 전부 point-in-time: 기준일 t의 예측은 t 종료 시점까지 확정된 데이터만 사용. 영업일 산술은 `korean-trading-calendar`. 기존 함수 재사용 명시.

| # | 피처 | 수식 (의사코드) | 재사용 |
|---|---|---|---|
| 1 | `interest_slope_7d` | `linearRegressionSlope(raw[t-6..t] asc) / max(mean(raw[t-6..t]), 1)` | `normalize.ts` |
| 2 | `interest_level_pct` | `percentileRank(mean(anchor_scaled[t-6..t]), 전 활성 테마 동일값 배열)` | `normalize.ts` |
| 3 | `interest_accel` | `slope(raw[t-2..t])/max(mean,1) - feature_1` | — |
| 4 | `dvi_7d` | `calculateDVI(raw[t-6..t] asc)` | `normalize.ts` |
| 5 | `news_volume_7d` | `log_normalize(Σ article_count[t-6..t], 64.3)` (기존 news_log_scale) | `normalize.ts` |
| 6 | `news_momentum` | `(Σ[t-6..t] − Σ[t-13..t-7]) / max(Σ[t-13..t-7], 1)` | calculator 산식 |
| 7 | `basket_return_5d` | `mean_j(close_j[t]/close_j[t-5영업일] − 1) − (KOSPI[t]/KOSPI[t-5] − 1)`, j=상위 5종목 | stock_daily_prices |
| 8 | `basket_volume_ratio` | `mean_j(vol_j[t-4..t]) / mean_j(vol_j[t-19..t])` | stock_daily_prices |
| 9 | `episode_progress` | `daysSinceSpike / median(완결 에피소드 peak_day 코호트)` (GT-C) | episode 라벨 |
| 10 | `market_regime` | `sign(KOSPI[t]/KOSPI[t-5] − 1)` ∈ {-1, +1} | stock_daily_prices |

- 결측: 피처별 `NaN → train median 대치 + is_missing_k 플래그`(피처 수 10+10). abstain 판정: 결측 피처 >3개 또는 관심도 이력 <7일.
- 표준화: robust z `(x − median_train) / (1.4826 × MAD_train)` — `medianAbsoluteDeviation`/`robustZScore` 재사용. 통계량은 아티팩트에 포함.

### G.2 GT-A 라벨러 판정식 (T-101, 의사코드)

```
labelGtA(theme, t):                       # t = KST 영업일
  past   = raw_value[t-4영업일 .. t]       # 5 영업일
  future = raw_value[t+1영업일 .. t+5영업일]
  if len(past) < 4 or len(future) < 4:            return exclude('insufficient_days')
  denom = mean(past)
  if denom < 4:                                    return exclude('denominator_floor')   # min_raw_interest
  if theme.keyword_epoch_changed_in(t-4 .. t+5):   return exclude('keyword_epoch_break')
  if theme.deactivated_before(t+5):                return censored()
  g = clip(ln(mean(future) / denom), -1.5, +1.5)   # 윈저라이즈
  rescale = (t - theme.window_max_renewal_date) <= 5영업일   # 리스케일 감지
  low_sig = denom < 10
  y = (g >= δ)                                      # δ: labeler_version에 박제
  return final(g, y, rescale_suspect=rescale, low_signal=low_sig)
# 확정 시점: t+5영업일 경과 후 일일 잡이 pending→final. labeler_version='gta-v1'
```

### G.3 모델 아티팩트 규약 (T-203/T-207/T-301)

`model_registry.coefficients` JSONB 스키마 (불가분 번들, P7):

```jsonc
{
  "artifact_version": "tli-model-artifact-v1",
  "model_type": "m1_logistic",
  "feature_schema": ["interest_slope_7d", "...10개 순서 고정..."],
  "scaler": { "median": [/*10*/], "mad": [/*10*/] },
  "coefficients": { "intercept": 0.0, "weights": [/*10 + missing 플래그 10*/] },
  "calibrator": { "type": "platt", "a": 0.0, "b": 0.0 },
  "trained_at": "2026-08-02", "train_range": ["2026-01-07", "2026-07-05"],
  "labeler_version": "gta-v1", "seed": 42
}
```

- 서빙 추론(TS, `lib/tli/model/`): `p = platt(sigmoid(w·z + b))` — 순수 함수, 부작용 0, 단위테스트 필수 (Python 학습기와 골든 벡터 대조 테스트: 동일 입력 → 확률 오차 < 1e-6).
- CI: 캘리브레이션 bin의 Wilson 95% (bin당 실측 적중률 기반, `level4-serving.ts`의 Wilson 구현 이식).

### G.4 파이프라인 접합점 (`pipeline-steps.ts` 기준)

| 삽입 위치 | 신규 단계 | 티켓 |
|---|---|---|
| Step 3 수집 직후 | Step 3.2: `stock_daily_prices` 일봉 적재 (T-008) | Phase 0 |
| Step 4 점수 계산 후 | Step 4.1: GT 라벨 생성(t 기준 pending) + t-5 확정 잡 (T-101/107) | Phase 1 |
| Step 6 예측 스냅샷 | **교체**: `theme_predictions_v3` 기록 (champion+challenger) (T-207) | Phase 2 |
| Step 7 예측 평가 | **교체**: v3 채점(GT-A 실현값 기입) + `model_metrics_daily` (T-303) | Phase 3 |
| Step 8 이후 | Step 8.5: 서킷브레이커 검사 (§5.7) | Phase 3 |

구 Step 6/7(v2 스냅샷·평가)은 Phase 3 노출 전환 후 제거. 각 단계 실패는 critical/warning 분류 후 §9 알림 정책.

### G.5 API 계약 (T-304/T-010)

`GET /api/tli/predictions` 응답 항목(테마당), v3 필드 + 6주 deprecation 병행:

```jsonc
{
  "themeId": "uuid", "predictionDate": "2026-08-03",
  "pRise": 0.68, "ciLower": 0.59, "ciUpper": 0.77,
  "abstain": false, "abstainReasons": [],
  "modelVersion": "m1-2026w31",
  "trailing90d": { "topSignalPrecision": 0.63, "n": 214 },
  "phase": "rising",            // DEPRECATED: p_rise 파생 호환값, 6주 후 제거
  "deprecation": { "phase": "removed_after=2026-09-15, use pRise" }
}
```

파생 규칙: `pRise≥0.6→rising, 0.4~0.6→hot, <0.4→cooling, abstain→null`. OpenAPI(`app/api/openapi.json/route.ts`)와 MCP `get-predictions` 동기 갱신 필수.

### G.6 `tli-weekly-learn.yml` 스펙 (T-301)

- 스케줄: `0 21 * * 6` (KST 일요일 06:00). 시크릿: 기존 `SUPABASE_SERVICE_ROLE_KEY`·`NEXT_PUBLIC_SUPABASE_URL` 재사용 (신규 시크릿 없음). Python 3.11 + scikit-learn 셋업 스텝 포함.
- 잡 구조: `checkpoint-check`(4주 여부 판정) → `evaluate-challenger`(게이트, §8 의사코드) → `promote-or-keep`(model_registry 트랜잭션) → `train-new-challenger` → `report`(GH Actions summary + Issue). 각 스텝 실패 = 챔피언 유지 + Issue (fail-safe).
- 드라이런 모드: `workflow_dispatch` 입력 `dry_run=true` — DB 쓰기 없이 판정 로그만 (T-301 AC의 모의 승격/롤백에 사용).

### G.7 개발 규약 (전 티켓 공통)

1. **1 티켓 = 1 PR** (T-4xx 삭제 티켓만 예외적으로 대형 허용). 브랜치 `tli-v3/t-XXX-slug`.
2. 머지 조건: 빌드 3종(`tsc --noEmit`+`eslint`+`next build`) 에러 0 + 신규 로직 단위테스트 (순수 함수는 필수, 특히 라벨러·추론기·게이트) + 기존 vitest 전체 통과.
3. 컨벤션: `~/.claude/rules/conventions.md` 준수 (kebab-case, export const 훅/유틸, 주석은 WHY만). DB는 additive 마이그레이션만 (Phase 4 전까지 DROP 금지).
4. 스키마 변경은 `supabase/migrations/NNN_*.sql` 연번 + RLS service_role 전용 (030 기조).
5. 매 Phase 종료: Isaac 게이트 리포트 (증빙: 빌드 3종 + AC 체크리스트 + diff 요약).

### G.8 킥오프 상태 (v2.0 — Phase 1 기준)

- [x] Phase 0 완료 (2026-07-06, `bed3040` — as-built 부록 H) / [x] 스키마 DDL+마이그레이션 번호 (부록 D) / [x] Phase 1~4 티켓 실행 명세 (부록 E) / [x] Q1~Q6 결정 (§11) / [x] Isaac 승인 (Phase 0 CTO 리뷰·커밋으로 갈음, 2026-07-06)
- **Phase 1 착수 순서**: T-101(스키마+라벨러 코어, 최우선) → T-102·T-105 병렬 (백필 ‖ 앵커 전환) → T-103(δ 검증 게이트) → T-104·T-107 → T-106(14일 후). 선행 잔여: T-008 KIS 백필 1회 실행.
- 구현 에이전트 진입점: **부록 H 정독 → 부록 E에서 티켓 선택 → 참조된 G/D 섹션 확인 → 1티켓 1PR**.
