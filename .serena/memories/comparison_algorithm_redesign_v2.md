# Comparison Algorithm Redesign v2 (Feb 2026)

## Overview
Full redesign of the theme comparison algorithm to fix 6 CRITICAL bugs, improve wording, and fix theme age issues.
Branch: `compare`

## Key Changes

### 1. Mutual Rank 알고리즘 (Feb 11, NEW)
- **File**: `lib/tli/comparison/mutual-rank.ts` (87줄)
- centroid dominance 방지: 모집단 중심 테마(메타버스 등)가 모든 테마와 높은 유사도를 보이는 문제 해결
- 알고리즘: z-score 정규화 → 쌍별 유클리디안 거리 → 순위 부여 → sqrt(rankA→B × rankB→A) → 선형 정규화
- 엣지케이스: N<2 가드, N=2 division-by-zero 가드 (`maxRank <= 1 ? 1.0`), featureVector 빈 배열 가드
- O(N² log N) — N=300 기준 <50ms
- `Float64Array`(거리), `Uint16Array`(순위) 사용
- `compositeCompare`에 `precomputedFeatureSim` 파라미터로 주입

### 2. 2-Pillar 복합 비교 (3-Pillar에서 변경)
- **File**: `lib/tli/comparison/composite.ts` (187줄)
- 키워드는 점수 미반영 (표시용) → 2-Pillar: feature + curve
- 특성 유사도 우선순위: Mutual Rank → z-score 유클리디안 폴백 → 코사인 폴백
- 적응적 가중치: 14일+ → feature:0.40/curve:0.60, 7-13일 → 0.60/0.40, <7일 → 1.00/0.00
- 섹터 교차 패널티: 0.85 (기존 0.7에서 변경)
- weight cap 0.65 제거 (Mutual Rank가 대체)

### 3. Score 기반 예측 (Feb 11, NEW)
- **File**: `lib/tli/prediction.ts` (195줄), `prediction-helpers.ts` (64줄)
- `calculatePrediction`에 `score?: number` 파라미터 추가
- `derivePhase`: score≥75 → at-peak, ≥55 → near-peak, <25 → declining/pre-peak, 25-54 → 비교 데이터
- `deriveMomentum`: score≥65 → accelerating, ≥35 → stable, <35 → 비교 데이터 폴백
- `deriveRisk`: score≥80 → high, ≥60 → moderate, ≥35 → low, <35 → phase 폴백
- 낮은 점수(<35)는 상승/하락 구분 불가 → 무조건 비교 데이터 기반 폴백
- `buildPhaseMessage`, `buildKeyInsight`에 score 기반 메시지 추가
- snapshot-predictions.ts는 score 미전달 (의도적: 비교 알고리즘 순수 성능 평가용)

### 4. Similarity Function: `exp(-distance * 0.7)` (폴백용)
- **File**: `lib/tli/comparison/similarity.ts:109`
- Mutual Rank가 1순위, z-score 유클리디안은 폴백으로 전환
- distance=0→1.0, 0.5→0.70, 1.0→0.50, 2.0→0.25

### 5. Curve Similarity: RMSE + Derivative Correlation
- **File**: `lib/tli/comparison/composite.ts:104-130`
- RMSE shape similarity (60% weight): `1 - rmse * 2.5`
- Derivative correlation (40% weight): Pearson on diff(curve)
- 선형 곡선은 미분 상관=0 → curveSim≈0.6 (정상)

### 6. Feature Vector: 5D → 7D
- **File**: `lib/tli/comparison/features.ts`
- Added `priceChangePct` ([-50,+50]% → [0,1]) and `volumeIntensity` (max 50M shares)

### 7. findPeakDay Sentinel: -1
- **File**: `lib/tli/comparison/timeline.ts:40-51`
- Returns -1 for empty data or all-zero values

### 8. Prediction Quality Gate
- **File**: `lib/tli/prediction.ts:142-143`
- Filters individual comparisons with `pastTotalDays < 14`
- `daysSinceSpike` capped at 365

### 9. 헤더 레이아웃 통일 (Feb 11)
- **File**: `app/themes/[id]/_components/comparison-list/index.tsx` (85줄)
- StockList와 동일: `px-4 py-3.5 border-b` + count badge + subtitle
- GlassCard: `h-full overflow-hidden flex flex-col`

### 10. UI Enterprise Review Improvements (Feb 11)
- `config.ts`: `PHASE_COLORS.dot` 데드 프로퍼티 제거
- `detail-content.tsx`: `idx >= 0` 방어 가드 추가, `score={theme.score.value}` 전달
- 전체 영어 주석 → 한글화

### 11. enrich-themes.ts Extraction
- **File**: `scripts/tli/enrich-themes.ts`
- Contains: `enrichThemes()`, `computePopulationStats()`, `resolveFirstSpikeDate()`

### 12. calculate-comparisons.ts 최적화
- **File**: `scripts/tli/calculate-comparisons.ts` (196줄)
- Mutual Rank 인덱스 구축 + findTopMatches에 주입
- 날짜 헬퍼 `daysAgo()` 도입으로 196줄로 압축
- 임계값: 0.30 (기존 0.40에서 변경)

### 13. 테스트 갱신
- `composite.test.ts`: 섹터 패널티 0.7→0.85, 가중치 주석 갱신, threshold 조정, precomputedFeatureSim 추가

## Files Modified (25+ total)
- `lib/tli/comparison/mutual-rank.ts` — NEW: Mutual Rank 알고리즘
- `lib/tli/comparison/composite.ts` — 2-Pillar, precomputedFeatureSim, 섹터패널티 0.85
- `lib/tli/comparison/similarity.ts` — exp scaling 0.7 (폴백)
- `lib/tli/comparison/features.ts` — 7D vector
- `lib/tli/comparison/timeline.ts` — findPeakDay sentinel
- `lib/tli/prediction.ts` — score 기반 phase/momentum/risk
- `lib/tli/prediction-helpers.ts` — score 기반 메시지
- `scripts/tli/calculate-comparisons.ts` — Mutual Rank 통합, 196줄
- `scripts/tli/enrich-themes.ts` — 보강 로직 분리
- `app/themes/[id]/_components/comparison-list/index.tsx` — 헤더 통일
- `app/themes/[id]/_components/theme-prediction/index.tsx` — score prop
- `app/themes/[id]/_components/theme-prediction/config.ts` — dot 제거
- `app/themes/[id]/_components/detail-content.tsx` — score 전달, idx 가드
- `lib/tli/__tests__/composite.test.ts` — 기대값 갱신
