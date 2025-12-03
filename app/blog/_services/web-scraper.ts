/** 엔터프라이즈급 웹 스크래핑 서비스 */

import * as cheerio from 'cheerio';
import { Agent, fetch as undiciFetch } from 'undici';
import { chromium, type Browser, type Page } from 'playwright';
import { PIPELINE_CONFIG, CONTENT_GAPS } from '../_config/pipeline-config';
import type { ScrapedContent, CompetitorAnalysis, SerpSearchResult } from '../_types/blog';
import type { AnyNode } from 'domhandler';

// ============================================================================
// 설정 상수
// ============================================================================

const LIMITS = {
  MIN_PARAGRAPH: 30,
  MAX_PARAGRAPH: 2000,
  MIN_DIV: 50,
  MIN_HTML: 500,
  MAX_HEADING: 200,
  MAX_PARAGRAPHS: 50,
  SCRAPE_DELAY: 800,
  MIN_CONTENT_SCORE: 100,
  BROWSER_NAVIGATION_TIMEOUT: 30000,
} as const;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
];

const REMOVE_SELECTORS = [
  'script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'iframe', 'form',
  'button', 'input', 'select', 'textarea', 'svg', 'canvas', 'video', 'audio',
  '.ad', '.ads', '.advertisement', '.sidebar', '.menu', '.comment', '.comments',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[aria-label*="광고"]',
];

interface DomainConfig {
  extraDelay?: number;
  contentSelector?: string;
  useBrowser?: boolean;
  waitForSelector?: string;
  skipReason?: string;
  maxRetries?: number;
  timeout?: number;
}

const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
  'brunch.co.kr': {
    extraDelay: 1500,
    contentSelector: '.wrap_body',
    useBrowser: true,
    waitForSelector: '.wrap_body',
    maxRetries: 2,
  },
  'blog.naver.com': {
    useBrowser: true,
    waitForSelector: 'iframe#mainFrame',
    contentSelector: '.se-main-container, #postViewArea, .post-view',
    extraDelay: 3000,
    maxRetries: 2,
  },
  'm.blog.naver.com': {
    useBrowser: true,
    waitForSelector: '.post_ct, #content',
    contentSelector: '.post_ct, #content, .post-view',
    extraDelay: 2000,
  },
  'medium.com': {
    extraDelay: 1000,
    contentSelector: 'article',
    waitForSelector: 'article',
  },
  'velog.io': {
    contentSelector: '.atom-one',
    useBrowser: true,
    waitForSelector: '.atom-one',
  },
  'tistory.com': {
    contentSelector: '.entry-content, .tt_article_useless_p_margin',
    extraDelay: 1000,
  },
  'translate.google.com': {
    skipReason: 'Google Translate는 스크래핑 불가능',
    timeout: 5000,
  },
  'google.com': {
    skipReason: 'Google 서비스는 스크래핑 불가능',
    timeout: 5000,
  },
  'youtube.com': {
    skipReason: 'YouTube는 스크래핑 불가능',
    timeout: 5000,
  },
  'facebook.com': {
    skipReason: 'Facebook은 스크래핑 불가능',
    timeout: 5000,
  },
};

interface ScrapeOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  referer?: string;
  forceBrowser?: boolean;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

interface RateLimitState {
  requests: number[];
  lastRequest: number;
}

interface ScrapingMetrics {
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  browserFallbackCount: number;
  circuitBreakerTrips: number;
  averageResponseTime: number;
  domainStats: Record<string, {
    attempts: number;
    successes: number;
    failures: number;
    avgResponseTime: number;
  }>;
}

// ============================================================================
// 글로벌 상태 관리
// ============================================================================

const circuitBreakers = new Map<string, CircuitBreakerState>();
const rateLimits = new Map<string, RateLimitState>();
const metrics: ScrapingMetrics = {
  totalAttempts: 0,
  successCount: 0,
  failureCount: 0,
  browserFallbackCount: 0,
  circuitBreakerTrips: 0,
  averageResponseTime: 0,
  domainStats: {},
};

let browserInstance: Browser | null = null;
let browserAvailable: boolean | null = null;
let browserCheckAttempted = false;
let lastBrowserCheckTime = 0;

const BROWSER_CHECK_TIMEOUT = 5000;
const BROWSER_RECHECK_INTERVAL = 5 * 60 * 1000; // 5분

interface NodeSystemError extends Error {
  code?: string;
  errno?: number;
  syscall?: string;
  path?: string;
}

// ============================================================================
// Circuit Breaker 패턴
// ============================================================================

const CIRCUIT_BREAKER_CONFIG = {
  FAILURE_THRESHOLD: 3,
  TIMEOUT: 60000, // 1분
  HALF_OPEN_REQUESTS: 1,
};

function getCircuitBreaker(domain: string): CircuitBreakerState {
  if (!circuitBreakers.has(domain)) {
    circuitBreakers.set(domain, {
      failures: 0,
      lastFailure: 0,
      state: 'closed',
    });
  }
  return circuitBreakers.get(domain)!;
}

function canAttemptRequest(domain: string): boolean {
  const breaker = getCircuitBreaker(domain);
  const now = Date.now();

  if (breaker.state === 'closed') {
    return true;
  }

  if (breaker.state === 'open') {
    if (now - breaker.lastFailure > CIRCUIT_BREAKER_CONFIG.TIMEOUT) {
      breaker.state = 'half-open';
      return true;
    }
    return false;
  }

  return true; // half-open
}

function recordSuccess(domain: string): void {
  const breaker = getCircuitBreaker(domain);
  breaker.failures = 0;
  breaker.state = 'closed';
}

function recordFailure(domain: string): void {
  const breaker = getCircuitBreaker(domain);
  breaker.failures++;
  breaker.lastFailure = Date.now();

  if (breaker.failures >= CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD) {
    breaker.state = 'open';
    metrics.circuitBreakerTrips++;
    console.log(`   🚨 Circuit breaker OPEN for ${domain} (${breaker.failures} failures)`);
  }
}

// ============================================================================
// Rate Limiting
// ============================================================================

const RATE_LIMIT_CONFIG = {
  MAX_REQUESTS_PER_MINUTE: 10,
  MIN_REQUEST_INTERVAL: 500, // ms
};

async function enforceRateLimit(domain: string): Promise<void> {
  const now = Date.now();

  if (!rateLimits.has(domain)) {
    rateLimits.set(domain, { requests: [], lastRequest: 0 });
  }

  const state = rateLimits.get(domain)!;

  // Clean old requests (>1 minute)
  state.requests = state.requests.filter(t => now - t < 60000);

  // Check rate limit
  if (state.requests.length >= RATE_LIMIT_CONFIG.MAX_REQUESTS_PER_MINUTE) {
    const oldestRequest = state.requests[0];
    const waitTime = 60000 - (now - oldestRequest);
    if (waitTime > 0) {
      console.log(`   ⏳ Rate limit: waiting ${Math.round(waitTime / 1000)}s for ${domain}`);
      await sleep(waitTime);
    }
  }

  // Enforce minimum interval
  const timeSinceLastRequest = now - state.lastRequest;
  if (timeSinceLastRequest < RATE_LIMIT_CONFIG.MIN_REQUEST_INTERVAL) {
    const waitTime = RATE_LIMIT_CONFIG.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    await sleep(waitTime);
  }

  // Record request
  state.requests.push(now);
  state.lastRequest = now;
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function createBrowserHeaders(referer?: string): Record<string, string> {
  return {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': referer || 'https://www.google.com/',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
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

  for (const [configDomain, config] of Object.entries(DOMAIN_CONFIGS)) {
    if (domain.includes(configDomain) || configDomain.includes(domain)) {
      return config;
    }
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

function calculateJitter(baseDelay: number): number {
  const jitter = Math.random() * 0.3 * baseDelay;
  return baseDelay + jitter;
}

// ============================================================================
// Readability Score (콘텐츠 품질 평가)
// ============================================================================

interface ContentBlock {
  element: cheerio.Cheerio<AnyNode>;
  text: string;
  score: number;
  wordCount: number;
}

function calculateReadabilityScore($element: cheerio.Cheerio<AnyNode>): number {
  let score = 0;
  const text = $element.text();
  const wordCount = countWords(text);

  // Word count scoring
  if (wordCount > 100) score += 25;
  if (wordCount > 200) score += 25;
  if (wordCount > 300) score += 25;

  // Paragraph count
  const paragraphCount = $element.find('p').length;
  score += Math.min(paragraphCount * 3, 30);

  // Link density (lower is better for content)
  const linkText = $element.find('a').text().length;
  const linkDensity = text.length > 0 ? linkText / text.length : 0;
  if (linkDensity < 0.2) score += 15;
  else if (linkDensity < 0.4) score += 10;

  // Positive indicators
  if ($element.find('p').length > 3) score += 10;
  if ($element.find('h2, h3').length > 0) score += 10;

  // Negative indicators
  if ($element.attr('class')?.match(/comment|sidebar|nav|footer|header/i)) score -= 50;
  if ($element.attr('id')?.match(/comment|sidebar|nav|footer|header/i)) score -= 50;

  return score;
}

function findBestContentBlock($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> | null {
  const candidates: ContentBlock[] = [];

  $('article, main, [role="main"], .post-content, .entry-content, .article-content, .content, #content').each((_, el) => {
    const $el = $(el);
    const text = $el.text();
    const wordCount = countWords(text);

    if (wordCount > 50) {
      candidates.push({
        element: $el,
        text,
        score: calculateReadabilityScore($el),
        wordCount,
      });
    }
  });

  // Fallback: score all divs
  if (candidates.length === 0) {
    $('div').each((_, el) => {
      const $el = $(el);
      const text = $el.text();
      const wordCount = countWords(text);

      if (wordCount > 100) {
        candidates.push({
          element: $el,
          text,
          score: calculateReadabilityScore($el),
          wordCount,
        });
      }
    });
  }

  if (candidates.length === 0) return null;

  // Sort by score, return best
  candidates.sort((a, b) => b.score - a.score);

  console.log(`   📊 Best content: ${candidates[0].wordCount} words (score: ${candidates[0].score})`);

  return candidates[0].score >= LIMITS.MIN_CONTENT_SCORE ? candidates[0].element : null;
}

// ============================================================================
// HTTP 가져오기
// ============================================================================

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

async function fetchHtml(url: string, timeout: number, referer?: string): Promise<string> {
  const startTime = Date.now();

  try {
    const html = await fetchWithUndici(url, timeout, referer);

    const responseTime = Date.now() - startTime;
    updateMetrics(extractDomain(url), true, responseTime);

    return html;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    updateMetrics(extractDomain(url), false, responseTime);

    throw error;
  }
}

// ============================================================================
// Playwright 브라우저 자동화
// ============================================================================

async function checkBrowserAvailability(): Promise<boolean> {
  const now = Date.now();

  if (browserCheckAttempted && now - lastBrowserCheckTime < BROWSER_RECHECK_INTERVAL) {
    return browserAvailable === true;
  }

  browserCheckAttempted = true;
  lastBrowserCheckTime = now;

  try {
    const testBrowser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: BROWSER_CHECK_TIMEOUT,
    });
    await testBrowser.close();
    browserAvailable = true;
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as NodeSystemError)?.code;

    const isInstallError =
      errorMessage.includes('Executable') ||
      errorMessage.includes('playwright install') ||
      errorCode === 'ENOENT';

    if (isInstallError) {
      console.log('   ⚠️ Playwright browsers not installed. Browser mode disabled.');
      console.log('   ℹ️ To enable browser mode, run: npx playwright install chromium');
    } else {
      console.log(`   ⚠️ Browser check failed: ${errorMessage}`);
    }

    browserAvailable = false;
    return false;
  }
}

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    console.log('   🌐 Starting browser...');
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    console.log('   🌐 Browser closed');
  }
}

async function fetchWithBrowser(url: string, timeout: number, domainConfig: DomainConfig): Promise<string> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
  });

  let page: Page | null = null;

  try {
    page = await context.newPage();

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: LIMITS.BROWSER_NAVIGATION_TIMEOUT,
    });

    // Extra delay for dynamic content
    if (domainConfig.extraDelay) {
      await sleep(domainConfig.extraDelay);
    }

    // Handle Naver blog iframe structure
    if (url.includes('blog.naver.com')) {
      try {
        // Wait for iframe
        await page.waitForSelector('iframe#mainFrame', { timeout: 5000, state: 'attached' });

        // Get iframe and its content
        const frame = page.frame({ name: 'mainFrame' }) || page.frames().find(f => f.url().includes('blog.naver.com'));

        if (frame) {
          // Wait for content inside iframe
          await frame.waitForSelector('body', { timeout: 5000 });
          await sleep(1000);

          // Get HTML from iframe
          const iframeContent = await frame.content();
          return iframeContent;
        }
      } catch (error) {
        console.log(`   ⚠️ iframe 처리 실패: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Wait for content selector if specified (non-iframe case)
    if (domainConfig.waitForSelector && !url.includes('blog.naver.com')) {
      try {
        await page.waitForSelector(domainConfig.waitForSelector, {
          timeout: 10000,
          state: 'visible',
        });
      } catch {
        console.log(`   ⚠️ Selector not found: ${domainConfig.waitForSelector}`);
      }
    }

    // Get HTML from main page
    const html = await page.content();
    return html;
  } finally {
    if (page) await page.close();
    await context.close();
  }
}

// ============================================================================
// 콘텐츠 추출
// ============================================================================

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

  // Use custom selector or find best content block
  let $mainContent: cheerio.Cheerio<AnyNode> | null = null;

    if (customContentSelector) {
        $mainContent = $(customContentSelector).first();
        if ($mainContent.length === 0) {
            console.log(` ⚠️ Custom selector not found: ${customContentSelector}`);
            $mainContent = null;
        }
    }
  if (!$mainContent) {
    $mainContent = findBestContentBlock($);
  }

  if (!$mainContent || $mainContent.length === 0) {
    console.log(`   ⚠️ Using body fallback`);
    $mainContent = $('body');
  }

  // Extract paragraphs
  const paragraphs: string[] = [];
  const $content = cheerio.load($mainContent.html() || '');

  $content('p').each((_, el) => {
    const text = normalizeText($content(el).text());
    if (text.length >= LIMITS.MIN_PARAGRAPH && text.length <= LIMITS.MAX_PARAGRAPH) {
      paragraphs.push(text);
    }
  });

  // Fallback: extract from divs if not enough paragraphs
  if (paragraphs.length < 3) {
    $content('div').each((_, el) => {
      const text = normalizeText($content(el).text());
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

// ============================================================================
// 메트릭 수집
// ============================================================================

function updateMetrics(domain: string, success: boolean, responseTime: number): void {
  metrics.totalAttempts++;

  if (success) {
    metrics.successCount++;
  } else {
    metrics.failureCount++;
  }

  // Update average response time
  const totalResponseTime = metrics.averageResponseTime * (metrics.totalAttempts - 1) + responseTime;
  metrics.averageResponseTime = totalResponseTime / metrics.totalAttempts;

  // Update domain stats
  if (!metrics.domainStats[domain]) {
    metrics.domainStats[domain] = {
      attempts: 0,
      successes: 0,
      failures: 0,
      avgResponseTime: 0,
    };
  }

  const domainStats = metrics.domainStats[domain];
  domainStats.attempts++;

  if (success) {
    domainStats.successes++;
  } else {
    domainStats.failures++;
  }

  const totalDomainTime = domainStats.avgResponseTime * (domainStats.attempts - 1) + responseTime;
  domainStats.avgResponseTime = totalDomainTime / domainStats.attempts;
}

export function getMetrics(): ScrapingMetrics {
  return { ...metrics };
}

export function resetMetrics(): void {
  metrics.totalAttempts = 0;
  metrics.successCount = 0;
  metrics.failureCount = 0;
  metrics.browserFallbackCount = 0;
  metrics.circuitBreakerTrips = 0;
  metrics.averageResponseTime = 0;
  metrics.domainStats = {};
  circuitBreakers.clear();
  rateLimits.clear();
}

// ============================================================================
// 메인 스크래핑 함수
// ============================================================================

export async function scrapeUrl(
  url: string,
  options: ScrapeOptions = {}
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

  // Check circuit breaker
  if (!canAttemptRequest(domain)) {
    console.log(`   🚨 Circuit breaker OPEN for ${domain}, skipping`);
    return null;
  }

  // Enforce rate limiting
  await enforceRateLimit(domain);

  // Skip if configured
  if (domainConfig.skipReason) {
    console.log(`   ⏭️ 스킵 (${domain}): ${domainConfig.skipReason}`);
    return null;
  }

  const maxRetries = domainConfig.maxRetries ?? retries;
  let useBrowser = forceBrowser || domainConfig.useBrowser || false;

  // Check browser availability before attempting to use it
  if (useBrowser) {
    const browserAvailableNow = await checkBrowserAvailability();
    if (!browserAvailableNow) {
      console.log(`   ⚠️ Browser requested but not available for ${domain}, falling back to HTTP`);
      useBrowser = false;
    }
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let html: string;

      if (useBrowser) {
        console.log(`   🌐 Browser mode for ${domain}`);
        html = await fetchWithBrowser(url, timeout, domainConfig);
        metrics.browserFallbackCount++;
      } else {
        try {
          html = await fetchHtml(url, timeout, referer);
        } catch (httpError) {
          // HTTP failed, try browser as fallback (only if browser is available)
          if (attempt === maxRetries) {
            const browserAvailableNow = await checkBrowserAvailability();
            if (browserAvailableNow) {
              console.log(`   🌐 Trying browser fallback...`);
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

      // Validate content quality
      if (content.wordCount < 50) {
        throw new Error(`콘텐츠 너무 짧음 (${content.wordCount} words)`);
      }

      recordSuccess(domain);
      return content;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;

      if (!isLastAttempt) {
        const delay = calculateJitter(retryDelay * Math.pow(2, attempt - 1));
        console.log(`   🔄 재시도 ${attempt}/${maxRetries} (${Math.round(delay)}ms 후)...`);
        await sleep(delay);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`   ⚠️ 실패 (${url}): ${message}`);
        recordFailure(domain);
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
  console.log(`   📈 메트릭: 브라우저 폴백 ${metrics.browserFallbackCount}회, 평균 응답시간 ${Math.round(metrics.averageResponseTime)}ms`);

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