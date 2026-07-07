# TLI v3 작업 현황 및 승격 로드맵 (2026-07-07)

Status: 스냅샷 문서 — 작성 시점 이후 상태 변화 가능. 최신 상태는 `docs/prd/PRD-tli-v3-rebuild.md` §부록 H(as-built) + `docs/tli-v3-early-promotion-preregistration.md` §7(실행 기록)에서 확인.

## 1. 오늘 무슨 일이 있었나 (요약)

1. Phase 1~3 구현 CTO 리뷰 → 결함 25건 발견·수정 → offline 평가 재실행 → **Go 판정 (rev 2)** → Isaac 승인 → M1을 challenger로 model_registry 등록.
2. Isaac이 4주 shadow 대기를 가속하라고 지시 → CTO 판단으로 **조기 승격 progressive delivery 사전 등록** → 검증 단계에서 **/themes 페이지 전면 장애 발견·긴급 수정** → **PIT 리플레이 감사** 실행 중 서빙 경로의 치명적 버그 2건 추가 발견·수정 → 최종 감사 판정 **3/4 통과, ECE 기준 미달로 조기 승격 보류** → 표준 4주 gate 경로로 복귀.
3. Isaac 지시로 코드 수정 담당을 GPT-5.5(xhigh, codex exec)로 전환, 메인 에이전트(Fable)는 판단·스펙·검증·리뷰 전담 체제로 전환.

## 2. 완료된 작업 (커밋 순)

| 커밋 | 내용 |
|---|---|
| `4d07af2` | TLI v3 Phase 1~3 구현 + CTO 리뷰 결함 25건 수정 (테스트 2,450개 통과, tsc/eslint 0) |
| `d431330` | T-206 offline eval Go 판정 rev 2 + 증빙 (Isaac 승인 완료) |
| `1fa1222` | challenger 등록 RPC ambiguous column 버그 수정 (migration 040) — 첫 실전 호출에서 발견 |
| `4d5bcdb` | M1 조기 승격 사전 등록 문서 — 리플레이 감사 기준·트립와이어·D+14 체크포인트 박제 (결과를 보기 전 커밋) |
| `5d8e68e` | **P0 핫픽스**: `/themes` 전면 장애 — `theme_news_articles`(32만 행) 복합 인덱스 부재로 statement timeout → `getRankingServer`가 EMPTY_RANKING 반환 (migration 041) |
| `906d776` | PIT 리플레이 감사 하네스 구현 (조기 승격 검증용) |
| `2cc78b1` | 뉴스 카운트 근본 수정 — DB 집계 RPC 전환 + 부분 실패 격리 (migration 042). 041은 응급처치, 042가 구조적 해결 |
| `138acd3` | **핵심 발견**: 서빙 피처 로더의 Supabase 1,000행 캡 버그 — 라이브 M1이 100% abstain(p_rise 전량 null)이던 근본 원인. 리플레이 감사가 이 버그를 승격 전에 잡아냄 |
| `f7ab506` | 리플레이 감사 최종 판정 기록 — 3/4 통과, ECE 미달로 조기 승격 보류 |

## 3. 현재 시스템 상태 (실측)

- **model_registry**: `b-abl-v1` = champion (승격일 2026-07-06), `m1-2026w28` = challenger.
- **/themes 페이지**: 정상 (활성 테마 121개, 뉴스 카운트 정상 집계).
- **라이브 shadow (theme_predictions_v3)**: 오늘 16:30 KST 정기 배치부터 수정된 로더로 실제 확률 기록 시작 (그 이전 행은 로더 버그로 p_rise가 null이었음 — 다음 배치의 upsert가 자동 덮어씀).
- **T-106 앵커 시계**: 오늘 최초 관측 시작 (`TLI_ANCHOR_ENABLED` 기본 활성, 수동 collect-data 트리거로 이미 1회 관측 완료). 14일 후 자동 CV 비교 판정.
- **리플레이 감사 판정** (train ≤5/29, replay 6/8~6/26, 사전 등록 기준):

  | 기준 | 실측 | 판정 |
  |---|---|---|
  | C1: M1 Brier < B-abl | 0.1816 < 0.2128 | PASS |
  | C2: M1 Brier ≤ 0.21 | 0.1816 | PASS |
  | C3: M1 ECE ≤ 0.08 | 0.0887 | **FAIL** (0.0087 초과) |
  | C4: M1 IC > 0 | 0.1084 | PASS |

  커버리지 88.3% (1,316/1,490). **판정: 조기 승격 보류, 표준 gate 경로로 복귀.**

## 4. 근본 원인 발견 목록 (오늘 세션에서 새로 잡은 것)

이 항목들은 PRD의 46건 발견 대장과 별개로, 오늘 실전 검증(Go 판정 이후 배포 시도) 과정에서만 드러난 것들이다 — offline 테스트 스위트로는 잡히지 않는 유형이라 특히 기록해 둔다.

1. **challenger 등록 RPC 컬럼 모호성** — `RETURNS TABLE` 출력 컬럼명이 plpgsql 변수와 충돌해 `ON CONFLICT` 절에서 런타임 에러. 유닛테스트는 이 RPC를 목(mock)했기 때문에 실제 DB 실행 전까지 발견 불가능했음.
2. **`/themes` 전면 장애** — `theme_news_articles` 테이블이 32만 행으로 자라면서 인덱스 없는 복합 조건 쿼리가 timeout. **더 심각한 설계 결함**: `getRankingServer`의 catch-all이 이 실패를 삼켜 페이지 전체를 빈 상태로 렌더 — 부분 실패가 전면 장애로 증폭되는 패턴. 042에서 실패 격리로 구조적 해결.
3. **서빙 피처 로더 1,000행 캡** — 오늘 세션에서 가장 중요한 발견. `loadFeatureInputsForBaseDate`가 교차 테마 20일 윈도우 쿼리에 페이지네이션이 없어 Supabase 기본 1,000행 캡에 걸림. offline 로더(`offline-eval-data.ts`)는 페이지네이션이 있어 정상 — 이 비대칭 때문에 **offline 평가는 훌륭한데 프로덕션 서빙은 100% abstain**이라는, 겉보기엔 모순된 상황이 발생했음. 리플레이 감사가 이 버그를 승격 결정 전에 발견하지 못했다면, 승격 즉시 확률 배지가 전부 "대기"로 노출되는 무의미한 릴리스가 됐을 것.
4. **리플레이 하네스 자체의 버그 2건** (1차 실행 시 0행 스코어링) — 스냅샷 우주 조회에 불필요한 horizon 필터가 걸려 매칭 0건. 수정 후 학습 데이터셋 캐시 재사용 + 8-워커 병렬화로 실행 시간도 단축.

**공통 패턴**: 전부 "에러 없이 조용히 데이터가 잘리거나 비는" 유형. 2월의 INTEGER 컬럼 소수점 upsert 실패, 오늘의 1,000행 캡, RPC 컬럼 모호성 — 전부 같은 계열. **유닛테스트/offline 평가만으로는 잡히지 않고, 실 DB에 대한 실행 검증(리플레이 감사, 실전 RPC 호출)에서만 드러남.**

## 5. 승격까지의 로드맵

### 경로 A — 표준 4주 shadow gate (기본 경로, 현재 활성)

```
오늘(7/7) challenger 등록·시계 시작
  → 매일 크론이 shadow 예측 축적 (b-abl-v1 champion 그대로 서빙, m1은 shadow 기록만)
  → ~8/4 (4주 후) 누적 비중복 라벨 n_eff≥250 확인
  → promotion-gate.ts 평가 (Brier point+99%CI, ECE≤0.08/upper95≤0.12, P@10 가드레일)
  → 통과 시 champion 승격 / 미달 시 최대 8주 연장 또는 hold
```

의존 파일: `scripts/tli/learn/promotion-gate.ts`, `scripts/tli/learn/run-weekly-learn.ts` (주간 크론, 매주 토 21:00 UTC), `scripts/tli/learn/gate-input-from-db.ts`.

### 경로 B — 조기 승격 재상정 (조건부, 매주 재평가 가능)

`docs/tli-v3-early-promotion-preregistration.md`에 사전 등록된 progressive delivery 절차. 오늘은 C3(ECE) 미달로 실행되지 않았으나, 절차 자체는 유효하며 매주 재상정 가능:

```
매주 월요일 weekly-learn이 새 challenger 학습
  (앵커 피처 축적 + 확대된 학습 윈도로 ECE 개선 기대)
  → 새 아티팩트에 리플레이 감사 재실행 (npm run tli:replay-audit)
  → 4개 기준(C1~C4) 전부 PASS 시:
    → Isaac에게 재상정 (반복 look에 따른 α 소진 명시한 새 사전 등록 필요 — 매주 재시도가
      곧 다중비교이므로, 몇 번째 시도인지와 누적 오탐률을 문서화할 것)
    → 승인 시 당일 champion 승격 + beta 노출 + 트립와이어 4종 상시 감시
    → D+14 확인 체크포인트에서 재검증, 미달 시 자동 롤백
```

**ECE 개선 근거 (다음 주 재상정이 유의미할 이유)**:
1. anchor 기반 피처(`interest_level_pct` 등)가 리플레이 구간(6월)엔 존재하지 않았음 — 앵커 수집이 오늘(7/7) 처음 시작됐기 때문. 다음 주 리플레이 윈도우는 앵커 데이터가 있는 최근 구간을 쓸 수 있어 이 결손이 사라짐.
2. 학습 윈도가 1/7~5/29로 짧게 잘려 있었음 — 매주 학습 윈도가 늘어나며 Platt 보정이 더 많은 데이터로 재적합됨.
3. 서빙 우주(스냅샷 213테마)와 라벨 우주의 분포 차이 — 이건 시간이 지나 라벨이 더 쌓이면 자연히 좁혀짐.

**하지 않을 것**: 사후에 ECE 임계값(0.08)을 완화하는 것. 이번 문서의 존재 이유가 "결과를 보고 기준을 바꾸지 않는다"이며, 다음 주 재상정도 동일 기준으로 판정한다.

## 6. 이번 주~다음 승격 판단까지 남은 작업

### 자동으로 진행되는 것 (조치 불필요)
- 매일 크론이 shadow 예측 + 라벨링 축적
- 앵커 관측 14일 시계 (T-106) — 7/21경 자동 CV 비교
- reflexivity report, anchor stability report 등 운영 리포트

### 다음 주(월요일, weekly-learn 실행 후) 사람이 판단할 것
1. 새 challenger 학습 결과 확인 (model_registry에 새 model_version 등록됨)
2. `npm run tli:replay-audit` 재실행 (또는 CTO가 직접 재실행) → 4개 기준 재평가
3. 전부 PASS면 Isaac에게 조기 승격 재상정 여부 문의 (α 소진 명시)
4. FAIL이면 경로 A(표준 gate) 계속 대기, 다음 주 재시도

### T-106 관련 (7/21경)
- 앵커 후보(계산기/번역/지도) 14일 CV 비교 → 자동 확정, 필요 시 Issue 발행

### T-303 / T-306 (달력 대기)
- T-303: 운영 지표 7일 연속 acceptance criteria — 매일 자동 축적
- T-306: 4주 shadow 누적 — 경로 A의 본체, ~8/4 gate 평가

### T-401~404 (blocked)
- T-306(또는 조기 승격) 완료 전까지 착수 불가 — PRD 부록 E 티켓 순서상 올바른 차단

## 7. 참고 문서 맵

| 문서 | 역할 |
|---|---|
| `docs/prd/PRD-tli-v3-rebuild.md` | Canonical 설계 문서 (v2.0, 부록 A~H) — 티켓 26개, as-built 상태 |
| `docs/tli-v3-go-no-go-2026-07-06.md` | T-206 offline eval Go/No-Go 판정 (rev 2 Go, Isaac 승인) |
| `docs/tli-v3-early-promotion-preregistration.md` | 조기 승격 사전 등록 — 기준·트립와이어·D+14 체크포인트·실행 기록(§7) |
| `docs/evidence/tli-v3-t205-offline-eval.{json,md}` | offline 평가 원본 증빙 |
| `docs/evidence/tli-v3-replay-audit-2026-07-07.{json,md}` | 리플레이 감사 원본 증빙 |
| 이 문서 (`tli-v3-status-2026-07-07.md`) | 오늘 세션 스냅샷 — 다음 세션이 여기서부터 이어받기 위한 현황판 |

## 8. 다음 세션 시작 시 체크리스트

1. `git log --oneline -5`로 이 문서 이후 커밋 확인 (weekly-learn이 자동으로 새 커밋을 만들지는 않으므로, 크론 실행 결과는 DB/`.omo evidence`에서 확인).
2. model_registry 상태 확인 (champion/challenger 현재 model_version).
3. `docs/tli-v3-early-promotion-preregistration.md` §7 실행 기록에 새 항목이 추가됐는지 확인 (다음 주 재상정 시도 여부).
4. 라이브 shadow의 p_rise non-null 비율 확인 (1,000행 캡 수정이 실제로 유지되고 있는지 회귀 감시).
