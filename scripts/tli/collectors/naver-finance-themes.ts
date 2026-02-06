import * as cheerio from 'cheerio';
import { sleep } from '../utils';

interface Theme {
  id: string;
  naverThemeId: string | null;
}

interface ThemeStock {
  themeId: string;
  symbol: string;
  name: string;
  market: string;
}

/** 네이버 금융 테마 페이지 스크래핑 */
async function scrapeNaverFinanceTheme(themeId: string, naverThemeId: string): Promise<ThemeStock[]> {
  const url = `https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${naverThemeId}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP 오류 ${response.status}`);
    }

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

      stocks.push({
        themeId,
        symbol: stockCode,
        name: stockName,
        market: parseInt(stockCode, 10) < 100000 ? 'KOSPI' : 'KOSDAQ',
      });
    });

    return stocks;
  } catch (error) {
    console.error(`   ❌ 테마 ${naverThemeId} 스크래핑 실패:`, error);
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
