# TLI 품질 게이트 v1 사후 분석 (Postmortem)

**생성일**: 2026-02-27
**분석 대상**: 품질 게이트 v1 제안서 (team-quality-gate 팀 산출물)
**분석 방법**: 엔터프라이즈급 검증 — 실 DB 시뮬레이션 대조

---

## [OBJECTIVE] v1 제안서의 실패 원인 분석 및 v2 설계 시 교훈 도출

---

## 1. v1 제안 요약

### 4-Layer 품질 게이트 구조
- **Layer 1**: confidence !== 'low' (신뢰도 필터)
- **Layer 2**: Active Signal (관심도 or 뉴스 최소 기준)
- **Layer 3**: Stage-differential 임계값 (단계별 최소 점수)
- **Layer 4**: Composite Signal Floor (복합 시그널 하한)

### 예측 결과
- Layer 1: 8개 필터 → 212개
- Layer 2: 30-40개 필터 → 172-182개
- Layer 3: 25-30개 필터 (Emerging falling + Peak news<5) → 147-157개
- Layer 4: 10-15개 필터 → **65-75개** (최종 목표)

---

## 2. 실 DB 대조 결과

### [DATA] 실제 시뮬레이션 (SQL 직접 쿼리)

| Layer | 예측 필터 수 | 실제 필터 수 | 오차 |
|-------|-------------|-------------|------|
| Layer 1 (low confidence) | 8 | 8 | 0 (정확) |
| Layer 2 (active signal) | 30-40 | **0** | **-30~40** |
| Layer 3a (Emerging falling) | 25-30 | **3** | **-22~27** |
| Layer 3b (Peak news<5) | 40-50 | **0** | **-40~50** |
| Layer 4 (composite floor) | 10-15 | **0** | **-10~15** |
| **최종 통과** | **65-75** | **151** | **+76~86** |

### [FINDING] 예측 정확도: 46-52% (사실상 실패)

---

## 3. 실패 원인 분석

### P0-1: Layer 2 완전 실패 — 데이터 분포 미확인

**제안**: `interest_score < 0.1 AND news_this_week < 5` → 필터
**현실**:
- interest_score 최솟값 ≈ 0.15 (p10=0.283) → 0.1 미만 없음
- news_this_week 최솟값 ≈ 12 (p10에서도 높음) → 5 미만 없음

**원인**: 실 데이터 분포를 확인하지 않고 임계값을 "합리적으로 보이는" 수치로 설정.
**교훈**: **모든 임계값은 실 데이터 백분위에서 도출해야 함**

### P0-2: Layer 3b 완전 실패 — Peak 뉴스 분포 오판

**제안**: Peak 단계에서 `news_this_week < 5` → 필터 (40-50개 예상)
**현실**: Peak 100개 중 news_this_week < 5인 테마 = **0개**
- news_momentum p10=0.736으로 전체적으로 높음
- Peak 분류 자체가 `newsVolume > 30` 조건 포함 → 구조적으로 낮은 뉴스 불가

**원인**: stage.ts의 Peak 분류 조건을 확인하지 않음. Peak = `score>=63 OR (score>=50 AND (stable/rising) AND newsVolume>30)` → 뉴스가 적은 테마는 애초에 Peak이 될 수 없음.
**교훈**: **필터 조건과 분류 조건 간 상호작용 검증 필수**

### P0-3: Layer 4 완전 실패 — Composite Floor의 허상

**제안**: `interest_score * news_momentum < 0.3` → 필터
**현실**: interest p50=0.549, news p50=0.871 → 곱의 p50 ≈ 0.478, 최솟값도 0.3 초과
- 두 컴포넌트 모두 하한이 높아 곱이 0.3 미만인 경우가 존재하지 않음

**원인**: 컴포넌트 간 곱의 분포를 시뮬레이션하지 않음.
**교훈**: **복합 조건은 개별이 아닌 조합 분포를 검증해야 함**

### P0-4: ThemeListItem에 components 필드 없음

**제안**: `theme.components.interest_score` 등으로 필터
**현실**: ThemeListItem 타입 정의에 components 필드 자체가 없음
- ScoreComponents는 DB에만 존재
- ThemeScoreMeta.latest.components는 `unknown` 타입

**원인**: 타입 정의를 확인하지 않고 필드 존재를 가정.
**교훈**: **구현 전 타입 정의 검증 필수**

### P0-5: 3개 코드 위치 미식별

**제안**: route.ts만 수정
**현실**: 동일한 품질 게이트가 3곳에 복제되어 있음
1. `app/api/tli/scores/ranking/route.ts:111-113`
2. `app/themes/_services/get-ranking-server.ts:93-95`
3. `app/blog/_services/tli-context.ts:85-91`

**원인**: 코드베이스 전체 탐색 부재.
**교훈**: **필터 로직 변경 시 grep으로 모든 사용처 확인**

---

## 4. Boomer 검증 평가

### 유효했던 반론
- **BC5 (Markov FSM 충돌)**: 게이트의 stage 재분류가 Markov 전이 제약과 충돌 가능성 → 수용됨
- **BC1 (False negative 리스크)**: 급성장 초기 테마가 잘못 필터될 가능성 → 수용됨

### 구조적 한계
- Boomer도 실 DB 데이터 없이 논리적 추론만 수행 → 수치 검증 불가
- v2에서는 Boomer에게도 실 데이터 제공 필요

---

## 5. v2 설계 교훈 (Lessons Learned)

| # | 교훈 | 적용 방법 |
|---|------|----------|
| 1 | 모든 임계값은 실 데이터에서 도출 | SQL 시뮬레이션 선행 |
| 2 | 필터 조건과 분류 조건 상호작용 검증 | stage.ts 조건과 교차 분석 |
| 3 | 복합 조건은 조합 분포 검증 | 다변량 시뮬레이션 |
| 4 | 타입 정의 확인 후 설계 | types/api.ts, types/db.ts 검증 |
| 5 | 코드 전체 사용처 확인 | grep으로 필터 로직 패턴 탐색 |
| 6 | Boomer에게도 실 데이터 제공 | 시뮬레이션 결과 첨부 |

---

## [CONCLUSION]

v1은 "합리적으로 보이는" 임계값을 설정했으나, 실 데이터와 대조 시 Layer 2/3b/4가 완전 무효화되어 예측 65-75개 vs 실제 151개라는 치명적 괴리 발생. 근본 원인은 **데이터 기반이 아닌 직관 기반 설계**. v2는 반드시 실 DB 시뮬레이션을 선행하고, 모든 임계값을 데이터 백분위에서 도출해야 한다.