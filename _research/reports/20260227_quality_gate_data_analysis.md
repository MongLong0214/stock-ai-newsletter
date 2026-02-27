# TLI 품질 게이트 데이터 분석 리포트

**생성일**: 2026-02-27
**분석 대상**: `app/api/tli/scores/ranking/`, `lib/tli/stage.ts`, `lib/tli/calculator.ts`, `lib/tli/normalize.ts`
**분석 방법**: 실 DB SQL 쿼리 + 시뮬레이션 검증

---

## [OBJECTIVE] 현행 품질 게이트 문제 진단 및 최적 필터링 전략 도출

현재 220개 테마가 모두 품질 게이트를 통과하여 (초기 49, 성장 44, 정점 100, 하락 24, 재점화 8) 신뢰도 저하 문제 발생. 과학적/통계적 근거 기반의 최적 품질 게이트를 설계한다.

---

## 1. 현행 품질 게이트 진단

### [DATA] 현재 필터 조건 (3개 코드 위치 동일)

| 위치 | 조건 | 결과 |
|------|------|------|
| `route.ts:111-113` | `stage === 'Dormant' \|\| score <= 0` | 0개 필터됨 |
| `get-ranking-server.ts:93-95` | 동일 | 0개 필터됨 |
| `tli-context.ts:85-91` | 동일 | 0개 필터됨 |

### [FINDING] 게이트가 사실상 비활성 — Dormant 테마 0개, score<=0 테마 0개

220개 전량 통과. 현행 게이트는 이론적으로만 존재하며 실 데이터에서는 어떤 테마도 필터하지 못함.

---

## 2. 점수 분포 분석

### [DATA] 실 DB 점수 분포 (2026-02-27 기준)

| 점수 범위 | 테마 수 | 비율 |
|-----------|---------|------|
| 30-39 | 1 | 0.5% |
| 40-49 | 27 | 12.3% |
| 50-59 | 96 | 43.6% |
| 60-69 | 82 | 37.3% |
| 70-79 | 14 | 6.4% |
| **합계** | **220** | **100%** |

- **p25**: 53, **p50 (중앙값)**: 58, **p75**: 64
- **81%가 50-69 범위에 집중** — 심각한 점수 압축

### [DATA] 신뢰도 분포

| 신뢰도 | 수 |
|--------|-----|
| high | 208 |
| medium | 4 |
| low | 8 |

### [FINDING] 점수 압축의 수학적 원인 (3가지)

1. **percentileRank 균등화** (기여도 ~24%): 값을 순위 기반으로 변환하면 분포가 uniform [0,1]로 압축됨
2. **sigmoid center=0 어트랙터** (기여도 ~30%): `sigmoid_normalize(x, 0, scale)` → x=0 근방에서 항상 0.5로 수렴
3. **가중 평균 분산 축소** (Irwin-Hall 분포): 4개 컴포넌트(interest:0.40, news:0.35, volatility:0.10, activity:0.15)의 가중합 → 분산이 개별 컴포넌트 대비 약 30% 축소

---

## 3. 컴포넌트 분포 분석

### [DATA] 4개 컴포넌트 백분위 분포

| 컴포넌트 | p10 | p25 | p50 | p75 | p90 |
|----------|-----|-----|-----|-----|-----|
| interest_score | 0.283 | 0.418 | 0.549 | 0.663 | 0.777 |
| news_momentum | 0.736 | 0.812 | 0.871 | 0.921 | 0.956 |
| volatility_score | 0.056 | 0.123 | 0.237 | 0.382 | 0.542 |
| activity_score | 0.268 | 0.431 | 0.599 | 0.741 | 0.845 |

### [FINDING] news_momentum은 필터링에 사용 불가

- p10=0.736으로 하위 10%조차 0.7 이상
- 전체 테마가 높은 뉴스 모멘텀을 보임 → 뉴스 기반 필터는 변별력 없음
- **interest_score**가 가장 넓은 분산(0.283~0.777) → 필터링에 가장 유용

---

## 4. 단계별 분포 분석

### [DATA] 현재 단계 분포

| 단계 | 수 | 비율 |
|------|-----|------|
| Emerging | 49 | 22.3% |
| Growth | 44 | 20.0% |
| Peak | 100 | 45.5% |
| Decline | 24 | 10.9% |
| Reigniting | 8 | 3.6% (Decline→Emerging 전이) |

### [FINDING] Peak 과잉 + Emerging 역전 현상

- **Peak가 45.5%** — 거의 절반이 "정점" → 의미 희석
- **Emerging avg score(62.5) > Growth avg score(49.7)** — 단계 역전 패러독스
- 원인: stage.ts의 Emerging이 catch-all 버킷 → falling-trend 고점수 테마가 Growth/Decline 조건 불충족 시 Emerging으로 분류

---

## 5. 필터링 전략 시뮬레이션

### [DATA] 점수 임계값 시뮬레이션

| 임계값 | 통과 수 | 필터율 |
|--------|---------|--------|
| score >= 45 | 210 | 4.5% |
| score >= 50 | 192 | 12.7% |
| score >= 55 | 150 | 31.8% |
| score >= 60 | 96 | 56.4% |
| score >= 62 | 75 | 65.9% |
| score >= 65 | 47 | 78.6% |

### [DATA] 접근법별 시뮬레이션 결과 (실 DB 검증)

#### A. 순수 점수 임계값
- `score >= 62` → **75개** (단순하지만 단계 구성 비율 제어 불가)

#### B. 단계별 상한(Cap) Only
- `{Em:12, Gr:15, Pk:30, Dc:10, Ri:8}` → **75개**
- 각 단계에서 상위 점수 순으로 선택

#### C. 하이브리드 (minScore + confidence + caps) ← **최적**
- `minScore=50, confidence!=low, caps={Em:12, Gr:15, Pk:25, Dc:10, Ri:8}`
- **→ 70개** (최적 범위)
- 단계별 분포가 의미론적으로 균형 있음

#### D. 동적 백분위
- `상위 30%` = score >= 62 = **75개**
- 데이터 변동 시 자동 조절되지만 예측 불가

### [FINDING] Hybrid C가 최적

| 기준 | A. 점수 | B. Cap | C. Hybrid | D. 동적 |
|------|---------|--------|-----------|---------|
| 테마 수 | 75 | 75 | **70** | 75 |
| 단계 균형 | X (Peak 과잉) | O | **O** | X |
| 구현 복잡도 | 낮음 | 중간 | 중간 | 높음 |
| 예측 가능성 | O | O | **O** | X |
| 최소 품질 보장 | O | X | **O** | O |
| 설정 유연성 | 낮음 | 높음 | **높음** | 낮음 |

---

## 6. 구현 아키텍처 제약

### [DATA] ThemeListItem 사용 가능 필드

필터링에 사용할 수 있는 필드:
- `score: number` — TLI 점수 (0-100)
- `stage: Stage` — 라이프사이클 단계
- `confidenceLevel?: ConfidenceLevel` — 신뢰도 (high/medium/low)
- `newsCount7d: number` — 7일 뉴스 건수
- `change7d: number` — 7일 점수 변화
- `stockCount: number` — 관련 종목 수
- `avgStockChange: number | null` — 평균 주가 변동률

### [CRITICAL] ThemeListItem에 `components` 필드 없음

v1 제안이 실패한 핵심 원인. ScoreComponents는 DB에만 존재하며, ranking API 구성 시 ThemeScoreMeta.latest.components (타입: unknown)를 통해 접근 가능하나, 최종 ThemeListItem에는 포함되지 않음.

→ 필터를 ThemeListItem 구성 **전**에 적용하거나, ranking-helpers.ts에서 ScoreComponents를 직접 참조하는 아키텍처 필요.

### [DATA] 3개 동기화 필요 위치

1. **`app/api/tli/scores/ranking/route.ts:111-113`** — API 엔드포인트
2. **`app/themes/_services/get-ranking-server.ts:93-95`** — SSR 서버사이드
3. **`app/blog/_services/tli-context.ts:85-91`** — 블로그 컨텍스트

→ 필터 로직을 공통 함수로 추출하여 단일 소스로 관리 필요

---

## 7. 추가 고려사항

### newsThisWeek vs newsCount7d

| 필드 | 소스 | 의미 |
|------|------|------|
| `news_this_week` | ScoreComponents.raw | 점수 계산 시 사용된 뉴스 수 (theme_news_metrics 기반) |
| `newsCount7d` | ThemeListItem | API 응답에 포함되는 뉴스 수 (theme_news_articles 기반, 별도 카운트) |

→ 동일한 값이 아닐 수 있음. 필터링 시 어느 필드를 기준으로 할지 명확히 해야 함.

### SEO 영향

- 현재 220개 테마 → 220개 인덱싱 가능 페이지
- 70개로 축소 시 150개 페이지 손실
- 대안: 필터된 테마를 "아카이브" 상태로 별도 노출 (noindex 또는 저우선 표시)

---

## [CONCLUSION]

1. 현행 게이트는 사실상 비활성 (0개 필터)
2. 점수 압축(81%가 50-69)으로 단순 임계값만으로는 불충분
3. **Hybrid 접근(minScore + confidence + stage caps)이 최적** — 70개, 단계 균형, 설정 유연
4. 구현 시 3개 코드 위치 동기화 + ThemeListItem 이전 단계 필터 적용 필수
5. 롤백 전략(feature flag/config) 및 모니터링 필수