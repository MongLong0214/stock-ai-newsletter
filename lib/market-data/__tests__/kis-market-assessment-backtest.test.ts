import { describe, expect, it } from 'vitest';

import {
  evaluateMarketAssessmentSnapshot,
  type MarketAssessmentSnapshot,
} from '../kis-market-assessment';

type Verdict = 'CRASH_ALERT' | 'NORMAL';

interface BacktestScenario {
  name: string;
  expected: Verdict;
  snapshot: Partial<SnapshotOverrides>;
}

interface SnapshotOverrides {
  sp500Pct: number;
  dowPct: number;
  nasdaqPct: number;
  kospiPct: number;
  nightKospiPct: number | null;
  isPreMarket: boolean;
  vixPrice: number | null;
  vixChange: number | null;
  usdKrwChange: number | null;
  nikkeiPct: number | null;
  nikkeiConfirmed: boolean;
  foreignerAmountMillion: number | null;
  tariffs: boolean;
  geopolitics: boolean;
  centralBank: boolean;
  financialInstitution: boolean;
  pandemic: boolean;
}

const DEFAULTS: SnapshotOverrides = {
  sp500Pct: 0,
  dowPct: 0,
  nasdaqPct: 0,
  kospiPct: 0,
  nightKospiPct: null,
  isPreMarket: true,
  vixPrice: 18,
  vixChange: 0,
  usdKrwChange: 0,
  nikkeiPct: null,
  nikkeiConfirmed: false,
  foreignerAmountMillion: null,
  tariffs: false,
  geopolitics: false,
  centralBank: false,
  financialInstitution: false,
  pandemic: false,
};

function createBacktestSnapshot(overrides: Partial<SnapshotOverrides> = {}): MarketAssessmentSnapshot {
  const o = { ...DEFAULTS, ...overrides };
  const ts = new Date().toISOString();
  const mkInd = (code: string, label: string, pct: number) => ({
    code,
    label,
    source: 'KIS' as const,
    price: 100,
    change: pct,
    changePct: pct,
    validation: 'direct' as const,
    secondarySource: null,
    fetchedAt: ts,
  });

  return {
    fetchedAt: ts,
    indicators: {
      sp500: mkInd('SPX', 'S&P 500', o.sp500Pct),
      dowJones: mkInd('.DJI', 'Dow Jones', o.dowPct),
      nasdaqComposite: mkInd('COMP', 'NASDAQ', o.nasdaqPct),
      kospi200MiniFutures: {
        ...mkInd('A05604', 'KOSPI200 mini futures', o.kospiPct),
        contractName: '미니F 202604',
        remainingDays: 30,
      },
      vix:
        o.vixPrice != null
          ? {
              code: '.VIX',
              label: 'VIX',
              source: 'MULTI_SOURCE' as const,
              price: o.vixPrice,
              change: o.vixChange ?? 0,
              changePct: 0,
              validation: 'cross_checked' as const,
              secondarySource: null,
              fetchedAt: ts,
            }
          : null,
      usdKrw:
        o.usdKrwChange != null
          ? {
              code: 'FX',
              label: 'USD/KRW',
              source: 'MULTI_SOURCE' as const,
              price: 1400,
              change: o.usdKrwChange,
              changePct: 0,
              validation: 'cross_checked' as const,
              secondarySource: null,
              fetchedAt: ts,
            }
          : null,
      usdJpy: null,
    },
    nightSession: {
      kospiMiniFutures:
        o.nightKospiPct != null
          ? {
              ...mkInd('A05604', 'KOSPI200 mini futures (night)', o.nightKospiPct),
              contractName: 'Night',
              remainingDays: null,
            }
          : null,
      isPreMarketHours: o.isPreMarket,
    },
    supplementary: {
      kospi200Futures: null,
      nikkeiFutures:
        o.nikkeiPct != null
          ? {
              label: 'Nikkei',
              query: '',
              title: 'Nikkei',
              snippet: '',
              link: null,
              price: 50000,
              change: null,
              changePct: o.nikkeiPct,
              confirmed: o.nikkeiConfirmed,
              proxy: false,
              fetchedAt: ts,
              source: 'NAVER_STOCK_API' as const,
            }
          : null,
      foreignerNetSelling:
        o.foreignerAmountMillion != null
          ? {
              date: null,
              dominantStock: null,
              topRows: [],
              topSellAmountMillion: o.foreignerAmountMillion,
              topSellQuantityK: 0,
              fetchedAt: ts,
              source: 'NAVER_FINANCE' as const,
            }
          : null,
    },
    events: {
      tariffs: { detected: o.tariffs, evidence: o.tariffs ? ['evidence'] : [] },
      geopolitics: { detected: o.geopolitics, evidence: o.geopolitics ? ['evidence'] : [] },
      centralBankSurprise: { detected: o.centralBank, evidence: o.centralBank ? ['evidence'] : [] },
      financialInstitutionFailure: { detected: o.financialInstitution, evidence: o.financialInstitution ? ['evidence'] : [] },
      pandemic: { detected: o.pandemic, evidence: o.pandemic ? ['evidence'] : [] },
    },
  };
}

function resolveVerdict(evidence: { crashScore: number; confidence: number }): Verdict {
  return evidence.crashScore >= 55 && evidence.confidence >= 70 ? 'CRASH_ALERT' : 'NORMAL';
}

// ============================================================
// TRUE POSITIVE SCENARIOS (expect CRASH_ALERT)
// ============================================================
const TP_SCENARIOS: BacktestScenario[] = [
  {
    name: 'TP-01: 2008-10-24 금융위기',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -3.45, dowPct: -3.59, nasdaqPct: -3.23, kospiPct: -4.5, vixPrice: 79.13, vixChange: 10, usdKrwChange: 25, financialInstitution: true },
  },
  {
    name: 'TP-02: 2008-09-29 리먼 파산',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -8.81, dowPct: -7.0, nasdaqPct: -9.14, kospiPct: -5, vixPrice: 46.72, vixChange: 8, usdKrwChange: 30, financialInstitution: true },
  },
  {
    name: 'TP-03: 2020-03-12 코로나',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -9.51, dowPct: -9.99, nasdaqPct: -9.43, kospiPct: -5, vixPrice: 75.47, vixChange: 15, usdKrwChange: 25, pandemic: true },
  },
  {
    name: 'TP-04: 2020-03-16 코로나 서킷',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -11.98, dowPct: -12.93, nasdaqPct: -12.32, kospiPct: -6, vixPrice: 82.69, vixChange: 20, usdKrwChange: 30, pandemic: true },
  },
  {
    name: 'TP-05: 2020-02-27 코로나 초기',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -4.42, dowPct: -4.42, nasdaqPct: -4.61, kospiPct: -3.3, vixPrice: 39.16, vixChange: 12, usdKrwChange: 15, pandemic: true },
  },
  {
    name: 'TP-06: 2022-06-13 금리쇼크',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -3.88, dowPct: -2.79, nasdaqPct: -4.68, kospiPct: -3.5, vixPrice: 34.56, vixChange: 6, usdKrwChange: 12, centralBank: true },
  },
  {
    name: 'TP-07: 2018-02-05 VIX 쇼크',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -4.10, dowPct: -4.60, nasdaqPct: -3.78, kospiPct: -2.5, vixPrice: 37.32, vixChange: 20, usdKrwChange: 8, centralBank: true },
  },
  {
    name: 'TP-08: 2024-08-05 엔캐리 청산',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -3.0, dowPct: -2.6, nasdaqPct: -3.43, kospiPct: -8.77, vixPrice: 65, vixChange: 25, usdKrwChange: 20, nikkeiPct: -12.4, nikkeiConfirmed: true },
  },
  {
    name: 'TP-09: 2025-04-07 관세 쇼크',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -5.97, dowPct: -5.50, nasdaqPct: -5.82, kospiPct: -5.57, vixPrice: 45, vixChange: 12, usdKrwChange: 20, tariffs: true },
  },
  {
    name: 'TP-10: 2018-10-10 무역전쟁',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -3.29, dowPct: -3.15, nasdaqPct: -4.08, kospiPct: -2.5, vixPrice: 28, vixChange: 6, usdKrwChange: 10, tariffs: true },
  },
  {
    name: 'TP-11: 2015-08-24 중국 블먼',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -3.94, dowPct: -3.57, nasdaqPct: -3.82, kospiPct: -2.47, vixPrice: 40.74, vixChange: 15, usdKrwChange: 15, geopolitics: true },
  },
  {
    name: 'TP-12: 2011-08-08 미국 신용등급 하락',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -6.66, dowPct: -5.55, nasdaqPct: -6.90, kospiPct: -4, vixPrice: 48, vixChange: 18, usdKrwChange: 15, financialInstitution: true },
  },
  {
    name: 'TP-13: 2020-03-09 유가전쟁+팬데믹 (다중이벤트)',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -7.60, dowPct: -7.79, nasdaqPct: -7.29, kospiPct: -4.2, vixPrice: 54.46, vixChange: 15, usdKrwChange: 20, pandemic: true, geopolitics: true },
  },
  {
    name: 'TP-14: 2022-09-13 CPI 쇼크',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -4.32, dowPct: -3.94, nasdaqPct: -5.16, kospiPct: -2.8, vixPrice: 27.27, vixChange: 4, usdKrwChange: 10, centralBank: true },
  },
  {
    name: 'TP-15: 한국 단독 위기 가상 (US flat, KOSPI -4%, 지정학+관세)',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: 0.1, dowPct: 0.2, nasdaqPct: -0.1, kospiPct: -4, nightKospiPct: -4, vixPrice: 28, vixChange: 5, usdKrwChange: 25, geopolitics: true, tariffs: true },
  },
  {
    name: 'TP-16: 관세+지정학 동시 가상 (다중이벤트)',
    expected: 'CRASH_ALERT',
    snapshot: { sp500Pct: -3.5, dowPct: -3.2, nasdaqPct: -3.8, kospiPct: -3, vixPrice: 32, vixChange: 7, usdKrwChange: 12, tariffs: true, geopolitics: true },
  },
];

// ============================================================
// TRUE NEGATIVE SCENARIOS (expect NORMAL)
// ============================================================
const TN_SCENARIOS: BacktestScenario[] = [
  {
    name: 'TN-01: 2026-03-24 야간 반등',
    expected: 'NORMAL',
    snapshot: { sp500Pct: 1.15, dowPct: 1.38, nasdaqPct: 1.38, kospiPct: -6.58, vixPrice: 26.15, vixChange: -0.63, usdKrwChange: -18.44 },
  },
  {
    name: 'TN-02: 일상 변동',
    expected: 'NORMAL',
    snapshot: { sp500Pct: -0.5, dowPct: -0.3, nasdaqPct: -0.7, kospiPct: -0.3, vixPrice: 18, vixChange: 0.5 },
  },
  {
    name: 'TN-03: 소폭 조정',
    expected: 'NORMAL',
    snapshot: { sp500Pct: -1.5, dowPct: -1.2, nasdaqPct: -1.8, kospiPct: -1, vixPrice: 22, vixChange: 2 },
  },
  {
    name: 'TN-04: VIX 스파이크 단독',
    expected: 'NORMAL',
    snapshot: { sp500Pct: -0.2, dowPct: 0.1, nasdaqPct: -0.5, kospiPct: 0, vixPrice: 28, vixChange: 5 },
  },
  {
    name: 'TN-05: 한국만 소폭 하락',
    expected: 'NORMAL',
    snapshot: { sp500Pct: 0.5, dowPct: 0.3, nasdaqPct: 0.7, kospiPct: -1.2 },
  },
  {
    name: 'TN-06: 환율 변동 단독',
    expected: 'NORMAL',
    snapshot: { sp500Pct: 0.1, dowPct: -0.1, nasdaqPct: 0.2, usdKrwChange: 20 },
  },
  {
    name: 'TN-07: 금요일 옵션만기 변동성',
    expected: 'NORMAL',
    snapshot: { sp500Pct: -0.8, dowPct: -0.5, nasdaqPct: -1.0, vixPrice: 25, vixChange: 3 },
  },
  {
    name: 'TN-08: 전일 하락 후 야간 보합',
    expected: 'NORMAL',
    snapshot: { sp500Pct: -2.0, dowPct: -1.8, nasdaqPct: -2.2, kospiPct: -2.5, nightKospiPct: -0.3 },
  },
  {
    name: 'TN-09: Nikkei만 하락',
    expected: 'NORMAL',
    snapshot: { sp500Pct: 0.1, dowPct: 0.2, nasdaqPct: -0.1, nikkeiPct: -3, nikkeiConfirmed: true },
  },
  {
    name: 'TN-10: 이벤트 감지 but 시장 무반응',
    expected: 'NORMAL',
    snapshot: { sp500Pct: 0.2, dowPct: 0.3, nasdaqPct: 0.1, tariffs: true },
  },
  {
    name: 'TN-11: US market holiday + KOSPI -1.5%',
    expected: 'NORMAL',
    snapshot: { sp500Pct: 0, dowPct: 0, nasdaqPct: 0, kospiPct: -1.5 },
  },
  {
    name: 'TN-12: SerpAPI 장애 → VIX single_source',
    expected: 'NORMAL',
    snapshot: { sp500Pct: -1.0, dowPct: -0.8, nasdaqPct: -1.2, kospiPct: -0.5 },
  },
  {
    name: 'TN-13: VIX 이미 극단(45) + 추가 +2pt',
    expected: 'NORMAL',
    snapshot: { sp500Pct: -1.5, dowPct: -1.2, nasdaqPct: -1.8, vixPrice: 47, vixChange: 2 },
  },
  {
    name: 'TN-14: 전일 -10% 후 야간 +8% 반등',
    expected: 'NORMAL',
    snapshot: { sp500Pct: 2, dowPct: 1.5, nasdaqPct: 2.5, kospiPct: -10, nightKospiPct: 8 },
  },
  {
    name: 'TN-15: 경계선 바로 아래 (near miss)',
    expected: 'NORMAL',
    snapshot: { sp500Pct: -2.4, dowPct: -2.4, nasdaqPct: -2.4, kospiPct: -2.3, vixPrice: 23, vixChange: 3 },
  },
];

const ALL_SCENARIOS = [...TP_SCENARIOS, ...TN_SCENARIOS];

describe('Market Assessment Backtest Suite', () => {
  const results: Array<{ name: string; expected: Verdict; actual: Verdict; crashScore: number; confidence: number; pass: boolean }> = [];

  for (const scenario of ALL_SCENARIOS) {
    it(scenario.name, () => {
      const snapshot = createBacktestSnapshot(scenario.snapshot);
      const evidence = evaluateMarketAssessmentSnapshot(snapshot);
      const actual = resolveVerdict(evidence);

      results.push({
        name: scenario.name,
        expected: scenario.expected,
        actual,
        crashScore: evidence.crashScore,
        confidence: evidence.confidence,
        pass: actual === scenario.expected,
      });

      expect(actual).toBe(scenario.expected);
    });
  }

  it('overall accuracy ≥ 93% (max 2 failures in 31 scenarios)', () => {
    const passed = results.filter((r) => r.pass).length;
    const total = results.length;
    const accuracy = (passed / total) * 100;

    console.table(
      results.map((r) => ({
        Scenario: r.name,
        Expected: r.expected,
        Actual: r.actual,
        Score: r.crashScore,
        Confidence: r.confidence,
        Pass: r.pass ? '✅' : '❌',
      }))
    );

    console.log(`\nAccuracy: ${passed}/${total} = ${accuracy.toFixed(1)}%`);

    expect(passed).toBeGreaterThanOrEqual(total - 2);
  });
});
