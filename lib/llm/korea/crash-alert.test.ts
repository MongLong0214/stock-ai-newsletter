import { afterEach, describe, expect, it, vi } from 'vitest';
const { crashPipeline, stockPipeline } = vi.hoisted(() => ({ crashPipeline: vi.fn(), stockPipeline: vi.fn() }));
vi.mock('./gemini-pipeline', () => ({ executeCrashAnalysisPipeline: crashPipeline, executeGeminiPipeline: stockPipeline, executeMarketAssessment: vi.fn() }));
vi.mock('../_config/pipeline-config', () => ({ PIPELINE_CONFIG: { OUTER_MAX_RETRY: 1, OUTER_BASE_RETRY_DELAY: 0, OUTER_MAX_RETRY_DELAY: 0 } }));
import { getGeminiRecommendation } from './gemini';
import { buildDeterministicCrashAlert } from './crash-alert';
import type { MarketAssessment } from './gemini-pipeline';
const assessment: MarketAssessment = { verdict: 'CRASH_ALERT', confidence: 40, summary: '검증된 가격 급락', severity: 'critical', marketOverview: { sp500_close: '-7.00%', kospi_futures: '확인 불가' } };

describe('crash alert delivery does not depend on generative text', () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
  it('preserves the numeric warning when the LLM is unavailable', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test');
    crashPipeline.mockRejectedValue(new Error('LLM outage'));
    const alert = JSON.parse(await getGeminiRecommendation(assessment));
    expect(alert.type).toBe('crash_alert');
    expect(alert.severity).toBe('critical');
    expect(alert.market_overview).toEqual(assessment.marketOverview);
    expect(alert.historical_context).toContain('제공하지 않습니다');
    expect(stockPipeline).not.toHaveBeenCalled();
  });
  it('produces a base warning even without LLM credentials', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
    expect(JSON.parse(await getGeminiRecommendation(assessment)).type).toBe('crash_alert');
    expect(crashPipeline).not.toHaveBeenCalled();
  });
  it('overrides invented model numbers and an incorrect downgrade', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test');
    const invented = JSON.parse(buildDeterministicCrashAlert(assessment));
    invented.severity = 'warning';
    invented.market_overview = { sp500_close: '+5%', kospi_futures: '+9%' };
    crashPipeline.mockResolvedValue(JSON.stringify(invented));
    const alert = JSON.parse(await getGeminiRecommendation(assessment));
    expect(alert.severity).toBe('critical');
    expect(alert.market_overview).toEqual(assessment.marketOverview);
  });
});
