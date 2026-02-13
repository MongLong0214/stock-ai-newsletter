/** HTTP 클라이언트 + Playwright 브라우저 자동화 */

import { Agent, fetch as undiciFetch } from 'undici';
import { chromium, type Browser, type Page } from 'playwright';

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
interface NodeSystemError extends Error { code?: string }

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
    const response = await undiciFetch(url, { headers: createBrowserHeaders(referer), signal: controller.signal, redirect: 'follow', dispatcher: agent });
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as NodeSystemError)?.code;

    const isInstallError = errorMessage.includes('Executable') || errorMessage.includes('playwright install') || errorCode === 'ENOENT';
    if (isInstallError) {
      console.log('   Playwright not installed. Run: npx playwright install chromium');
    } else {
      console.log(`   Browser check failed: ${errorMessage}`);
    }

    browserAvailable = false;
    return false;
  }
}

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    console.log('   Starting browser...');
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
    console.log('   Browser closed');
  }
}

export async function fetchWithBrowser(url: string, timeout: number, domainConfig: DomainConfig): Promise<string> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
  });

  let page: Page | null = null;
  try {
    page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

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
      } catch (error) {
        console.log(`   iframe 처리 실패: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 콘텐츠 셀렉터 대기 (iframe이 아닌 경우)
    if (domainConfig.waitForSelector && !url.includes('blog.naver.com')) {
      try {
        await page.waitForSelector(domainConfig.waitForSelector, { timeout: 10000, state: 'visible' });
      } catch {
        console.log(`   Selector not found: ${domainConfig.waitForSelector}`);
      }
    }

    return await page.content();
  } finally {
    if (page) await page.close();
    await context.close();
  }
}
