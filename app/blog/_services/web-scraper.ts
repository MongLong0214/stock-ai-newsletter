/** 웹 스크래핑 및 경쟁사 분석 서비스 */

import * as cheerio from 'cheerio';
import { Agent, fetch as undiciFetch } from 'undici';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PIPELINE_CONFIG, CONTENT_GAPS } from '../_config/pipeline-config';
import type { ScrapedContent, CompetitorAnalysis, SerpSearchResult } from '../_types/blog';

const execFileAsync = promisify(execFile);

const LIMITS = {
  MIN_PARAGRAPH: 30,
  MAX_PARAGRAPH: 2000,
  MIN_DIV: 50,
  MIN_HTML: 500,
  MAX_HEADING: 200,
  MAX_PARAGRAPHS: 50,
  SCRAPE_DELAY: 800,
} as const;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
];

const REMOVE_SELECTORS = [
  'script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'iframe', 'form',
  'button', 'input', 'select', 'textarea', 'svg', 'canvas', 'video', 'audio',
  '.ad', '.ads', '.advertisement', '.sidebar', '.menu', '.comment', '.comments',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
];

interface DomainConfig {
  extraDelay?: number;
  contentSelector?: string;
  skip?: boolean;
  skipReason?: string;
}

const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
  'brunch.co.kr': { extraDelay: 1000, contentSelector: '.wrap_body' },
  'blog.naver.com': { skip: true, skipReason: 'iframe 구조' },
  'm.blog.naver.com': { skip: true, skipReason: 'iframe 구조' },
  'medium.com': { extraDelay: 500, contentSelector: 'article' },
  'velog.io': { contentSelector: '.atom-one' },
};

interface ScrapeOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  referer?: string;
}

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function createBrowserHeaders(referer?: string): HeadersInit {
  return {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
    'Referer': referer || 'https://www.google.com/',
    'Connection': 'keep-alive',
  };
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function getDomainConfig(url: string): DomainConfig {
  const domain = extractDomain(url);
  if (DOMAIN_CONFIGS[domain]) return DOMAIN_CONFIGS[domain];

  for (const [configDomain, config] of Object.entries(DOMAIN_CONFIGS)) {
    if (domain.endsWith(configDomain)) return config;
  }

  return {};
}

function cleanHtml($: cheerio.CheerioAPI): void {
  $(REMOVE_SELECTORS.join(', ')).remove();
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithUndici(url: string, timeout: number, referer?: string): Promise<string> {
  const agent = new Agent({
    connect: { timeout, rejectUnauthorized: true },
    connections: 10,
    bodyTimeout: timeout,
    headersTimeout: timeout,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await undiciFetch(url, {
      headers: createBrowserHeaders(referer),
      signal: controller.signal,
      redirect: 'follow',
      dispatcher: agent,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error(`Not HTML: ${contentType.split(';')[0]}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
    await agent.close();
  }
}

function sanitizeReferer(referer?: string): string {
  if (!referer) return 'https://www.google.com/';
  try {
    const url = new URL(referer);
    return ['http:', 'https:'].includes(url.protocol) ? referer : 'https://www.google.com/';
  } catch {
    return 'https://www.google.com/';
  }
}

async function fetchWithCurl(url: string, timeout: number, referer?: string): Promise<string> {
  const userAgent = getRandomUserAgent();
  const timeoutSecs = Math.ceil(timeout / 1000);
  const safeReferer = sanitizeReferer(referer);

  const args = [
    '-s', '-L', '--compressed',
    '--max-time', String(timeoutSecs),
    '-A', userAgent,
    '-H', `Referer: ${safeReferer}`,
    url,
  ];

  const { stdout, stderr } = await execFileAsync('curl', args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: timeout + 5000,
  });

  if (stderr && stderr.includes('curl:')) {
    throw new Error(`curl error: ${stderr}`);
  }

  return stdout;
}

async function fetchHtml(url: string, timeout: number, referer?: string): Promise<string> {
  try {
    return await fetchWithUndici(url, timeout, referer);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    console.log(`   ⚡ curl 폴백 (${reason})...`);
    return await fetchWithCurl(url, timeout, referer);
  }
}

function extractContent(
  $: cheerio.CheerioAPI,
  url: string,
  customContentSelector?: string
): ScrapedContent {
  const title =
    $('h1').first().text().trim() ||
    $('title').text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    '';

  const description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    '';

  const headings = { h1: [] as string[], h2: [] as string[], h3: [] as string[] };

  ['h1', 'h2', 'h3'].forEach((tag) => {
    $(tag).each((_, el) => {
      const text = normalizeText($(el).text());
      if (text.length > 0 && text.length < LIMITS.MAX_HEADING) {
        headings[tag as keyof typeof headings].push(text);
      }
    });
  });

  const contentSelectors = customContentSelector
    ? [customContentSelector]
    : [
        'article', 'main', '[role="main"]', '.post-content', '.entry-content',
        '.article-content', '.content', '#content', '.wrap_body', '.atom-one',
      ];

  let mainContent = '';
  for (const selector of contentSelectors) {
    const found = $(selector).first().html();
    if (found && found.length > mainContent.length) {
      mainContent = found;
    }
  }

  if (!mainContent || mainContent.length < 100) {
    mainContent = $('body').html() || '';
  }

  const paragraphs: string[] = [];
  const $main = cheerio.load(mainContent);

  $main('p').each((_, el) => {
    const text = normalizeText($main(el).text());
    if (text.length >= LIMITS.MIN_PARAGRAPH && text.length <= LIMITS.MAX_PARAGRAPH) {
      paragraphs.push(text);
    }
  });

  if (paragraphs.length < 3) {
    $main('div').each((_, el) => {
      const text = normalizeText($main(el).text());
      if (text.length >= LIMITS.MIN_DIV && text.length <= LIMITS.MAX_PARAGRAPH) {
        const isDuplicate = paragraphs.some((p) => p.includes(text) || text.includes(p));
        if (!isDuplicate) paragraphs.push(text);
      }
    });
  }

  const wordCount = countWords(paragraphs.join(' '));

  return {
    url,
    title: normalizeText(title),
    description: normalizeText(description),
    headings,
    paragraphs: paragraphs.slice(0, LIMITS.MAX_PARAGRAPHS),
    wordCount,
    scrapedAt: new Date().toISOString(),
  };
}

export async function scrapeUrl(
  url: string,
  options: ScrapeOptions = {}
): Promise<ScrapedContent | null> {
  const {
    timeout = PIPELINE_CONFIG.requestTimeout,
    retries = 3,
    retryDelay = 1000,
    referer,
  } = options;

  const domainConfig = getDomainConfig(url);

  if (domainConfig.skip) {
    console.log(`   ⏭️ 스킵 (${extractDomain(url)}): ${domainConfig.skipReason}`);
    return null;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (domainConfig.extraDelay && attempt > 1) {
        await sleep(domainConfig.extraDelay);
      }

      const html = await fetchHtml(url, timeout, referer);

      if (!html || html.length < LIMITS.MIN_HTML) {
        throw new Error('응답이 너무 짧음');
      }

      const $ = cheerio.load(html);
      cleanHtml($);

      return extractContent($, url, domainConfig.contentSelector);
    } catch (error) {
      if (attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt - 1);
        console.log(`   🔄 재시도 ${attempt}/${retries} (${delay}ms 후)...`);
        await sleep(delay);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`   ⚠️ 실패 (${url}): ${message}`);
      }
    }
  }

  return null;
}

export async function scrapeSearchResults(
  searchResults: SerpSearchResult[]
): Promise<ScrapedContent[]> {
  const scrapedContents: ScrapedContent[] = [];
  const total = searchResults.length;
  let succeeded = 0;

  console.log(`   📥 ${total}개 URL 스크래핑 시작...`);

  for (let i = 0; i < searchResults.length; i++) {
    const result = searchResults[i];
    const domain = extractDomain(result.link);

    console.log(`   [${i + 1}/${total}] ${domain}...`);

    const content = await scrapeUrl(result.link, {
      referer: 'https://www.google.co.kr/search?q=' + encodeURIComponent(result.title),
    });

    if (content) {
      scrapedContents.push(content);
      succeeded++;
      console.log(`   ✅ 성공 (${content.wordCount} 단어)`);
    }

    if (i < searchResults.length - 1) {
      await sleep(LIMITS.SCRAPE_DELAY);
    }
  }

  const successRate = ((succeeded / total) * 100).toFixed(0);
  console.log(`   📊 완료: ${succeeded}/${total} (${successRate}%)`);

  return scrapedContents;
}

export function analyzeCompetitors(
  scrapedContents: ScrapedContent[],
  targetKeyword: string
): CompetitorAnalysis {
  if (scrapedContents.length === 0) {
    console.log(`   ⚠️ 분석할 콘텐츠 없음. 기본값 사용.`);
    return {
      totalCompetitors: 0,
      commonTopics: [],
      averageWordCount: 1500,
      keywordDensity: {},
      contentGaps: [...CONTENT_GAPS],
      scrapedContents: [],
    };
  }

  const topicCounts = new Map<string, number>();

  scrapedContents.forEach((content) => {
    content.headings.h2.forEach((heading) => {
      const normalized = heading.toLowerCase();
      topicCounts.set(normalized, (topicCounts.get(normalized) || 0) + 1);
    });
  });

  const minOccurrence = scrapedContents.length >= 3 ? 2 : 1;
  const commonTopics = Array.from(topicCounts.entries())
    .filter(([, count]) => count >= minOccurrence)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic]) => topic);

  const validContents = scrapedContents.filter((c) => c.wordCount > 100);
  const totalWords = validContents.reduce((sum, c) => sum + c.wordCount, 0);
  const averageWordCount = validContents.length > 0
    ? Math.round(totalWords / validContents.length)
    : 1500;

  const keywordDensity: Record<string, number> = {};
  const relatedKeywords = targetKeyword.toLowerCase().split(' ').filter((k) => k.length >= 2);
  const regexCache = new Map<string, RegExp>();

  relatedKeywords.forEach((keyword) => {
    regexCache.set(keyword, new RegExp(keyword, 'gi'));
  });

  scrapedContents.forEach((content) => {
    const fullText = content.paragraphs.join(' ').toLowerCase();
    relatedKeywords.forEach((keyword) => {
      const regex = regexCache.get(keyword)!;
      regex.lastIndex = 0;
      const matches = fullText.match(regex);
      keywordDensity[keyword] = (keywordDensity[keyword] || 0) + (matches?.length || 0);
    });
  });

  return {
    totalCompetitors: scrapedContents.length,
    commonTopics,
    averageWordCount,
    keywordDensity,
    contentGaps: [...CONTENT_GAPS],
    scrapedContents,
  };
}