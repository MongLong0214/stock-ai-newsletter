# TLI 테마 서비스 품질 개선 계획서

> **목표**: 6.5/10 → 8.5+/10
> **작성일**: 2026-02-11
> **분석 근거**: 아키텍처, 데이터사이언스, 프로덕트, 파이프라인 안정성 4개 전문 에이전트 분석 결과 종합

---

## 목차

1. [현재 상태 진단](#1-현재-상태-진단)
2. [Phase 0: 긴급 방어](#2-phase-0-긴급-방어-1-2일)
3. [Phase 1: 점수 신뢰도 혁신](#3-phase-1-점수-신뢰도-혁신-1주)
4. [Phase 2: 피드백 루프 구축](#4-phase-2-피드백-루프-구축-2주)
5. [Phase 3: 프로덕트 경험 개선](#5-phase-3-프로덕트-경험-개선-3-4주)
6. [Phase 4: 실시간성 + 데이터 확장](#6-phase-4-실시간성--데이터-확장-1-2개월)
7. [점수 프로젝션](#7-점수-프로젝션)
8. [제약사항](#8-제약사항)

---

## 1. 현재 상태 진단

### 1.1 강점 (이미 잘 되어 있는 것)

| 영역 | 상세 | 수준 |
|------|------|------|
| 데이터 파이프라인 구조 | upsert + UNIQUE 제약, 배치 실패 집계, 전량 실패 시 throw | 프로덕션급 |
| 점수 계산 방어 로직 | 노이즈 감지(CV>0.8), 백분위 감쇠, NaN 가드, clamp 0-100 | 촘촘함 |
| 비교 알고리즘 | Mutual Rank + 적응적 가중치 + 섹터 패널티 + 자체 검증 구조 | 실용적 설계 |
| 프론트엔드 아키텍처 | Server/Client 분리, React Query + Jotai, 스켈레톤/에러 바운더리 | 깔끔 |
| 검증 인프라 | evaluate-predictions, evaluate-comparisons, comparison_calibration | 존재하나 미연결 |

### 1.2 약점 (개선 필요)

| 영역 | 문제 | 코드 위치 | 영향 |
|------|------|----------|------|
| **감성 분석 부재** | 58개 키워드 사전만 존재, 정확도 ~55%. 점수의 20% 가중치가 사실상 상수(0.5) | `lib/tli/sentiment.ts:31-83`, `lib/tli/constants/score-config.ts:4-8` | 점수 왜곡 |
| **비교 임계값 과도하게 낮음** | 0.25에서 매치의 70%가 노이즈 | `scripts/tli/calculate-comparisons.ts:10` | 비교 신뢰도 하락 |
| **오픈 루프** | 검증 결과를 수집하지만 파라미터 자동 조정에 미반영 | `evaluate-comparisons.ts:138` → `calculate-comparisons.ts:11` 단절 | 시간 경과해도 품질 정체 |
| **DataLab 0값 방어 없음** | API 장애 시 0값으로 기존 정상 데이터 덮어쓰기 가능 | `scripts/tli/collectors/naver-datalab.ts:140-161` | 2/6 사고 재발 가능 |
| **수집 실패 전파** | DataLab 실패해도 점수 계산 진행 → 과거 데이터 기반 잘못된 점수 | `scripts/tli/collect-and-score.ts:52-68` | 연쇄 오염 |
| **알림 전무** | 파이프라인 실패/테마 급변 시 알림 없음 | 전체 | 사고 인지 지연, 재방문률 낮음 |
| **Score Confidence 없음** | 데이터 3일차 점수와 30일차 점수 구분 불가 | `lib/tli/calculator.ts:10` (MIN_INTEREST_DAYS=3만 존재) | 사용자 오해 유발 |
| **정보 과부하** | 상세 페이지 6개 섹션, "그래서 어떻게?" 액션 부재 | `app/themes/[id]/_components/` | 이탈률 높음 |
| **DataLab 정규화 한계** | 자기 max 정규화 → 테마 간 절대 비교 불가 | `scripts/tli/collectors/naver-datalab.ts:148-158` | "A가 B보다 인기" 판단 불가 |

---

## 2. Phase 0: 긴급 방어 (1~2일)

> **목적**: 2/6~2/10 유형 사고의 구조적 재발 방지
> **예상 점수 상승**: 6.5 → 6.8 (+0.3)

### 2.0.1 수집 데이터 볼륨 검증 게이트

**위험도**: CRITICAL
**문제**: DataLab API 장애 시 ratio=0 전량 저장 → 기존 정상 데이터 덮어쓰기 → 점수 급락

**변경 파일**: `scripts/tli/collect-and-score.ts`

**변경 내용**:

```
DataLab 수집 직후, 점수 계산 직전에 검증 로직 삽입:

1. 수집된 interest_metrics 건수를 활성 테마 수와 비교
2. 활성 테마의 70% 미만에 대해서만 데이터가 있으면:
   - console.error로 경고
   - 점수 계산 단계 스킵
   - process.exit(1) (GitHub Actions 실패 처리)
3. rawValue가 0인 레코드가 전체의 90% 이상이면:
   - "API 장애 의심" 경고
   - 해당 배치 저장 스킵 (기존 데이터 보호)
```

**구체적 위치**:
- `collect-and-score.ts`의 DataLab 수집 try 블록 직후 (약 line 62~65 사이)
- 검증 실패 시 후속 단계(점수/비교/예측) 전체 스킵

**검증 방법**:
- DataLab 응답을 빈 배열로 모킹하여 파이프라인이 점수 계산을 스킵하는지 확인
- rawValue 전량 0인 경우 upsert가 호출되지 않는지 확인

---

### 2.0.2 criticalFailures 범위 확대

**위험도**: HIGH
**문제**: 점수 계산/비교/예측이 전량 실패해도 `process.exit(0)` (정상 종료)

**변경 파일**: `scripts/tli/collect-and-score.ts`

**현재 상태** (약 line 27, 65, 83):
```
criticalFailures가 증가하는 곳:
- DataLab 수집 실패 (line 65)
- 뉴스 수집 실패 (line 83)

criticalFailures가 증가하지 않는 곳:
- 종목 수집 실패 (line 97)
- 점수 계산 실패 (line 110)
- 비교 분석 실패 (line 119)
- 예측 실패 (line 128)
- 검증 실패 (line 146)
```

**변경 내용**:
```
모든 try-catch 블록의 catch에서 criticalFailures++ 추가:
- 종목 수집 실패 catch
- 점수 계산 실패 catch
- 비교 분석 실패 catch

예측/검증 실패는 severity가 낮으므로 별도 warningFailures로 분리.
파이프라인 종료 시:
- criticalFailures > 0 → process.exit(1)
- warningFailures > 0 → 로그만 출력, exit(0)
```

---

### 2.0.3 파이프라인 실패 알림

**위험도**: HIGH
**문제**: 파이프라인이 실패해도 30분 이내에 인지할 채널이 없음

**변경 파일**: `.github/workflows/tli-collect-data.yml`

**변경 내용**:
```yaml
# collect-and-score job 하단에 추가
- name: Notify on failure
  if: failure()
  uses: actions/github-script@v7
  with:
    script: |
      // GitHub Issue 자동 생성 또는 Discord webhook 호출
      // 실패한 step, 에러 메시지, 실행 URL 포함
```

**선택지**:
- A. Discord webhook (즉시 알림, 추천)
- B. GitHub Issue 자동 생성 (이력 관리)
- C. 이메일 (SendGrid 이미 있으므로 재활용 가능)

→ 사용자가 선호하는 채널 선택 필요

---

### 2.0.4 Supabase 호출 재시도

**위험도**: HIGH
**문제**: 네이버 API 호출에만 `withRetry`가 있고, Supabase DB 호출에는 재시도 없음

**변경 파일**: `scripts/tli/supabase-batch.ts`

**현재 코드** (line 69-73):
```typescript
const { error } = await supabaseAdmin
  .from(table)
  .upsert(batch, { onConflict })
if (error) {
  failedCount += batch.length
  // 재시도 없이 다음 배치로 진행
}
```

**변경 내용**:
```
upsert 호출을 withRetry로 감싸기:
- 최대 2회 재시도 (원래 시도 포함 총 3회)
- 지수 백오프: 1초, 2초
- 3회 모두 실패 시 기존 로직대로 failedCount 누적

batchQuery에도 동일하게 적용 (line 19-33)
```

---

## 3. Phase 1: 점수 신뢰도 혁신 (1주)

> **목적**: 점수/비교의 신뢰도를 실질적으로 개선
> **예상 점수 상승**: 6.8 → 7.6 (+0.8)

### 3.1.1 Score Confidence 시스템

**문제**: 데이터 3일차 점수 65와 30일차 점수 65가 동일하게 표시됨. 사용자가 점수의 신뢰도를 판단할 근거가 없음.

**변경 파일 및 순서**:

#### Step 1: 타입 정의

**파일**: `lib/tli/types/db.ts`
**위치**: `ScoreComponents` 인터페이스 내부

```
ScoreComponents에 confidence 필드 추가:

confidence: {
  level: 'high' | 'medium' | 'low'
  dataAge: number              // 사용 가능한 interest 데이터 일수
  interestCoverage: number     // 0-1, 30일 윈도우 대비 interest 데이터 비율
  newsCoverage: number         // 0-1, 14일 윈도우 대비 news 데이터 비율
  reason: string               // 사람이 읽을 수 있는 설명
}
```

#### Step 2: Confidence 계산 로직

**파일**: `lib/tli/calculator.ts`
**위치**: `calculateLifecycleScore` 함수 내부, score 계산 직후 (line 106 이후)

```
Confidence 결정 기준:

- interestCoverage = min(interestMetrics.length / 30, 1)
- newsCoverage = min(뉴스 있는 날 수 / 14, 1)
- coverageScore = interestCoverage * 0.6 + newsCoverage * 0.4

level 결정:
- coverageScore >= 0.7 && interestMetrics.length >= 14 → 'high'
- coverageScore >= 0.4 && interestMetrics.length >= 7  → 'medium'
- 나머지 → 'low'

reason 생성:
- interestMetrics.length < 7 → "관심도 {N}일 (7일 미만)"
- 뉴스 0건 → "뉴스 데이터 없음"
- 모두 충족 → "충분한 데이터"
```

#### Step 3: API 응답 노출

**파일**: `app/api/tli/themes/[id]/build-response.ts`
**위치**: 응답 객체에 confidence 필드 포함 (약 line 101-102)

**파일**: `app/api/tli/scores/ranking/ranking-helpers.ts`
**위치**: `ThemeScoreMeta`에 confidence.level 포함 (약 line 88)

#### Step 4: 프론트엔드 표시

**파일**: `components/tli/lifecycle-score.tsx`
**변경**: 점수 원형 표시 옆에 confidence 뱃지 추가

```
- HIGH: 표시 없음 (기본 상태)
- MEDIUM: 점수 옆에 "~" 표시 또는 회색 테두리
- LOW: 점수 옆에 "데이터 부족" 태그 + 흐린 처리
```

**파일**: `app/themes/[id]/_components/score-card.tsx`
**변경**: confidence.reason을 작은 텍스트로 표시

**검증 방법**:
- interestMetrics 3건/7건/14건/30건 테스트 케이스로 confidence level 확인
- 프론트엔드에서 각 level에 따른 시각적 차이 확인
- 기존 테스트 135개 전부 통과 확인

---

### 3.1.2 비교 임계값 상향: 0.25 → 0.35

**문제**: 임계값 0.25에서 매치의 약 70%가 의미 없는 노이즈

**변경 파일**: `scripts/tli/calculate-comparisons.ts`
**변경 위치**: line 10

```
현재: const SIMILARITY_THRESHOLD = 0.25
변경: const SIMILARITY_THRESHOLD = 0.35
```

**사전 검증**:
```bash
# backtest-comparisons.ts로 실데이터 기반 정밀도-재현율 확인
npx tsx scripts/tli/backtest-comparisons.ts
```

- 0.35에서 테마당 평균 매치 수가 1개 이상 유지되는지 확인
- MAX_MATCHES_PER_THEME=3은 유지
- backtest 결과에 따라 0.30~0.40 범위에서 최종 결정

**위험**: 매치 수 감소로 일부 테마의 비교 데이터가 0개가 될 수 있음
**완화**: 프론트엔드 `comparison-list/index.tsx`에 이미 빈 상태 처리가 있으므로 UX 문제 없음

---

### 3.1.3 가중치 재분배

**문제**:
- 감성 20% 가중치가 AI 없이는 정확도 ~55% 사전에 의존
- 부정확한 신호에 높은 가중치 → 점수 오염

**변경 파일**: `lib/tli/constants/score-config.ts`
**변경 위치**: line 4-8

```
현재:
  interest: 0.40
  newsMomentum: 0.25
  sentiment: 0.20
  volatility: 0.15

변경:
  interest: 0.45
  newsMomentum: 0.30
  sentiment: 0.05
  volatility: 0.20
```

**근거**:
- interest/newsMomentum: DataLab + 네이버 뉴스로 검증된 하드 데이터. 신뢰도 높음.
- sentiment: AI 없이 키워드 사전만으로는 상수(0.5) 반환 빈도가 높음. 0.05로 보조 지표화.
- volatility: 종목 가격 변동성. 이미 수집 중이고 데이터 품질 양호. 0.15→0.20으로 상향.

**영향 범위**:
- `calculator.ts`의 `SCORE_WEIGHTS` 참조 → 자동 반영
- 모든 테마의 점수가 재계산됨 (다음 full 실행 시)
- 테스트 파일 `lib/tli/__tests__/calculator.test.ts` 업데이트 필요

**검증 방법**:
- calculator.test.ts의 기대값 업데이트
- full 실행 후 점수 분포 확인 (극단적 변화가 없는지)

---

### 3.1.4 주가 방향성 대리 감성 반영

**문제**: 감성 가중치를 0.05로 낮추더라도, 그 0.05마저 키워드 사전(정확도 ~55%)에 의존

**변경 파일**: `lib/tli/calculator.ts`

**변경 내용**:
```
sentimentScore 계산 로직 변경:

현재:
  sentimentAgg = aggregateSentiment(input.sentimentScores || [])
  sentimentScore = hasSentimentData ? sentimentAgg.normalized : 0.5

변경:
  1차: 기존 키워드 감성 사용 (sentimentScores가 있으면)
  2차: 키워드 감성 없으면 주가 방향성으로 대체
    - input.avgPriceChangePct > 2%  → sentimentScore = 0.7
    - -2% ~ +2%                     → sentimentScore = 0.5
    - < -2%                         → sentimentScore = 0.3
  3차: 둘 다 없으면 → 0.5 (중립)
```

**필요한 변경**:
- `CalculateScoreInput` 인터페이스에 `avgPriceChangePct?: number` 추가
- `scripts/tli/calculate-scores.ts`에서 `calculateLifecycleScore` 호출 시 `avgPriceChangePct` 전달
  - 이미 `theme_stocks`에서 수집하고 있으므로 DB 조회만 추가

**검증 방법**:
- avgPriceChangePct 값별 sentimentScore 확인
- 기존 테스트 + 새 테스트 케이스 추가

---

## 4. Phase 2: 피드백 루프 구축 (2주)

> **목적**: 시간이 지날수록 자동으로 개선되는 시스템 구축
> **예상 점수 상승**: 7.6 → 8.1 (+0.5)

### 4.2.1 비교 임계값 자동 튜닝

**문제**:
- `evaluate-comparisons.ts:138`이 `suggested_threshold`를 DB에 기록하지만
- `calculate-comparisons.ts:11`은 하드코딩된 상수를 사용
- **루프가 끊겨 있음**

**변경 파일 및 순서**:

#### Step 1: 자동 튜닝 모듈 생성

**새 파일**: `scripts/tli/auto-tune.ts`

```
함수: computeOptimalThreshold()

1. comparison_calibration 테이블에서 최근 30일 데이터 조회
2. total_verified < 30이면 null 반환 (데이터 부족)
3. 검증된 비교 중 trajectory_correlation > 0.5인 것을 "정확"으로 분류
4. 후보 임계값 [0.25, 0.30, 0.35, 0.40, 0.45, 0.50]에 대해:
   - 정밀도 = 해당 임계값 이상인 비교 중 "정확"한 비율
   - 재현율 = "정확"한 비교 중 해당 임계값 이상인 비율
   - F1 = 2 * (정밀도 * 재현율) / (정밀도 + 재현율)
5. F1 최대 임계값 선택
6. 베이지안 축소: verified < 100이면 기본값(0.35)쪽으로 축소
   optimal = default * (100 - verified) / 100 + computed * verified / 100
7. 범위 제한: 0.25 ~ 0.50
8. 반환: { threshold, confidence, sampleSize }
```

#### Step 2: calculate-comparisons.ts 연결

**파일**: `scripts/tli/calculate-comparisons.ts`
**변경 위치**: line 10-11

```
현재:
  const SIMILARITY_THRESHOLD = 0.25

변경:
  // auto-tune 결과 로딩 (없으면 폴백)
  const tuningResult = await computeOptimalThreshold()
  const SIMILARITY_THRESHOLD = tuningResult?.threshold ?? 0.35

  if (tuningResult) {
    console.log(`🎯 자동 튜닝 임계값: ${tuningResult.threshold} (n=${tuningResult.sampleSize})`)
  } else {
    console.log(`🎯 기본 임계값 사용: 0.35 (검증 데이터 부족)`)
  }
```

#### Step 3: evaluate-comparisons.ts 개선

**파일**: `scripts/tli/evaluate-comparisons.ts`
**변경 위치**: line 138

```
현재:
  suggested_threshold: DEFAULT_THRESHOLD  // 하드코딩 0.30

변경:
  suggested_threshold: computedOptimal    // 실제 계산된 최적 임계값
```

#### Step 4: collect-and-score.ts 호출 순서

**파일**: `scripts/tli/collect-and-score.ts`

```
현재 순서:
  1. 수집 → 2. 점수 → 3. 비교 → 4. 예측 → 5. 검증

변경 순서:
  1. 수집 → 2. 점수 → 2.5. 자동 튜닝 → 3. 비교(튜닝 결과 적용) → 4. 예측 → 5. 검증

2.5단계에서 computeOptimalThreshold() 호출하여 결과를 3단계에 전달
```

**검증 방법**:
- comparison_calibration에 테스트 데이터 삽입 후 computeOptimalThreshold 결과 확인
- 임계값 변동 범위가 0.25~0.50 이내인지 확인
- 검증 데이터 0건일 때 0.35 폴백 확인

---

### 4.2.2 키워드 감성 사전 확장

**문제**: 현재 58개 키워드(긍정 ~30, 부정 ~28). 금융 도메인 커버리지 부족.

**변경 파일**: `lib/tli/sentiment.ts`

**변경 내용**:
```
1. 단일 키워드 → 바이그램/트라이그램 확장:
   긍정: "실적 호조", "수주 확대", "흑자 전환", "신고가", "기관 매수"
   부정: "실적 부진", "적자 전환", "공매도 급증", "하한가", "상장폐지"

2. 가중치 차별화:
   강한 긍정 (+1.0): "신고가", "실적 서프라이즈"
   약한 긍정 (+0.5): "관심", "기대"
   강한 부정 (-1.0): "상장폐지", "횡령"
   약한 부정 (-0.5): "우려", "변동성"

3. 부정어 처리:
   "않다", "못", "아니" 뒤의 긍정어 → 중립으로 처리
   예: "실적 호조가 아닌" → 긍정 취소

4. 목표: 58개 → 150~200개 키워드/바이그램
```

**우선순위**: 이 작업은 Phase 1의 가중치 재분배(0.05) 이후이므로 급하지 않음.
감성 가중치가 0.05인 상태에서는 사전 확장의 점수 영향이 미미함.
향후 감성 데이터 품질이 입증되면 가중치를 0.10~0.15로 다시 올릴 수 있음.

**검증 방법**:
- `lib/tli/__tests__/sentiment.test.ts`에 바이그램/부정어 테스트 추가
- 실제 뉴스 기사 100건 샘플로 정확도 측정 (목표: 62%+)

---

## 5. Phase 3: 프로덕트 경험 개선 (3~4주)

> **목적**: 사용자 가치 인지 + 재방문률 상승
> **예상 점수 상승**: 8.1 → 8.8 (+0.7)

### 5.3.1 상세 페이지 Executive Summary

**문제**: 6개 섹션 정보 나열. "그래서 어떻게?" 액션 부재. 이탈률 추정 50%.

**변경 파일**: `app/themes/[id]/_components/detail-content.tsx`

**새 컴포넌트**: `app/themes/[id]/_components/executive-summary.tsx`

**변경 내용**:
```
상세 페이지 최상단에 Executive Summary 섹션 추가:

구조:
┌─────────────────────────────────────────────┐
│ [테마명]은 현재 [Stage] 단계입니다.          │
│                                             │
│ 최근 7일간 [+/-N]pt [상승/하락].             │
│ [비교 기반 인사이트 1문장]                    │
│                                             │
│ 신뢰도: [HIGH/MEDIUM/LOW]                    │
│ [신뢰도 사유]                                │
│                                             │
│ [관련 종목 보기]  [뉴스 보기]                 │
└─────────────────────────────────────────────┘

인사이트 생성 로직 (AI 없이, 규칙 기반):
- Peak + 7D 상승 → "과열 신호, 단기 조정 가능성"
- Growth + comparison 있음 → "과거 유사 테마 평균 {N}일 후 정점"
- Decay + reigniting → "재점화 가능성 감지"
- Early + 데이터 부족 → "데이터 축적 중, 추이 관찰 필요"
```

**기존 섹션 재배치**:
```
현재:
  1. Header → 2. Prediction → 3. Chart → 4. News → 5. Score/Comparison/Stocks

변경:
  1. Header → 2. Executive Summary (신규) → 3. Chart+Prediction → 4. 접을 수 있는 상세
     └ Score Card
     └ Comparison List
     └ Stock List
     └ News Headlines
```

---

### 5.3.2 데이터 Freshness 표시

**문제**: 사용자가 "지금 보는 점수가 실시간인지 어제 데이터인지" 모름

**변경 파일**:
- `app/api/tli/themes/[id]/build-response.ts` — 응답에 `lastUpdatedAt` 필드 추가
- `app/api/tli/scores/ranking/ranking-helpers.ts` — 랭킹에도 `lastUpdatedAt` 포함
- `components/tli/lifecycle-score.tsx` — 점수 하단에 "마지막 업데이트: N시간 전" 표시
- `app/themes/[id]/_components/score-card.tsx` — 동일

**데이터 소스**: `lifecycle_scores.calculated_at` (이미 존재)

**표시 형식**:
```
- 1시간 이내: "방금 업데이트"
- 1~24시간: "N시간 전 업데이트"
- 1일 이상: "N일 전 업데이트" (빨간 텍스트로 경고)
- 다음 업데이트 예정: "오늘 16:30" (cron 스케줄 기반 고정값)
```

---

### 5.3.3 알림 시스템

**문제**: 재방문 유도 메커니즘 전무. 사용자가 능동적으로 확인해야만 변화 인지 가능.

#### 단계 1: 뉴스레터 강화 (기존 인프라 활용)

**변경 파일**: `scripts/newsletter/prepare-newsletter.ts` (또는 관련 파일)

```
현재 뉴스레터 구성:
  - Gemini AI 분석 (3종목)

추가 섹션:
  - "오늘의 테마 요약"
    - Top 3 상승 테마 (점수 변화량 기준)
    - Top 3 하락 테마
    - 신규 Reigniting 테마
  - 전일 대비 단계 변경된 테마 목록
```

#### 단계 2: 브라우저 푸시 알림 (Web Push API)

**새 파일들**:
- `app/api/push/subscribe/route.ts` — 푸시 구독 등록
- `app/api/push/send/route.ts` — 푸시 발송
- `lib/push/service-worker.ts` — Service Worker 등록

**DB 테이블 추가**: `push_subscriptions`
```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  theme_ids UUID[] DEFAULT '{}',  -- 구독한 테마 목록
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**트리거 조건**:
```
점수 계산 후 (collect-and-score.ts) 변화 감지:
- 점수 ±10pt 이상 변화
- 단계 변경 (stage_changed = true)
- Reigniting 감지 (is_reigniting = true로 변경)

→ push_subscriptions에서 해당 theme_id를 구독한 사용자에게 Web Push 발송
```

**프론트엔드**:
- `app/themes/[id]/_components/` — "알림 받기" 버튼 추가
- 권한 요청 → 구독 등록 → theme_id 추가

#### 단계 3: Discord/Slack 웹훅 (고급 사용자)

**우선순위 낮음** — 단계 2 이후 검토

---

### 5.3.4 검색 실패 시 대안 제시

**문제**: 검색 결과 0건 시 "검색 결과가 없습니다" 메시지만 표시

**변경 파일**: `app/themes/_components/themes-empty-states.tsx`

**변경 내용**:
```
현재: <EmptySearchResult query={searchQuery} />

개선:
<EmptySearchResult query={searchQuery}>
  <div>
    <p>"{searchQuery}"에 대한 결과가 없습니다.</p>

    {/* 인기 테마 제안 */}
    <h4>지금 인기 테마</h4>
    <ThemeCardMini themes={topThemes.slice(0, 3)} />

    {/* 최근 급상승 */}
    <h4>최근 급상승</h4>
    <ThemeCardMini themes={surgingThemes.slice(0, 3)} />
  </div>
</EmptySearchResult>
```

**데이터**: 이미 `use-get-ranking.ts`로 로딩된 전체 테마 목록에서 필터링

---

## 6. Phase 4: 실시간성 + 데이터 확장 (1~2개월)

> **목적**: 감지 지연 축소 + 테마 간 비교 가능
> **예상 점수 상승**: 8.8 → 9.0+ (+0.2~0.5)

### 6.4.1 장중 뉴스 서지 감지

**문제**: 최소 감지 지연 ~7.5시간 (아침 cron 직후 발생한 이벤트)

**변경 파일**: `.github/workflows/tli-collect-data.yml`

**변경 내용**:
```yaml
# 기존 cron에 추가
- cron: '0 1,3,5,7 * * 1-5'  # UTC 1,3,5,7 = KST 10,12,14,16 (장중 2시간 간격)
```

**새 파일**: `scripts/tli/detect-surge.ts`

```
실행 흐름:
1. 활성 테마 로딩
2. 네이버 뉴스 API로 최근 2시간 기사 조회 (기존 collectNaverNews 재사용, 날짜 범위 축소)
3. 테마별 2시간 기사 수와 7일 일일 평균 비교
4. 2시간 기사 수 > 일일 평균의 50% → surge 후보
5. surge 후보 테마에 대해서만:
   - DataLab 수집 (대상 축소로 배치 5개 제한 내)
   - 점수 재계산
   - lifecycle_scores upsert (당일 기존 점수 덮어쓰기)
```

**새 DB 테이블**: `surge_alerts`
```sql
CREATE TABLE surge_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID REFERENCES themes(id),
  detected_at TIMESTAMPTZ DEFAULT now(),
  trigger_type VARCHAR(20),  -- 'news_surge' | 'price_surge'
  news_count_2h INTEGER,
  baseline_daily_avg REAL,
  is_notified BOOLEAN DEFAULT false,
  UNIQUE(theme_id, detected_at::date)
);
```

**collect-and-score.ts 모드 추가**:
```
TLI_MODE 값:
- 'full': 기존 전체 파이프라인
- 'news-only': 뉴스만 수집
- 'surge-detect': 서지 감지 모드 (신규)
```

---

### 6.4.2 DataLab Anchor 정규화

**문제**: 자기 max 정규화 → 테마 간 절대 인기도 비교 불가 (상관 r=0.672)

**변경 파일**: `scripts/tli/collectors/naver-datalab.ts`

**변경 내용**:
```
현재 배치 구성:
  배치 1: [테마A, 테마B, 테마C, 테마D, 테마E]  (5개)
  → 각 테마의 max로 정규화 (자기 참조)

Anchor 정규화:
  배치 1: [테마A, 테마B, 테마C, 테마D, 앵커]  (4개 + 1 앵커)
  → 앵커의 값을 기준으로 모든 테마 정규화

앵커 키워드: 변동이 적고 인기가 안정적인 키워드 (예: "주식", "코스피")
모든 배치에 동일한 앵커를 포함시켜 배치 간 비교 가능하게 함.

구체적:
1. ANCHOR_KEYWORD = "주식" (또는 설정으로 관리)
2. 각 배치에 4 테마 + 1 앵커
3. 앵커의 ratio를 기준값으로 사용: normalized = (theme_ratio / anchor_ratio) * 50
4. 기존 self-normalization은 유지하되, anchor_normalized 컬럼 추가
```

**DB 변경**: `interest_metrics`에 `anchor_normalized DECIMAL(5,2)` 컬럼 추가 (nullable)

**트레이드오프**:
- 배치당 4 테마 (기존 5개) → 처리량 20% 감소
- API 호출 횟수 증가 → rate limit 주의
- 앵커 키워드 선정이 중요 (안정적이어야 함)

**우선순위**: Phase 4 (가장 마지막). 자기 정규화 + 백분위 감쇠가 현재도 어느 정도 작동하므로 급하지 않음.

---

### 6.4.3 백필 전용 CLI 도구

**문제**: 데이터 유실 시 복구 방법이 `workflow_dispatch` (항상 최근 30일만) 밖에 없음

**새 파일**: `scripts/tli/backfill.ts`

```
사용법:
  TLI_START_DATE=2026-02-01 TLI_END_DATE=2026-02-05 npx tsx scripts/tli/backfill.ts

기능:
1. 지정 날짜 범위의 DataLab 데이터 재수집
   - DataLab API 30일 윈도우 제약 내에서만 가능
   - 30일 이전은 복구 불가 (경고 표시)
2. 지정 날짜 범위의 뉴스 데이터 재수집
3. 재수집 후 해당 날짜 범위의 점수 재계산
4. 비교/예측 재실행은 선택적 (--with-comparisons 플래그)

안전장치:
- 기존 데이터 덮어쓰기 전 확인 프롬프트
- dry-run 모드 (--dry-run)
- 수집 건수 리포트
```

---

## 7. 점수 프로젝션

| Phase | 누적 점수 | 기간 | 핵심 달성 |
|-------|----------|------|----------|
| 현재 | 6.5 | — | — |
| Phase 0 (방어) | 6.8 | 1~2일 | 파이프라인 사고 재발 구조적 차단 |
| Phase 1 (신뢰도) | 7.6 | +1주 | Confidence 시스템, 노이즈 비교 70% 제거, 가중치 현실화 |
| Phase 2 (피드백) | 8.1 | +2주 | 자동 튜닝 루프 구축, 감성 사전 확장 |
| Phase 3 (프로덕트) | 8.8 | +3~4주 | 알림, Executive Summary, freshness, 검색 개선 |
| Phase 4 (확장) | 9.0+ | +1~2개월 | 실시간 서지 감지, Anchor 정규화, 백필 도구 |

### ROI 순위 (노력 대비 효과, 최종)

| 순위 | 작업 | Phase | 노력 | 효과 | 비고 |
|------|------|-------|------|------|------|
| 1 | 가중치 재분배 + 임계값 상향 | 1 | 1시간 | 즉시 품질 상승 | 상수 변경만 |
| 2 | Score Confidence 시스템 | 1 | 1~2일 | 사용자 신뢰도 혁신 | 인프라 100% 준비 |
| 3 | 수집 볼륨 검증 게이트 | 0 | 1일 | 사고 재발 차단 | CRITICAL 방어 |
| 4 | 파이프라인 실패 알림 | 0 | 반나절 | 사고 인지 시간 30분→즉시 | workflow 변경만 |
| 5 | 피드백 루프 연결 | 2 | 2~3일 | 자동 개선 시작 | 시간이 지날수록 복리 효과 |
| 6 | Executive Summary | 3 | 2~3일 | 이탈률 감소 | 규칙 기반 (AI 불필요) |
| 7 | 주가 대리 감성 | 1 | 1일 | 감성 0.05 정상화 | 기존 데이터 재활용 |
| 8 | 알림 시스템 (웹 푸시) | 3 | 1~2주 | 재방문률 핵심 | 새 인프라 필요 |
| 9 | 키워드 사전 확장 | 2 | 3~5일 | 미미 (가중치 0.05) | 낮은 우선순위 |
| 10 | DataLab Anchor 정규화 | 4 | 1주 | 테마 간 비교 가능 | 처리량 20% 감소 |
| 11 | 서지 감지 | 4 | 3~5일 | 감지 지연 축소 | cron + 신규 스크립트 |
| 12 | 백필 도구 | 4 | 2~3일 | 복구 능력 확보 | 비상용 |

---

## 8. 제약사항

### 8.1 기술적 제약

| 제약 | 영향 | 완화 |
|------|------|------|
| AI API 사용 불가 | 감성 분석 정확도 상한 ~62% | 가중치 축소 + 주가 대리변수 |
| DataLab 배치 5개 제한 | Anchor 정규화 시 처리량 20% 감소 | 배치 간 앵커 공유 |
| DataLab 30일 윈도우 | 30일 이전 데이터 복구 불가 | 백필 도구 + 조기 경고 |
| 네이버 HTML 스크래핑 의존 | HTML 구조 변경 시 종목/테마 발견 깨짐 | 스크래핑 결과 0건 방어 + 알림 |
| GitHub Actions cron 15~30분 지연 | mode 판별 오류 가능 | cron event schedule 값 직접 참조 |

### 8.2 데이터 제약

| 제약 | 영향 | 완화 |
|------|------|------|
| 과거 테마 풀 부족 (서비스 초기) | 비교 품질 저하 | 시간이 해결. Phase 1 임계값 상향으로 노이즈 제거 |
| 자동 튜닝에 최소 30건 검증 데이터 필요 | 구축 초기 2~4주간 기본값 사용 | 베이지안 축소로 안전하게 전환 |
| 단일 데이터 소스 (네이버) | 네이버 장애 = 전체 장애 | Phase 0 방어 + Phase 4 다소스 확장 |

### 8.3 선택이 필요한 항목

| 항목 | 선택지 | 결정 시점 |
|------|--------|----------|
| 파이프라인 실패 알림 채널 | Discord / Slack / GitHub Issue / 이메일 | Phase 0 착수 시 |
| 임계값 최종값 | backtest 실행 후 0.30~0.40 범위에서 결정 | Phase 1 착수 시 |
| 앵커 키워드 | "주식", "코스피", "경제" 중 안정성 검증 | Phase 4 착수 시 |
| DataLab 수집 실패 시 점수 계산 정책 | 스킵 vs 과거 데이터로 계속 | Phase 0 착수 시 |

---

*이 문서는 코드베이스 분석에 기반한 계획이며, 각 Phase 착수 전 최신 코드 상태를 재확인해야 합니다.*
