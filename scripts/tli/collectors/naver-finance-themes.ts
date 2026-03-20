import * as cheerio from 'cheerio';
import { sleep, withRetry } from '@/scripts/tli/shared/utils';

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
      `테마 ${naverThemeId} 종목 스크래핑`
    );

    // 네이버 금융은 EUC-KR 인코딩 사용
    const buffer = await response.arrayBuffer();
    const html = new TextDecoder('euc-kr').decode(buffer);
    const $ = cheerio.load(html);
    const stocks: ThemeStock[] = [];

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
        market: stockCode.startsWith('0') ? 'KOSPI' : 'KOSDAQ',
        currentPrice,
        priceChangePct,
        volume,
      });
    });

    return stocks;
  } catch (error: unknown) {
    console.error(`   ❌ 테마 ${naverThemeId} 스크래핑 실패:`, error instanceof Error ? error.message : String(error));
    return [];
  }
}

/** 네이버 금융 테마 종목 수집 */
export async function collectNaverFinanceStocks(themes: Theme[]): Promise<ThemeStock[]> {
  console.log('📈 네이버 금융 테마 종목 수집 중...');
  console.log(`   처리할 테마: ${themes.filter(t => t.naverThemeId).length}개`);

  const allStocks: ThemeStock[] = [];

  for (const theme of themes) {
    if (!theme.naverThemeId) {
      console.log(`   ⊘ 테마 ${theme.id} 건너뜀: naverThemeId 없음`);
      continue;
    }

    console.log(`\n   테마 ${theme.id} 처리 중 (네이버 ID: ${theme.naverThemeId})`);

    const stocks = await scrapeNaverFinanceTheme(theme.id, theme.naverThemeId);

    if (stocks.length > 0) {
      console.log(`   ✓ ${stocks.length}개 종목 발견`);
      allStocks.push(...stocks);
    } else {
      console.log(`   ⚠️ 종목 없음`);
    }

    // 요청 간 정중한 지연
    await sleep(3000);
  }

  console.log(`\n   ✅ ${allStocks.length}개 테마-종목 매핑 수집 완료`);
  return allStocks;
}
