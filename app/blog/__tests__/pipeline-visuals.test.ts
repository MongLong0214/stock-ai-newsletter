import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompetitorAnalysis, GeneratedContent } from '../_types/blog';

const { mockCreateResponse, mockSave, mockCheckYmyl, mockVisuals, mockRemoveImages, mockMarket } = vi.hoisted(() => ({
  mockCreateResponse: vi.fn(), mockSave: vi.fn(), mockCheckYmyl: vi.fn(),
  mockVisuals: vi.fn(), mockRemoveImages: vi.fn(), mockMarket: vi.fn(),
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
vi.mock('../_services/ymyl-gate', () => ({ checkYmyl: mockCheckYmyl }));
vi.mock('../_services/blog-repository', () => ({
  saveBlogPost: mockSave,
  countPublishedToday: vi.fn(async () => 0),
  findBlogPostStatus: vi.fn(), publishBlogPost: vi.fn(),
  blogPostExists: vi.fn(async () => false),
}));
vi.mock('../_services/market-data', () => ({
  buildMarketContext: mockMarket,
  alignMarketToBody: vi.fn((market: unknown) => market),
  formatMarketDataForPrompt: vi.fn(() => ''),
}));
vi.mock('../_services/post-visuals', () => ({ createPostVisuals: mockVisuals }));
vi.mock('../_services/image-storage', () => ({ removeBlogImages: mockRemoveImages }));

import { generateBlogPost } from '../pipeline';

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

const IMAGE_PATH = 'posts/s/abc-cover-1536x1024.webp';
const IMAGE_LINE = `![커버](https://x.supabase.co/storage/v1/object/public/blog-images/${IMAGE_PATH} "캡션 · AI 생성 이미지")`;
const MARKET = { stocks: [], theme: null, direct: true, asOf: '2026-11-06' };

const respond = (text: string) => async () => ({ model: 'gpt-6.1-sol', status: 'completed', output_text: text, output: [] });

async function run() {
  const result = generateBlogPost(KEYWORD);
  await vi.advanceTimersByTimeAsync(10_000);
  return result;
}

describe('blog pipeline visuals integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('BLOG_HUMANIZE', 'on');
    vi.spyOn(Math, 'random').mockReturnValue(1);
    for (const method of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation(() => {});
    }
    mockCreateResponse.mockReset()
      .mockImplementationOnce(respond(JSON.stringify(content)))
      .mockImplementationOnce(respond(content.content));
    mockCheckYmyl.mockReset().mockResolvedValue([]);
    mockMarket.mockReset().mockResolvedValue(MARKET);
    mockRemoveImages.mockReset().mockResolvedValue(undefined);
    mockVisuals.mockReset().mockImplementation(async ({ markdown }: { markdown: string }) => ({
      markdown: `${IMAGE_LINE}\n\n${markdown}`,
      uploadedPaths: [IMAGE_PATH],
      summary: { chart: false, cover: true, sections: 0 },
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it('saves the body with visuals under the same slug the images were stored for', async () => {
    expect(await run()).toMatchObject({ success: true });

    expect(mockVisuals).toHaveBeenCalledTimes(1);
    const visualsInput = mockVisuals.mock.calls[0][0];
    expect(visualsInput.market).toBe(MARKET);
    expect(mockSave).toHaveBeenCalledTimes(1);
    const saved = mockSave.mock.calls[0][0];
    expect(saved.slug).toBe(visualsInput.slug);
    expect(saved.content.startsWith(IMAGE_LINE)).toBe(true);
    expect(mockRemoveImages).not.toHaveBeenCalled();
  });

  it('drops only the visuals when the final body fails the YMYL gate', async () => {
    mockCheckYmyl.mockImplementation(async (input: { body: string }) =>
      input.body.includes(IMAGE_LINE) ? [{ rule: 'test', detail: 'visual' }] : []);

    expect(await run()).toMatchObject({ success: true });

    const saved = mockSave.mock.calls[0][0];
    expect(saved.content).not.toContain(IMAGE_LINE);
    expect(mockRemoveImages).toHaveBeenCalledWith([IMAGE_PATH]);
  });

  it('removes uploaded images when the draft cannot be saved', async () => {
    mockSave.mockRejectedValueOnce(new Error('db down'));

    expect(await run()).toMatchObject({ success: false });
    expect(mockRemoveImages).toHaveBeenCalledWith([IMAGE_PATH]);
  });

  it('keeps the images when the save timed out, because the write may still commit', async () => {
    mockSave.mockImplementationOnce(() => new Promise(() => {}));
    const result = generateBlogPost(KEYWORD);
    await vi.advanceTimersByTimeAsync(120_000);

    expect(await result).toMatchObject({ success: false });
    expect(mockRemoveImages).not.toHaveBeenCalled();
  });

  it('still publishes the text when market data and visuals fail', async () => {
    mockMarket.mockRejectedValue(new Error('kis down'));
    mockVisuals.mockRejectedValue(new Error('image api down'));

    expect(await run()).toMatchObject({ success: true });
    expect(mockSave.mock.calls[0][0].content).toBe(mockVisuals.mock.calls[0][0].markdown);
  });
});
