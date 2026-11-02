import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

const { mockGenerateText } = vi.hoisted(() => ({ mockGenerateText: vi.fn() }));
vi.mock('@/lib/llm/openai-client', () => ({ generateText: mockGenerateText }));
vi.mock('@/lib/supabase/server-client', () => ({ getServerSupabaseClient: () => ({}) }));
vi.mock('@/lib/supabase/paginate', () => ({ fetchAllRows: vi.fn(async () => []) }));
vi.mock('../tli-context', () => ({ fetchTLIContext: vi.fn(async () => undefined) }));
vi.mock('@/lib/naver-searchad', () => ({
  HINT_KEYWORD_LIMIT: 5,
  credentialsFromEnv: () => ({ customerId: 'c', apiKey: 'k', secretKey: 's' }),
  fetchKeywordVolumes: vi.fn(async (_creds: unknown, batch: string[]) =>
    batch.map((keyword) => ({ keyword, pc: 1_000, mobile: 1_000, total: 2_000 }))),
}));

import { KEYWORD_CONFIG } from '../../_config/pipeline-config';
import { generateKeywords } from '../keyword-generator';

const item = (keyword: string) => ({
  keyword, searchIntent: 'informational', difficulty: 'low', estimatedSearchVolume: 500, relevanceScore: 90,
  contentType: 'guide', topicArea: 'education',
  reasoning: '초보 투자자가 자주 묻는 주제라 검색 수요가 꾸준하고 기존 글과 겹치지 않아 새 글로 다룰 가치가 충분하다.',
});
const response = (...keywords: string[]) => JSON.stringify(keywords.map(item));

describe('generateKeywords time budget (gpt-6.1-sol)', () => {
  let log: MockInstance; let warn: MockInstance; let error: MockInstance;

  beforeEach(() => {
    mockGenerateText.mockReset();
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    log.mockRestore(); warn.mockRestore(); error.mockRestore();
  });

  it('gives each keyword call the sol-sized timeout instead of the 120s default', async () => {
    mockGenerateText.mockResolvedValue(response('배당주 투자 방법', '공매도 원리 설명'));
    await generateKeywords(2);
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({ timeout: KEYWORD_CONFIG.timeout }));
    expect(KEYWORD_CONFIG.timeout).toBeGreaterThanOrEqual(300_000);
  });

  it('keeps keywords from earlier attempts when a later call times out', async () => {
    mockGenerateText
      .mockResolvedValueOnce(response('배당주 투자 방법', '공매도 원리 설명'))
      .mockRejectedValueOnce(new Error('Timeout after 300000ms'))
      .mockRejectedValueOnce(new Error('Timeout after 300000ms'));
    const result = await generateKeywords(4);
    expect(mockGenerateText).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(true);
    expect(result.keywords.map(({ keyword }) => keyword).sort()).toEqual(['공매도 원리 설명', '배당주 투자 방법']);
  });

  it('does not start an attempt that could outlast the budget', async () => {
    vi.useFakeTimers();
    mockGenerateText.mockImplementationOnce(() => new Promise((resolve) => {
      setTimeout(() => resolve(response('배당주 투자 방법')), KEYWORD_CONFIG.budget - KEYWORD_CONFIG.timeout + 1_000);
    }));
    const pending = generateKeywords(4);
    await vi.advanceTimersByTimeAsync(KEYWORD_CONFIG.budget);
    const result = await pending;
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true, keywords: [expect.objectContaining({ keyword: '배당주 투자 방법' })] });
  });

  it('still reports failure when every attempt errors', async () => {
    mockGenerateText.mockRejectedValue(new Error('Timeout after 300000ms'));
    const result = await generateKeywords(2);
    expect(mockGenerateText).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ success: false, keywords: [] });
  });
});
