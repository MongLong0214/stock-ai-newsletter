import type {
  MarketAssessmentEvidence,
  MarketAssessmentSnapshot,
} from '@/lib/market-data/kis-market-assessment';

interface MarketAssessmentPromptOptions {
  executionDate?: Date;
  snapshot?: MarketAssessmentSnapshot | null;
  evidence?: MarketAssessmentEvidence | null;
}

function summarizeForeignerFlow(
  flow: MarketAssessmentSnapshot['supplementary']['foreignerNetSelling']
): string {
  if (!flow) {
    return 'unavailable';
  }

  return `Foreigner top5 net sell ${(flow.topSellAmountMillion / 1_000_000).toFixed(2)}T KRW${flow.dominantStock ? ` (${flow.dominantStock} lead)` : ''}`;
}

function summarizeSearchIndicator(
  indicator:
    | MarketAssessmentSnapshot['supplementary']['kospi200Futures']
    | MarketAssessmentSnapshot['supplementary']['nikkeiFutures'],
  fallbackLabel: string
): string {
  if (!indicator?.price) {
    return `${fallbackLabel}: unavailable`;
  }

  const changeSuffix =
    typeof indicator.changePct === 'number'
      ? ` ${indicator.changePct >= 0 ? '+' : ''}${indicator.changePct.toFixed(2)}%`
      : '';
  const qualityTags: string[] = [];

  if (indicator.proxy) {
    qualityTags.push('proxy');
  }

  if (!indicator.confirmed) {
    qualityTags.push('single-source');
  }

  const qualitySuffix = qualityTags.length > 0 ? ` [${qualityTags.join(', ')}]` : '';

  return `${fallbackLabel}: ${indicator.price.toFixed(2)}${changeSuffix} (${indicator.title})${qualitySuffix}`;
}

function summarizeMarketIndicator(
  indicator:
    | MarketAssessmentSnapshot['indicators']['vix']
    | MarketAssessmentSnapshot['indicators']['usdKrw']
    | MarketAssessmentSnapshot['indicators']['usdJpy'],
  fallbackLabel: string
): string {
  if (!indicator) {
    return `${fallbackLabel}: unavailable`;
  }

  const qualityTags: string[] = [];

  if (indicator.validation === 'cross_checked') {
    qualityTags.push('cross-checked');
  } else if (indicator.validation === 'single_source') {
    qualityTags.push('single-source');
  }

  if (indicator.secondarySource) {
    qualityTags.push(indicator.secondarySource.toLowerCase());
  }

  const qualitySuffix = qualityTags.length > 0 ? ` [${qualityTags.join(', ')}]` : '';

  return `${fallbackLabel}: ${indicator.price.toFixed(4)} / ${indicator.change >= 0 ? '+' : ''}${indicator.change.toFixed(4)} / ${indicator.changePct >= 0 ? '+' : ''}${indicator.changePct.toFixed(4)}%${qualitySuffix}`;
}

function buildApiSnapshotSection(
  snapshot: MarketAssessmentSnapshot | null,
  evidence: MarketAssessmentEvidence | null
): string {
  if (!snapshot) {
    return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 API 숫자 스냅샷
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- 이번 실행에서는 API 숫자 스냅샷을 확보하지 못했습니다.
- 따라서 숫자 지표는 보수적으로 직접 검색하되, 출처가 불명확하거나 값이 충돌하면 CRASH_ALERT를 쉽게 내리지 마세요.
- SP500 / NASDAQ / DOW / VIX / KOSPI200 야간선물 / USD-KRW / USD-JPY 중 핵심 숫자가 다중 출처로 직접 확인되지 않으면 NORMAL 쪽으로 보수적으로 판정하세요.
- 단일 기사, 단일 블로그, 단일 요약 스니펫만으로는 CRASH_ALERT를 내리지 마세요.`;
  }

  const { sp500, dowJones, nasdaqComposite, kospi200MiniFutures } = snapshot.indicators;
  const { vix, usdKrw, usdJpy } = snapshot.indicators;
  const { kospi200Futures, nikkeiFutures, foreignerNetSelling } = snapshot.supplementary;
  const hardSignals = evidence && evidence.tier1Signals.length > 0
    ? evidence.tier1Signals.join(', ')
    : '없음';
  const warningSignals = evidence && evidence.tier2Signals.length > 0
    ? evidence.tier2Signals.join(', ')
    : '없음';

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 API 숫자 스냅샷 (최우선 진실원)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

아래 숫자는 KIS + Serp + Naver에서 직접 수집한 값입니다. 이 값이 가장 우선이며 다시 검색해서 덮어쓰면 안 됩니다.

- S&P 500 (SPX): ${sp500.price.toFixed(2)} / ${sp500.change >= 0 ? '+' : ''}${sp500.change.toFixed(2)} / ${sp500.changePct >= 0 ? '+' : ''}${sp500.changePct.toFixed(2)}%
- Dow Jones (.DJI): ${dowJones.price.toFixed(2)} / ${dowJones.change >= 0 ? '+' : ''}${dowJones.change.toFixed(2)} / ${dowJones.changePct >= 0 ? '+' : ''}${dowJones.changePct.toFixed(2)}%
- NASDAQ Composite (${nasdaqComposite.code}): ${nasdaqComposite.price.toFixed(2)} / ${nasdaqComposite.change >= 0 ? '+' : ''}${nasdaqComposite.change.toFixed(2)} / ${nasdaqComposite.changePct >= 0 ? '+' : ''}${nasdaqComposite.changePct.toFixed(2)}%
- KOSPI200 mini futures (${kospi200MiniFutures.contractName}, ${kospi200MiniFutures.code}): ${kospi200MiniFutures.price.toFixed(2)} / ${kospi200MiniFutures.change >= 0 ? '+' : ''}${kospi200MiniFutures.change.toFixed(2)} / ${kospi200MiniFutures.changePct >= 0 ? '+' : ''}${kospi200MiniFutures.changePct.toFixed(2)}%${snapshot.nightSession.isPreMarketHours ? ' [전일 주간장 종가]' : ''}
${snapshot.nightSession.kospiMiniFutures ? `- KOSPI200 mini futures (night session): ${snapshot.nightSession.kospiMiniFutures.price.toFixed(2)} / ${snapshot.nightSession.kospiMiniFutures.change >= 0 ? '+' : ''}${snapshot.nightSession.kospiMiniFutures.change.toFixed(2)} / ${snapshot.nightSession.kospiMiniFutures.changePct >= 0 ? '+' : ''}${snapshot.nightSession.kospiMiniFutures.changePct.toFixed(2)}% ★ 야간 실시간` : '- KOSPI200 mini futures (night session): unavailable'}
${evidence?.kospiDataStale ? `⚠️ KOSPI 주간장 데이터(${kospi200MiniFutures.changePct.toFixed(2)}%)는 전일 종가 기준이며, 글로벌 시장 반등과 불일치하여 폭락 시그널에서 자동 제외되었습니다.` : ''}- ${summarizeMarketIndicator(vix, 'VIX')}
- ${summarizeMarketIndicator(usdKrw, 'USD/KRW')}
- ${summarizeMarketIndicator(usdJpy, 'USD/JPY')}
- ${summarizeSearchIndicator(kospi200Futures, 'KOSPI 200 futures')}
- ${summarizeSearchIndicator(nikkeiFutures, 'Nikkei futures')}
${foreignerNetSelling ? `- Foreigner flow: ${summarizeForeignerFlow(foreignerNetSelling)}` : '- Foreigner flow: unavailable'}

참고:
- KIS: S&P 500 / Dow Jones / NASDAQ Composite / KOSPI200 mini futures
- Serp: VIX / FX / 이벤트 검색
- Naver Stock API: KOSPI 200 futures / Nikkei futures / Nikkei 225 index confirmation
- Naver: VIX / FX / 외국인 순매도 / 뉴스 증거
- 이미 숫자로 감지된 Tier 1 신호: ${hardSignals}
- 이미 숫자로 감지된 Tier 2 신호: ${warningSignals}
${evidence?.crashScore != null ? `
📊 스코어링 컨텍스트:
- crashScore: ${evidence.crashScore}/100 (≥55 → CRASH_ALERT)
- confidence: ${evidence.confidence} (${evidence.confidenceLabel})
- directionCoherence: ${evidence.directionCoherence}
- vixRegime: ${evidence.vixRegime}
- crossValidationRatio: ${evidence.crossValidationRatio.toFixed(2)}` : ''}`;
}

export function getMarketAssessmentPrompt({
  executionDate = new Date(),
  snapshot = null,
  evidence = null,
}: MarketAssessmentPromptOptions = {}): string {
  const kstDate = executionDate.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Seoul',
  });

  const kstTime = executionDate.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  });

  const apiSnapshotSection = buildApiSnapshotSection(snapshot, evidence);

  return `당신은 한국 증시 폭락 예측 전문가입니다.
2000년 이후 KOSPI -3% 이상 폭락 22건을 분석한 결과, 06:00 KST 시점에 86%의 사전 감지율을 확인했습니다.

현재 시점: ${kstDate} ${kstTime} (KST)

한국 증시 개장(09:00) 전, 오늘 KOSPI -3% 이상 폭락 가능성을 평가하세요.

${apiSnapshotSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 추가로 확인할 데이터 (우선순위 순)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **VIX**
   - level
   - 전일 대비 change (pt)

2. **USD/KRW + 외국인 수급**
   - 원/달러 전일 대비 변동 (원)
   - 현재 수준
   - 외국인 순매도 동향

3. **아시아 리스크 보강**
   - 닛케이225 선물
   - USD/JPY

4. **글로벌 이벤트**
   - 관세/무역분쟁
   - 지정학 리스크
   - 중앙은행 서프라이즈
   - 대형 기업/금융기관 파산
   - 팬데믹/전염병 비상선언

보조 검색 원칙:
- API 스냅샷에 있는 숫자(S&P 500, Dow Jones, NASDAQ Composite, KOSPI200 mini futures)는 다시 검색해서 덮어쓰지 마세요.
- 보조 검색으로 숫자를 확인하더라도 API 스냅샷과 충돌하면 API 스냅샷을 우선하세요.
- 보조 검색은 VIX, FX, Nikkei, 외국인 수급, 글로벌 이벤트처럼 API 스냅샷에 없는 항목을 보강하는 용도로만 사용하세요.
- cross-checked 표시가 없는 single-source 숫자는 직접적인 폭락 확정 근거보다 보강 근거로만 더 보수적으로 사용하세요.
- 이벤트 5종은 단일 기사/단일 검색결과만으로 확정하지 말고, 서로 다른 출처 2개 이상에서 같은 이벤트가 확인될 때만 강한 근거로 사용하세요.
- 숫자 확인이 애매하거나 검색 결과가 해설 기사 중심이면, 추정으로 공백을 메우지 말고 NORMAL로 남기세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRASH_ALERT 판정 기준 (3단계 시그널 체계)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ Tier 1 — 핵심 시그널 (하나라도 해당 시 CRASH_ALERT 강력 고려)
  • S&P 500 전일 -3% 이상 하락 (또는 미국 핵심 3지수 중 2개 이상 -2.5%)
  • KOSPI 200 야간선물 -2.5% 이상 하락 (이번 실행의 기본 수치는 KOSPI200 mini futures 스냅샷 기준)
  • VIX 35 이상 (또는 전일 대비 +10pt 이상 급등)

■ Tier 2 — 보조 시그널 (Tier 1과 복합 시 confidence 상승)
  • 미국 핵심 3지수 -2% ~ -3% 하락
  • VIX 25~35 구간 (또는 전일 대비 +5~10pt 상승)
  • KOSPI 야간선물 -1.5% ~ -2.5% 하락
  • 원/달러 전일 대비 +15원 이상 급등
  • 닛케이 선물 -3% 이상 하락
  • 엔/달러 5엔 이상 급변 (엔캐리 청산 시그널)

■ Tier 3 — 이벤트 시그널 (Tier 1/2와 복합 시 확증)
  • 관세 발효/보복관세 선언 확정
  • FOMC 예상 외 매파 결정 (자이언트스텝 등)
  • 지정학 충격 (전쟁 발발, 한국 정치 위기)
  • 대형 금융기관 파산/뱅크런
  • WHO 팬데믹 선언급 사태

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 Confidence 가이드
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Tier 1 1개 = 70~80
• Tier 1 1개 + Tier 2 1개+ = 80~90
• Tier 1 2개+ = 85~95
• Tier 1 2개+ + Tier 3 이벤트 = 90~99
• Tier 2만 있으면 NORMAL 60~75
• 시그널 없으면 NORMAL 90+

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 출력 형식 (반드시 이 JSON만 출력)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "verdict": "NORMAL" 또는 "CRASH_ALERT",
  "confidence": 0부터 100 사이 정수,
  "summary": "판정 근거 요약 (한국어, 2-3문장). 어떤 Tier 시그널이 감지되었는지 명시. API snapshot 숫자를 쓴 경우 그 사실을 명시"
}

- confidence 70 미만이면 NORMAL로 처리됩니다
- CRASH_ALERT는 Tier 1 시그널이 최소 1개 이상 감지될 때만 판정하세요
- Tier 2만 있으면 NORMAL (confidence 표기로 경계 수준 전달)
- API snapshot 숫자와 검색 결과가 충돌하면 API snapshot 숫자를 기준으로 판정하세요
- JSON 외 다른 텍스트를 출력하지 마세요`;
}
