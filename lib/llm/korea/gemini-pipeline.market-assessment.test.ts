import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { riskQuote, riskSnapshot, RISK_NOW } from '@/lib/market-data/__tests__/market-risk-fixture';

const { mockGenerateContent, mockGetSnapshot } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(), mockGetSnapshot: vi.fn(),
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent: mockGenerateContent }; },
}));
vi.mock('@/lib/market-data/kis-market-assessment', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/market-data/kis-market-assessment')>(),
  getKisMarketAssessmentSnapshot: mockGetSnapshot,
}));
import { executeMarketAssessment } from './gemini-pipeline';

describe('executeMarketAssessment: authoritative deterministic verdict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(RISK_NOW));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('keeps a confirmed crash alert even when coverage is below 70', async () => {
    const s = riskSnapshot();
    s.indicators.sp500 = riskQuote('S&P 500', -7);
    s.indicators.dowJones = null;
    s.indicators.nasdaqComposite = null;
    s.indicators.vix = null;
    s.indicators.usdKrw = null;
    mockGetSnapshot.mockResolvedValue(s);
    const result = await executeMarketAssessment();
    expect(result.verdict).toBe('CRASH_ALERT');
    expect(result.confidence).toBeLessThan(70);
    expect(result.severity).toBe('critical');
    expect(result.marketOverview?.sp500_close).toContain('-7.00%');
    expect(result.marketOverview?.kosdaq_futures).toContain('확인 불가');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
  it('never asks an LLM to manufacture a verdict after acquisition fails', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('snapshot unavailable'));
    mockGenerateContent.mockResolvedValue({ text: '{"verdict":"NORMAL","confidence":99,"summary":"invented"}' });
    await expect(executeMarketAssessment()).rejects.toMatchObject({ code: 'MARKET_ASSESSMENT_UNAVAILABLE' });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
  it('fails closed when timestamps are missing, even with a successful HTTP snapshot', async () => {
    const s = riskSnapshot();
    for (const q of Object.values(s.indicators)) if (q) q.observedAt = null;
    mockGetSnapshot.mockResolvedValue(s);
    await expect(executeMarketAssessment()).rejects.toThrow('NORMAL 처리 및 종목 추천을 중단');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
  it('emits NORMAL with explicit probability and safety limitations', async () => {
    mockGetSnapshot.mockResolvedValue(riskSnapshot());
    const result = await executeMarketAssessment();
    expect(result.verdict).toBe('NORMAL');
    expect(result.summary).toContain('안전 보장이 아닙니다');
    expect(result.summary).toContain('not a probability');
    expect(result.policyVersion).toBe('2026-09-23.v3');
  });
});
