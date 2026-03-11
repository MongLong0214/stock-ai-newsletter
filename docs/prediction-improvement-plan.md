# TLI 예측 시스템 재설계 계획 v2

> 작성: 2026-02-27 | 기반: 실측 데이터 검증 + 3인 전문가 팀 분석
> v1 폐기 사유: 핵심 가정(Stage 14일 지속률 65~85%) 실측 23.4%로 붕괴
> 목표: 문제 재정의 → 실현 가능한 개선 → 단계적 검증

---

## 1. v1 계획 폐기 사유 (교훈)

### 1.1 실측 데이터로 검증한 결과

| v1 가정 | v1 기대값 | 실측값 | 판정 |
|---------|----------|--------|------|
| Stage 14일 지속률 | 65~85% | **23.4%** | 붕괴 |
| Stage-based Phase 효과 | +18pp | **+2.1pp (비유의)** | 붕괴 |
| Peak 14일 지속 | 가정 암묵적 | **0.0%** (20건 중 0건) | 붕괴 |
| 누적 효과 | +30pp 단순합산 | 비가산적 (Phase 1 후 error profile 변경) | 설계 오류 |

### 1.2 근본 원인

1. **미검증 가정에 기대값 선반영**: Stage 지속률을 측정하지 않고 65~85%로 가정
2. **평가 함수 오염**: evaluate-predictions.ts가 `snapshot_date + 14일`이 아닌 **평가 시점 최신 stage** 사용 → horizon 오염
3. **정보이론적 한계 무시**: 14일 전이 행렬의 MI = 0.055 bits (2.8%) → 예측 불가 구간

### 1.3 교훈 (재발 방지)

- **모든 기대값은 실측 쿼리로 사전 검증 후에만 확정**
- **기대 효과는 단순합산 금지** — holdout 검증만 인정
- **평가 함수의 정확한 동작을 코드 레벨로 확인**

---

## 2. 실측 데이터 요약

### 2.1 14일 Stage 전이 행렬

```
             Emerging  Growth   Peak    Decline  Dormant
Emerging     44%       20%      16%     20%      0%
Growth       33%       31%      13%     22%      0%
Peak         40%       30%      0%      30%      0%
Decline      36%       22%      22%     19%      0%
Dormant      38%       34%      13%     10%      6%
```

**Row Entropy**: 모든 행이 최대 엔트로피의 87~99%. Peak→?는 3상태 균등분포(99.1%).
**상호정보량 MI(X_t; X_{t+14}) = 0.055 bits** — 현재 Stage가 14일 후에 대해 정보 없음.

### 2.2 현재 시스템 성능

| 지표 | 값 |
|------|-----|
| Phase 적중률 | 47.2% (137/290) |
| Majority baseline (전부 Peak) | 38.6% |
| Majority 대비 향상 | +8.6pp |
| actual_stage 분포 | Peak 37.8%, Growth 26.4%, Emerging 22.3%, Decline 13.5% |
| 비교 커버리지 | 5.8% (활성 테마 중 예측 가능) |

### 2.3 시스템 시상수 분석

| 메커니즘 | 시상수 | 14일 잔존 |
|---------|--------|----------|
| EMA (α=0.4) | Half-life ≈ 2일 | 0.078% |
| Hysteresis (2일) | 전이 주기 2~3일 | 5~7회 전이 |
| DataLab 배치 | 일별 독립 | 0% 상관 |

**시스템의 예측 가능 지평: 3~5일.** 14일은 이 지평의 3~5배.

### 2.4 Stage 그룹핑 분석

{Emerging, Growth} = "상승" vs {Decline, Dormant} = "하락" 2분류 시:

| 시작 | →상승 | →하락 | →Peak |
|------|-------|-------|-------|
| Emerging | 64% | 20% | 16% |
| Growth | 64% | 22% | 13% |
| Peak | 70% | 30% | 0% |
| Decline | 58% | 19% | 22% |
| Dormant | 72% | 16% | 13% |

**모든 시작 Stage에서 "상승" 도착이 58~72%.** 그룹핑해도 차별화 불가.

### 2.5 평가 함수 오염 (신규 발견)

`evaluate-predictions.ts:32-48`에서 `lifecycle_scores`를 `calculated_at DESC`로 정렬 후 **최신 stage**를 actual로 사용.
→ snapshot_date + 14일의 stage가 아닌 **평가 실행 시점의 stage** → horizon 가변적.

---

## 3. 문제 재정의

### 3.1 기존 문제 (폐기)

~~"14일 후 5-Phase 예측 적중률 47% → 68%"~~

### 3.2 새 문제 정의

**"7일 후 3-Phase 예측 — 실용적 정확도 + 차별화 달성"**

변경 근거:

| 변경 | 근거 |
|------|------|
| 14일 → **7일** | 시스템 시상수 ~2일. 7일은 예측 가능 지평 내. 14일에서 MI=0.055→7일에서 ~0.15 bits (3배) |
| 5-Phase → **3-Phase** | near-peak(Growth 1개만 정답, ceiling 31%), at-peak(Peak 지속률 0%) 구조적 불가. 5분류 = 2.32bits 필요, MI로 지원 불가 |
| Phase 재정의 | Rising/Hot/Cooling — 투자 판단과 직접 연결, 대칭적 매핑 |

### 3.3 새 Phase 체계

| Phase | 포함 Stage | 투자 시그널 | 매핑 대칭성 |
|-------|-----------|-----------|------------|
| **Rising** | Emerging, Growth | 관심 상승 — 주목 | 2 Stage |
| **Hot** | Peak | 관심 정점 — 주의 | 1 Stage |
| **Cooling** | Decline, Dormant | 관심 하락 — 회피 | 2 Stage |

### 3.4 달성 가능한 목표치

| 지표 | 현재 (14일, 5P) | 목표 (7일, 3P) | 근거 |
|------|----------------|---------------|------|
| Phase 적중률 | 47.2% | **60~65%** | 7일 지속률 ~45% + 3-Phase 대칭 매핑 |
| Majority 대비 Δ | +8.6pp | **+20~25pp** | majority baseline ~40% |
| 차별화 능력 | 있음 | **개선** | 3-Phase가 더 균형된 분포 |

---

## 4. 사전 검증 게이트 (코드 변경 전 필수)

### Gate 1: 7일/5일/3일 Stage 지속률 실측

```sql
-- validate-stage-persistence.ts를 수정하여 여러 윈도우 실측
-- 14일과 동일한 방식으로 7일, 5일, 3일 측정
```

**진행 기준**:
- 7일 지속률 ≥ 40% → Phase 1 진행
- 7일 지속률 35~40% → 3-Phase로만 진행 (5-Phase 불가)
- 7일 지속률 < 35% → 5일로 추가 단축 검토, 또는 예측 폐기 → 순수 진단 전환

### Gate 2: 평가 함수 오염 수정 후 재측정

현재 47.2%가 horizon 오염된 수치인지 확인:

```typescript
// evaluate-predictions.ts 수정:
// 현재: 최신 stage 사용
// 수정: snapshot_date + EVALUATION_WINDOW 시점의 stage 사용
const targetDate = new Date(snapshot.snapshot_date)
targetDate.setDate(targetDate.getDate() + EVALUATION_WINDOW)
const targetDateStr = targetDate.toISOString().slice(0, 10)
// lifecycle_scores에서 targetDate에 가장 가까운 score 사용
```

### Gate 3: 3-Phase 재분류 시뮬레이션

코드 변경 없이 기존 290건 데이터로 3-Phase 적중률 시뮬레이션:

```sql
-- 기존 evaluated 스냅샷에 3-Phase 재분류 적용
-- Rising: actual_stage IN ('Emerging', 'Growth')
-- Hot: actual_stage = 'Peak'
-- Cooling: actual_stage IN ('Decline', 'Dormant')
```

---

## 5. 구현 계획

### Phase 0: 사전 검증 (코드 변경 최소, 1~2일)

| 순서 | 작업 | 파일 | 산출물 |
|------|------|------|--------|
| 0a | 7일/5일/3일 지속률 실측 | `validate-stage-persistence.ts` 수정 | 지속률 테이블 |
| 0b | 평가 함수 오염 수정 | `evaluate-predictions.ts` | 보정된 47.2% 재측정 |
| 0c | 3-Phase 시뮬레이션 | 새 검증 스크립트 | 3-Phase 기대 적중률 |

**Gate 판정**: 0a~0c 결과에 따라 Phase 1 진행 여부 결정.

### Phase 1: 평가 윈도우 7일 전환 (1~2일)

| 순서 | 작업 | 파일 | 규모 |
|------|------|------|------|
| 1a | EVALUATION_WINDOW = 7 | `evaluate-predictions.ts` | 1줄 |
| 1b | snapshot-predictions에 score/stage 전달 | `snapshot-predictions.ts` | ~20줄 |
| 1c | UI에서 "7일 전망"으로 표기 변경 | 프론트엔드 | ~5줄 |
| 1d | 검증: 7일 후 평가 사이클 대기 | — | 7일 대기 |

**검증**: 1d 완료 후 새 적중률 측정. 기대: 47% → 55~60%.

### Phase 2: 3-Phase 재분류 (2~3일, Phase 1 검증 후)

| 순서 | 작업 | 파일 | 규모 |
|------|------|------|------|
| 2a | Phase 타입 축소 (5→3) | `lib/tli/types.ts` 또는 `prediction.ts` | ~20줄 |
| 2b | STAGE_TO_PHASE 재매핑 | `prediction.ts` | ~10줄 |
| 2c | phaseToStageMap 대칭화 | `evaluate-predictions.ts` | ~10줄 |
| 2d | derivePhaseFallback 재작성 | `prediction.ts` | ~30줄 |
| 2e | UI Phase 표시 변경 | 프론트엔드 | ~30줄 |
| 2f | prediction-helpers 메시지 수정 | `lib/tli/prediction-helpers.ts` | ~20줄 |
| 2g | 검증: 2주 데이터 축적 후 측정 | — | 2주 대기 |

**검증**: 2g 완료 후 측정. 기대: 55~60% → 60~65%.

### Phase 3: Score Trajectory 보강 (조건부, 3~5일)

Phase 2 검증 결과 65% 미달 시에만 진행.

| 순서 | 작업 | 파일 | 규모 |
|------|------|------|------|
| 3a | score 추세 피처 추출 (7일 기울기, 3일 기울기) | `snapshot-predictions.ts` | ~30줄 |
| 3b | score-trend 기반 Phase 보정 | `prediction.ts` | ~50줄 |
| 3c | 검증 | — | 2주 대기 |

**검증**: 3c 완료 후 측정. 기대: +3~5pp 추가.

---

## 6. 평가 체계 개선

### 6.1 평가 함수 수정 (Phase 0b)

```typescript
// 현재 (오염): 최신 stage 사용
const latestScores = new Map()
for (const s of scores) {
  if (!latestScores.has(s.theme_id)) {
    latestScores.set(s.theme_id, { score: s.score, stage: s.stage })
  }
}

// 수정: snapshot_date + EVALUATION_WINDOW에 가장 가까운 stage 사용
const targetScores = new Map()
for (const snapshot of snapshots) {
  const targetDate = addDays(snapshot.snapshot_date, EVALUATION_WINDOW)
  const closest = scores
    .filter(s => s.theme_id === snapshot.theme_id)
    .reduce((best, s) => {
      const diff = Math.abs(dateDiff(s.calculated_at, targetDate))
      return diff < best.diff ? { ...s, diff } : best
    }, { diff: Infinity })
  if (closest.diff <= 3) { // 3일 이내 데이터만 허용
    targetScores.set(snapshot.id, { score: closest.score, stage: closest.stage })
  }
}
```

### 6.2 메트릭 추가

| 메트릭 | 목적 | 구현 |
|--------|------|------|
| **macro F1** | class imbalance 보정 | 3-Phase 각 F1의 평균 |
| **majority baseline 대비 향상** | metric gaming 방지 | Δ = accuracy - max(class_proportion) |
| **balanced accuracy** | class 균형 평가 | per-class recall의 평균 |
| **Δscore MAE** | 연속값 예측 정밀도 | 실제 - 예측 점수 변화량 |

### 6.3 검증 프로토콜

모든 개선안에 대해:

1. **사전**: 코드 변경 전 SQL 시뮬레이션으로 기대 효과 측정
2. **holdout**: 변경 후 새 데이터로만 평가 (기존 데이터 재사용 금지)
3. **비교**: majority baseline, "항상 Rising" baseline과 반드시 비교
4. **통계 검정**: McNemar's test (N≥200, MDE=+10pp, α=0.05)

---

## 7. 파이프라인 구조적 문제 수정

### 7.1 score/stage 미전달 (Phase 1b)

**현재** (`snapshot-predictions.ts:83`):
```typescript
calculatePrediction(theme.first_spike_date, inputs, today)
// score, stage 인자 누락
```

**수정**: lifecycle_scores에서 현재 score/stage 조회 후 전달.
이 수정 자체는 +2.1pp(14일)이지만, 7일 윈도우 + 3-Phase에서는 더 큰 효과 기대.

### 7.2 비교 커버리지 5.8% 문제

현재 94.2% 테마가 비교 데이터 부족으로 예측 불가.

**접근**: 비교 커버리지 확대가 아닌, **비교 없이도 예측 가능한 모델로 전환**.
- score/stage + score 추세만으로 Phase 판정 → 커버리지 100%
- 비교 데이터는 보조 시그널로만 활용 (있으면 가산, 없어도 동작)

### 7.3 derivePhaseFallback 재작성 (Phase 2d)

현재 시간 비율 기반 → **score 추세 + 현재 stage 기반**으로 전환:

```
score 상승 추세 + (Emerging|Growth) → Rising
score 고위 (≥70) + 정체/하락 조짐 → Hot
score 하락 추세 + (Decline|Dormant) → Cooling
```

---

## 8. 대안 시나리오

### 시나리오 A: 예측 유지 + 재설계 (본 계획)

- 7일 + 3-Phase → 60~65% 목표
- 구현 비용: ~150줄 코드 + 2~4주 검증
- 사용자 가치: "7일 후 방향 전망" 제공

### 시나리오 B: 예측 폐기 → 순수 진단

- Phase 예측 기능 제거
- "현재 상태 + 추세" 리포팅만 유지
- 구현 비용: 코드 삭제 (~200줄 제거)
- 사용자 가치: 오판 리스크 즉시 제거, 신뢰도 상승

### 시나리오 C: Binary 예측 (상승/하락)

- 3-Phase 대신 2-Phase (Rising/Not-Rising)
- 기대 적중률: 방향 정확도 58~65%
- 구현 비용: ~100줄
- 사용자 가치: 가장 단순하고 직관적

### 의사결정 기준

| Gate 결과 | 진행 경로 |
|----------|----------|
| 7일 지속률 ≥ 40% | → 시나리오 A (본 계획) |
| 7일 지속률 35~40% | → 시나리오 C (Binary) |
| 7일 지속률 < 35% | → 시나리오 B (폐기→진단) |

---

## 9. 수정 파일 목록

### Phase 0 (사전 검증)

| 파일 | 작업 | Level |
|------|------|-------|
| `scripts/tli/validate-stage-persistence.ts` | 7일/5일/3일 윈도우 추가 | 0 |
| `scripts/tli/evaluate-predictions.ts` | horizon 오염 수정 | 0 |
| 새 검증 스크립트 | 3-Phase 시뮬레이션 | 0 |

### Phase 1 (7일 전환)

| 파일 | 작업 | Level |
|------|------|-------|
| `scripts/tli/evaluate-predictions.ts` | EVALUATION_WINDOW = 7 | 0 |
| `scripts/tli/snapshot-predictions.ts` | score/stage 전달 | 0 |
| 프론트엔드 | "7일 전망" 표기 | 0 |

### Phase 2 (3-Phase)

| 파일 | 작업 | Level |
|------|------|-------|
| `lib/tli/prediction.ts` | Phase 타입 + STAGE_TO_PHASE + derivePhaseFallback | 0 |
| `scripts/tli/evaluate-predictions.ts` | phaseToStageMap 재정의 | 0 |
| `lib/tli/prediction-helpers.ts` | 메시지 수정 | 0 |
| 프론트엔드 (Phase 표시) | Rising/Hot/Cooling UI | 0 |

### Phase 3 (조건부)

| 파일 | 작업 | Level |
|------|------|-------|
| `scripts/tli/snapshot-predictions.ts` | score 추세 피처 추출 | 0 |
| `lib/tli/prediction.ts` | score-trend 보정 | 0 |

**전체 Level 0** — DB 스키마 변경 없음, 외부 API 추가 없음.

---

## 10. 모니터링 지표

| 지표 | 측정 주기 | Phase 1 목표 | Phase 2 목표 |
|------|----------|-------------|-------------|
| phase_correct (전체) | 주간 | ≥ 55% | ≥ 60% |
| macro F1 | 주간 | ≥ 0.45 | ≥ 0.55 |
| majority 대비 Δ | 주간 | ≥ +15pp | ≥ +20pp |
| balanced accuracy | 주간 | ≥ 50% | ≥ 55% |
| 비교 커버리지 | 일간 | ≥ 15% | ≥ 15% |

---

## 11. 타임라인

```
Day 1-2:   Phase 0 — 사전 검증 (Gate 1/2/3)
Day 2:     Isaac 판정 — 시나리오 A/B/C 중 선택
Day 3-4:   Phase 1 — 7일 전환 + score/stage 전달
Day 4-11:  Phase 1 검증 — 7일 대기 후 적중률 측정
Day 12-14: Phase 2 — 3-Phase 재분류 (Phase 1 목표 달성 시)
Day 14-28: Phase 2 검증 — 2주 데이터 축적
Day 28+:   Phase 3 — 조건부 (Phase 2 목표 미달 시)
```

---

## 부록 A: 정보이론 분석 상세

### 전이 행렬 Row Entropy

| 시작 Stage | 도달 가능 상태 | Row Entropy (bits) | 최대 대비 |
|-----------|-------------|-------------------|---------|
| Emerging | 4 | 1.87 | 93.5% |
| Growth | 4 | 1.91 | 95.5% |
| Peak | 3 | 1.57 | 99.1% |
| Decline | 4 | 1.95 | 97.5% |
| Dormant | 5 | 2.02 | 87.0% |

### 상호정보량

```
H(X_{t+14})       = 1.988 bits
H(X_{t+14}|X_t)   = 1.933 bits
I(X_{t+14}; X_t)  = 0.055 bits (2.8%)
```

14일 윈도우에서 현재 Stage는 미래에 대해 사실상 정보 없음.
7일 윈도우에서 예상 MI ≈ 0.15 bits (3배 증가, 실측 필요).

## 부록 B: 구현 현황 (2026-02-27)

### 완료

| 작업 | 파일 | 상태 |
|------|------|------|
| Gate 1: 멀티 윈도우 지속률 실측 | `validate-stage-persistence.ts` | ✅ 7일 3-Phase 51.4% |
| Gate 2: Horizon 오염 검증 | `validate-horizon-fix.ts` | ✅ +0.5pp (무시 가능) |
| Gate 3: 3-Phase 시뮬레이션 | `validate-stage-persistence.ts` | ✅ 14일 26.9% (7일 필수 확인) |
| Phase 1a: EVALUATION_WINDOW 7일 | `evaluate-predictions.ts` | ✅ |
| Phase 1b: score/stage 전달 | `snapshot-predictions.ts` | ✅ |
| Phase 2a: Phase 타입 5→3 | `prediction.ts` | ✅ rising/hot/cooling |
| Phase 2b: STAGE_TO_PHASE 재매핑 | `prediction.ts` | ✅ |
| Phase 2c: phaseToStageMap 하위 호환 | `evaluate-predictions.ts` | ✅ v1+v2 공존 |
| Phase 2d: derivePhaseFallback 재작성 | `prediction.ts` | ✅ 3-Phase |
| Phase 2e: UI Phase 표시 | `config.ts` | ✅ 3단계 라벨/색상 |
| Phase 2f: prediction-helpers 메시지 | `prediction-helpers.ts` | ✅ Cooling 완화 포함 |
| 방법론 페이지 3-Phase 반영 | `methodology-content.tsx` | ✅ |
| SEO 메타데이터 업데이트 | `layout.tsx` | ✅ |
| 빌드 3종 | tsc + eslint + next build | ✅ 에러 0 |
| 테스트 | prediction.test.ts 18/18 | ✅ |

### 대기 중

| 작업 | 예상 시점 |
|------|----------|
| 7일 데이터 축적 → 실측 적중률 확인 | 배포 후 7일 |
| 55% 미달 시 Binary 전환 검토 | 실측 후 판단 |
| Phase 3: Score Trajectory 보강 | Phase 2 검증 후 조건부 |

### 최종 리뷰 결과

| 리뷰어 | 판정 | 핵심 |
|--------|------|------|
| code-reviewer | APPROVE | 이슈 0건, 프로덕션 레디 |
| market-analyst | 조건부 가치 추가 (6.5/10) | Rising 60.8% 킬러, Cooling 38% baseline 미달 |
| boomer | RECONSIDER → 수정 반영 | Cooling 완화 + 방법론 정합 완료 |

---

## 부록 C: 이전 계획 대비 변경 사항

| 항목 | v1 | v2 | 변경 근거 |
|------|----|----|----------|
| 목표 | 68% | 60~65% | 정보이론적 상한 반영 |
| 평가 윈도우 | 14일 | 7일 | 시상수 분석 (half-life 2일) |
| Phase 수 | 5 | 3 | MI vs class 수 불일치 해소 |
| 핵심 전략 | Stage 직접 매핑 | 윈도우 단축 + 재분류 | 실측 지속률 23.4% 반영 |
| 비교 알고리즘 | 개선 (MR, 9D) | 보조로 격하 | trajCorr ~0, 커버리지 5.8% |
| 사전 검증 | 선택 | **필수 (Gate)** | v1 실패 교훈 |
| 기대 효과 검증 | 단순합산 | holdout + McNemar | 비가산성 교훈 |
| 평가 함수 | 그대로 | 오염 수정 | horizon 오염 발견 |
