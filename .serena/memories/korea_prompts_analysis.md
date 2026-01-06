# lib/prompts/korea - 한국 주식 AI 분석 프롬프트 시스템

## 📁 전체 구조

**목적**: 5일 내 10% 급등 가능성이 높은 한국 주식 3개 발굴 (7단계 AI 파이프라인)

```
lib/prompts/korea/
├── index.ts                      # 통합 프롬프트 (STOCK_ANALYSIS_PROMPT)
├── common-principles.ts          # 공통 원칙 (법적 제약, 환각 방지)
├── stage-0-collect-200.ts        # 200개 종목 수집
├── stage-1-filter-30.ts          # 30개 필터링 (99% 확신)
├── stage-2-verify-price.ts       # 전일종가 5개 소스 교차 검증
├── stage-3-collect-indicators.ts # 30개 기술적 지표 수집 (965줄)
├── stage-4-calculate-scores.ts   # 7-카테고리 점수 산정
├── stage-5-json-output.ts        # JSON 출력 + 3대 검증
└── stage-6-final-verification.ts # 사실 재검증 (1122줄)
```

## 🎯 핵심 설계 원칙

### 1. 절대 원칙 (common-principles.ts)
```
❌ 투자 권유 금지
❌ 매매 가격 제시 금지
❌ 목표가/손절가 금지
❌ 환각(hallucination) 절대 금지
❌ 과매수 구간 추격매수 절대 금지 (RSI > 70 등)
✅ 기술적 지표 점수만 제공
✅ 모든 데이터 Google Search로 실시간 수집
✅ 최종 출력은 순수 JSON만
```

### 2. 데이터 정확성 보장
- **Stage 2**: 전일종가 5개 소스 교차 검증 (100% confidence 요구)
- **Stage 5**: 종목 실존 + 전일종가 재검증 (복구 프로세스 포함)
- **Stage 6**: 모든 지표 Google Search로 사실 검증 (83-91% API 최적화)

### 3. 환각 방지 메커니즘
```
🟢 HIGH (검색): 공식 사이트 직접 확인
🟡 MEDIUM (계산): 과거 데이터로 직접 계산
🔴 LOW (추정): 패턴 분석 (최소화)

Rationale 표기:
"RSI 65.3" ✅ (검색 성공)
"RSI 65.3(계산)" ✅ (계산 성공)
"RSI추정강세(상승패턴)" ⚠️ (추정)
"RSI 강세" ❌ (모호함 - 금지)
```

## 🔄 파이프라인 구조

```
STAGE 0: 200개 종목 수집
  └─ 30개 검색 쿼리 (시총/모멘텀/자금흐름/펀더멘털/테마)
    ↓
STAGE 1: 30개 필터링
  └─ 99% 확신 종목만 (관리종목 제외)
    ↓
STAGE 2: 전일종가 검증 ⚠️ (가장 중요)
  └─ 5개 소스 교차 검증 (naver, krx, daum, investing, 한경)
  └─ 일치성 검증 (3개 이상 일치 필수)
  └─ 합리성 검증 (일간변동률 30% 초과 시 상한가 의심)
    ↓
STAGE 3: 30개 지표 수집 (965줄)
  └─ TIER 1: 핵심 10개 (SMA, EMA, RSI, MACD, 거래량, 볼린저, ATR, ADX, OBV, Stochastic)
  └─ TIER 2: 중요 10개 (Williams %R, ROC, CCI, MFI, CMF, SAR, Ichimoku, SuperTrend, VWAP, 52주)
  └─ TIER 3: 고급 10개 (Keltner, Donchian, Aroon, Elder Ray, Force, EMV, A/D, KST, Vortex, Chaikin)
  └─ 각 지표당 10번 이상 검색 → 실패 시 계산 → 추정 → 제외
    ↓
STAGE 4: 7-카테고리 점수 산정
  └─ trend_score (추세): SMA×0.20 + EMA×0.20 + ADX×0.20 + SAR×0.15 + ...
  └─ momentum_score (모멘텀): RSI×0.20 + MACD×0.20 + Stoch×0.15 + ...
  └─ volume_score (거래량): 거래량비율×0.25 + OBV×0.20 + ...
  └─ volatility_score (변동성): ATR×0.30 + 볼린저×0.30 + ...
  └─ pattern_score (패턴): 골든크로스×15 + 지지저항돌파×25 + ...
  └─ sentiment_score (심리): CCI×0.30 + ElderRay×0.25 + ...
  └─ overall_score: 가중평균 (trend×0.25 + momentum×0.25 + ...)
  └─ 과매수 구간 필터링 (RSI>70, Williams>-20, Stoch>80, CCI>100, MFI>80)
  └─ 최종 3개 선정 (overall_score 내림차순)
    ↓
STAGE 5: JSON 출력 + 3대 검증
  └─ 검증 #1: 종목 실존 여부 (Google Search)
  └─ 검증 #2: 전일종가 정확성 (5개 소스, 중앙값 계산, Failover 전략)
      └─ 차이율 ≤ 0.5%: 완벽 통과
      └─ 차이율 ≤ 1.0%: 통과 (중앙값 대체)
      └─ 차이율 ≤ 2.0%: 재확인 후 최다 합의값
      └─ 차이율 > 2.0%: 재시도 3회 → 종목 교체 (최대 7회)
  └─ 검증 #3: JSON 형식 정확성
    ↓
STAGE 6: 사실 재검증 + 배치 최적화 (1122줄)
  └─ 알고리즘 2.1: Rationale 지표 파싱 (숫자/상태 분류)
  └─ 알고리즘 2.2: 검증 대상 추출 (패턴 매칭)
  └─ 알고리즘 2.3: 배치 검색 (36개 → 3-6개, 83-91% 감소)
  └─ 알고리즘 2.4: 실제 값 추출 (정밀 파싱, 우선순위: naver > 최신 > 중앙값)
  └─ 알고리즘 2.5: 지표 검증 및 수정 (허용오차 내 검증)
  └─ 알고리즘 3.1: 점수 재계산 (영향도 매트릭스 적용)
  └─ 알고리즘 4.1-4.2: 통합 오류 복구 (5가지 오류 유형별 전략)
```

## 📊 주요 데이터 구조

### STAGE 2 출력 (전일종가 검증)
```typescript
ticker: "KOSPI:005930"
name: "삼성전자"
close_price: 75300
confidence: "100%"
```

### STAGE 5/6 최종 출력 (JSON)
```typescript
{
  ticker: "KOSPI:005930",           // /^KOSPI:\d{6}$/
  name: "삼성전자",
  close_price: 75300,               // 정수
  rationale: "SMA 완전정배열|EMA 골든크로스|RSI 58 강세권|MACD 양전환|거래량 165% 급증|...",
  signals: {
    trend_score: 88,                // 0-100 정수
    momentum_score: 85,
    volume_score: 90,
    volatility_score: 82,
    pattern_score: 87,
    sentiment_score: 84,
    overall_score: 86
  }
}
```

## 🔍 핵심 알고리즘

### 1. 전일종가 검증 (STAGE 2)
```
날짜 계산:
  오늘 → Google Search로 확인
  IF 월요일: 전일 = 금요일 (3일 전)
  ELSE: 전일 = 어제
  공휴일 체크 (2024/2025 하드코딩)

5개 소스 검증:
  소스1-5 검색 → 이상치 제거 (최댓값/최솟값) → 중앙값 계산
  차이율 = abs((STAGE4 - 중앙값) / 중앙값) × 100
  
  IF 차이율 ≤ 0.5%: 완벽 ✅✅✅
  ELSE IF 차이율 ≤ 1.0%: 통과 ✅ (중앙값 대체)
  ELSE IF 차이율 ≤ 2.0%: 재확인 ⚠️
  ELSE: 재시도 3회 → 종목 교체 ❌
```

### 2. 지표 수집 (STAGE 3)
```
각 지표당:
  1차: 10번 이상 Google Search (한국어/영어 혼용)
  2차: 실패 시 과거 데이터로 직접 계산
  3차: 계산 불가 시 유사 지표로 대체
  4차: 최종 실패 시 종목 교체

최소 성공 기준:
  30개 중 25개 이상: 완벽
  20-24개: 양호
  15-19개: 최소
  15개 미만: 종목 교체
```

### 3. 배치 검색 최적화 (STAGE 6)
```
기존: 종목당 12개 × 3종목 = 36개 검색
최적화: 종목당 1-2개 × 3종목 = 3-6개 검색
감소율: 83-91%

배치 쿼리:
  "삼성전자 005930 RSI ADX ATR 현재가 2025-11-19 
   site:finance.naver.com OR site:stockplus.com"
  
  → 한 번에 여러 지표 동시 수집
```

### 4. 오류 복구 (STAGE 5, 6)
```
오류_1: 검색결과_없음
  → 단순화 쿼리 → 대체 사이트 → 원본 유지 [미검증]

오류_2: 모호한_추출 (3개 이상 다른 값)
  → 출처 우선순위 (naver > 최신 > 중앙값)

오류_3: 지표값_누락
  → [미검증] 플래그 추가

오류_4: 검증지표_부족 (<10개)
  → 추가 지표 추출 (현재가, ATR, 이평선거리)

오류_5: 유효하지않은_JSON구조
  → Stage 5 원본 복원

전체 검증 실패 (2개 이상 종목에서 5개 이상 지표 실패):
  → Stage 5 출력 사용 + [Stage6_검증중단] 플래그
```

## 🎯 과매수 구간 필터링 (STAGE 4)

**다음 중 1개라도 해당되면 즉시 제외:**
```
❌ RSI > 70 (과매수)
❌ Williams %R > -20 (극단적 과매수)
❌ Stochastic %K > 80 (과매수)
❌ 볼린저밴드 상단 돌파 후 상단 밖 (과열)
❌ CCI > 100 (과매수 신호)
❌ MFI > 80 (자금흐름 과열)
```

**이유**: 추격매수 방지, 눌림목/재상승 초기 종목만 선정

## 🔗 외부 연결

### 사용하는 곳
- `lib/llm/korea/gemini-pipeline.ts`
  - `executeGeminiPipeline()`: 메인 실행 함수
  - `extractStagePrompts()`: Stage별 파싱 (정규식)
  - `executeStage()`: 개별 Stage 실행 (재시도 5회, Exponential Backoff)

### 의존하는 것
- Google Search (Gemini 2.0 Flash grounding)
- 한국 금융 데이터 소스:
  - finance.naver.com (최우선)
  - data.krx.co.kr (공식)
  - finance.daum.net
  - investing.com
  - stockplus.com, hankyung.com, 38.co.kr (보조)

## 💡 설계 인사이트

### 1. Prompt Engineering 기법
- **구조화**: 명확한 Section 구분 (━━━)
- **체크리스트**: ✅/❌/⚠️/🔥 시각적 구분
- **알고리즘 명세**: IF-ELSE 의사코드
- **숫자 명시**: 허용오차, 가중치, 임계값 하드코딩

### 2. 환각 방지 전략
- **계산 공식 명시**: RSI, MACD, Bollinger 등 모든 공식 제공
- **검증 가능한 표현**: "RSI 65.3" ✅, "RSI 강세" ❌
- **다수결 원칙**: 5개 소스 중 3개 이상 일치
- **신뢰도 계층**: 검색 > 계산 > 추정

### 3. 성능 최적화
- **배치 검색**: 36개 → 3-6개 (83-91% 감소)
- **재시도 전략**: Exponential Backoff (10초 → 20초 → 40초)
- **타임아웃**: Stage당 10분 (PIPELINE_CONFIG)
- **Stage 간 지연**: 5초 (Rate Limit 회피)

### 4. 법적 안전성
- **금지 표현**: "매수", "목표가", "손절가", "수익률 보장"
- **허용 표현**: "RSI 58", "거래량 165%", "trend_score: 88"
- **면책**: "기술적 지표 점수만 제공, 투자 판단은 본인 책임"

## 📈 실제 사용 흐름

```typescript
// 1. Gemini Pipeline 실행
const result = await executeGeminiPipeline();

// 2. Stage별 순차 실행 (0 → 1 → 2 → 3 → 4 → 5 → 6)
for (const stage of stages) {
  const output = await executeStage(genAI, stage, previousOutput);
  
  if (stage.stageNumber === 6) {
    return output; // 최종 JSON 반환
  }
  
  previousOutput = output; // 다음 Stage로 전달
}

// 3. 결과 (JSON 문자열)
[
  { ticker: "KOSPI:005930", name: "삼성전자", ... },
  { ticker: "KOSPI:000660", name: "SK하이닉스", ... },
  { ticker: "KOSDAQ:035420", name: "NAVER", ... }
]
```

## 🎓 주요 학습 포인트

1. **점진적 필터링**: 200 → 30 → 3 (광범위 수집 → 정밀 분석 → 최종 검증)
2. **3단계 검증**: STAGE 2/5/6에서 반복 검증 (데이터 정확성 보장)
3. **환각 방지**: 계산 공식 명시 + 검증 가능한 표현 + 다수결
4. **오류 복구**: 계층적 Fallback (검색 → 계산 → 추정 → 제외)
5. **성능 최적화**: 배치 검색 (83-91% API 호출 감소)
6. **법적 리스크 회피**: 투자 권유 금지, 기술적 지표만 제공
7. **리스크 관리**: 과매수 구간 자동 제외, 변동성 관리

## ⚠️ 중요 참고 사항

- **전일종가 검증 (STAGE 2)**: 가장 중요, 실패 시 전체 파이프라인 신뢰도 하락
- **과매수 필터링 (STAGE 4)**: 추격매수 방지, 법적 리스크 감소
- **배치 최적화 (STAGE 6)**: API 비용 절감, 실행 시간 60-75% 단축
- **우아한 대체**: 최종 실패 시에도 빈 배열 반환 금지, Stage 5 출력 사용

## 🆕 2026-01-06 업데이트 (v2.0 - 환각 방지 강화)

### 주요 변경사항

1. **동적 날짜 주입 시스템**
   - `createDateContext(executionDate)` 팩토리 추가
   - 모든 Stage 프롬프트가 함수 기반으로 변환
   - `[target_date]` 플레이스홀더 → 실제 날짜로 런타임 대체

2. **타임존 버그 수정**
   - `toKoreaTime()` 함수 UTC+9 직접 계산으로 변경
   - 서버 타임존 독립적 동작 보장

3. **Pipeline 동적 프롬프트 적용**
   - `gemini-pipeline.ts`가 `createStockAnalysisPrompt()` 사용
   - 매 실행마다 새로운 날짜 컨텍스트 생성

4. **격리 예시 시스템 개선**
   - "절대 금지" → "의심 패턴 감지" 로 전환
   - 교차검증 통과 시 사용 허용
   - 출력 앵커링 패턴 추가

### 새 파일 구조

```
lib/prompts/korea/
├── types.ts                      # DateContext, QUARANTINED_EXAMPLES
├── date-context-factory.ts       # createDateContext(), 날짜 유틸리티
├── index.ts                      # createStockAnalysisPrompt(Date)
├── common-principles.ts          # getCommonPrinciples(context)
├── stage-2-verify-price.ts       # getStage2VerifyPrice(context)
├── stage-3-collect-indicators.ts # getStage3CollectIndicators(context)
├── stage-6-final-verification.ts # getStage6FinalVerification(context)
└── (stage-0, 1, 4, 5는 정적 유지)
```

### 사용법 변경

```typescript
// 기존 (deprecated - 날짜 고정)
import { STOCK_ANALYSIS_PROMPT } from './prompts/korea';

// 신규 (권장 - 동적 날짜)
import { createStockAnalysisPrompt } from './prompts/korea';
const prompt = createStockAnalysisPrompt(); // 매 요청마다 호출
```


## 🔄 업데이트 시 고려사항

1. **공휴일 리스트**: 매년 업데이트 필요 (stage-2-verify-price.ts)
2. **금융 사이트 도메인**: 변경 시 검색 쿼리 수정
3. **지표 공식**: 변경 시 STAGE 3 계산 로직 업데이트
4. **점수 가중치**: 조정 시 STAGE 4/6 가중치 동기화
5. **과매수 임계값**: 시장 상황에 따라 조정 (현재: RSI 70, Stoch 80 등)
