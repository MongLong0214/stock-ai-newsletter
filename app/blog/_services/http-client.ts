/** HTTP 클라이언트 + Playwright 브라우저 자동화 */

import { Agent, fetch as undiciFetch } from 'undici';
import { chromium, type Browser, type Page } from 'playwright';
import { assertPublicUrl } from './url-guard';

export interface DomainConfig {
  extraDelay?: number;
  contentSelector?: string;
  useBrowser?: boolean;
  waitForSelector?: string;
  skipReason?: string;
  maxRetries?: number;
  timeout?: number;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
];

const BROWSER_CHECK_TIMEOUT = 5000;
const MAX_REDIRECTS = 5;
const BROWSER_RECHECK_INTERVAL = 5 * 60 * 1000;
let browserInstance: Browser | null = null;
let browserAvailable: boolean | null = null;
let browserCheckAttempted = false;
let lastBrowserCheckTime = 0;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithUndici(url: string, timeout: number, referer?: string): Promise<string> {
  const agent = new Agent({ connect: { timeout, rejectUnauthorized: true }, connections: 10, bodyTimeout: timeout, headersTimeout: timeout });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // 리다이렉트는 직접 따라가며 매 hop을 검사한다 — 'follow'면 공인 URL이 내부 주소로 넘겨도 모른다
    let current = url;
    let response;
    for (let hop = 0; ; hop++) {
      await assertPublicUrl(current);
      response = await undiciFetch(current, { headers: createBrowserHeaders(referer), signal: controller.signal, redirect: 'manual', dispatcher: agent });
      const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
      if (!location) break;
      if (hop >= MAX_REDIRECTS) throw new Error(`리다이렉트 ${MAX_REDIRECTS}회 초과`);
      await response.body?.cancel();
      current = new URL(location, current).toString();
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

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

export async function fetchHtml(
  url: string,
  timeout: number,
  referer?: string,
  onMetrics?: (domain: string, success: boolean, responseTime: number) => void,
): Promise<string> {
  const startTime = Date.now();
  const domain = new URL(url).hostname;

  try {
    const html = await fetchWithUndici(url, timeout, referer);
    onMetrics?.(domain, true, Date.now() - startTime);
    return html;
  } catch (error) {
    onMetrics?.(domain, false, Date.now() - startTime);
    throw error;
  }
}

export async function checkBrowserAvailability(): Promise<boolean> {
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
  } catch {
    browserAvailable = false;
    return false;
  }
}

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export async function fetchWithBrowser(url: string, timeout: number, domainConfig: DomainConfig): Promise<string> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
  });

  // 페이지 안의 모든 요청(iframe·스크립트·XHR)도 내부 주소로 못 가게 막는다. 호스트별 판정은 캐시한다.
  const verdicts = new Map<string, Promise<boolean>>();
  await context.route('**/*', async (route) => {
    const target = route.request().url();
    if (target.startsWith('data:') || target.startsWith('blob:')) return route.continue();
    let host = '';
    try { const u = new URL(target); host = `${u.protocol}//${u.host}`; } catch { /* 형식 오류는 아래에서 차단 */ }
    if (!verdicts.has(host)) verdicts.set(host, assertPublicUrl(target).then(() => true, () => false));
    return (await verdicts.get(host)) ? route.continue() : route.abort('blockedbyclient');
  });

  let page: Page | null = null;
  try {
    await assertPublicUrl(url);
    page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    // route는 리다이렉트 중간 hop을 보지 못한다 — 도착한 주소를 다시 검사한다
    await assertPublicUrl(page.url());

    if (domainConfig.extraDelay) await sleep(domainConfig.extraDelay);

    // 네이버 블로그 iframe 처리
    if (url.includes('blog.naver.com')) {
      try {
        await page.waitForSelector('iframe#mainFrame', { timeout: 5000, state: 'attached' });
        const frame = page.frame({ name: 'mainFrame' }) || page.frames().find(f => f.url().includes('blog.naver.com'));

        if (frame) {
          await frame.waitForSelector('body', { timeout: 5000 });
          await sleep(1000);
          return await frame.content();
        }
      } catch {
        // iframe handling failed, fall through to main page content
      }
    }

    // 콘텐츠 셀렉터 대기 (iframe이 아닌 경우)
    if (domainConfig.waitForSelector && !url.includes('blog.naver.com')) {
      try {
        await page.waitForSelector(domainConfig.waitForSelector, { timeout: 10000, state: 'visible' });
      } catch {
        // selector not found, proceed with available content
      }
    }

    return await page.content();
  } finally {
    if (page) await page.close();
    await context.close();
  }
}
