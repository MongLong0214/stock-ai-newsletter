/** HTTP 클라이언트 + Playwright 브라우저 자동화 */

import { Agent, fetch as undiciFetch } from 'undici';
import { chromium, type Browser, type Page } from 'playwright';
import { abortableSleep, throwIfAborted } from '../_utils/abort';
import { validateUrlSafety, validateRedirectHop } from '@/lib/security/url-validation';

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

async function fetchWithUndici(
  url: string,
  timeout: number,
  referer?: string,
  signal?: AbortSignal,
): Promise<string> {
  throwIfAborted(signal, `fetch ${url}`);
  const safety = await validateUrlSafety(url, { allowedSchemes: ['http', 'https'], checkDns: true });
  throwIfAborted(signal, `fetch ${url}`);
  if (!safety.safe) {
    throw new Error(`URL blocked by SSRF policy: ${safety.reason}`);
  }

  const maxRedirects = 5;
  let currentUrl = url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    throwIfAborted(signal, `fetch ${currentUrl}`);
    const agent = new Agent({ connect: { timeout, rejectUnauthorized: true }, connections: 10, bodyTimeout: timeout, headersTimeout: timeout });
    const controller = new AbortController();
    const onParentAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onParentAbort, { once: true });
    const timeoutId = setTimeout(() => controller.abort(new Error('HTTP request timeout')), timeout);

    try {
      const response = await undiciFetch(currentUrl, {
        headers: createBrowserHeaders(referer),
        signal: controller.signal,
        redirect: 'manual',
        dispatcher: agent,
      });

      // Handle redirects with SSRF validation per hop
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error(`Redirect ${response.status} without Location header`);

        const hopValidation = await validateRedirectHop(location, currentUrl, hop + 1, maxRedirects);
        if (!hopValidation.safe) {
          throw new Error(`Redirect blocked by SSRF policy: ${hopValidation.reason}`);
        }

        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        throw new Error(`Not HTML: ${contentType.split(';')[0]}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onParentAbort);
      await agent.close();
    }
  }

  throw new Error(`Too many redirects (>${maxRedirects})`);
}

export async function fetchHtml(
  url: string,
  timeout: number,
  referer?: string,
  onMetrics?: (domain: string, success: boolean, responseTime: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const startTime = Date.now();
  const domain = new URL(url).hostname;

  try {
    const html = await fetchWithUndici(url, timeout, referer, signal);
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
      args: ['--disable-dev-shm-usage', '--disable-gpu'],
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
      args: ['--disable-dev-shm-usage', '--disable-gpu'],
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

export async function fetchWithBrowser(
  url: string,
  timeout: number,
  domainConfig: DomainConfig,
  signal?: AbortSignal,
): Promise<string> {
  throwIfAborted(signal, `browser fetch ${url}`);
  const safety = await validateUrlSafety(url, { allowedSchemes: ['http', 'https'], checkDns: true });
  throwIfAborted(signal, `fetch ${url}`);
  if (!safety.safe) {
    throw new Error(`URL blocked by SSRF policy: ${safety.reason}`);
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
  });
  const onAbort = () => { void context.close(); };
  signal?.addEventListener('abort', onAbort, { once: true });

  let page: Page | null = null;
  try {
    page = await context.newPage();

    // Install route policy: validate every navigation/redirect target
    await page.route('**/*', async (route) => {
      const request = route.request();
      const requestUrl = request.url();

      // Allow data: URLs (inline resources)
      if (requestUrl.startsWith('data:')) {
        await route.continue();
        return;
      }

      // Block non-http(s) schemes
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        await route.abort('blockedbyclient');
        return;
      }

      // Validate every HTTP(S) request, not only top-level navigation.
      // A hostile page can otherwise reach private services through images,
      // scripts, iframes, fetch/XHR, or redirect chains.
      const requestSafety = await validateUrlSafety(requestUrl, {
        allowedSchemes: ['http', 'https'],
        checkDns: true,
      });
      if (!requestSafety.safe) {
        await route.abort('blockedbyclient');
        return;
      }

      await route.continue();
    });

    throwIfAborted(signal, `browser navigation ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

    if (domainConfig.extraDelay) {
      await abortableSleep(domainConfig.extraDelay, signal, `browser delay ${url}`);
    }

    // 네이버 블로그 iframe 처리
    if (url.includes('blog.naver.com')) {
      try {
        await page.waitForSelector('iframe#mainFrame', { timeout: 5000, state: 'attached' });
        const frame = page.frame({ name: 'mainFrame' }) || page.frames().find(f => f.url().includes('blog.naver.com'));

        if (frame) {
          await frame.waitForSelector('body', { timeout: 5000 });
          await abortableSleep(1000, signal, 'Naver iframe stabilization');
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
    signal?.removeEventListener('abort', onAbort);
    if (page) await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}
