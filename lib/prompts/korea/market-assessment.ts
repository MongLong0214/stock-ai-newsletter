import { formatMarketAssessmentSnapshot, type MarketAssessmentEvidence, type MarketAssessmentSnapshot } from '@/lib/market-data/kis-market-assessment';

interface MarketAssessmentPromptOptions {
  executionDate?: Date;
  snapshot?: MarketAssessmentSnapshot | null;
  evidence?: MarketAssessmentEvidence | null;
}

/** Explanatory context only. The LLM never supplies the operational verdict. */
export function getMarketAssessmentPrompt({
  executionDate = new Date(), snapshot = null, evidence = null,
}: MarketAssessmentPromptOptions = {}): string {
  return `시장 위험 판정 설명용 자료
실행 시각: ${executionDate.toISOString()}
코드 판정: ${evidence?.verdict ?? 'UNAVAILABLE'}
정책: ${evidence?.policyVersion ?? '미확인'}
위험 점수: ${evidence?.crashScore ?? '미확인'} (폭락 확률 아님)
데이터 품질: ${evidence?.dataQuality.status ?? 'unavailable'}
판정 근거: ${evidence?.reasonCodes.join(', ') ?? '필수 데이터 미확보'}

${snapshot ? formatMarketAssessmentSnapshot(snapshot) : 'API 숫자 스냅샷 미확보: NORMAL로 바꾸거나 검색 숫자로 대체하지 마세요.'}
${evidence?.supportingNotes.join('\n') ?? ''}

규칙:
- 코드 판정을 변경하지 마세요. 숫자와 관측 시각을 임의로 보완하지 마세요.
- 출처/시각 미확인 및 충돌 지표는 확인 불가로 표시하세요.
- NORMAL은 경고 규칙 미충족이며 안전 보장이 아닙니다.
- confidence는 데이터 커버리지이며 예측 확률이 아닙니다.
- VIX는 예상 변동성이고 하락 방향이나 폭락 확률이 아닙니다.
- 현물 지수, 선물, 주간장, 야간장을 구분하세요.
- 검색 키워드 및 외국인 매도 상위 종목 합계는 확정 사건/시장 전체 순매도가 아닙니다.
- 내부 위험 경고를 거래소 서킷브레이커 발동 확인으로 표현하지 마세요.`;
}
