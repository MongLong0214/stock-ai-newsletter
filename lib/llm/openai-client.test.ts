import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent } from 'undici';
import { OPENAI_API_CONFIG, PIPELINE_CONFIG } from './_config/pipeline-config';

const { mockCreateResponse, mockClient, mockGenerateImage } = vi.hoisted(() => ({
  mockCreateResponse: vi.fn(), mockClient: vi.fn(), mockGenerateImage: vi.fn(),
}));
vi.mock('openai', () => ({
  default: class {
    constructor(options: unknown) { mockClient(options); }
    responses = { create: mockCreateResponse };
    images = { generate: mockGenerateImage };
  },
}));
import { generateImage, generateText } from './openai-client';

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
    expect(mockClient).toHaveBeenCalledWith({
      apiKey: 'test-key', maxRetries: 0, timeout: PIPELINE_CONFIG.STAGE_TIMEOUT,
      fetch: expect.any(Function), fetchOptions: { dispatcher: expect.any(Agent) },
    });
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

  it('sends an attached image as an input_image next to the prompt', async () => {
    await generateText({ prompt: '검수하세요', image: { data: Buffer.from('img'), mimeType: 'image/webp' }, config: { reasoningEffort: 'low' } });
    expect(mockCreateResponse.mock.calls[0][0].input).toEqual([{
      role: 'user',
      content: [
        { type: 'input_text', text: '검수하세요' },
        { type: 'input_image', image_url: `data:image/webp;base64,${Buffer.from('img').toString('base64')}`, detail: 'high' },
      ],
    }]);
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

describe('OpenAI generateImage', () => {
  const options = { prompt: '장면', model: 'gpt-image-2.6-sunburst', size: '1536x1024' as const, quality: 'medium' as const, timeout: 1_000 };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it('decodes the base64 image and requests compressed webp', async () => {
    mockGenerateImage.mockResolvedValue({ data: [{ b64_json: Buffer.from('webp-bytes').toString('base64') }], usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } });
    expect((await generateImage(options)).toString()).toBe('webp-bytes');
    expect(mockGenerateImage).toHaveBeenCalledExactlyOnceWith({
      model: 'gpt-image-2.6-sunburst', prompt: '장면', size: '1536x1024', quality: 'medium', n: 1,
      output_format: 'webp', output_compression: 85,
    }, { signal: expect.any(AbortSignal) });
  });

  it('throws when the response carries no image', async () => {
    mockGenerateImage.mockResolvedValue({ data: [] });
    await expect(generateImage(options)).rejects.toThrow('이미지 응답에 데이터가 없습니다');
  });

  it('aborts the request when it runs past the timeout', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    mockGenerateImage.mockImplementation((_body: unknown, opts: { signal: AbortSignal }) => {
      signal = opts.signal;
      return new Promise(() => {});
    });
    const pending = generateImage(options);
    const assertion = expect(pending).rejects.toThrow('Timeout after 1000ms');
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });
});
