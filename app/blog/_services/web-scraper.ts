/** 웹 스크래핑 오케스트레이션 + barrel export */

import * as cheerio from 'cheerio';
import { PIPELINE_CONFIG } from '../_config/pipeline-config';
import type { ScrapedContent, SerpSearchResult } from '../_types/blog';
import { fetchHtml, fetchWithBrowser, checkBrowserAvailability, type DomainConfig } from './http-client';
import { cleanHtml, extractContent } from './content-extractor';
import { metrics, canAttemptRequest, recordSuccess, recordFailure, enforceRateLimit, updateMetrics } from './scraping-resilience';

export type { DomainConfig } from './http-client';

export interface ScrapeOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  referer?: string;
  forceBrowser?: boolean;
}

const LIMITS = {
  MIN_HTML: 500,
  SCRAPE_DELAY: 800,
} as const;

const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
  'brunch.co.kr': { extraDelay: 1500, contentSelector: '.wrap_body', useBrowser: true, waitForSelector: '.wrap_body', maxRetries: 2 },
  'blog.naver.com': { useBrowser: true, waitForSelector: 'iframe#mainFrame', contentSelector: '.se-main-container, #postViewArea, .post-view', extraDelay: 3000, maxRetries: 2 },
  'm.blog.naver.com': { useBrowser: true, waitForSelector: '.post_ct, #content', contentSelector: '.post_ct, #content, .post-view', extraDelay: 2000 },
  'medium.com': { extraDelay: 1000, contentSelector: 'article', waitForSelector: 'article' },
  'velog.io': { contentSelector: '.atom-one', useBrowser: true, waitForSelector: '.atom-one' },
  'tistory.com': { contentSelector: '.entry-content, .tt_article_useless_p_margin', extraDelay: 1000 },
  'translate.google.com': { skipReason: 'Google Translate 스크래핑 불가', timeout: 5000 },
  'google.com': { skipReason: 'Google 서비스 스크래핑 불가', timeout: 5000 },
  'youtube.com': { skipReason: 'YouTube 스크래핑 불가', timeout: 5000 },
  'facebook.com': { skipReason: 'Facebook 스크래핑 불가', timeout: 5000 },
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function getDomainConfig(url: string): DomainConfig {
  const domain = extractDomain(url);

  for (const [configDomain, config] of Object.entries(DOMAIN_CONFIGS)) {
    if (domain.includes(configDomain)) {
      return config;
    }
  }

  return {};
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const calculateJitter = (base: number) => base + Math.random() * 0.3 * base;

export async function scrapeUrl(
  url: string,
  options: ScrapeOptions = {},
): Promise<ScrapedContent | null> {
  const domain = extractDomain(url);
  const domainConfig = getDomainConfig(url);

  const {
    timeout = domainConfig.timeout ?? PIPELINE_CONFIG.requestTimeout,
    retries = 3,
    retryDelay = 1000,
    referer,
    forceBrowser = false,
  } = options;

  if (!canAttemptRequest(domain)) {
    return null;
  }

  await enforceRateLimit(domain);

  if (domainConfig.skipReason) {
    return null;
  }

  const maxRetries = domainConfig.maxRetries ?? retries;
  let useBrowser = forceBrowser || domainConfig.useBrowser || false;

  if (useBrowser) {
    const available = await checkBrowserAvailability();
    if (!available) {
      useBrowser = false;
    }
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let html: string;

      if (useBrowser) {
        html = await fetchWithBrowser(url, timeout, domainConfig);
      } else {
        try {
          html = await fetchHtml(url, timeout, referer, updateMetrics);
        } catch (httpError) {
          // HTTP 실패 시 마지막 시도에서만 브라우저 폴백
          if (attempt === maxRetries) {
            const available = await checkBrowserAvailability();
            if (available) {
              html = await fetchWithBrowser(url, timeout, domainConfig);
              metrics.browserFallbackCount++;
            } else {
              throw httpError;
            }
          } else {
            throw httpError;
          }
        }
      }

      if (!html || html.length < LIMITS.MIN_HTML) {
        throw new Error('응답이 너무 짧음');
      }

      const $ = cheerio.load(html);
      cleanHtml($);

      const content = extractContent($, url, domainConfig.contentSelector);

      if (content.wordCount < 50) {
        throw new Error(`콘텐츠 너무 짧음 (${content.wordCount} words)`);
      }

      recordSuccess(domain);
      return content;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;

      if (!isLastAttempt) {
        const delay = calculateJitter(retryDelay * Math.pow(2, attempt - 1));
        await sleep(delay);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`   Failed (${url}): ${message}`);
        recordFailure(domain);
      }
    }
  }

  return null;
}

export async function scrapeSearchResults(
  searchResults: SerpSearchResult[],
): Promise<ScrapedContent[]> {
  const scrapedContents: ScrapedContent[] = [];
  const total = searchResults.length;
  let succeeded = 0;

  for (let i = 0; i < searchResults.length; i++) {
    const result = searchResults[i];

    const content = await scrapeUrl(result.link, {
      referer: 'https://www.google.co.kr/search?q=' + encodeURIComponent(result.title),
    });

    if (content) {
      scrapedContents.push(content);
      succeeded++;
    }

    if (i < searchResults.length - 1) {
      await sleep(LIMITS.SCRAPE_DELAY);
    }
  }

  console.log(`   Done: ${succeeded}/${total} (${((succeeded / total) * 100).toFixed(0)}%), fallback ${metrics.browserFallbackCount}x, avg ${Math.round(metrics.averageResponseTime)}ms`);

  return scrapedContents;
}

export { closeBrowser, getBrowser } from './http-client';
export { resetMetrics, getMetrics } from './scraping-resilience';
export { analyzeCompetitors } from './competitor-analyzer';
export { countWords } from './content-extractor';
