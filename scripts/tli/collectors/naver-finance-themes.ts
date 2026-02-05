import 'dotenv/config';
import * as cheerio from 'cheerio';

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

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeNaverFinanceTheme(
  themeId: string,
  naverThemeId: string
): Promise<ThemeStock[]> {
  const url = `https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${naverThemeId}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const stocks: ThemeStock[] = [];

    // Find the table with stock listings
    $('table.type_5 tbody tr').each((_, row) => {
      const $row = $(row);

      // Extract stock code from href attribute
      const href = $row.find('td:nth-child(2) a').attr('href') || '';
      const stockCode = href.match(/code=(\d+)/)?.[1] || '';
      if (!stockCode) return;

      const stockName = $row.find('td:nth-child(2) a').text().trim();

      // Determine market (KOSPI or KOSDAQ) - usually can infer from stock code
      // A-codes typically KOSPI, others KOSDAQ, but this is approximate
      // More reliable would be to check another column if available
      const market = stockCode.startsWith('0') ? 'KOSPI' : 'KOSDAQ';

      stocks.push({
        themeId,
        symbol: stockCode,
        name: stockName,
        market,
      });
    });

    return stocks;
  } catch (error) {
    console.error(`   ❌ Error scraping theme ${naverThemeId}:`, error);
    return [];
  }
}

export async function collectNaverFinanceStocks(themes: Theme[]): Promise<ThemeStock[]> {
  console.log('📈 Collecting Naver Finance theme stocks...');
  console.log(`   Themes to process: ${themes.filter(t => t.naverThemeId).length}`);

  const allStocks: ThemeStock[] = [];

  for (const theme of themes) {
    if (!theme.naverThemeId) {
      console.log(`   ⊘ Skipping theme ${theme.id}: no naverThemeId`);
      continue;
    }

    console.log(`\n   Processing theme ${theme.id} (Naver ID: ${theme.naverThemeId})`);

    const stocks = await scrapeNaverFinanceTheme(theme.id, theme.naverThemeId);

    if (stocks.length > 0) {
      console.log(`   ✓ Found ${stocks.length} stocks`);
      allStocks.push(...stocks);
    } else {
      console.log(`   ⚠️ No stocks found`);
    }

    // Polite delay between requests
    await sleep(3000);
  }

  console.log(`\n   ✅ Collected ${allStocks.length} theme-stock mappings`);
  return allStocks;
}
