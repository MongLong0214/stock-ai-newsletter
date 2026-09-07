import type { MarketAssessmentSnapshot, MarketIndicatorSnapshot } from '../kis-market-assessment';

export const RISK_NOW = '2026-09-09T06:00:00+09:00';
export function riskQuote(code: string, pct = 0, korea = false): MarketIndicatorSnapshot {
  return {
    code, label: code, source: 'KIS', validation: 'direct',
    price: 100 * (1 + pct / 100), change: pct, changePct: pct,
    fetchedAt: RISK_NOW,
    observedAt: korea ? '2026-09-08T15:45:00+09:00' : '2026-09-08T16:15:00-04:00',
    session: 'day',
  };
}
export function riskSnapshot(): MarketAssessmentSnapshot {
  return {
    fetchedAt: RISK_NOW,
    indicators: {
      sp500: riskQuote('S&P 500'), dowJones: riskQuote('Dow'), nasdaqComposite: riskQuote('NASDAQ'),
      kospi200MiniFutures: { ...riskQuote('Mini', 0, true), contractName: 'Mini September', remainingDays: 1 },
      kospi: riskQuote('KOSPI', 0, true), kosdaq: riskQuote('KOSDAQ', 0, true),
      vix: { ...riskQuote('VIX'), price: 18 },
      usdKrw: { ...riskQuote('USD/KRW', 0, true), price: 1400 },
      usdJpy: { ...riskQuote('USD/JPY', 0, true), price: 145 },
    },
    nightSession: { kospiMiniFutures: null, isPreMarketHours: true },
    supplementary: { kospi200Futures: null, nikkeiFutures: null, foreignerNetSelling: null },
    events: {
      tariffs: { detected: false, evidence: [] }, geopolitics: { detected: false, evidence: [] },
      centralBankSurprise: { detected: false, evidence: [] }, financialInstitutionFailure: { detected: false, evidence: [] },
      pandemic: { detected: false, evidence: [] },
    },
  };
}
