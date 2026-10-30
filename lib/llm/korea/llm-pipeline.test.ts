import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPENAI_API_CONFIG } from '../_config/pipeline-config';

const { mockCreateResponse, mockClient } = vi.hoisted(() => ({
  mockCreateResponse: vi.fn(), mockClient: vi.fn(),
}));
vi.mock('openai', () => ({
  default: class {
    constructor(options: unknown) { mockClient(options); }
    responses = { create: mockCreateResponse };
  },
}));
vi.mock('../_config/pipeline-config', async importOriginal => {
  const actual = await importOriginal<typeof import('../_config/pipeline-config')>();
  return { ...actual, PIPELINE_CONFIG: {
    ...actual.PIPELINE_CONFIG, STAGE_MAX_RETRY: 2,
    STAGE_INITIAL_RETRY_DELAY: 1, STAGE_DELAY: 1, STAGE_TIMEOUT: 100,
  } };
});
import { executeCrashAnalysisPipeline, executeLlmPipeline } from './llm-pipeline';

const ANALYSIS = '검증된 시세와 출처를 바탕으로 작성한 분석 근거입니다. '.repeat(20);
const STOCKS = JSON.stringify([1, 2, 3].map(rank => ({
  ticker: `KOSPI:${String(rank).padStart(6, '0')}`, name: `종목 ${rank}`, close_price: 10000,
  rationale: ANALYSIS,
  signals: { trend_score: 50, momentum_score: 50, volume_score: 50, volatility_score: 50, pattern_score: 50, sentiment_score: 50, overall_score: 50 },
})));
const CRASH = JSON.stringify({ type: 'crash_alert', historical_context: ANALYSIS });
const response = (text = ANALYSIS) => ({
  model: 'gpt-6.1-sol', status: 'completed', output_text: text,
  output: [{ type: 'web_search_call' }, { type: 'message' }, { type: 'web_search_call' }],
  usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140, output_tokens_details: { reasoning_tokens: 25 } },
});

describe('OpenAI analysis pipelines', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it('keeps all seven stock stages grounded and extracts the final JSON from plain text', async () => {
    for (let i = 0; i < 6; i++) mockCreateResponse.mockResolvedValueOnce(response());
    mockCreateResponse.mockResolvedValueOnce(response(`결과:\n\`\`\`json\n${STOCKS}\n\`\`\``));
    expect(JSON.parse(await executeLlmPipeline())).toEqual(JSON.parse(STOCKS));
    expect(mockClient).toHaveBeenCalledExactlyOnceWith({ apiKey: 'test-key', maxRetries: 0, timeout: 100 });
    expect(mockCreateResponse).toHaveBeenCalledTimes(7);
    for (const [request, options] of mockCreateResponse.mock.calls) {
      expect(request).toEqual({
        model: OPENAI_API_CONFIG.MODEL, input: expect.any(String),
        reasoning: { effort: 'high' }, max_output_tokens: OPENAI_API_CONFIG.MAX_OUTPUT_TOKENS,
        tools: [{ type: 'web_search' }],
      });
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
    expect(mockCreateResponse.mock.calls[1][0].input).toContain(ANALYSIS);
    expect(console.log).toHaveBeenCalledWith(JSON.stringify({
      event: 'llm_usage', provider: 'openai', model: 'gpt-6.1-sol', stage: 'STAGE 0',
      promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 25,
      totalTokenCount: 140, webSearchQueriesCount: 2,
    }));
  });

  it('retries a token-truncated stock stage without passing its partial text to the next stage', async () => {
    mockCreateResponse.mockResolvedValueOnce({ ...response('PARTIAL'.repeat(100)), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } });
    for (let i = 0; i < 6; i++) mockCreateResponse.mockResolvedValueOnce(response());
    mockCreateResponse.mockResolvedValueOnce(response(STOCKS));
    expect(await executeLlmPipeline()).toBe(STOCKS);
    expect(mockCreateResponse).toHaveBeenCalledTimes(8);
    expect(mockCreateResponse.mock.calls[1][0].input).toBe(mockCreateResponse.mock.calls[0][0].input);
    expect(mockCreateResponse.mock.calls[2][0].input).not.toContain('PARTIAL');
  });

  it('uses search only for crash research and JSON mode only for its conversion stage', async () => {
    mockCreateResponse.mockResolvedValueOnce(response()).mockResolvedValueOnce({ ...response(CRASH), output: [] });
    expect(await executeCrashAnalysisPipeline('검증된 위험 경고')).toBe(CRASH);
    const [search, json] = mockCreateResponse.mock.calls.map(call => call[0]);
    expect(search.tools).toEqual([{ type: 'web_search' }]);
    expect(search.text).toBeUndefined();
    expect(json.tools).toBeUndefined();
    expect(json.text).toEqual({ format: { type: 'json_object' } });
    expect(json.input).toContain('JSON');
    expect(json.input).toContain(ANALYSIS);
    for (const [request, options] of mockCreateResponse.mock.calls) {
      expect(request.model).toBe(OPENAI_API_CONFIG.MODEL);
      expect(request.reasoning).toEqual({ effort: 'high' });
      expect(request).not.toHaveProperty('temperature');
      expect(request).not.toHaveProperty('top_p');
      expect(request).not.toHaveProperty('top_k');
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it.each([1, 2])('retries max_output_tokens at crash stage %i', async stage => {
    const truncated = { ...response(), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } };
    if (stage === 1) mockCreateResponse.mockResolvedValueOnce(truncated).mockResolvedValueOnce(response()).mockResolvedValueOnce(response(CRASH));
    else mockCreateResponse.mockResolvedValueOnce(response()).mockResolvedValueOnce(truncated).mockResolvedValueOnce(response(CRASH));
    expect(await executeCrashAnalysisPipeline('위험 경고')).toBe(CRASH);
    expect(mockCreateResponse).toHaveBeenCalledTimes(3);
    expect(mockCreateResponse.mock.calls[stage][0]).toEqual(mockCreateResponse.mock.calls[stage - 1][0]);
  });

  it('requires OPENAI_API_KEY before constructing either analysis client', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    await expect(executeLlmPipeline()).rejects.toThrow('OPENAI_API_KEY');
    await expect(executeCrashAnalysisPipeline('위험 경고')).rejects.toThrow('OPENAI_API_KEY');
    expect(mockClient).not.toHaveBeenCalled();
    expect(mockCreateResponse).not.toHaveBeenCalled();
  });

  it('aborts each timed-out crash request before the outer loop retries', async () => {
    vi.useFakeTimers();
    mockCreateResponse.mockImplementation(() => new Promise(() => {}));
    const rejected = expect(executeCrashAnalysisPipeline('위험 경고')).rejects.toThrow('Timeout after 100ms');
    await vi.advanceTimersByTimeAsync(201);
    await rejected;
    expect(mockCreateResponse).toHaveBeenCalledTimes(2);
    expect(mockCreateResponse.mock.calls.every(call => call[1].signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
