import type { CrashAlertData } from '@/app/archive/_types/archive.types';
import type { MarketAssessment } from './gemini-pipeline';

/** Numerical fields and severity belong to the risk engine, not the text model. */
export function bindCrashAssessment(alert: CrashAlertData, assessment: MarketAssessment): CrashAlertData {
  return {
    ...alert,
    severity: assessment.severity ?? alert.severity,
    market_overview: assessment.marketOverview ?? alert.market_overview,
  };
}

export function buildDeterministicCrashAlert(assessment: MarketAssessment): string {
  return JSON.stringify(bindCrashAssessment({
    type: 'crash_alert', severity: assessment.severity ?? 'warning',
    title: '시장 급락 위험 경고',
    market_overview: assessment.marketOverview ?? {},
    causes: [{ factor: '가격 기반 위험 신호', impact: 'high', detail: assessment.summary }],
    historical_context: '상세 분석 서비스가 응답하지 않아 과거 유사 사례 비교를 제공하지 않습니다.',
    outlook: '관측된 가격이 내부 위험 경고 기준을 충족했습니다. 추가 하락이나 거래소 서킷브레이커 발동을 확정하는 예측이 아닙니다.',
    investor_guidance: '오늘의 종목 추천을 보류합니다. 거래소 공지와 최신 시세를 확인하고 본인의 위험 한도와 유동성을 점검하세요.',
  }, assessment));
}
