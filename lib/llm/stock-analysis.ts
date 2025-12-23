import { getGeminiRecommendation } from './korea/gemini';
import { getBatchStockPrices } from '@/app/archive/_utils/api/kis/client';

export interface StockAnalysisResult {
  geminiAnalysis: string;
}

/** KIS API로 close_price 보정 (추천일 전일 종가) */
async function correctClosePrices(json: string): Promise<string> {
  const stocks = JSON.parse(json);
  if (!Array.isArray(stocks)) return json;

  const { prices } = await getBatchStockPrices(stocks.map((s) => s.ticker));

  for (const stock of stocks) {
    const kis = prices.get(stock.ticker);
    if (kis?.previousClose) {
      stock.close_price = kis.previousClose;
    }
  }
  return JSON.stringify(stocks);
}

export async function getStockAnalysis(): Promise<StockAnalysisResult> {
  const [result] = await Promise.allSettled([getGeminiRecommendation()]);

  let geminiAnalysis =
    result.status === 'fulfilled' ? result.value : `⚠️ Gemini 분석 실패: ${result.reason}`;

  // KIS API로 종가 보정 (실패 시 Gemini 값 유지)
  if (!geminiAnalysis.startsWith('⚠️')) {
    try {
      geminiAnalysis = await correctClosePrices(geminiAnalysis);
    } catch {
      // KIS 실패 시 Gemini 값 유지
    }
  }

  return { geminiAnalysis };
}
