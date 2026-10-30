import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_CONFIG, HUMANIZE_CONFIG } from '../_config/pipeline-config';
import type { CompetitorAnalysis, GeneratedContent } from '../_types/blog';

const { mockCreateResponse, mockSave } = vi.hoisted(() => ({
  mockCreateResponse: vi.fn(), mockSave: vi.fn(),
}));
vi.mock('openai', () => ({
  default: class {
    responses = { create: mockCreateResponse };
  },
}));
vi.mock('../_services/serp-api', () => ({
  searchGoogle: vi.fn(async () => [{ link: 'https://example.com/article' }]),
}));
vi.mock('../_services/web-scraper', () => ({
  scrapeSearchResults: vi.fn(async () => [{}]),
  analyzeCompetitors: vi.fn(() => analysis),
  closeBrowser: vi.fn(async () => {}),
  getMetrics: vi.fn(), resetMetrics: vi.fn(),
}));
vi.mock('../_services/ymyl-gate', () => ({ checkYmyl: vi.fn(async () => []) }));
vi.mock('../_services/blog-repository', () => ({
  saveBlogPost: mockSave,
  countPublishedToday: vi.fn(async () => 0),
  findBlogPostStatus: vi.fn(), publishBlogPost: vi.fn(),
}));
vi.mock('../_services/keyword-generator', () => ({
  generateKeywords: vi.fn(async () => ({
    success: true,
    keywords: [3, 2, 1].map(volume => ({
      keyword: KEYWORD, contentType: 'guide', estimatedSearchVolume: volume,
    })),
  })),
}));

import { generateBlogPost, generateWithDynamicKeywords } from '../pipeline';

const KEYWORD = '주식 기술적 분석';
const analysis: CompetitorAnalysis = {
  totalCompetitors: 1, commonTopics: [], averageWordCount: 100,
  keywordDensity: {}, contentGaps: [], scrapedContents: [], competitorKeywords: [],
};
const content: GeneratedContent = {
  title: `${KEYWORD} 기초와 활용 방법`,
  description: `${KEYWORD}을 살펴봅니다.`,
  metaTitle: `${KEYWORD} 활용 방법`,
  metaDescription: `${KEYWORD}의 기초와 활용 방법을 살펴봅니다.`,
  content: ['기초', '활용', '정리'].map(section =>
    `## ${KEYWORD} ${section}\n\n${`${KEYWORD}은 가격 흐름과 거래량을 함께 살펴보는 방법입니다. `.repeat(20)}`
  ).join('\n\n').trim(),
  headings: [], suggestedTags: [KEYWORD],
  faqItems: [
    { question: '무엇을 살펴보나요?', answer: '가격 흐름과 거래량입니다.' },
    { question: '어떻게 활용하나요?', answer: '여러 지표를 함께 살펴봅니다.' },
  ],
};

function responseAfter(text: string, ms: number) {
  return () => new Promise(resolve => setTimeout(() => resolve({
    model: 'gpt-6.1-sol', status: 'completed', output_text: text, output: [],
  }), ms));
}

describe('blog LLM timeout budgets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockCreateResponse.mockReset();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('BLOG_HUMANIZE', 'on');
    vi.spyOn(Math, 'random').mockReturnValue(1);
    for (const method of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation(() => {});
    }
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it('allows nearly 600 seconds for generation and humanization and drafts only one post', async () => {
    expect(CONTENT_CONFIG.timeout).toBe(600_000);
    expect(HUMANIZE_CONFIG.timeout).toBe(600_000);
    mockCreateResponse
      .mockImplementationOnce(responseAfter(JSON.stringify(content), 599_999))
      .mockImplementationOnce(responseAfter(content.content, 599_999));

    const result = generateWithDynamicKeywords();
    await vi.advanceTimersByTimeAsync(1_200_000);

    expect(await result).toMatchObject([{ success: true }]);
    expect(mockCreateResponse).toHaveBeenCalledTimes(2);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for two full timeouts, maximum retry backoff, and a slow successful final attempt', async () => {
    mockCreateResponse
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(responseAfter(JSON.stringify(content), 599_999))
      .mockImplementationOnce(responseAfter(content.content, 599_999));

    const result = generateBlogPost(KEYWORD);
    await vi.advanceTimersByTimeAsync(2_407_800);

    expect(await result).toMatchObject({ success: true });
    expect(mockCreateResponse).toHaveBeenCalledTimes(4);
    for (const call of mockCreateResponse.mock.calls.slice(0, 2)) {
      expect(call[1].signal.aborted).toBe(true);
    }
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts all three timed-out attempts before the outer generation budget expires', async () => {
    mockCreateResponse.mockImplementation(() => new Promise(() => {}));

    const result = generateBlogPost(KEYWORD);
    await vi.advanceTimersByTimeAsync(1_807_800);

    expect(await result).toMatchObject({ success: false, error: 'Timeout after 600000ms' });
    expect(mockCreateResponse).toHaveBeenCalledTimes(3);
    for (const call of mockCreateResponse.mock.calls) {
      expect(call[1].signal.aborted).toBe(true);
    }
    expect(mockSave).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
