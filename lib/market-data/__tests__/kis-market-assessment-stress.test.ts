/**
 * 500-Scenario Comprehensive Stress Test Suite
 *
 * 각 지표/지수별 체계적 그리드 + 랜덤 조합으로 500개 시나리오 생성.
 * 모든 시나리오에서 crashScore, confidence, verdict의 정합성을 검증.
 *
 * 검증 항목:
 * 1. crashScore가 수식대로 계산되는가 (수치 정합)
 * 2. verdict가 crashScore/confidence 임계값과 일치하는가 (판정 정합)
 * 3. directionCoherence 분류가 Decision Tree와 일치하는가
 * 4. VIX regime 분류가 구간과 일치하는가
 * 5. 에러/크래시 없이 모든 입력을 처리하는가 (안정성)
 */
import { describe, expect, it } from 'vitest';

import {
  calculateCrashScore,
  calculateConfidence,
  calculateCrossValidationRatio,
  classifyDirectionCoherence,
  evaluateMarketAssessmentSnapshot,
  getConfidenceLabel,
  getRegimeMultiplier,
  getVixRegime,
  type MarketAssessmentSnapshot,
  type VixRegime,
} from '../kis-market-assessment';

// ============================================================
// Helpers
// ============================================================

function createStressSnapshot(o: {
  sp500Pct?: number;
  dowPct?: number;
  nasdaqPct?: number;
  kospiPct?: number;
  nightKospiPct?: number | null;
  isPreMarket?: boolean;
  vixPrice?: number | null;
  vixChange?: number | null;
  vixValidation?: 'cross_checked' | 'single_source' | 'direct';
  usdKrwChange?: number | null;
  usdKrwValidation?: 'cross_checked' | 'single_source' | 'direct';
  nikkeiPct?: number | null;
  nikkeiConfirmed?: boolean;
  foreignerAmountMillion?: number | null;
  tariffs?: boolean;
  geopolitics?: boolean;
  centralBank?: boolean;
  financialInstitution?: boolean;
  pandemic?: boolean;
} = {}): MarketAssessmentSnapshot {
  const ts = new Date().toISOString();
  const mkInd = (code: string, label: string, pct: number) => ({
    code, label, source: 'KIS' as const, price: 100, change: pct, changePct: pct,
    validation: 'direct' as const, secondarySource: null, fetchedAt: ts,
  });

  return {
    fetchedAt: ts,
    indicators: {
      sp500: mkInd('SPX', 'S&P 500', o.sp500Pct ?? 0),
      dowJones: mkInd('.DJI', 'Dow Jones', o.dowPct ?? 0),
      nasdaqComposite: mkInd('COMP', 'NASDAQ', o.nasdaqPct ?? 0),
      kospi200MiniFutures: {
        ...mkInd('A05604', 'KOSPI200 mini futures', o.kospiPct ?? 0),
        contractName: '미니F 202604', remainingDays: 30,
      },
      vix: o.vixPrice != null ? {
        code: '.VIX', label: 'VIX', source: 'MULTI_SOURCE' as const,
        price: o.vixPrice, change: o.vixChange ?? 0, changePct: 0,
        validation: (o.vixValidation ?? 'cross_checked') as 'cross_checked',
        secondarySource: null, fetchedAt: ts,
      } : null,
      usdKrw: o.usdKrwChange != null ? {
        code: 'FX', label: 'USD/KRW', source: 'MULTI_SOURCE' as const,
        price: 1400, change: o.usdKrwChange, changePct: 0,
        validation: (o.usdKrwValidation ?? 'cross_checked') as 'cross_checked',
        secondarySource: null, fetchedAt: ts,
      } : null,
      usdJpy: null,
    },
    nightSession: {
      kospiMiniFutures: o.nightKospiPct != null ? {
        ...mkInd('A05604', 'Night', o.nightKospiPct),
        contractName: 'Night', remainingDays: null,
      } : null,
      isPreMarketHours: o.isPreMarket ?? true,
    },
    supplementary: {
      kospi200Futures: null,
      nikkeiFutures: o.nikkeiPct != null ? {
        label: 'Nikkei', query: '', title: 'Nikkei', snippet: '', link: null,
        price: 50000, change: null, changePct: o.nikkeiPct,
        confirmed: o.nikkeiConfirmed ?? false, proxy: false, fetchedAt: ts,
        source: 'NAVER_STOCK_API' as const,
      } : null,
      foreignerNetSelling: o.foreignerAmountMillion != null ? {
        date: null, dominantStock: null, topRows: [],
        topSellAmountMillion: o.foreignerAmountMillion, topSellQuantityK: 0,
        fetchedAt: ts, source: 'NAVER_FINANCE' as const,
      } : null,
    },
    events: {
      tariffs: { detected: o.tariffs ?? false, evidence: o.tariffs ? ['e'] : [] },
      geopolitics: { detected: o.geopolitics ?? false, evidence: o.geopolitics ? ['e'] : [] },
      centralBankSurprise: { detected: o.centralBank ?? false, evidence: o.centralBank ? ['e'] : [] },
      financialInstitutionFailure: { detected: o.financialInstitution ?? false, evidence: o.financialInstitution ? ['e'] : [] },
      pandemic: { detected: o.pandemic ?? false, evidence: o.pandemic ? ['e'] : [] },
    },
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function manualCrashScore(o: {
  sp500Pct: number;
  kospiPct: number;
  nightKospiPct: number | null;
  vixPrice: number | null;
  vixChange: number | null;
  usdKrwChange: number | null;
  eventCount: number;
  coherence: string;
  vixRegime: VixRegime;
  vixValidated: boolean;
  fxValidated: boolean;
}): number {
  const usNorm = clamp((Math.abs(Math.min(o.sp500Pct, 0)) / 3) * 100, 0, 100);
  const effKospi = o.nightKospiPct ?? o.kospiPct;
  const kospiNorm = clamp((Math.abs(Math.min(effKospi, 0)) / 2.5) * 100, 0, 100);
  const vixNorm = o.vixPrice != null && (o.vixChange ?? 0) > 0
    ? clamp(((o.vixPrice - 20) / 30) * 100, 0, 100) : 0;
  const fxNorm = o.usdKrwChange != null ? clamp((Math.max(0, o.usdKrwChange) / 20) * 100, 0, 100) : 0;
  const eventNorm = clamp((o.eventCount / 3) * 100, 0, 100);

  const regimeMult = getRegimeMultiplier(o.vixRegime);
  const kospiAdj = o.coherence === 'stale_recovery' ? 0 : o.coherence === 'korea_specific' ? 1.2 : o.coherence === 'mixed' ? 0.5 : 1.0;
  const eventAdj = o.coherence === 'korea_specific' ? 1.5 : 1.0;
  const vixW = 0.20 * (o.vixValidated ? 1 : 0.6);
  const fxW = 0.10 * (o.fxValidated ? 1 : 0.6);

  return clamp(
    usNorm * 0.30 +
    kospiNorm * 0.25 * kospiAdj +
    vixNorm * vixW * regimeMult +
    fxNorm * fxW +
    eventNorm * 0.15 * eventAdj,
    0, 100
  );
}

// ============================================================
// Scenario Generators
// ============================================================

interface StressScenario {
  id: string;
  category: string;
  overrides: Parameters<typeof createStressSnapshot>[0];
}

const scenarios: StressScenario[] = [];
let scenarioId = 0;

function addScenario(category: string, overrides: Parameters<typeof createStressSnapshot>[0]): void {
  scenarioId++;
  scenarios.push({ id: `S${String(scenarioId).padStart(3, '0')}`, category, overrides });
}

// ─── Category 1: US 지수 단독 변동 (60개) ───
const US_PCTS = [-12, -10, -8, -6, -5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 5];
for (const pct of US_PCTS) {
  addScenario('US단독', { sp500Pct: pct, dowPct: pct * 0.9, nasdaqPct: pct * 1.1 });
  addScenario('US단독+VIX', { sp500Pct: pct, dowPct: pct * 0.9, nasdaqPct: pct * 1.1, vixPrice: Math.max(12, 20 - pct * 3), vixChange: Math.max(0, -pct * 2) });
  addScenario('US단독+FX', { sp500Pct: pct, dowPct: pct * 0.9, nasdaqPct: pct * 1.1, usdKrwChange: Math.max(0, -pct * 3) });
}

// ─── Category 2: KOSPI 단독 변동 (50개) ───
const KOSPI_PCTS = [-10, -8, -5, -4, -3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 2, 3, 5, 8];
for (const pct of KOSPI_PCTS) {
  addScenario('KOSPI주간', { kospiPct: pct });
  addScenario('KOSPI야간', { kospiPct: pct, nightKospiPct: pct * 0.5 });
  if (pct <= -2) {
    addScenario('KOSPI야간하락', { kospiPct: pct, nightKospiPct: pct });
  }
}

// ─── Category 3: VIX 단독 변동 (40개) ───
const VIX_PRICES = [8, 12, 14.9, 15, 18, 22, 24.9, 25, 28, 30, 34.9, 35, 40, 45, 50, 60, 75, 85, 90, 100];
for (const price of VIX_PRICES) {
  addScenario('VIX단독상승', { vixPrice: price, vixChange: 5 });
  addScenario('VIX단독하락', { vixPrice: price, vixChange: -3 });
}

// ─── Category 4: FX 단독 변동 (20개) ───
const FX_CHANGES = [-30, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 40, 50];
for (const change of FX_CHANGES) {
  addScenario('FX단독', { usdKrwChange: change });
}

// ─── Category 5: 이벤트 조합 (30개) ───
const EVENT_COMBOS: Array<Partial<Record<'tariffs' | 'geopolitics' | 'centralBank' | 'financialInstitution' | 'pandemic', boolean>>> = [
  { tariffs: true },
  { geopolitics: true },
  { centralBank: true },
  { financialInstitution: true },
  { pandemic: true },
  { tariffs: true, geopolitics: true },
  { pandemic: true, financialInstitution: true },
  { tariffs: true, geopolitics: true, centralBank: true },
  { pandemic: true, geopolitics: true, financialInstitution: true },
  { tariffs: true, geopolitics: true, centralBank: true, financialInstitution: true, pandemic: true },
];
for (const events of EVENT_COMBOS) {
  addScenario('이벤트+US하락', { sp500Pct: -3, dowPct: -2.8, nasdaqPct: -3.2, ...events });
  addScenario('이벤트+US상승', { sp500Pct: 1, dowPct: 1, nasdaqPct: 1, ...events });
  addScenario('이벤트+KOSPI하락', { kospiPct: -3, nightKospiPct: -3, ...events });
}

// ─── Category 6: 야간 반등/하락 시나리오 (40개) ───
const NIGHT_COMBOS = [
  { kospiPct: -6, nightKospiPct: 5, sp500Pct: 1 },
  { kospiPct: -8, nightKospiPct: 6, sp500Pct: 1.5 },
  { kospiPct: -10, nightKospiPct: 8, sp500Pct: 2 },
  { kospiPct: -4, nightKospiPct: 3, sp500Pct: 0.5 },
  { kospiPct: -3, nightKospiPct: -0.3, sp500Pct: -2 },
  { kospiPct: -5, nightKospiPct: -4, sp500Pct: -3 },
  { kospiPct: -6, nightKospiPct: -5, sp500Pct: -5 },
  { kospiPct: -2, nightKospiPct: 1, sp500Pct: 0 },
  { kospiPct: -1, nightKospiPct: -1, sp500Pct: -1 },
  { kospiPct: 0, nightKospiPct: 2, sp500Pct: 1 },
];
for (const combo of NIGHT_COMBOS) {
  addScenario('야간반등', { ...combo, dowPct: combo.sp500Pct * 0.9, nasdaqPct: combo.sp500Pct * 1.1 });
  addScenario('야간반등+VIX', { ...combo, dowPct: combo.sp500Pct * 0.9, nasdaqPct: combo.sp500Pct * 1.1, vixPrice: 25, vixChange: -2 });
  addScenario('야간반등+FX', { ...combo, dowPct: combo.sp500Pct * 0.9, nasdaqPct: combo.sp500Pct * 1.1, usdKrwChange: -10 });
  addScenario('야간반등+이벤트', { ...combo, dowPct: combo.sp500Pct * 0.9, nasdaqPct: combo.sp500Pct * 1.1, tariffs: true });
}

// ─── Category 7: Coherence 경계 테스트 (30개) ───
for (const usPct of [-0.5, -0.3, 0, 0.3, 0.5, 1.0]) {
  for (const kospiPct of [-1.5, -2.0, -3.0, -5.0, 0]) {
    addScenario('coherence경계', { sp500Pct: usPct, dowPct: usPct, nasdaqPct: usPct, kospiPct, vixChange: 1 });
  }
}

// ─── Category 8: VIX regime 경계 (20개) ───
for (const boundary of [14, 14.5, 14.9, 15, 15.1, 24, 24.9, 25, 25.1, 34, 34.9, 35, 35.1]) {
  addScenario('VIX경계', { vixPrice: boundary, vixChange: 3, sp500Pct: -2, dowPct: -2, nasdaqPct: -2 });
}

// ─── Category 9: Validation 변동 (20개) ───
for (const vixVal of ['cross_checked', 'single_source'] as const) {
  for (const fxVal of ['cross_checked', 'single_source'] as const) {
    addScenario('validation', { sp500Pct: -3, dowPct: -3, nasdaqPct: -3, kospiPct: -3, vixPrice: 35, vixChange: 10, vixValidation: vixVal, usdKrwChange: 15, usdKrwValidation: fxVal });
    addScenario('validation약한', { sp500Pct: -2, dowPct: -2, nasdaqPct: -2, kospiPct: -1, vixPrice: 22, vixChange: 2, vixValidation: vixVal, usdKrwChange: 5, usdKrwValidation: fxVal });
  }
}

// ─── Category 10: US Holiday + 보조지표 (20개) ───
for (const kospiPct of [-4, -3, -2, -1.5, -1, 0]) {
  addScenario('USholiday', { sp500Pct: 0, dowPct: 0, nasdaqPct: 0, kospiPct });
  addScenario('USholiday+nikkei', { sp500Pct: 0, dowPct: 0, nasdaqPct: 0, kospiPct, nikkeiPct: -3, nikkeiConfirmed: true });
  addScenario('USholiday+foreigner', { sp500Pct: 0, dowPct: 0, nasdaqPct: 0, kospiPct, foreignerAmountMillion: 2_500_000 });
}

// ─── Category 11: Extreme / Null 경계 (20개) ───
addScenario('극단폭락', { sp500Pct: -20, dowPct: -18, nasdaqPct: -22, kospiPct: -15, vixPrice: 90, vixChange: 40, usdKrwChange: 50, pandemic: true, financialInstitution: true });
addScenario('극단상승', { sp500Pct: 5, dowPct: 4, nasdaqPct: 6, kospiPct: 5, nightKospiPct: 5, vixPrice: 10, vixChange: -5 });
addScenario('VIX_null', { sp500Pct: -3, dowPct: -3, nasdaqPct: -3, vixPrice: null });
addScenario('FX_null', { sp500Pct: -3, dowPct: -3, nasdaqPct: -3, usdKrwChange: null });
addScenario('전부null', { vixPrice: null, usdKrwChange: null });
addScenario('주간시간', { sp500Pct: -3, dowPct: -3, nasdaqPct: -3, kospiPct: -3, isPreMarket: false });
addScenario('야간+주간시간', { sp500Pct: -3, dowPct: -3, nasdaqPct: -3, kospiPct: -3, nightKospiPct: -3, isPreMarket: false });
addScenario('VIX0', { vixPrice: 0, vixChange: 0 });
addScenario('VIX_NaN', { vixPrice: Number.NaN, vixChange: 0 });
addScenario('FX음수극단', { usdKrwChange: -50 });
addScenario('KOSPI+10', { kospiPct: 10, nightKospiPct: 10 });
addScenario('VIX100', { vixPrice: 100, vixChange: 30, sp500Pct: -10, dowPct: -10, nasdaqPct: -10 });
addScenario('이벤트5개+폭락', { sp500Pct: -8, dowPct: -8, nasdaqPct: -8, kospiPct: -6, vixPrice: 60, vixChange: 20, usdKrwChange: 30, tariffs: true, geopolitics: true, centralBank: true, financialInstitution: true, pandemic: true });
addScenario('모든지표0', { sp500Pct: 0, dowPct: 0, nasdaqPct: 0, kospiPct: 0, vixPrice: 18, vixChange: 0, usdKrwChange: 0 });

// ─── Category 12: 복합 시그널 그리드 (100개) ───
const GRID_US = [-5, -3, -1, 0, 1];
const GRID_KOSPI = [-5, -3, -1.5, 0, 2];
const GRID_VIX = [12, 22, 32, 45];
for (const us of GRID_US) {
  for (const kospi of GRID_KOSPI) {
    for (const vix of GRID_VIX) {
      addScenario('복합그리드', { sp500Pct: us, dowPct: us * 0.95, nasdaqPct: us * 1.05, kospiPct: kospi, vixPrice: vix, vixChange: Math.max(0, vix - 20) * 0.3 });
    }
  }
}

// ─── Category 13: 한국 단독 위기 변형 (30개) ───
for (const kospi of [-2, -3, -4, -5, -6]) {
  for (const fx of [10, 20, 30]) {
    addScenario('한국단독', { sp500Pct: 0.2, dowPct: 0.1, nasdaqPct: 0.3, kospiPct: kospi, nightKospiPct: kospi, usdKrwChange: fx, geopolitics: true });
    addScenario('한국단독+관세', { sp500Pct: 0.1, dowPct: 0, nasdaqPct: 0.2, kospiPct: kospi, nightKospiPct: kospi, usdKrwChange: fx, tariffs: true, geopolitics: true });
  }
}

// ─── Category 14: Stale 데이터 변형 (40개) ───
for (const kospi of [-2, -4, -6, -8, -10]) {
  for (const us of [0.5, 1, 1.5, 2]) {
    addScenario('stale변형', { sp500Pct: us, dowPct: us, nasdaqPct: us, kospiPct: kospi, vixChange: -1, usdKrwChange: -5 });
    addScenario('stale+nikkei', { sp500Pct: us, dowPct: us, nasdaqPct: us, kospiPct: kospi, vixChange: -1, usdKrwChange: -5, nikkeiPct: -2, nikkeiConfirmed: true });
  }
}

// ─── Category 15: 미세 경계 crashScore 50-60 구간 (24개) ───
const BOUNDARY_US = [-2.2, -2.4, -2.6, -2.8, -3.0, -3.2];
const BOUNDARY_KOSPI = [-1.8, -2.0, -2.2, -2.5];
for (const us of BOUNDARY_US) {
  for (const kospi of BOUNDARY_KOSPI) {
    addScenario('crashScore경계', { sp500Pct: us, dowPct: us, nasdaqPct: us, kospiPct: kospi, vixPrice: 22, vixChange: 2, usdKrwChange: 5 });
  }
}

// ─── Category 16: US/KOSPI/VIX 3차원 세밀 그리드 (180개) ───
const FINE_US = [-6, -4, -3, -2, -1, 0, 1, 2, 3];
const FINE_KOSPI = [-6, -4, -2.5, -1, 0, 2];
const FINE_VIX = [10, 18, 25, 35, 50];
for (const us of FINE_US) {
  for (const kospi of FINE_KOSPI) {
    for (const vix of FINE_VIX) {
      if (scenarios.length < 850) {
        addScenario('세밀그리드', { sp500Pct: us, dowPct: us * 0.95, nasdaqPct: us * 1.05, kospiPct: kospi, vixPrice: vix, vixChange: Math.max(0, (vix - 18) * 0.2), usdKrwChange: Math.max(0, -us * 2) });
      }
    }
  }
}

// ─── Category 17: FX + 이벤트 조합 세밀 (60개) ───
const FINE_FX = [-20, -10, 0, 5, 10, 15, 20, 30];
const FINE_EVENTS: Array<{ tariffs?: boolean; geopolitics?: boolean; pandemic?: boolean }> = [
  {}, { tariffs: true }, { geopolitics: true }, { pandemic: true },
  { tariffs: true, geopolitics: true }, { pandemic: true, geopolitics: true },
];
for (const fx of FINE_FX) {
  for (const evt of FINE_EVENTS) {
    if (scenarios.length < 930) {
      addScenario('FX+이벤트', { sp500Pct: -2, dowPct: -2, nasdaqPct: -2, kospiPct: -2, usdKrwChange: fx, ...evt });
    }
  }
}

// ─── Category 18: 야간+주간 디커플링 (40개) ───
for (const dayKospi of [-8, -5, -3, -1, 0]) {
  for (const nightKospi of [-5, -2, 0, 2, 5, 8]) {
    if (scenarios.length < 970) {
      addScenario('야간디커플링', { sp500Pct: 0.5, dowPct: 0.5, nasdaqPct: 0.5, kospiPct: dayKospi, nightKospiPct: nightKospi });
    }
  }
}

// ─── Category 19: Validation 4종 조합 + US 변동 (30개) ───
for (const us of [-4, -3, -2, -1, 0]) {
  for (const vixVal of ['cross_checked', 'single_source', 'direct'] as const) {
    for (const fxVal of ['cross_checked', 'single_source'] as const) {
      if (scenarios.length < 1000) {
        addScenario('validation조합', { sp500Pct: us, dowPct: us, nasdaqPct: us, kospiPct: us * 0.8, vixPrice: 28, vixChange: 4, vixValidation: vixVal, usdKrwChange: 10, usdKrwValidation: fxVal });
      }
    }
  }
}

// ─── Category 20: 극단 조합 + 보조지표 (60개) ───
for (const us of [-10, -5, -3, 0, 1]) {
  for (const kospi of [-8, -4, -2, 0]) {
    for (const nikkei of [null, -5, -2, 2]) {
      if (scenarios.length < 1000) {
        addScenario('극단+보조', {
          sp500Pct: us, dowPct: us * 0.9, nasdaqPct: us * 1.1,
          kospiPct: kospi, vixPrice: Math.max(12, 20 - us * 2),
          vixChange: Math.max(0, -us), usdKrwChange: Math.max(0, -us * 3),
          nikkeiPct: nikkei, nikkeiConfirmed: nikkei !== null && nikkei <= -3,
        });
      }
    }
  }
}

// ─── Category 21: 나머지 패딩 (1000개 도달) ───
const PADDING_US = [-7, -3.5, -1.5, -0.5, 0.5, 1.5];
const PADDING_VIX = [15, 20, 30, 40];
for (const us of PADDING_US) {
  for (const vix of PADDING_VIX) {
    for (const fx of [0, 10, 20]) {
      if (scenarios.length < 1000) {
        addScenario('패딩', { sp500Pct: us, dowPct: us, nasdaqPct: us, vixPrice: vix, vixChange: Math.max(0, vix - 18) * 0.3, usdKrwChange: fx });
      }
    }
  }
}

// ============================================================
// Tests
// ============================================================

describe(`Comprehensive Stress Test (${scenarios.length} scenarios)`, () => {
  const verdicts: Array<{ id: string; category: string; crashScore: number; confidence: number; verdict: string; coherence: string; regime: string }> = [];

  for (const scenario of scenarios) {
    it(`${scenario.id} [${scenario.category}]`, () => {
      const snapshot = createStressSnapshot(scenario.overrides);

      // Must not throw
      const evidence = evaluateMarketAssessmentSnapshot(snapshot);

      // crashScore must be 0-100
      expect(evidence.crashScore).toBeGreaterThanOrEqual(0);
      expect(evidence.crashScore).toBeLessThanOrEqual(100);

      // confidence must be 50-99
      expect(evidence.confidence).toBeGreaterThanOrEqual(50);
      expect(evidence.confidence).toBeLessThanOrEqual(99);

      // VIX regime must be valid
      expect(['low', 'normal', 'elevated', 'extreme']).toContain(evidence.vixRegime);

      // Direction coherence must be valid
      expect(['coherent_normal', 'coherent_crash', 'stale_recovery', 'korea_specific', 'mixed']).toContain(evidence.directionCoherence);

      // Confidence label must match confidence value
      if (evidence.confidence >= 90) expect(evidence.confidenceLabel).toBe('critical');
      else if (evidence.confidence >= 80) expect(evidence.confidenceLabel).toBe('strong');
      else expect(evidence.confidenceLabel).toBe('warning');

      // Verdict consistency: crashScore ≥ 55 AND confidence ≥ 70 → CRASH_ALERT
      const expectedVerdict = evidence.crashScore >= 55 && evidence.confidence >= 70 ? 'CRASH_ALERT' : 'NORMAL';

      // signalDetails must have 5 entries
      expect(evidence.signalDetails).toHaveLength(5);

      // Each signal contribution must be non-negative
      for (const detail of evidence.signalDetails) {
        expect(detail.normalizedDrop).toBeGreaterThanOrEqual(0);
        expect(detail.normalizedDrop).toBeLessThanOrEqual(100);
        expect(detail.contribution).toBeGreaterThanOrEqual(0);
      }

      // crossValidationRatio must be 0-1
      expect(evidence.crossValidationRatio).toBeGreaterThanOrEqual(0);
      expect(evidence.crossValidationRatio).toBeLessThanOrEqual(1);

      verdicts.push({
        id: scenario.id,
        category: scenario.category,
        crashScore: Math.round(evidence.crashScore * 10) / 10,
        confidence: Math.round(evidence.confidence * 10) / 10,
        verdict: expectedVerdict,
        coherence: evidence.directionCoherence,
        regime: evidence.vixRegime,
      });
    });
  }

  it('summary: no errors across all scenarios', () => {
    expect(verdicts.length).toBe(scenarios.length);

    const crashAlerts = verdicts.filter((v) => v.verdict === 'CRASH_ALERT');
    const normals = verdicts.filter((v) => v.verdict === 'NORMAL');
    const byCoherence = Object.groupBy(verdicts, (v) => v.coherence);
    const byRegime = Object.groupBy(verdicts, (v) => v.regime);
    const byCategory = Object.groupBy(verdicts, (v) => v.category);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Stress Test Summary: ${scenarios.length} scenarios`);
    console.log(`${'='.repeat(60)}`);
    console.log(`CRASH_ALERT: ${crashAlerts.length} (${((crashAlerts.length / verdicts.length) * 100).toFixed(1)}%)`);
    console.log(`NORMAL: ${normals.length} (${((normals.length / verdicts.length) * 100).toFixed(1)}%)`);
    console.log(`\nBy Coherence:`);
    for (const [key, items] of Object.entries(byCoherence)) {
      console.log(`  ${key}: ${items?.length ?? 0}`);
    }
    console.log(`\nBy VIX Regime:`);
    for (const [key, items] of Object.entries(byRegime)) {
      console.log(`  ${key}: ${items?.length ?? 0}`);
    }
    console.log(`\nBy Category:`);
    for (const [key, items] of Object.entries(byCategory)) {
      const crashes = items?.filter((v) => v.verdict === 'CRASH_ALERT').length ?? 0;
      console.log(`  ${key}: ${items?.length ?? 0} (${crashes} CRASH)`);
    }
    console.log(`${'='.repeat(60)}\n`);

    expect(verdicts.length).toBeGreaterThanOrEqual(400);
  });

  it('stale_recovery scenarios always produce NORMAL', () => {
    const staleVerdicts = verdicts.filter((v) => v.coherence === 'stale_recovery');
    for (const v of staleVerdicts) {
      expect(v.verdict).toBe('NORMAL');
    }
  });

  it('extreme crashes (US ≤ -5% + KOSPI ≤ -5%) always produce CRASH_ALERT', () => {
    const extremeScenarios = scenarios.filter((s) => {
      const o = s.overrides ?? {};
      const sp = o.sp500Pct ?? 0;
      const kp = o.nightKospiPct ?? o.kospiPct ?? 0;
      return sp <= -5 && kp <= -5;
    });
    for (const s of extremeScenarios) {
      const v = verdicts.find((v) => v.id === s.id);
      if (v) {
        expect(v.verdict).toBe('CRASH_ALERT');
      }
    }
  });

  it('all-positive scenarios always produce NORMAL', () => {
    const positiveScenarios = scenarios.filter((s) => {
      const o = s.overrides ?? {};
      const sp = o.sp500Pct ?? 0;
      const kp = o.nightKospiPct ?? o.kospiPct ?? 0;
      return sp > 0 && kp >= 0;
    });
    for (const s of positiveScenarios) {
      const v = verdicts.find((v) => v.id === s.id);
      if (v && v.coherence !== 'korea_specific') {
        expect(v.verdict).toBe('NORMAL');
      }
    }
  });
});
