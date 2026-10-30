import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPENAI_API_CONFIG, PIPELINE_CONFIG } from './_config/pipeline-config';

const { mockCreateResponse, mockClient } = vi.hoisted(() => ({
  mockCreateResponse: vi.fn(), mockClient: vi.fn(),
}));
vi.mock('openai', () => ({
  default: class {
    constructor(options: unknown) { mockClient(options); }
    responses = { create: mockCreateResponse };
  },
}));
import { generateText } from './openai-client';

const response = {
  model: 'gpt-6.1-sol', status: 'completed', output_text: '완료된 응답', output: [],
  usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140, output_tokens_details: { reasoning_tokens: 25 } },
};

describe('OpenAI generateText', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockCreateResponse.mockResolvedValue(response);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it('returns output_text and records usage with SDK retries disabled', async () => {
    expect(await generateText({ prompt: '분석하세요' })).toBe('완료된 응답');
    expect(mockClient).toHaveBeenCalledWith({ apiKey: 'test-key', maxRetries: 0, timeout: PIPELINE_CONFIG.STAGE_TIMEOUT });
    expect(mockCreateResponse).toHaveBeenCalledExactlyOnceWith({
      model: OPENAI_API_CONFIG.MODEL, input: '분석하세요',
      max_output_tokens: OPENAI_API_CONFIG.MAX_OUTPUT_TOKENS,
      reasoning: { effort: 'high' },
    }, { signal: expect.any(AbortSignal) });
    expect(console.log).toHaveBeenCalledWith(JSON.stringify({
      event: 'llm_usage', provider: 'openai', model: 'gpt-6.1-sol', stage: 'generateText',
      promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 25,
      totalTokenCount: 140, webSearchQueriesCount: 0,
    }));
  });

  it('supports lower effort and JSON mode without search', async () => {
    await generateText({ prompt: 'Return JSON', config: { reasoningEffort: 'low', maxOutputTokens: 500, responseMimeType: 'application/json' } });
    expect(mockCreateResponse).toHaveBeenCalledExactlyOnceWith({
      model: OPENAI_API_CONFIG.MODEL, input: 'Return JSON', max_output_tokens: 500,
      reasoning: { effort: 'low' }, text: { format: { type: 'json_object' } },
    }, { signal: expect.any(AbortSignal) });
  });

  it('rejects token-truncated text before consumers can use it', async () => {
    mockCreateResponse.mockResolvedValue({ ...response, status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } });
    await expect(generateText({ prompt: '분석하세요' })).rejects.toThrow('max_output_tokens');
    expect(mockCreateResponse).toHaveBeenCalledTimes(1);
  });

  it('does not construct a client without OPENAI_API_KEY', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    await expect(generateText({ prompt: '분석하세요' })).rejects.toThrow('OPENAI_API_KEY');
    expect(mockClient).not.toHaveBeenCalled();
    expect(mockCreateResponse).not.toHaveBeenCalled();
  });

  it('aborts the SDK request when the existing timeout expires', async () => {
    vi.useFakeTimers();
    mockCreateResponse.mockImplementation(() => new Promise(() => {}));
    const result = generateText({ prompt: '분석하세요', timeout: 50 });
    const rejected = expect(result).rejects.toThrow('Timeout after 50ms');
    const signal = mockCreateResponse.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates API errors without multiplying the caller retry loop', async () => {
    vi.useFakeTimers();
    mockCreateResponse.mockRejectedValue(new Error('429 rate limit'));
    await expect(generateText({ prompt: '분석하세요' })).rejects.toThrow('429');
    expect(mockCreateResponse).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
