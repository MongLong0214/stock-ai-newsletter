import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { SerpSearchResult } from '../../_types/blog';

const { mockFetchHtml } = vi.hoisted(() => ({ mockFetchHtml: vi.fn() }));
vi.mock('../http-client', () => ({
  fetchHtml: mockFetchHtml,
  fetchWithBrowser: vi.fn(() => new Promise(() => {})),
  checkBrowserAvailability: vi.fn(async () => false),
  closeBrowser: vi.fn(async () => {}),
  getBrowser: vi.fn(),
}));
vi.mock('../scraping-resilience', () => ({
  metrics: { browserFallbackCount: 0, averageResponseTime: 0 },
  canAttemptRequest: () => true,
  recordSuccess: vi.fn(), recordFailure: vi.fn(),
  enforceRateLimit: vi.fn(async () => {}),
  updateMetrics: vi.fn(), resetMetrics: vi.fn(), getMetrics: vi.fn(),
}));
vi.mock('../content-extractor', () => ({
  cleanHtml: vi.fn(),
  extractContent: vi.fn((_$: unknown, url: string) => ({ url, title: url, content: '본문', wordCount: 100, headings: [] })),
  countWords: vi.fn(),
}));
vi.mock('../competitor-analyzer', () => ({ analyzeCompetitors: vi.fn() }));

import { scrapeSearchResults } from '../web-scraper';

const HTML = `<html><body>${'본문 '.repeat(300)}</body></html>`;
const results = (links: string[]): SerpSearchResult[] => links.map((link, index) => ({
  position: index + 1, title: link, link, snippet: '', displayed_link: link,
}));
const hang = () => new Promise<string>(() => {});

describe('scrapeSearchResults batch budget', () => {
  let warn: MockInstance;
  let log: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetchHtml.mockReset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    warn.mockRestore();
    log.mockRestore();
  });

  it('keeps a slow success when the next in-flight URL hangs past the budget (run 41363393602)', async () => {
    mockFetchHtml.mockImplementation((url: string) => url.includes('slow-ok')
      ? new Promise<string>((resolve) => setTimeout(() => resolve(HTML), 85_000))
      : hang());
    let settled = false;
    const batch = scrapeSearchResults(results([
      'https://a.example.com/slow-ok', 'https://b.example.com/hang', 'https://c.example.com/never',
    ])).finally(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(89_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(settled).toBe(true);
    await expect(batch).resolves.toEqual([expect.objectContaining({ url: 'https://a.example.com/slow-ok' })]);
    expect(mockFetchHtml).toHaveBeenCalledTimes(2);
  });

  it('returns an empty batch at the budget instead of hanging on the first URL', async () => {
    mockFetchHtml.mockImplementation(hang);
    let settled = false;
    const batch = scrapeSearchResults(results(['https://a.example.com/hang', 'https://b.example.com/never']))
      .finally(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(90_001);
    expect(settled).toBe(true);
    await expect(batch).resolves.toEqual([]);
    expect(mockFetchHtml).toHaveBeenCalledTimes(1);
  });

  it('scrapes every URL when each finishes inside the budget', async () => {
    mockFetchHtml.mockImplementation(async () => HTML);
    const batch = scrapeSearchResults(results(['https://a.example.com/1', 'https://b.example.com/2']));
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(batch).resolves.toHaveLength(2);
  });
});
