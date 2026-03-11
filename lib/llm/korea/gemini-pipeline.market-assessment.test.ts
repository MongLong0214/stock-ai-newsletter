import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGenerateContent,
  mockGetKisMarketAssessmentSnapshot,
  mockEvaluateMarketAssessmentSnapshot,
  mockFormatMarketAssessmentSnapshot,
} = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
  mockGetKisMarketAssessmentSnapshot: vi.fn(),
  mockEvaluateMarketAssessmentSnapshot: vi.fn(),
  mockFormatMarketAssessmentSnapshot: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
    };
  },
}));

vi.mock('@/lib/market-data/kis-market-assessment', () => ({
  getKisMarketAssessmentSnapshot: mockGetKisMarketAssessmentSnapshot,
  evaluateMarketAssessmentSnapshot: mockEvaluateMarketAssessmentSnapshot,
  formatMarketAssessmentSnapshot: mockFormatMarketAssessmentSnapshot,
}));

import { executeMarketAssessment } from './gemini-pipeline';

describe('executeMarketAssessment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
  });

  it('returns the local API snapshot verdict when snapshot acquisition succeeds', async () => {
    mockGetKisMarketAssessmentSnapshot.mockResolvedValue({
      indicators: {
        sp500: { changePct: -3.4, change: -200, price: 6000 },
        dowJones: { changePct: -2.7, change: -900, price: 42000 },
        nasdaqComposite: { changePct: -2.6, change: -500, price: 22000 },
        kospi200MiniFutures: { changePct: -2.8, change: -23, price: 800 },
        vix: { price: 36.2, change: 11.4, changePct: 45.2, validation: 'cross_checked' },
        usdKrw: null,
        usdJpy: null,
      },
      supplementary: {},
      events: {},
    });
    mockEvaluateMarketAssessmentSnapshot.mockReturnValue({
      tier1Signals: ['S&P 500 -3.40%'],
      tier2Signals: [],
      tier3Signals: [],
      supportingNotes: [],
    });
    mockFormatMarketAssessmentSnapshot.mockReturnValue('snapshot');

    const result = await executeMarketAssessment();

    expect(result.verdict).toBe('CRASH_ALERT');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('falls back to Gemini search when market snapshot acquisition fails', async () => {
    mockGetKisMarketAssessmentSnapshot.mockRejectedValue(new Error('snapshot unavailable'));
    mockGenerateContent.mockResolvedValue({
      text: '{"verdict":"CRASH_ALERT","confidence":82,"summary":"Fallback crash signal detected."}',
    });

    const result = await executeMarketAssessment();

    expect(result).toEqual({
      verdict: 'CRASH_ALERT',
      confidence: 82,
      summary: 'Fallback crash signal detected.',
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('downgrades low-confidence fallback crash responses to NORMAL', async () => {
    mockGetKisMarketAssessmentSnapshot.mockRejectedValue(new Error('snapshot unavailable'));
    mockGenerateContent.mockResolvedValue({
      text: '{"verdict":"CRASH_ALERT","confidence":61,"summary":"Weak crash concern."}',
    });

    const result = await executeMarketAssessment();

    expect(result.verdict).toBe('NORMAL');
    expect(result.confidence).toBe(69);
    expect(result.summary).toContain('Gemini search fallback');
  });
});
