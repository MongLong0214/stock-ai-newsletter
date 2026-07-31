import * as cheerio from 'cheerio';
import {
  getAuthoritativeStockMarket,
  type AuthoritativeKoreanStockMarket,
} from '@/app/archive/_utils/api/kis/client';
import { sleep, withRetry } from '@/scripts/tli/shared/utils';
import {
  NaverFinanceThemeGateError,
  validateNaverFinanceThemeStocks,
} from '@/scripts/tli/collectors/naver-finance-theme-gates';

interface Theme {
  id: string;
  naverThemeId: string | null;
}

type CollectedMarket = AuthoritativeKoreanStockMarket | 'UNKNOWN';

interface ThemeStock {
  themeId: string;
  symbol: string;
  name: string;
  market: CollectedMarket;
  currentPrice: number | null;
  priceChangePct: number | null;
  volume: number | null;
}

/** Naver가 URL에 명시한 거래소 값만 신뢰한다. 종목코드·row text·CSS 추정은 금지한다. */
export function classifyExplicitNaverMarket(href: string): CollectedMarket {
  const match = /(?:[?&])sosok=(0|1)(?:&|$)/.exec(href);
  if (match?.[1] === '0') return 'KOSPI';
  if (match?.[1] === '1') return 'KOSDAQ';
  return 'UNKNOWN';
}

export class NaverFinanceMarketResolutionError extends Error {
  readonly name = 'NaverFinanceMarketResolutionError';

  constructor(readonly symbol: string, cause: unknown) {
    super(
      `Authoritative market lookup failed for ${symbol}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

/**
 * 거래소가 URL에 없는 종목만 KIS로 확인한다.
 *
 * 개별 조회 실패는 해당 종목만 제외하고 계속 진행한다. 거래소를 추정해서 넣지 않는다는
 * 원칙은 유지하되(잘못된 market은 하위 분석을 오염시킨다), 한 종목의 일시적 조회 실패가
 * 테마 전체 수집을 날리지는 않게 한다. 실패가 산발적이지 않으면 뒤따르는
 * `validateNaverFinanceThemeStocks` 커버리지 게이트가 잡는다.
 */
async function resolveUnknownMarkets(stocks: readonly ThemeStock[]): Promise<ThemeStock[]> {
  const resolved: ThemeStock[] = [];
  const dropped: string[] = [];

  for (const stock of stocks) {
    if (stock.market !== 'UNKNOWN') {
      resolved.push(stock);
      continue;
    }

    try {
      const market = await withRetry(
        () => getAuthoritativeStockMarket(stock.symbol),
        3,
        `KIS 종목 ${stock.symbol} 거래소 확인`,
      );
      resolved.push({ ...stock, market });
    } catch (error: unknown) {
      dropped.push(stock.symbol);
      console.warn(
        `   ⚠️ ${new NaverFinanceMarketResolutionError(stock.symbol, error).message} — 해당 종목 제외 후 계속`,
      );
    }

    await sleep(100);
  }

  if (dropped.length > 0) {
    console.warn(`   ⚠️ 거래소 미확인으로 제외된 종목 ${dropped.length}건: ${dropped.join(', ')}`);
  }

  return resolved;
}

/** 네이버 금융 테마 페이지 스크래핑 */
async function scrapeNaverFinanceTheme(themeId: string, naverThemeId: string): Promise<ThemeStock[]> {
  const url = `https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${naverThemeId}`;

  try {
    const response = await withRetry(
      async () => {
        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP 오류 ${res.status}`);
        return res;
      },
      3,
      `테마 ${naverThemeId} 종목 스크래핑`,
    );

    // 네이버 금융은 EUC-KR 인코딩 사용
    const buffer = await response.arrayBuffer();
    const html = new TextDecoder('euc-kr').decode(buffer);
    const $ = cheerio.load(html);
    const stocks: ThemeStock[] = [];
    const expectedRows = $('table.type_5 tbody tr')
      .filter((_, row) => $(row).find('td:first-child .name_area a').length > 0)
      .length;

    // 종목 테이블 파싱 (종목 링크는 첫 번째 td의 .name_area 안에 있음)
    $('table.type_5 tbody tr').each((_, row) => {
      const $row = $(row);
      const $link = $row.find('td:first-child .name_area a');
      const href = $link.attr('href') || '';
      const stockCode = href.match(/code=(\d{6})/)?.[1] || '';
      if (!stockCode) return;

      const stockName = $link.text().trim();
      if (!stockName) return;

      // 테이블 컬럼 구조 (11 TDs):
      // td[0]=종목명, td[1]=편입사유, td[2]=현재가, td[3]=전일비, td[4]=등락률,
      // td[5]=매수호가, td[6]=매도호가, td[7]=거래량, td[8]=거래대금, td[9]=전일거래량, td[10]=토론
      const $tds = $row.find('td');
      const parseNum = (text: string): number | null => {
        // 한글 prefix 제거 (상승, 하락, 상한가, 하한가 등) + 화살표 제거
        const cleaned = text.replace(/[,%\s가-힣+▲▼△▽]/g, '');
        const num = Number(cleaned);
        return isFinite(num) && cleaned !== '' ? num : null;
      };

      const currentPrice = parseNum($tds.eq(2).text());
      const priceChangeRaw = parseNum($tds.eq(4).text());
      // 등락률 부호 감지: 하락 시 음수로 변환
      const isNegative = $tds.eq(3).find('img[src*="ico_down"], .blind:contains("하락")').length > 0
        || $tds.eq(4).text().includes('-');
      const priceChangePct = priceChangeRaw !== null && isNegative && priceChangeRaw > 0
        ? -priceChangeRaw
        : priceChangeRaw;
      const volume = parseNum($tds.eq(7).text());

      stocks.push({
        themeId,
        symbol: stockCode,
        name: stockName,
        market: classifyExplicitNaverMarket(href),
        currentPrice,
        priceChangePct,
        volume,
      });
    });

    const resolvedStocks = await resolveUnknownMarkets(stocks);
    const metrics = validateNaverFinanceThemeStocks(resolvedStocks, { expectedRows });
    console.log(
      `   ✓ 스크래퍼 게이트 통과: 커버리지 ${(metrics.rowCoverage * 100).toFixed(1)}%, 파싱 성공률 ${(metrics.schemaParseRate * 100).toFixed(1)}%`,
    );

    return resolvedStocks;
  } catch (error: unknown) {
    console.error(`   ❌ 테마 ${naverThemeId} 스크래핑 실패:`, error instanceof Error ? error.message : String(error));
    if (error instanceof NaverFinanceThemeGateError || error instanceof NaverFinanceMarketResolutionError) {
      throw error;
    }
    return [];
  }
}

/** 게이트 실패 1건이 이미 수집된 다른 테마 결과까지 폐기하지 않도록, 전면 붕괴일 때만 throw */
const GATE_FAILURE_COLLAPSE_RATIO = 0.3;

function shouldRejectThemeStockCollection(input: {
  readonly attemptedThemeCount: number;
  readonly gateFailedCount: number;
  readonly collectedStockCount: number;
}): boolean {
  if (input.attemptedThemeCount === 0) return false;
  const gateFailureRatio = input.gateFailedCount / input.attemptedThemeCount;
  return gateFailureRatio > GATE_FAILURE_COLLAPSE_RATIO || input.collectedStockCount === 0;
}

/** 네이버 금융 테마 종목 수집 */
export async function collectNaverFinanceStocks(themes: Theme[]): Promise<ThemeStock[]> {
  console.log('📈 네이버 금융 테마 종목 수집 중...');
  console.log(`   처리할 테마: ${themes.filter(t => t.naverThemeId).length}개`);

  const allStocks: ThemeStock[] = [];
  let attemptedThemeCount = 0;
  let gateFailedCount = 0;

  for (const theme of themes) {
    if (!theme.naverThemeId) {
      console.log(`   ⊘ 테마 ${theme.id} 건너뜀: naverThemeId 없음`);
      continue;
    }

    console.log(`\n   테마 ${theme.id} 처리 중 (네이버 ID: ${theme.naverThemeId})`);
    attemptedThemeCount++;

    let stocks: ThemeStock[];
    try {
      stocks = await scrapeNaverFinanceTheme(theme.id, theme.naverThemeId);
    } catch (error: unknown) {
      if (error instanceof NaverFinanceThemeGateError) {
        gateFailedCount++;
        console.warn(
          `   ⚠️ 테마 ${theme.id} 게이트 실패로 건너뜀: ${error.issues.map((issue) => issue.kind).join(', ')}`,
        );
        await sleep(3000);
        continue;
      }
      throw error;
    }

    if (stocks.length > 0) {
      console.log(`   ✓ ${stocks.length}개 종목 발견`);
      allStocks.push(...stocks);
    } else {
      console.log('   ⚠️ 종목 없음');
    }

    // 요청 간 정중한 지연
    await sleep(3000);
  }

  if (shouldRejectThemeStockCollection({ attemptedThemeCount, gateFailedCount, collectedStockCount: allStocks.length })) {
    throw new Error(
      `네이버 금융 테마 스크래퍼 전면 붕괴 감지 (게이트 실패 ${gateFailedCount}/${attemptedThemeCount}개 테마, 수집 종목 ${allStocks.length}건) — 셀렉터 파손 가능성`,
    );
  }

  console.log(`\n   ✅ ${allStocks.length}개 테마-종목 매핑 수집 완료${gateFailedCount > 0 ? ` (게이트 실패 ${gateFailedCount}개 테마 제외)` : ''}`);
  return allStocks;
}
