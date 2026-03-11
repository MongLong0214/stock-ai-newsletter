# PRD: 테마 비교 알고리즘 v3 — 전면 개선

> Superseded on 2026-03-11 by [comparison-v4-prd.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/docs/comparison-v4-prd.md).
> 이 문서는 아이디어/실험 백로그 참고용으로만 유지한다. production cutover 기준 문서는 v4가 canonical이다.

> 2026-03-11 | 평가 종합 72/100 → 목표 90+/100
> 평가 결과: P1 4건 + P2 14건 = **18건 전량 해결**

---

## 0. 배경 및 동기

3개 전문 에이전트(수학 82/100, 실증 58/100, 파이프라인 76/100) + Boomer 구조적 검증 결과,
**실증 검증 인프라 부재**가 최대 약점으로 식별됨. 알고리즘 자체의 수학적 설계는 건전하나,
"이 알고리즘이 실제로 가치를 만드는가?"를 증명할 메타-검증 체계가 없음.

### 현재 아키텍처 (v2)

```
DataLab/뉴스/금융 수집 → enrichThemes → Mutual Rank 인덱스
→ compositeCompare (2-Pillar: feature + curve) → threshold 필터
→ DB 저장 → prediction → evaluation
```

### v3 목표

1. 모든 메트릭에 통계적 유의성 검증 추가
2. 알고리즘 자체의 수학적 일관성 향상 (스케일 통일, 불연속 제거)
3. 데이터 품질 개선 (뉴스 스냅샷, 계절성 보정)
4. 운영 성숙도 향상 (모니터링, 증분 캐싱)

---

## 1. Phase 1 — 측정 인프라 (P1 해결)

> 다른 Phase의 개선 효과를 측정하려면 먼저 측정 도구가 있어야 한다.

### 1.1 백테스트 Holdout Split [P1#1]

**문제**: `backtest-comparisons.ts`에서 threshold sweep이 전체 데이터로 in-sample 평가.
precision이 10-20pp 과대추정될 수 있음.

**파일**: `scripts/tli/backtest-comparisons.ts`

**구현**:

```
변경 전: enriched 전체 → threshold sweep → precision/recall 보고

변경 후:
1. enriched를 first_spike_date 기준 시간순 정렬
2. 70% 앞부분 = train, 30% 뒷부분 = test (temporal split)
3. threshold sweep은 train에서만 실행
4. 최적 threshold를 test에 적용 → out-of-sample precision/recall 보고
5. 결과: { trainPrecision, testPrecision, gap } 출력
```

**변경 사항**:

```typescript
// backtest-comparisons.ts — 기존 100-163행 대체

// temporal split (70/30)
const sorted = [...enriched].sort((a, b) =>
  a.firstSpikeDate.localeCompare(b.firstSpikeDate)
)
const splitIdx = Math.floor(sorted.length * 0.7)
const trainSet = sorted.slice(0, splitIdx)
const testSet = sorted.slice(splitIdx)

console.log(`📊 Train: ${trainSet.length}개 / Test: ${testSet.length}개\n`)

// threshold sweep on train only
for (const threshold of thresholds) {
  const trainResult = runSweep(trainSet, threshold, populationStats)
  const testResult = runSweep(testSet, threshold, populationStats)
  // ... 결과 출력
}
```

**AC**:
- [ ] temporal split 70/30 구현
- [ ] train/test 별도 precision/recall 보고
- [ ] gap (train-test) >= 15pp 시 경고 메시지 출력
- [ ] 기존 runSweep 로직을 함수로 추출하여 재사용

---

### 1.2 Baseline 비교 [P1#2]

**문제**: `evaluate-predictions.ts`에서 phase_correct 51.4%를 기저율과 비교하지 않음.
부가가치 증명 불가.

**파일**: `scripts/tli/evaluate-predictions.ts`

**구현**:

```typescript
// evaluate-predictions.ts — evaluatePredictions 함수 끝부분에 추가

// Baseline 계산 (evaluated 스냅샷 대상)
const evaluated = await supabaseAdmin
  .from('prediction_snapshots')
  .select('phase, actual_stage, phase_correct')
  .eq('status', 'evaluated')
  .not('phase_correct', 'is', null)

if (evaluated.data && evaluated.data.length >= 30) {
  const total = evaluated.data.length

  // Baseline 1: Random (3-class uniform = 33.3%)
  const randomBaseline = 1 / 3

  // Baseline 2: Majority class
  const stageCounts = new Map<string, number>()
  for (const e of evaluated.data) {
    stageCounts.set(e.actual_stage, (stageCounts.get(e.actual_stage) || 0) + 1)
  }
  const majorityBaseline = Math.max(...stageCounts.values()) / total

  // Baseline 3: Persistence (현재 stage가 유지된다고 가정)
  // → phase_correct와 동일 기준이므로 별도 계산 필요
  // persistence는 evaluation_window 내 stage 변화가 없는 비율

  // 실제 정확도
  const accuracy = evaluated.data.filter(e => e.phase_correct).length / total

  // Binomial test (정규 근사)
  const z = (accuracy - randomBaseline) / Math.sqrt(randomBaseline * (1 - randomBaseline) / total)
  const significant = z > 1.96 // p < 0.05

  console.log(`\n📊 Baseline 비교 (N=${total}):`)
  console.log(`   모델 정확도:    ${(accuracy * 100).toFixed(1)}%`)
  console.log(`   Random 기저율:  ${(randomBaseline * 100).toFixed(1)}%`)
  console.log(`   Majority 기저율: ${(majorityBaseline * 100).toFixed(1)}%`)
  console.log(`   Lift (vs Random): +${((accuracy - randomBaseline) * 100).toFixed(1)}pp`)
  console.log(`   통계적 유의성:  z=${z.toFixed(2)} ${significant ? '✅ p<0.05' : '⚠️ 유의하지 않음'}`)
}
```

**AC**:
- [ ] Random/Majority/Persistence 3종 baseline 계산
- [ ] Binomial test z-score + p<0.05 판정
- [ ] N < 30이면 "표본 부족" 경고
- [ ] 매 실행 시 콘솔 리포트 출력

---

### 1.3 Survivorship Bias 추적 [P1#3]

**문제**: `evaluate-comparisons.ts:82`에서 `comp.current_day >= alignedPastInterest.length` 조건으로
silent skip. 검증 결과가 장기 생존 테마 쪽으로 편향됨.

**파일**: `scripts/tli/evaluate-comparisons.ts`

**구현**:

```typescript
// evaluate-comparisons.ts — 기존 66행 for 루프 내부에 카운터 추가

let skipCount = 0
let skipReasons = { insufficientData: 0, shortTimeline: 0, noInterest: 0 }

for (const comp of unverified) {
  const currentInterest = interestByTheme.get(comp.current_theme_id) || []
  const pastInterest = interestByTheme.get(comp.past_theme_id) || []

  // 건너뜀 사유 추적
  if (currentInterest.length === 0 || pastInterest.length === 0) {
    skipCount++; skipReasons.noInterest++; continue
  }
  // ... (기존 alignedPastInterest 계산)
  if (comp.current_day >= alignedPastInterest.length) {
    skipCount++; skipReasons.insufficientData++; continue
  }
  const minLen = Math.min(afterDate.length, pastValues.length)
  if (minLen < 7) {
    skipCount++; skipReasons.shortTimeline++; continue
  }
  // ... (기존 검증 로직)
}

// 캘리브레이션 집계에 skip 메트릭 추가
const skipRate = unverified.length > 0 ? skipCount / unverified.length : 0
console.log(`   ⚠️ Skip rate: ${(skipRate * 100).toFixed(1)}% (${skipCount}/${unverified.length})`)
console.log(`      사유: 데이터부족=${skipReasons.insufficientData}, 짧은타임라인=${skipReasons.shortTimeline}, 관심도없음=${skipReasons.noInterest}`)

// details에 skip 정보 포함
details: {
  ...existingDetails,
  skip_rate: skipRate,
  skip_reasons: skipReasons,
}
```

**AC**:
- [ ] skip 사유별 카운터 추가 (3종)
- [ ] skip_rate를 comparison_calibration.details에 저장
- [ ] skip_rate > 50% 시 콘솔 경고
- [ ] 기존 검증 로직 변경 없음 (추가만)

---

### 1.4 Curve Ensemble 스케일 통일 [P1#4, Boomer 승격]

**문제**: `composite.ts:126,138,140`에서 RMSE(`1-x*2.5` 선형)와 DTW(`exp(-x)` 지수)가 혼용.
같은 거리값 0.4에서 RMSE=0, DTW=0.67로 의미 불일치. 가중 평균의 의미 손상.

**파일**: `lib/tli/comparison/composite.ts`

**구현**:

```
변경 전:
  shapeSim = Math.max(0, 1 - Math.sqrt(sumSqDiff / len) * 2.5)     // 선형
  dtwSim   = exp(-dist)                                              // 지수
  derivCorr = Math.max(0, pearsonCorrelation(...))                    // [0,1] 자연

변경 후: 모든 거리→유사도 변환을 exp(-d * k) 형태로 통일
  shapeSim = Math.exp(-Math.sqrt(sumSqDiff / len) * 2.0)            // 지수, k=2.0
  dtwSim   = exp(-dist * 1.0)                                        // 지수, k=1.0 (기존 유지)
  derivCorr = Math.max(0, pearsonCorrelation(...))                    // 변환 불필요 (이미 [-1,1])
```

**스케일 검증**:

| RMSE | 변경 전 (선형) | 변경 후 (지수) | 해석 |
|------|--------------|--------------|------|
| 0.0 | 1.00 | 1.00 | 동일 곡선 |
| 0.1 | 0.75 | 0.82 | 매우 유사 |
| 0.2 | 0.50 | 0.67 | 유사 |
| 0.3 | 0.25 | 0.55 | 약한 유사 |
| 0.4 | 0.00 | 0.45 | 비유사 (선형은 너무 가혹) |
| 0.5 | 0.00 | 0.37 | 비유사 |

지수 변환은 RMSE 0.4 이상을 더 부드럽게 감쇄하여 DTW/Pearson과 동일한 스케일 분포를 형성.

**변경 코드** (`composite.ts:126`):

```typescript
// 변경 전
const shapeSim = Math.max(0, 1 - Math.sqrt(sumSqDiff / len) * 2.5)

// 변경 후
const rmse = Math.sqrt(sumSqDiff / len)
const shapeSim = Math.exp(-rmse * 2.0)
```

**AC**:
- [ ] shapeSim을 `exp(-rmse * 2.0)`으로 변경
- [ ] 기존 테스트(`composite.test.ts`) 기대값 업데이트
- [ ] 변경 전/후 백테스트 precision 비교 (5% 이상 하락 시 k 조정)
- [ ] DTW scale(1.0) 유지 확인

---

## 2. Phase 2 — 알고리즘 일관성 개선 (P2 핵심)

### 2.1 섹터 친화도 행렬 [P2#5]

**문제**: `composite.ts:87-88`에서 모든 이종 섹터 쌍에 동일한 0.85 패널티.
"AI-반도체"(밀접)와 "AI-바이오"(무관)를 구분하지 못함.

**파일**: `lib/tli/constants/sectors.ts` (신규), `lib/tli/comparison/composite.ts`

**구현**:

```typescript
// lib/tli/constants/sectors.ts — SECTOR_AFFINITY 추가

/** 섹터 친화도 행렬 (1.0=동일, 0.85=기본, 값이 높을수록 친화) */
export const SECTOR_AFFINITY: Record<string, Record<string, number>> = {
  tech:    { tech: 1.0, semi: 0.95, media: 0.90, energy: 0.85, bio: 0.85, finance: 0.85, industry: 0.85 },
  semi:    { tech: 0.95, semi: 1.0, industry: 0.90, energy: 0.88, bio: 0.85, media: 0.85, finance: 0.85 },
  bio:     { bio: 1.0, tech: 0.85, semi: 0.85, industry: 0.85, energy: 0.85, media: 0.85, finance: 0.85 },
  energy:  { energy: 1.0, industry: 0.92, semi: 0.88, tech: 0.85, bio: 0.85, media: 0.85, finance: 0.85 },
  // ... 나머지 섹터
}

export function getSectorPenalty(sectorA: string, sectorB: string): number {
  if (sectorA === sectorB) return 1.0
  if (sectorA === 'etc' || sectorB === 'etc') return 1.0
  return SECTOR_AFFINITY[sectorA]?.[sectorB]
    ?? SECTOR_AFFINITY[sectorB]?.[sectorA]
    ?? 0.85 // 미등록 쌍은 기본값 유지
}
```

**composite.ts 변경** (87-88행):

```typescript
// 변경 전
const sectorMatch = current.sector === past.sector || current.sector === 'etc' || past.sector === 'etc'
const rawSim = (...) * (sectorMatch ? 1.0 : 0.85)

// 변경 후
const sectorPenalty = getSectorPenalty(current.sector, past.sector)
const rawSim = (...) * sectorPenalty
```

**AC**:
- [ ] SECTOR_AFFINITY 행렬 정의 (현재 SECTOR_KEYWORDS의 섹터 목록 기반)
- [ ] getSectorPenalty 함수 + 단위 테스트
- [ ] composite.ts에서 기존 sectorMatch 로직 대체
- [ ] 미등록 섹터 쌍은 0.85 폴백 유지 (하위 호환)

---

### 2.2 다중공선성 검증 + 차원 정비 [P2#6]

**문제**: `features.ts:64,69`에서 `interestMomentum`(slope)과 `volatilityDVI`(RSI)가
동일 소스(관심도 7일)에서 파생. 정보 중복 가능.

**파일**: `scripts/tli/diagnostics/` (신규 디렉토리), `lib/tli/comparison/features.ts`

**구현 (2단계)**:

**Step A: VIF 진단 스크립트** (신규 파일)

```typescript
// scripts/tli/diagnostics/vif-analysis.ts
// 전체 enriched 테마의 7D 벡터에서 VIF 계산
// VIF > 5이면 다중공선성 경고, VIF > 10이면 차원 통합 권장

function calculateVIF(matrix: number[][]): number[] {
  const numDims = matrix[0].length
  const vifs: number[] = []
  for (let d = 0; d < numDims; d++) {
    // d번째 차원을 종속변수로, 나머지를 독립변수로 OLS 회귀
    // R² 계산 → VIF = 1 / (1 - R²)
    const y = matrix.map(row => row[d])
    const X = matrix.map(row => row.filter((_, i) => i !== d))
    const rSquared = olsRSquared(y, X)
    vifs.push(1 / (1 - rSquared))
  }
  return vifs
}
```

**Step B: 조건부 차원 통합** (VIF > 5 확인 후)

```
만약 interestMomentum ↔ volatilityDVI VIF > 5:
  → 두 차원을 단일 "directionality" 차원으로 통합
  → directionality = 0.6 * momentum + 0.4 * DVI
  → 7D → 6D (차원 축소)

만약 VIF <= 5:
  → 현재 7D 유지 (변경 없음)
```

**AC**:
- [ ] VIF 진단 스크립트 작성 + 실행
- [ ] VIF 결과에 따라 차원 통합 여부 결정 (Isaac 확인 필요)
- [ ] VIF > 5 차원 쌍이 있으면 통합 구현 + 테스트 업데이트
- [ ] VIF <= 5이면 "검증 완료, 변경 불필요" 기록

---

### 2.3 적응적 가중치 시그모이드 보간 [P2#7]

**문제**: `composite.ts:82-84`에서 7일/14일 경계에 계단 함수 불연속.
13→14일에서 feature 가중치가 0.60→0.40으로 20pp 급변.

**파일**: `lib/tli/comparison/composite.ts`

**구현**:

```typescript
// 변경 전 (계단 함수)
if (minCurveLen >= 14)     { wFeature = 0.40; wCurve = 0.60 }
else if (minCurveLen >= 7) { wFeature = 0.60; wCurve = 0.40 }
else                       { wFeature = 1.00; wCurve = 0.00 }

// 변경 후 (시그모이드 보간)
function adaptiveWeights(minCurveLen: number): { wFeature: number; wCurve: number } {
  if (minCurveLen < 7) return { wFeature: 1.00, wCurve: 0.00 }

  // 7일=0.40 → 14일=0.60 (시그모이드 보간)
  // sigmoid: 1 / (1 + exp(-k * (x - center)))
  const t = 1 / (1 + Math.exp(-0.8 * (minCurveLen - 10.5)))
  const wCurve = 0.40 + t * 0.20  // 0.40 ~ 0.60
  const wFeature = 1.00 - wCurve   // 0.60 ~ 0.40
  return { wFeature, wCurve }
}
```

**검증 표**:

| minCurveLen | 변경 전 wCurve | 변경 후 wCurve | 차이 |
|-------------|--------------|--------------|------|
| 6 | 0.00 | 0.00 | 동일 |
| 7 | 0.40 | 0.41 | ~동일 |
| 10 | 0.40 | 0.49 | 자연스러운 전환 |
| 13 | 0.40 | 0.57 | 14일에 가까워짐 |
| 14 | 0.60 | 0.59 | ~동일 |
| 21 | 0.60 | 0.60 | 동일 |

**AC**:
- [ ] adaptiveWeights 함수 추출
- [ ] 7일 미만 = (1.0, 0.0) 유지
- [ ] 7일 = ~0.40, 14일 = ~0.60으로 기존 경계값과 근사
- [ ] 중간 구간(10-13일)에서 부드러운 전환 확인
- [ ] composite.test.ts 업데이트

---

### 2.4 캘리브레이션 파이프라인 순서 [P2#8]

**문제**: `calibrate-weights.ts`, `calibrate-confidence.ts`, `calibrate-noise.ts`가
독립 실행되나 실제로는 의존 관계: weights → scores 재생성 → noise → confidence.

**파일**: `scripts/tli/pipeline-steps.ts` (기존), `scripts/tli/auto-tune.ts`

**구현**:

```
현재: 각 스크립트 독립 실행 (순서 보장 없음)
변경: pipeline-steps.ts에 calibration 순서 강제

calibration 실행 순서:
1. calibrate-weights → 가중치 최적화
2. calculate-scores → 새 가중치로 점수 재계산 (기존 스텝 재사용)
3. calibrate-noise → 노이즈 임계값 최적화
4. calibrate-confidence → 신뢰도 구간 최적화
5. auto-tune → 유사도 임계값 최적화

각 단계 사이에 이전 결과가 DB에 반영되므로 자연스러운 순차 실행.
```

```typescript
// pipeline-steps.ts에 추가
export async function runCalibrationPipeline() {
  console.log('🔧 캘리브레이션 파이프라인 (순차 실행)\n')

  console.log('Step 1/4: 가중치 캘리브레이션')
  await calibrateWeights()

  console.log('Step 2/4: 노이즈 캘리브레이션')
  await calibrateNoise()

  console.log('Step 3/4: 신뢰도 캘리브레이션')
  await calibrateConfidence()

  console.log('Step 4/4: 임계값 자동 튜닝')
  await autoTune()

  console.log('\n✅ 캘리브레이션 파이프라인 완료')
}
```

**AC**:
- [ ] runCalibrationPipeline 함수 추가
- [ ] 의존 순서: weights → noise → confidence → auto-tune
- [ ] 각 단계 실패 시 중단 + 에러 보고 (후속 단계 미실행)
- [ ] 기존 개별 실행도 유지 (하위 호환)

---

### 2.5 Bootstrap 최소 N 가드 [P2#9]

**문제**: `prediction-bootstrap.ts:22`에서 n < 2 가드만 있음.
n=2~4에서 Bootstrap CI가 과도하게 좁아 거짓 정밀도.

**파일**: `lib/tli/prediction-bootstrap.ts`

**구현**:

```typescript
// 변경 전
if (n < 2) return null;

// 변경 후
const MIN_BOOTSTRAP_N = 5
if (n < 2) return null;
if (n < MIN_BOOTSTRAP_N) {
  // t-분포 기반 간이 CI (소표본 대안)
  const mean = values.reduce((s, v) => s + v, 0) / n
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1))
  const tCritical = n === 2 ? 6.31 : n === 3 ? 2.92 : 2.35 // t(α/2=0.05, df)
  const margin = tCritical * std / Math.sqrt(n)
  return {
    lower: Math.round(mean - margin),
    upper: Math.round(mean + margin),
    median: Math.round(mean),
    confidenceLevel: 0.90,
  }
}
```

**AC**:
- [ ] MIN_BOOTSTRAP_N = 5 상수 도입
- [ ] n < 5: t-분포 CI 폴백
- [ ] n >= 5: 기존 Bootstrap 유지
- [ ] prediction-bootstrap.test.ts에 n=2,3,4 케이스 추가
- [ ] CI width가 n < 5에서 기존 대비 최소 2배 이상 넓어지는지 검증

---

## 3. Phase 3 — 데이터 품질 개선

### 3.1 뉴스 밀도 스냅샷 [P2#10]

**문제**: `calculate-comparisons.ts:117`에서 news_metrics를 30일만 로딩.
과거 비활성 테마의 newsIntensity가 전량 0으로 붕괴 → 7D 벡터 1차원 판별력 상실.

**파일**: `scripts/tli/enrich-themes.ts`, `scripts/tli/calculate-comparisons.ts`

**구현**:

```
해법: 테마가 활성이었던 기간의 "일평균 뉴스 건수"를 스냅샷으로 저장.
themes 테이블에 avg_daily_news 컬럼 추가 또는 enrichment 시점에 계산.

enrichThemes에서:
  - 활성 테마: 현재 30일 뉴스 데이터 사용 (기존)
  - 비활성 테마: totalDays 기간 내 총 뉴스 / totalDays 사용 (스냅샷)
```

**변경 1**: `calculate-comparisons.ts:117`

```typescript
// 변경 전
batchQuery('news_metrics', 'theme_id, article_count', themeIds, q => q.gte('time', daysAgo(30)))

// 변경 후: 비활성 테마는 전체 기간 뉴스 로딩
const activeIds = themes.filter(t => t.is_active).map(t => t.id)
const inactiveIds = themes.filter(t => !t.is_active).map(t => t.id)

const [newsActive, newsInactive] = await Promise.all([
  batchQuery('news_metrics', 'theme_id, article_count', activeIds, q => q.gte('time', daysAgo(30))),
  batchQuery('news_metrics', 'theme_id, article_count, time', inactiveIds), // 전체 기간
])
```

**변경 2**: `enrich-themes.ts`에서 비활성 테마 뉴스 정규화

```typescript
// 비활성 테마: 일평균 뉴스 × 30 (활성 테마와 동일 스케일)
const totalNews = newsRows.reduce((s, r) => s + r.article_count, 0)
const dailyAvg = totalDays > 0 ? totalNews / totalDays : 0
const normalizedTotalNews = dailyAvg * 30 // 30일 기준으로 정규화
```

**AC**:
- [ ] 비활성 테마 뉴스 전체 기간 로딩
- [ ] 일평균 뉴스 × 30 정규화로 활성/비활성 스케일 일치
- [ ] 비활성 테마 newsIntensity가 0이 아닌 값을 갖는지 검증
- [ ] 기존 활성 테마 로직 변경 없음

---

### 3.2 계절성 보정 [P2#13]

**문제**: 설/추석 기간 DataLab 관심도 급감, 거래량 0 → feature 왜곡.

**파일**: `lib/tli/constants/holidays.ts` (신규), `lib/tli/comparison/features.ts`

**구현**:

```typescript
// lib/tli/constants/holidays.ts
// 한국 공휴일 (증시 휴장일) — 매년 갱신 필요
export const KR_HOLIDAYS_2026: string[] = [
  '2026-01-01', // 신정
  '2026-02-16', '2026-02-17', '2026-02-18', // 설 연휴
  '2026-03-01', // 삼일절
  '2026-05-05', // 어린이날
  '2026-06-06', // 현충일
  '2026-08-15', // 광복절
  '2026-10-03', // 개천절
  '2026-10-04', '2026-10-05', '2026-10-06', // 추석 연휴
  '2026-10-09', // 한글날
  '2026-12-25', // 크리스마스
]

/** 날짜가 공휴일 ±1일 이내인지 확인 */
export function isHolidayPeriod(dateStr: string): boolean {
  const dt = new Date(dateStr).getTime()
  const margin = 86400000 // ±1일
  return KR_HOLIDAYS_2026.some(h => Math.abs(new Date(h).getTime() - dt) <= margin)
}
```

**features.ts 변경**: 피처 추출 시 holiday 데이터 보간

```typescript
// extractFeatures에 holidayDates 파라미터 추가 (optional)
// interestValues에서 holiday 기간 값을 전후 평균으로 대체
function interpolateHolidays(values: number[], dates: string[]): number[] {
  return values.map((v, i) => {
    if (!isHolidayPeriod(dates[i])) return v
    const prev = i > 0 ? values[i - 1] : v
    const next = i < values.length - 1 ? values[i + 1] : v
    return (prev + next) / 2
  })
}
```

**AC**:
- [ ] KR_HOLIDAYS 상수 정의
- [ ] isHolidayPeriod 함수 + 테스트
- [ ] extractFeatures에서 holiday 보간 적용 (옵션, dates 파라미터 있을 때만)
- [ ] 보간 전/후 momentum, DVI 차이 10% 이내 확인 (비명절 기간)

---

### 3.3 길이 비율 감쇄 패널티 [P2#12]

**문제**: 7일 vs 180일 테마를 50포인트로 통일 시 lifecycle 비율 매핑이 단기 노이즈를
장기 사이클과 동일시.

**파일**: `lib/tli/comparison/composite.ts`

**구현**:

```typescript
// compositeCompare에서 rawSim 계산 후 길이 비율 패널티 적용

// 길이 비율 패널티: ratio > 10이면 최대 20% 감쇄
const lengthRatio = Math.max(current.activeDays, past.totalDays) /
                    Math.max(1, Math.min(current.activeDays, past.totalDays))
const lengthPenalty = lengthRatio > 10 ? 0.80
                    : lengthRatio > 5  ? 0.90
                    : 1.00

const rawSim = (wFeature * featureSim + wCurve * curveSim) * sectorPenalty * lengthPenalty
```

**AC**:
- [ ] lengthRatio 계산
- [ ] ratio > 10: 0.80, ratio > 5: 0.90, 그 외: 1.00
- [ ] composite.test.ts에 극단 길이 비율 테스트 추가
- [ ] 기존 임계값 기반 필터링(`past.totalDays < 14`)과 공존

---

## 4. Phase 4 — 엣지케이스 & 운영 (P2 나머지)

### 4.1 동시 활성 테마 매칭 구분 [P2#11]

**문제**: 활성↔활성 매칭이 "과거 사례 기반 미래 예측"이라는 가치 제안과 충돌.
estimatedDaysToPeak 등 예측 메시지의 의미 약화.

**파일**: `scripts/tli/calculate-comparisons.ts`, `lib/tli/comparison/composite.ts`

**구현**:

```typescript
// calculate-comparisons.ts — findTopMatches에서 활성/비활성 분리

function findTopMatches(...) {
  const inactiveMatches: MatchResult[] = []
  const activeMatches: MatchResult[] = []

  for (const past of allThemes) {
    if (past.id === current.id) continue
    if (past.totalDays < 14 || past.curve.length < 7) continue
    const result = compositeCompare(...)
    if (result.similarity >= threshold) {
      const match = { pastThemeId: past.id, pastThemeName: past.name, ...result }
      if (past.isActive) activeMatches.push(match)
      else inactiveMatches.push(match)
    }
  }

  // 비활성 우선: 비활성 3개 → 부족 시 활성으로 보충
  inactiveMatches.sort((a, b) => b.similarity - a.similarity)
  activeMatches.sort((a, b) => b.similarity - a.similarity)
  const result = inactiveMatches.slice(0, MAX_MATCHES_PER_THEME)
  const remaining = MAX_MATCHES_PER_THEME - result.length
  if (remaining > 0) result.push(...activeMatches.slice(0, remaining))
  return result
}
```

**DB 변경**: theme_comparisons에 `is_past_active BOOLEAN` 컬럼 추가 (nullable, 기존 레코드 호환)

**AC**:
- [ ] 비활성 우선 매칭 로직
- [ ] is_past_active 컬럼 추가 (마이그레이션)
- [ ] 메시지에서 활성 매칭 시 "동시 활성 테마" 표기
- [ ] 예측 스냅샷에서 활성 매칭은 제외 (순수 비교 성능 평가)

---

### 4.2 N<15 Mutual Rank 폴백 [P2#15(원#17)]

**문제**: `mutual-rank.ts:72`의 `1 - mr/N` 선형 변환에서 N<10이면 rank 1-2 차이가 0.20으로
임계값 근처 불안정.

**파일**: `lib/tli/comparison/mutual-rank.ts`, `scripts/tli/calculate-comparisons.ts`

**구현**:

```typescript
// mutual-rank.ts — buildMutualRankIndex 수정

export function buildMutualRankIndex(
  themes: ReadonlyArray<{ id: string; featureVector: number[] }>,
  populationStats: FeaturePopulationStats,
): MutualRankIndex {
  const n = themes.length
  const MIN_MR_POPULATION = 15

  // N < 15: Mutual Rank 구축하지 않음 → compositeCompare에서 z-score 폴백 작동
  if (n < MIN_MR_POPULATION) return { getSimilarity: () => 0 }

  // ... (기존 로직)
}

// buildCurveMutualRankIndex에도 동일 적용
```

**AC**:
- [ ] MIN_MR_POPULATION = 15 상수 도입 (Feature MR + Curve MR 둘 다)
- [ ] N < 15 시 `getSimilarity = () => 0` → z-score 폴백 자동 작동
- [ ] mutual-rank.test.ts에 N=10 케이스 추가
- [ ] 로그 메시지: `Mutual Rank 생략: N=${n} < ${MIN_MR_POPULATION}`

---

### 4.3 리샘플 캐시 길이 일관성 [P2#16(원#18)]

**문제**: `composite.ts:118-119`에서 캐시된 리샘플 곡선의 길이가 새로 계산한 것과
다를 수 있음. `Math.min(cR.length, pR.length)`로 방어하나 의도치 않은 불일치.

**파일**: `lib/tli/comparison/composite.ts`, `scripts/tli/enrich-themes.ts`

**구현**:

```typescript
// composite.ts:118-119 — 캐시 검증 강화

const EXPECTED_RESAMPLE_LEN = 50

const cR = cachedCurrent?.length === EXPECTED_RESAMPLE_LEN
  ? cachedCurrent
  : resampleCurve(normalizeValues(currentCurve))
const pR = cachedPast?.length === EXPECTED_RESAMPLE_LEN
  ? cachedPast
  : resampleCurve(normalizeValues(pastCurve))
```

**AC**:
- [ ] EXPECTED_RESAMPLE_LEN = 50 상수 도입
- [ ] 캐시 길이 !== 50이면 재계산 (기존 `.length` 체크 강화)
- [ ] 테스트에서 길이 불일치 캐시 입력 → 재계산 확인

---

### 4.4 통계적 유의성 유틸리티 [P2#14(원#16)]

**문제**: precision/recall/phase_correct에 p-value, CI 없음.
1.2에서 baseline 비교를 추가하지만, 범용 유틸이 필요.

**파일**: `lib/tli/stats/` (신규 디렉토리)

**구현**:

```typescript
// lib/tli/stats/significance.ts

/** 이항 검정 z-score (정규 근사) */
export function binomialTestZ(observed: number, total: number, baseline: number): {
  z: number; pValue: number; significant: boolean
} {
  if (total === 0) return { z: 0, pValue: 1, significant: false }
  const p = observed / total
  const se = Math.sqrt(baseline * (1 - baseline) / total)
  const z = se > 0 ? (p - baseline) / se : 0
  // 양측 검정 근사
  const pValue = 2 * (1 - normalCDF(Math.abs(z)))
  return { z, pValue, significant: pValue < 0.05 }
}

/** Bootstrap 비율 CI */
export function bootstrapProportionCI(
  successes: number, total: number, B = 2000, alpha = 0.05
): { lower: number; upper: number } {
  const p = successes / total
  const samples: number[] = []
  let seed = 42
  const rand = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff }

  for (let b = 0; b < B; b++) {
    let s = 0
    for (let i = 0; i < total; i++) { if (rand() < p) s++ }
    samples.push(s / total)
  }
  samples.sort((a, b) => a - b)
  return {
    lower: samples[Math.floor(B * alpha / 2)],
    upper: samples[Math.floor(B * (1 - alpha / 2))],
  }
}
```

**AC**:
- [ ] binomialTestZ 함수 구현 + 테스트
- [ ] bootstrapProportionCI 함수 구현 + 테스트
- [ ] evaluate-predictions.ts, evaluate-comparisons.ts에서 활용
- [ ] normalCDF 근사 함수 구현 (Abramowitz & Stegun)

---

### 4.5 증분 캐싱 [P2#14(원#16) — 일부]

**문제**: 매일 모든 테마를 전체 재계산. 비활성 테마의 features/curve는 변하지 않으므로 낭비.

**파일**: `scripts/tli/enrich-themes.ts`

**구현**:

```typescript
// enrich-themes.ts — 비활성 테마 캐시

// 캐시 전략:
// - 활성 테마: 매일 재계산 (데이터가 매일 변경)
// - 비활성 테마: features + resampledCurve를 Map에 캐싱
//   → first_spike_date/interest 변경이 없으면 재사용
//   → 메모리 캐시 (프로세스 내, DB 저장 불필요)

const inactiveCache = new Map<string, {
  features: ThemeFeatures
  resampledCurve: number[]
  curve: TimeSeriesPoint[]
  cacheKey: string // `${firstSpikeDate}_${interestCount}` 기반 무효화
}>()

function getCacheKey(theme: ThemeRow, interestCount: number): string {
  return `${theme.first_spike_date}_${interestCount}`
}
```

**AC**:
- [ ] 비활성 테마 enrichment 캐시 (메모리 Map)
- [ ] cacheKey 기반 무효화 (first_spike_date 또는 interest 개수 변경 시)
- [ ] 캐시 히트율 로그 출력
- [ ] 캐시 미사용 시 기존 동작과 동일 결과 확인

---

### 4.6 일별 유사도 안정성 모니터링 [P2#15(원#17)]

**문제**: 매일 전체 재계산으로 같은 테마 쌍의 유사도가 변동 가능하나 추적 수단 없음.

**파일**: `scripts/tli/calculate-comparisons.ts`

**구현**:

```typescript
// saveMatches 후 안정성 체크 추가

async function checkStability(currentThemeId: string, todayMatches: MatchResult[], today: string) {
  // 어제 매칭 로딩
  const yesterday = new Date(new Date(today).getTime() - 86400000).toISOString().split('T')[0]
  const { data: prevMatches } = await supabaseAdmin
    .from('theme_comparisons')
    .select('past_theme_id, similarity_score')
    .eq('current_theme_id', currentThemeId)
    .eq('calculated_at', yesterday)

  if (!prevMatches?.length) return

  const prevMap = new Map(prevMatches.map(m => [m.past_theme_id, m.similarity_score]))
  let totalDrift = 0, comparisons = 0

  for (const match of todayMatches) {
    const prev = prevMap.get(match.pastThemeId)
    if (prev !== undefined) {
      totalDrift += Math.abs(match.similarity - prev)
      comparisons++
    }
  }

  if (comparisons > 0) {
    const avgDrift = totalDrift / comparisons
    if (avgDrift > 0.10) {
      console.warn(`   ⚠️ 유사도 변동 경고: ${currentThemeId} 평균 drift=${(avgDrift * 100).toFixed(1)}%`)
    }
  }
}
```

**AC**:
- [ ] 전일 대비 유사도 변동폭(drift) 계산
- [ ] drift > 10% 시 콘솔 경고
- [ ] Top 매칭 교체 (어제 1위 → 오늘 탈락) 시 별도 로그
- [ ] 추가 DB 쿼리 최소화 (어제 데이터 1회만 조회)

---

### 4.7 Stage Match 개선 [추가 — Agent 2 제안 반영]

**문제**: `evaluate-comparisons.ts:96`에서 `currentStage === pastStage` 단순 비교.
비활성 과거 테마는 대부분 Decline/Dormant → 거의 항상 불일치.

**파일**: `scripts/tli/evaluate-comparisons.ts`

**구현**:

```typescript
// 변경 전
const stageMatch = currentStage != null && pastStage != null && currentStage === pastStage

// 변경 후: lifecycle 위치 기반 stage 비교
// 과거 테마의 current_day 시점 stage를 로딩하여 비교
const pastStageAtPosition = pastScoresTimeline.find(s => {
  const daysSinceSpike = daysBetween(pastFirstSpike, s.calculated_at)
  return Math.abs(daysSinceSpike - comp.current_day) <= 3 // ±3일 허용
})?.stage

const stageMatch = currentStage != null && pastStageAtPosition != null
  && currentStage === pastStageAtPosition
```

**AC**:
- [ ] 과거 테마의 동일 lifecycle 위치 stage 조회
- [ ] ±3일 허용 범위 (기존 evaluate-predictions 일관)
- [ ] 과거 stage 데이터 없으면 null (기존 동작 유지)
- [ ] stage_match_rate 유의미한 변화 확인

---

## 5. 수용 기준 (전체)

### 빌드 3종 통과
- [ ] `tsc --noEmit` — 에러 0
- [ ] `eslint .` — 에러 0
- [ ] `pnpm test` — 전 테스트 통과

### 정량 목표

| 메트릭 | 현재 | 목표 | 측정 방법 |
|--------|------|------|----------|
| 백테스트 test precision | 미측정 (in-sample만) | out-of-sample 보고 | temporal split 30% |
| Baseline lift | 미측정 | > +10pp vs random | binomial test |
| Skip rate 가시성 | silent | 매 실행 보고 | 콘솔 + DB |
| Curve 스케일 일관성 | 혼합 (선형+지수) | 전부 지수 | 코드 검증 |
| 가중치 불연속 | 20pp 점프 | < 5pp/일 | 시그모이드 |
| Bootstrap CI 소표본 | n=2 허용 | n<5 t-분포 | 테스트 |
| 비활성 뉴스 피처 | 0 (전량 붕괴) | > 0 (정규화) | enrichment 로그 |

### 하위 호환
- [ ] 기존 theme_comparisons 레코드 무효화하지 않음 (신규 필드는 nullable)
- [ ] 기존 API 응답 형태 변경 없음
- [ ] evaluate-comparisons의 ACCURACY_THRESHOLD (0.3) 유지

---

## 6. 구현 순서 및 의존성

```
Phase 1 (측정 인프라) — 다른 Phase 효과 측정의 전제
├── 1.1 Holdout split ─────────────── 독립
├── 1.2 Baseline 비교 ─────────────── 독립
├── 1.3 Survivorship tracking ────── 독립
└── 1.4 Curve 스케일 통일 ──────────── 독립 (테스트 기대값 갱신 필요)

Phase 2 (알고리즘 일관성) — Phase 1 이후 효과 측정 가능
├── 2.1 섹터 친화도 행렬 ──────────── 독립
├── 2.2 VIF 진단 → 조건부 차원 통합 ── 독립 (Isaac 확인 필요)
├── 2.3 시그모이드 가중치 ──────────── 독립
├── 2.4 캘리브레이션 순서 ──────────── 독립
└── 2.5 Bootstrap N 가드 ──────────── 독립

Phase 3 (데이터 품질) — Phase 2와 병렬 가능
├── 3.1 뉴스 밀도 스냅샷 ──────────── 독립
├── 3.2 계절성 보정 ────────────────── 3.1 이후 (features.ts 변경 충돌 방지)
└── 3.3 길이 비율 패널티 ──────────── 독립

Phase 4 (엣지케이스 & 운영)
├── 4.1 활성 매칭 구분 ────────────── 독립 (DB 마이그레이션 필요)
├── 4.2 N<15 MR 폴백 ─────────────── 독립
├── 4.3 리샘플 캐시 검증 ──────────── 독립
├── 4.4 통계 유틸리티 ─────────────── 1.2 이전 필요 (의존)
├── 4.5 증분 캐싱 ─────────────────── 독립
├── 4.6 안정성 모니터링 ───────────── 독립
└── 4.7 Stage match 개선 ──────────── 독립
```

**권장 실행 순서**:
1. 4.4 (통계 유틸리티) — 1.2의 의존성
2. Phase 1 전체 (측정 인프라)
3. Phase 2 + Phase 3 병렬
4. Phase 4 나머지

---

## 7. DB 마이그레이션

```sql
-- 009_comparison_v3_improvements.sql

-- 4.1: 활성 매칭 구분
ALTER TABLE theme_comparisons
ADD COLUMN IF NOT EXISTS is_past_active BOOLEAN;

-- 1.3: survivorship 메트릭을 details에 저장 (스키마 변경 불필요, JSONB)
-- 기존 comparison_calibration.details에 skip_rate, skip_reasons 추가

-- 4.7: 별도 스키마 변경 없음 (기존 stage_match 재활용)
```

---

## 8. 리스크 및 롤백

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 스케일 통일(1.4) 후 precision 하락 | 매칭 품질 저하 | 변경 전 백테스트 → 변경 후 비교. 5% 이상 하락 시 k 파라미터 조정 |
| 섹터 친화도 행렬 오류 | 잘못된 매칭 생성 | 미등록 쌍 0.85 폴백 유지. 행렬은 보수적(0.85-0.95) 범위 |
| VIF 진단 후 차원 축소 | 기존 테스트 전면 수정 | VIF <= 5이면 변경 없음. Isaac 승인 후에만 진행 |
| 뉴스 스냅샷 정규화 부정확 | 과거 테마 뉴스 과대/과소 추정 | 일평균×30 정규화는 보수적 근사. 활성 테마 로직 불변 |
| DB 마이그레이션 | 다운타임 | nullable 컬럼 추가만 (ALTER TABLE ADD COLUMN). 무중단 |

**롤백 전략**: 각 Phase는 독립적이므로 문제 발생 시 해당 Phase만 revert 가능.
composite.ts 변경은 git revert 한 번으로 원복.

---

## 9. Finding → 구현 매핑 (추적표)

| Finding | Severity | Section | Status |
|---------|----------|---------|--------|
| #1 백테스트 split 부재 | P1 | 1.1 | ⬜ |
| #2 Baseline 비교 없음 | P1 | 1.2 | ⬜ |
| #3 Survivorship bias | P1 | 1.3 | ⬜ |
| #4 Curve 스케일 불일치 | P1 | 1.4 | ⬜ |
| #5 섹터 패널티 고정값 | P2 | 2.1 | ⬜ |
| #6 다중공선성 미검증 | P2 | 2.2 | ⬜ |
| #7 가중치 불연속 | P2 | 2.3 | ⬜ |
| #8 캘리브레이션 순서 | P2 | 2.4 | ⬜ |
| #9 Bootstrap n<5 | P2 | 2.5 | ⬜ |
| #10 뉴스 30일 윈도우 | P2 | 3.1 | ⬜ |
| #11 활성 매칭 의미론 | P2 | 4.1 | ⬜ |
| #12 길이 비율 왜곡 | P2 | 3.3 | ⬜ |
| #13 계절성 미처리 | P2 | 3.2 | ⬜ |
| #14 전체 재계산 비효율 | P2 | 4.5 | ⬜ |
| #15 모니터링 부재 | P2 | 4.6 | ⬜ |
| #16 통계적 유의성 | P2 | 4.4 | ⬜ |
| #17 N<10 MR 저해상도 | P2 | 4.2 | ⬜ |
| #18 캐시 길이 불일치 | P2 | 4.3 | ⬜ |
| +α Stage match 개선 | P2 | 4.7 | ⬜ |
