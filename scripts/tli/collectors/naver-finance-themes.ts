import { sleep, withRetry } from '@/scripts/tli/shared/utils';
import {
  NaverFinanceThemeGateError,
  validateNaverFinanceThemeStocks,
} from '@/scripts/tli/collectors/naver-finance-theme-gates';

interface Theme {
  id: string;
  naverThemeId: string | null;
}

interface ThemeStock {
  themeId: string;
  symbol: string;
  name: string;
  market: string;
  currentPrice: number | null;
  priceChangePct: number | null;
  volume: number | null;
}

/**
 * 붕괴 원인 판별용 응답 지문.
 *
 * 게이트는 "몇 행이 파싱됐나"만 알려주므로 원인을 좁혀주지 못한다. 2026-09-10 실측에서
 * 게이트 4종이 239/239 테마에 동시에 떴지만 전부 "행 0개"의 파생이었고, 진짜 원인은
 * **네이버가 finance.naver.com/sise를 stock.naver.com으로 이전한 것**이었다.
 * `redirected`/`finalUrl`만 남겼어도 즉시 드러났을 사고다. 그래서 그걸 남긴다.
 */
interface ResponseShape {
  bytes: number;
  finalUrl: string;
  redirected: boolean;
  status: number;
  stockCount: number;
}

function tally(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([value, count]) => `"${value}" ${count}건`)
    .join(', ');
}

/**
 * 실패 응답들의 공통 모양으로 원인을 좁힌다.
 *
 * 리다이렉트 여부를 가장 먼저 본다 — 엔드포인트 이전·차단은 리다이렉트로 나타나고,
 * 그때 200을 받아도 그건 우리가 요청한 리소스가 아니다.
 */
export function summarizeResponseShapes(shapes: readonly ResponseShape[]): string {
  if (shapes.length === 0) return '   진단: 수집된 응답 지문 없음';

  const redirected = shapes.filter((shape) => shape.redirected);
  const bytes = shapes.map((shape) => shape.bytes);
  const verdict = redirected.length > 0
    ? `${redirected.length}/${shapes.length}건이 리다이렉트됐다 → 엔드포인트 이전·차단이다. 받은 200은 요청한 리소스가 아니다`
    : '리다이렉트는 없다 → 응답 스키마 변경이나 빈 응답 쪽을 보라';

  return [
    `   진단 표본 ${shapes.length}건`,
    `     HTTP: ${tally(shapes.map((shape) => String(shape.status)))}`,
    `     리다이렉트: ${redirected.length}/${shapes.length}건`,
    `     최종 URL: ${tally(shapes.map((shape) => shape.finalUrl))}`,
    `     응답 크기: ${Math.min(...bytes).toLocaleString()}~${Math.max(...bytes).toLocaleString()}바이트`,
    `     종목 수: ${tally(shapes.map((shape) => String(shape.stockCount)))}`,
    `     해석: ${verdict}`,
  ].join('\n');
}

/** 네이버 종목 API 응답 중 우리가 쓰는 필드만 */
interface NaverThemeApiStock {
  accumulatedTradingVolumeRaw?: string;
  closePriceRaw?: string;
  compareToPreviousPrice?: { name?: string };
  fluctuationsRatio?: string;
  itemCode?: string;
  stockExchangeType?: { name?: string };
  stockName?: string;
}

interface NaverThemeApiResponse {
  stocks?: NaverThemeApiStock[];
  totalCount?: number;
}

const API_PAGE_SIZE = 100;

const toNumber = (value: string | undefined): number | null => {
  if (value === undefined || value === '') return null;
  const num = Number(value.replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
};

/**
 * 테마 종목 수집.
 *
 * 2026-09-10부터 `finance.naver.com/sise/sise_group_detail.naver`가
 * `stock.naver.com`으로 301 리다이렉트되면서 HTML 테이블(`table.type_5`)이 사라졌다.
 * 새 화면은 CSR이라 HTML에 데이터가 없다 — 같은 데이터를 주는 JSON API로 옮긴다.
 *
 * 부수 효과로 두 가지가 정확해진다.
 *  - `expectedRows`를 DOM 행수가 아니라 API의 `totalCount`로 받는다(권위 있는 값).
 *  - 시장 구분을 종목코드 첫 자리 추정이 아니라 `stockExchangeType.name`으로 받는다.
 */
async function scrapeNaverFinanceTheme(
  themeId: string,
  naverThemeId: string,
  failureShapes: ResponseShape[],
): Promise<ThemeStock[]> {
  // catch에서 참조해야 하므로 try 밖에 둔다
  let shape: ResponseShape | null = null;

  try {
    const stocks: ThemeStock[] = [];
    let expectedRows = 0;
    let page = 1;

    // totalCount가 페이지 크기를 넘으면 이어서 받는다 — 부족분은 커버리지 게이트가 잡지만,
    // 애초에 다 받아오는 게 맞다.
    for (;;) {
      const url = `https://m.stock.naver.com/api/stocks/theme/${naverThemeId}?page=${page}&pageSize=${API_PAGE_SIZE}`;
      const response = await withRetry(
        async () => {
          const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
          if (!res.ok) throw new Error(`HTTP 오류 ${res.status}`);
          return res;
        },
        3,
        `테마 ${naverThemeId} 종목 수집`
      );

      const body = await response.text();
      const payload = JSON.parse(body) as NaverThemeApiResponse;
      const pageStocks = payload.stocks ?? [];
      if (page === 1) {
        expectedRows = payload.totalCount ?? 0;
        shape = {
          bytes: body.length,
          finalUrl: response.url,
          redirected: response.redirected,
          status: response.status,
          stockCount: pageStocks.length,
        };
      }

      for (const item of pageStocks) {
        const symbol = item.itemCode ?? '';
        const name = item.stockName?.trim() ?? '';
        if (!symbol || !name) continue;

        // 등락률은 부호를 포함해 내려오지만, 방향 필드가 하락인데 양수면 음수로 맞춘다.
        const ratio = toNumber(item.fluctuationsRatio);
        const falling = item.compareToPreviousPrice?.name === 'FALLING';
        const priceChangePct = ratio !== null && falling && ratio > 0 ? -ratio : ratio;

        stocks.push({
          themeId,
          symbol,
          name,
          market: item.stockExchangeType?.name ?? (symbol.startsWith('0') ? 'KOSPI' : 'KOSDAQ'),
          currentPrice: toNumber(item.closePriceRaw),
          priceChangePct,
          volume: toNumber(item.accumulatedTradingVolumeRaw),
        });
      }

      if (pageStocks.length === 0 || stocks.length >= expectedRows || page >= 10) break;
      page += 1;
    }

    // API가 "이 테마엔 종목이 0개"라고 **명시적으로** 답한 경우는 파싱 실패가 아니다.
    // 게이트에 넘기면 invalidExpectedRows+zeroRows로 매 실행 실패로 집계된다.
    // 전면 장애는 여전히 잡힌다 — 모든 테마가 비면 수집 0건이라 붕괴 판정이 걸린다.
    if (expectedRows === 0 && stocks.length === 0) {
      console.log(`   ⊘ 빈 테마 (네이버 totalCount=0)`);
      return [];
    }

    const metrics = validateNaverFinanceThemeStocks(stocks, { expectedRows });
    console.log(
      `   ✓ 수집 게이트 통과: 커버리지 ${(metrics.rowCoverage * 100).toFixed(1)}%, 파싱 성공률 ${(metrics.schemaParseRate * 100).toFixed(1)}%`
    );

    return stocks;
  } catch (error: unknown) {
    console.error(`   ❌ 테마 ${naverThemeId} 종목 수집 실패:`, error instanceof Error ? error.message : String(error));
    if (error instanceof NaverFinanceThemeGateError) {
      if (shape) failureShapes.push(shape);
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

export interface ThemeStockCollection {
  /**
   * **성공적으로 동기화된** 테마.
   *
   * 게이트를 통과했거나 네이버가 명시적으로 "종목 0개"라고 답한 테마만 담는다.
   * 게이트 실패·에러로 결과를 모르는 테마는 넣지 않는다 — mark-and-sweep에서
   * 이 집합이 곧 sweep 범위이고, 실패한 테마를 넣으면 **소스가 잠깐 비었을 때
   * 멀쩡한 종목을 대량 비활성화**한다.
   */
  readonly syncedThemeIds: readonly string[];
  readonly stocks: ThemeStock[];
}

/** 네이버 금융 테마 종목 수집 */
export async function collectNaverFinanceStocks(themes: Theme[]): Promise<ThemeStockCollection> {
  console.log('📈 네이버 금융 테마 종목 수집 중...');
  console.log(`   처리할 테마: ${themes.filter(t => t.naverThemeId).length}개`);

  const allStocks: ThemeStock[] = [];
  const syncedThemeIds: string[] = [];
  const failureShapes: ResponseShape[] = [];
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
      stocks = await scrapeNaverFinanceTheme(theme.id, theme.naverThemeId, failureShapes);
    } catch (error: unknown) {
      if (error instanceof NaverFinanceThemeGateError) {
        gateFailedCount++;
        // kind만 남기면 로그만 보고 원인을 가릴 수 없다 — error.message가 위반 값을 싣는다.
        console.warn(`   ⚠️ 테마 ${theme.id} 게이트 실패로 건너뜀: ${error.message}`);
        await sleep(3000);
        continue;
      }
      throw error;
    }

    // 여기까지 왔으면 이 테마는 성공적으로 동기화됐다(게이트 통과 또는 빈 테마).
    syncedThemeIds.push(theme.id);

    if (stocks.length > 0) {
      console.log(`   ✓ ${stocks.length}개 종목 발견`);
      allStocks.push(...stocks);
    } else {
      console.log(`   ⚠️ 종목 없음`);
    }

    // 요청 간 정중한 지연
    await sleep(3000);
  }

  if (shouldRejectThemeStockCollection({ attemptedThemeCount, gateFailedCount, collectedStockCount: allStocks.length })) {
    // 원인을 단정하지 않는다. "셀렉터 파손 가능성"이라고 못 박았더니 실제 원인이
    // 차단·점검 페이지였던 2026-09-10 사고에서 조사가 셀렉터 쪽으로 쏠렸다.
    throw new Error(
      [
        `네이버 금융 테마 스크래퍼 전면 붕괴 감지 (게이트 실패 ${gateFailedCount}/${attemptedThemeCount}개 테마, 수집 종목 ${allStocks.length}건)`,
        summarizeResponseShapes(failureShapes),
      ].join('\n')
    );
  }

  console.log(`\n   ✅ ${allStocks.length}개 테마-종목 매핑 수집 완료${gateFailedCount > 0 ? ` (게이트 실패 ${gateFailedCount}개 테마 제외)` : ''}`);
  return { stocks: allStocks, syncedThemeIds };
}
