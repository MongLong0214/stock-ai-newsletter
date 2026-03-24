# PRD: 시장 폭락 예측 엔터프라이즈급 고도화

**Version**: 0.3
**Author**: AI Pipeline
**Date**: 2026-03-24
**Status**: Approved
**Size**: L

---

## 1. Problem Statement

### 1.1 Background
현재 시장 폭락 예측 시스템(`evaluateMarketAssessmentSnapshot`)은 **단순 임계값 기반 3-Tier 시그널 체계**를 사용한다. 06:00 KST에 실행되어 09:00 개장 전 CRASH_ALERT 또는 NORMAL을 판정하며, CRASH_ALERT 시 폭락 분석 파이프라인을 추가 실행한다.

2026-03-24 실제 오탐 사례:
- 미국 3대 지수 모두 +1%대 상승, VIX 하락, 원화 강세
- KOSPI200 미니선물 -6.58% (전일 주간장 종가, 야간 +5.84% 회복)
- → CRASH_ALERT(confidence 84) 오탐 발동

이 오탐은 **전일 주간장 데이터를 야간 실시간으로 오인**한 것이 원인이며, 기본 coherence check를 긴급 패치했지만 근본적인 시스템 고도화가 필요하다.

### 1.2 Problem Definition
단순 임계값 기반 판정 시스템으로는 **False Positive(오탐)**과 **False Negative(미감지)**를 동시에 95% 이상 억제할 수 없다. 시그널 간 가중치, 방향 정합성, VIX 레짐, 데이터 신선도를 종합적으로 고려하는 **가중 스코어링 시스템**이 필요하다.

### 1.3 Impact of Not Solving
- **False Positive**: 구독자에게 잘못된 폭락 경보 → 패닉 유발, 뉴스레터 신뢰도 하락
- **False Negative**: 실제 폭락 미감지 → 서비스 핵심 가치 훼손
- 현재 시스템은 특히 **전일 대폭락 후 야간 반등** 시나리오에 취약

## 2. Goals & Non-Goals

### 2.1 Goals
- [ ] G1: True Positive Rate ≥ 95% — 실제 KOSPI -3% 이상 폭락 시 CRASH_ALERT 감지
- [ ] G2: True Negative Rate ≥ 95% — 비폭락 상황에서 CRASH_ALERT 미발동
- [ ] G3: 역사적 22개 KOSPI 대폭락 사례 중 21개+ 정확 감지 (백테스트)
- [ ] G4: 2026-03-24 같은 야간 반등 시나리오에서 100% NORMAL 판정
- [ ] G5: 기존 API 소스 변경 없이 평가 로직만 개선 (데이터 수집 레이어 유지)

### 2.2 Non-Goals
- NG1: 새로운 외부 API 소스 추가 (Investing.com, Bloomberg 등)
- NG2: WebSocket 실시간 야간선물 연동 (KIS WebSocket)
- NG3: ML/딥러닝 모델 도입
- NG4: UI/뉴스레터 포맷 변경
- NG5: 폭락 분석(crash-analysis) 프롬프트 구조 변경 (severity 기준 등 유지)

## 3. User Stories & Acceptance Criteria

### US-1: 가중 시그널 스코어링
**As a** 뉴스레터 시스템, **I want** 개별 임계값 대신 가중 스코어로 시장 상태를 평가, **so that** 단일 시그널의 노이즈에 흔들리지 않는 종합 판정이 가능하다.

**Acceptance Criteria:**
- [ ] AC-1.1: 각 시그널에 가중치를 부여하고, 아래 공식으로 합산. **crashScore ≥ 55 → CRASH_ALERT, < 55 → NORMAL**
  ```
  signal.clampedDrop = clamp(signal.normalizedDrop, 0, 100)  // 개별 시그널 100 상한
  signal.multiplier = (signal.name === 'VIX') ? regimeMultiplier : 1.0
  signal.contribution = signal.clampedDrop × signal.weight × signal.multiplier × signal.coherenceAdjust
  crashScore = clamp(Σ contributions, 0, 100)
  ```
  - `coherenceAdjust`: coherent_normal=1.0, coherent_crash=1.0, korea_specific(KOSPI=0.8, 이벤트=1.5), mixed(KOSPI=0.5), stale_recovery(KOSPI=0.0)
- [ ] AC-1.2: 초기 가중치 시드값 (백테스트로 튜닝):

| Signal | Weight | normalizedDrop 산정 |
|--------|--------|-------------------|
| US지수 (S&P500 대표) | 0.30 | `abs(min(changePct, 0)) / 3 × 100` (3%=-100pt) |
| KOSPI200 야간/주간 | 0.25 | `abs(min(changePct, 0)) / 2.5 × 100` (2.5%=-100pt) |
| VIX | 0.20 | `max(0, (price - 20) / 30 × 100)` (20=0, 50=100) |
| FX (USD/KRW) | 0.10 | `max(0, change / 20 × 100)` (20원=100pt) |
| 이벤트 (Tier3) | 0.15 | `detectedCount / 3 × 100` (3개+=100pt) |

- [ ] AC-1.3: 기존 3-Tier 시그널은 유지. Tier 분류 후 normalizedDrop 산정의 입력으로 사용
- [ ] AC-1.4: 교차검증 미달(single_source) 시그널은 weight × 0.6 감쇠 적용

### US-2: 방향 정합성 매트릭스 (Direction Coherence)
**As a** 시스템, **I want** US시장과 KOSPI 야간선물의 방향 일치 여부를 검증, **so that** 전일 하락 데이터의 stale 오탐과 한국 단독 위기를 구분할 수 있다.

**Acceptance Criteria (Decision Tree):**
```
1. if (nightSession.kospiMiniFutures exists)
   → effectiveKospi = nightSession data
   → if (effectiveKospi.changePct > -0.5%) → 'coherent_normal'
   → if (effectiveKospi.changePct <= -2.5% AND US 2/3 <= -2%) → 'coherent_crash'
   → if (effectiveKospi.changePct <= -1.5% AND anyEventDetected) → 'korea_specific'
   → else → 'mixed'

2. if (nightSession NOT available AND isPreMarketHours)
   → usUp = US 2/3 changePct > +0.3%
   → kospiDown = dayFutures.changePct <= -1.5%
   → vixCalm = (vix == null OR vix.change < +5pt)
   → fxCalm = (usdKrw == null OR usdKrw.change < +10)
   → noEvent = 5종 이벤트(tariffs/geopolitics/centralBank/financialInstitution/pandemic) 모두 detected=false
   → if (kospiDown AND usUp AND vixCalm AND fxCalm AND noEvent) → 'stale_recovery'
   → if (kospiDown AND !usUp) → 'coherent_crash'
   → if (kospiDown AND usUp AND anyEventDetected) → 'korea_specific'
   → else → 'mixed'

3. else (daytime session, not pre-market)
   → 'coherent_normal' 또는 기존 Tier 로직 그대로
```
- [ ] AC-2.0: `coherent_normal` 판정 시 모든 시그널 weight 1.0× 유지 (정상 계산, 가장 빈번한 비위기 상태)
- [ ] AC-2.1: `stale_recovery` 판정 시 KOSPI 시그널의 crashScore 기여를 0으로 처리
- [ ] AC-2.2: `coherent_crash` 판정 시 KOSPI weight 1.0× 유지
- [ ] AC-2.3: `korea_specific` 판정 시 KOSPI weight 0.8×, 이벤트 weight 1.5× 부스트
- [ ] AC-2.4: `mixed` 판정 시 KOSPI weight 0.5× 감쇠
- [ ] AC-2.5: 야간 데이터 존재 시 야간 기준으로 방향 판정 (Decision Tree §1 우선)

### US-3: 동적 Confidence 산정
**As a** 시스템, **I want** 시그널 조합과 강도에 따라 confidence를 연속적으로 산정, **so that** 하드코딩된 계단식 confidence 대신 정밀한 확신도를 제공한다.

**Acceptance Criteria:**
- [ ] AC-3.1: `confidence = clamp(baseConfidence + validationBonus + coherenceBonus + nightBonus, 50, 99)` 여기서:
  - `baseConfidence = crashScore × 0.85 + 15` (crashScore 55 → confidence ~62, 100 → ~100)
  - `validationBonus = crossValidationRatio × 8` (전부 cross_checked → +8, 절반 → +4)
  - `coherenceBonus`: coherent_crash=+5, korea_specific=+3, mixed=0, stale_recovery=-20
  - `nightBonus`: 야간 데이터 확보 시 +5, 미확보 시 0
- [ ] AC-3.2: CRASH_ALERT 발동 시 confidence ≥ 70 보장. crashScore ≥ 55이지만 confidence < 70이면 NORMAL로 다운그레이드
- [ ] AC-3.4: NORMAL verdict confidence 산정: `normalConfidence = clamp(95 - crashScore × 0.5, 60, 95)` (crashScore 0→95, 50→70). CRASH_ALERT confidence와 별도 공식 적용
- [ ] AC-3.3: confidence 70-79: warning, 80-89: strong, 90+: critical momentum

### US-4: VIX 레짐 적응형 임계값
**As a** 시스템, **I want** 현재 VIX 수준에 따라 폭락 임계값을 조정, **so that** 이미 공포가 높은 환경(VIX>30)과 안정기(VIX<20)를 구분하여 판정한다.

**Acceptance Criteria:**
- [ ] AC-4.1: VIX 레짐 4구간 정의 및 regimeMultiplier:

| Regime | VIX Range | regimeMultiplier (VIX signal) | 설명 |
|--------|-----------|-------------------------------|------|
| low | 0-15 | 1.5 | 안정기 급변은 더 위험 |
| normal | 15-25 | 1.0 | 기본 임계값 유지 |
| elevated | 25-35 | 0.7 | 이미 경계, 추가 변동 감쇠 |
| extreme | 35+ | 0.4 | 이미 공포 반영, 추가 변동 크게 감쇠 |

- [ ] AC-4.2: 레짐 판정은 stateless 단순 구간 매핑 (히스테리시스 없음 — `evaluateMarketAssessmentSnapshot`이 stateless 함수이므로 이전 레짐 참조 불가). 경계값 정확히 low<15, normal<25, elevated<35, extreme≥35
- [ ] AC-4.3: regimeMultiplier는 VIX signal에만 적용. AC-1.1 공식의 `signal.multiplier = (signal.name === 'VIX') ? regimeMultiplier : 1.0`과 일치
- [ ] AC-4.4: VIX 하락(change < 0)은 시장 안정 신호로, VIX normalizedDrop을 0으로 처리

### US-5: 역사적 시나리오 백테스트
**As a** 개발자, **I want** 역사적 KOSPI 대폭락 + 비폭락 시나리오를 테스트 데이터로 검증, **so that** 알고리즘 변경 시 regression을 방지하고 95% 정확도를 증명한다.

**Acceptance Criteria:**
- [ ] AC-5.1: 최소 **16개 폭락 + 15개 비폭락** 시나리오 (31개 총). 위기 유형별 최소 2개씩: 금리, 팬데믹, 무역, 지정학, 금융시스템, 엔캐리/기술. 다중 이벤트 동시 감지 시나리오 최소 2개 포함 (TP-13, TP-16)
- [ ] AC-5.2: 각 시나리오는 실제 시장 데이터 기반 완전한 `MarketAssessmentSnapshot` 생성 (US 3지수 + KOSPI + VIX + FX + 이벤트 + nightSession 모두 명시)
- [ ] AC-5.3: 테스트 실행 시 TP/TN/FP/FN 매트릭스 + 정확도/Recall/Precision 출력
- [ ] AC-5.4: 백테스트 정확도 ≥ 93% (30개 중 2개 이하 오류). **통계적 한계 인정**: 30개 샘플로 90% 신뢰구간 ±9%. 95% 확정은 후속 30일 실전 데이터로 재검증
- [ ] AC-5.5: 비폭락 시나리오에 US market holiday(변동 0%), Partial API failure(VIX cross-check 실패) 포함

### US-6: 강화된 데이터 신선도 검증
**As a** 시스템, **I want** KOSPI 데이터의 신선도를 다중 지표로 검증, **so that** stale 데이터 기반 오탐을 더 강력하게 방지한다.

**Acceptance Criteria:**
- [ ] AC-6.1: staleness 예외규칙은 Decision Tree §2에 통합 (별도 후처리 아님). Decision Tree §2 stale_recovery 판정 전 추가 조건:
  ```
  stale 후보 = (kospiDown AND usUp AND vixCalm AND fxCalm AND noEvent)
  if (stale 후보 AND nikkeiFutures?.confirmed AND nikkeiFutures.changePct <= -2%) → 'mixed' (Nikkei도 하락 → staleness 확신 불가)
  if (stale 후보 AND foreignerNetSelling?.topSellAmountMillion >= 2_000_000) → 'korea_specific' (대량 외국인 매도 → 한국 고유 이슈 가능)
  if (stale 후보) → 'stale_recovery'
  ```
- [ ] AC-6.2: US holiday 처리도 Decision Tree §2에 통합: `if (US 3지수 changePct 모두 0) → 'mixed'` (staleness 판정 불가)
- [ ] AC-6.3: KIS inquire-price 야간 조회 성공 시 display-board 대비 가격 차이 ≥ 0.3%로 신선도 확인
- [ ] AC-6.4: 야간 데이터 확보 시 nightBonus=+5pt. 미확보 시 nightBonus=0 (패널티 없음, base confidence 유지)

## 4. Technical Design

### 4.1 Architecture Overview

```
기존: Snapshot → evaluateMarketAssessmentSnapshot(threshold check) → tier signals → resolve(tier count)
변경: Snapshot → evaluateMarketAssessmentSnapshot → {
        1. Direction Coherence Matrix (방향 정합성)
        2. VIX Regime Detection (레짐 판별)
        3. Staleness Guard (신선도 검증, 강화)
        4. Weighted Signal Scoring (가중 스코어)
        5. Dynamic Confidence (동적 확신도)
      } → MarketAssessmentEvidence (확장) → resolve(score-based)
```

변경 범위:
- `kis-market-assessment.ts`: evaluateMarketAssessmentSnapshot 리팩터링 + 새 스코어링 함수 + directionCoherence + vixRegime
- `gemini-pipeline.ts`: resolveMarketAssessmentFromSnapshot을 crashScore 기반 판정으로 전환
- `market-assessment.ts` 프롬프트: `buildApiSnapshotSection`에 crashScore, directionCoherence, vixRegime을 context로 전달. Tier signals 구조는 유지하되 신규 필드를 "📊 스코어링 컨텍스트" 섹션으로 추가
- 테스트: 백테스트 시나리오 30개+ (15 폭락 + 15 비폭락)

### 4.2 Data Model Changes

`MarketAssessmentEvidence` 확장:
```typescript
export interface MarketAssessmentEvidence {
  // 기존
  tier1Signals: string[];
  tier2Signals: string[];
  tier3Signals: string[];
  supportingNotes: string[];
  kospiDataStale: boolean;
  stalenessNote: string | null;
  // 신규
  crashScore: number;           // 0-100 가중 스코어
  directionCoherence: 'coherent_crash' | 'coherent_normal' | 'stale_recovery' | 'korea_specific' | 'mixed';
  vixRegime: 'low' | 'normal' | 'elevated' | 'extreme';
  crossValidationRatio: number; // 교차검증된 지표 비율 (0-1)
  signalDetails: SignalScoreDetail[];
}

interface SignalScoreDetail {
  name: string;
  normalizedDrop: number;  // 0-100 clamped (원본 시장값을 정규화한 위험 수치)
  weight: number;
  multiplier: number;      // VIX signal만 regimeMultiplier, 나머지 1.0
  coherenceAdjust: number; // directionCoherence에 따른 조정 (0.0~1.5)
  contribution: number;    // normalizedDrop × weight × multiplier × coherenceAdjust
  validated: boolean;      // 교차검증 여부
}
```

### 4.3 API Design
API 엔드포인트 변경 없음. 내부 평가 로직만 변경.

### 4.4 Key Technical Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| 스코어링 방식 | ML모델 / 룰기반 가중합 / 의사결정트리 | 룰기반 가중합 | 해석 가능성, 디버깅 용이, 외부 의존성 없음 |
| VIX 레짐 구분 | 연속 함수 / 구간 상수 | 4구간 상수 | 직관적, 테스트 용이, 충분한 해상도 |
| Confidence 산정 | 하드코딩 / 선형함수 / 시그모이드 | 선형함수 + 클램프 | 예측 가능, 디버깅 용이 |
| 백테스트 형태 | 별도 스크립트 / vitest 케이스 | vitest 케이스 | CI 통합, regression 자동 감지 |

## 5. Edge Cases & Error Handling

| # | Scenario | Expected Behavior | Severity |
|---|----------|-------------------|----------|
| E1 | 전일 -6% 하락 후 야간 +5% 회복 (2026-03-24 실제 케이스) | NORMAL, stale_recovery 판정 | P0 |
| E2 | US -3%, KOSPI -3%, VIX +10 (coherent crash) | CRASH_ALERT, coherent_crash | P0 |
| E3 | US 평탄, KOSPI -3%, 한국 이벤트 감지 | CRASH_ALERT, korea_specific | P0 |
| E4 | 모든 데이터 소스 정상이나 VIX만 -5pt (VIX 하락) | NORMAL, VIX 하락은 안정 신호 | P1 |
| E5 | 야간 데이터 확보 성공, +3% 상승 | NORMAL, 야간 우선 판정 | P1 |
| E6 | 야간 데이터 확보 성공, -4% 하락 | CRASH_ALERT, 야간 기준 판정 | P1 |
| E7 | VIX 이미 45 (극단), 추가 +2pt | 이미 반영된 공포, Tier1 미추가 | P2 |
| E8 | 외국인 2조 순매도 + KOSPI -1% (약한 하락) | Tier2 외국인만, CRASH 미발동 | P2 |
| E9 | 교차검증 불일치 (SerpAPI vs Naver VIX 차이 >3pt) | single_source 처리, 가중치 감소 | P2 |
| E10 | 모든 API 에러, fallback으로 Gemini search만 가능 | 기존 fallback 유지, conservative | P1 |
| E11 | SerpAPI 타임아웃 → VIX cross-check 실패, single_source 격하 | VIX weight × 0.6 감쇠, confidence -4pt | P1 |
| E12 | US market holiday (변동 0%) + KOSPI -3% | Decision Tree §2 AC-6.2에 의해 directionCoherence='mixed', KOSPI weight 0.5× | P1 |
| E13 | 팬데믹 + 유가전쟁 동시 발생 (다중 이벤트) | 이벤트 detectedCount=2, 이벤트 normalizedDrop 증가, score 상승 | P1 |
| E14 | 야간 데이터 확보 실패 + US holiday + KOSPI -2% | coherence='mixed', weight 0.5×, conservative NORMAL | P2 |

## 6. Security & Permissions
N/A — 내부 평가 로직 변경. 외부 접근 제어 변경 없음.

## 7. Performance & Monitoring

| Metric | Target | Measurement |
|--------|--------|-------------|
| 평가 함수 실행 시간 | < 50ms (snapshot 이후) | 함수 내 Date.now() 차이 |
| 전체 snapshot 수집 | < 30s (기존 유지) | 로그 타임스탬프 |
| 백테스트 스위트 | < 500ms | vitest 실행 시간 |

### 7.1 Monitoring & Alerting
- 기존 로깅 유지: `console.log`로 Tier 신호 + 새로 crashScore, directionCoherence, vixRegime 출력
- 판정 결과 로그에 `[SCORE: {N}/100] [COHERENCE: {type}] [VIX_REGIME: {type}]` 추가

## 8. Testing Strategy

### 8.1 Unit Tests
- `evaluateMarketAssessmentSnapshot` 가중 스코어 계산 검증
- 각 SignalScoreDetail의 weight × rawValue 정확성
- VIX 레짐별 임계값 적용 검증
- Direction coherence 분류 검증

### 8.2 Integration Tests
- 전체 snapshot → evaluate → resolve 플로우 검증
- 프롬프트 생성에 새 필드 반영 확인

### 8.3 Edge Case Tests (역사적 백테스트)
**폭락 시나리오 (True Positive 기대) — 15개, 6개 위기 유형:**
1. 2008-10-24 금융위기 (S&P -3.45%, VIX 79.13) [금융시스템]
2. 2008-09-29 리먼 파산 (S&P -8.81%, VIX 46.72) [금융시스템]
3. 2020-03-12 코로나 (S&P -9.51%, VIX 75.47) [팬데믹]
4. 2020-03-16 코로나 서킷 (S&P -11.98%, VIX 82.69) [팬데믹]
5. 2020-02-27 코로나 초기 (S&P -4.42%, VIX 39.16) [팬데믹]
6. 2022-06-13 금리쇼크 (S&P -3.88%, VIX 34.56) [금리]
7. 2018-02-05 VIX 쇼크 (VIX +115%, S&P -4.10%) [금리/기술]
8. 2024-08-05 엔캐리 청산 (Nikkei -12.4%, KOSPI -8.77%) [엔캐리]
9. 2025-04-07 관세 쇼크 (S&P -5.97%, KOSPI -5.57%) [무역]
10. 2018-10-10 무역전쟁 (S&P -3.29%, VIX 22→28) [무역]
11. 2015-08-24 중국 블먼 (S&P -3.94%, KOSPI -2.47%) [지정학/중국]
12. 2011-08-08 미국 신용등급 하락 (S&P -6.66%) [금융시스템]
13. 2020-03-09 유가전쟁+팬데믹 동시 (S&P -7.60%, VIX 54.46) [다중이벤트]
14. 2022-09-13 CPI 쇼크 (S&P -4.32%, VIX 27.27) [금리]
15. 한국 단독 위기 가상 (US flat, KOSPI -4%, 지정학 이벤트 감지) [지정학]
16. 관세+지정학 동시 가상 (S&P -3.5%, KOSPI -3%, 관세+지정학 이벤트 2개 감지) [다중이벤트]

**비폭락 시나리오 (True Negative 기대) — 15개:**
1. 2026-03-24 야간 반등 (US +1%, KOSPI주간 -6.58%, 야간 +5.84%) [stale_recovery]
2. 일상 변동 (US -0.5%, KOSPI -0.3%, VIX 18) [normal]
3. 소폭 조정 (US -1.5%, KOSPI -1%, VIX 22) [normal]
4. VIX 스파이크 단독 (VIX 28 but US flat, KOSPI flat) [VIX only]
5. 한국만 소폭 하락 (US +0.5%, KOSPI -1.2%, 이벤트 없음) [stale candidate]
6. 환율 변동 단독 (USD/KRW +20원, 나머지 안정) [FX only]
7. 금요일 옵션만기 변동성 (VIX 25, US -0.8%) [normal volatility]
8. 전일 하락 후 야간 보합 (US -2%, Dow -1.8%, NASDAQ -2.2%, KOSPI주간 -2.5%, 야간 -0.3%) [night recovery]
9. Nikkei만 하락 (Nikkei -3%, US flat, KOSPI flat) [isolated]
10. 이벤트 감지되었으나 시장 무반응 (관세 뉴스, US +0.2%) [event_no_impact]
11. US market holiday (변동 0%) + KOSPI -1.5% (한국만 소폭 하락) [holiday_mixed]
12. SerpAPI 장애 → VIX single_source, 나머지 정상 (US -1%, KOSPI -0.5%) [partial_failure]
13. VIX 이미 극단(45) + 추가 +2pt (US -1.5%) [extreme_vix_no_change]
14. 전일 코로나급 폭락(-10%) 후 야간 +8% 반등 확인 [strong_recovery]
15. US -2.4%, KOSPI -2.3%, VIX 23 (경계선 바로 아래) [near_miss]

## 9. Rollout Plan

### 9.1 Migration Strategy
코드 변경만. DB 마이그레이션 없음.

### 9.2 Feature Flag
N/A — 평가 로직 직접 교체. 백테스트 통과가 검증.

### 9.3 Rollback Plan
`git revert` — 이전 `evaluateMarketAssessmentSnapshot` 복원.

## 10. Dependencies & Risks

### 10.1 Dependencies
| Dependency | Owner | Status | Risk if Delayed |
|-----------|-------|--------|-----------------|
| KIS API 가용성 | 한국투자증권 | Active | 야간 inquire-price 실패 시 fallback |
| Naver/SerpAPI | Third-party | Active | 교차검증 불가 시 single-source |

### 10.2 Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| 가중치 오버피팅 (역사적 데이터에만 최적화) | Medium | High | 20개+ 다양한 시나리오, 극단값 테스트 |
| VIX 레짐 경계에서의 불안정 | Low | Medium | 경계값 ±1pt 버퍼 적용 |
| 야간 데이터 KIS API 미지원 | High | Low | Coherence check가 fallback |

## 11. Success Metrics

| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|--------------------|
| True Positive Rate | ~86% (프롬프트 주장) | ≥ 93% (백테스트) → 95% (30일 실전) | 백테스트 16개 폭락 시나리오 |
| True Negative Rate | ~80% (오탐 발생) | ≥ 93% (백테스트) → 95% (30일 실전) | 백테스트 15개 비폭락 시나리오 |
| Overall Accuracy | ~83% | ≥ 93% (백테스트, 31개 중 2개 이하 오류) | (TP+TN)/(TP+TN+FP+FN) |
| 2026-03-24 시나리오 | CRASH_ALERT (오탐) | NORMAL | 전용 테스트 케이스 |

**릴리스 게이트 (단일)**: 백테스트 31개 시나리오 정확도 ≥ 93%. 95% 확정은 30일 실전 모니터링 후.

## 12. Open Questions

- [x] OQ-1: KIS inquire-price가 야간 데이터를 반환하는가? → best-effort, coherence check가 fallback
- [x] OQ-2: 가중치 최적값은? → AC-1.2에 초기 시드값 명시 (US 0.30, KOSPI 0.25, VIX 0.20, FX 0.10, 이벤트 0.15). 백테스트 30개 시나리오로 검증 후 튜닝
