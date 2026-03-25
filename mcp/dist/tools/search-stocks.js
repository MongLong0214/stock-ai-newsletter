import { z } from 'zod';
import { fetchApi, formatResult, formatError, formatEmptyResult } from '../fetch-helper.js';
const CONTEXT = `[StockMatrix Stock Search]
Search Korean stocks by company name or 6-digit code, then inspect which themes they belong to.
For 6-digit codes, returns detailed stock-to-theme lookup. For text queries, returns matching stocks with themes.
Results include stock identity plus top related themes with lifecycle score and stage.
Common examples: 삼성전자, SK하이닉스, NAVER, 카카오, 005930, 000660.`;
const IS_SIX_DIGIT = /^\d{6}$/;
export const registerSearchStocks = (server) => {
    server.tool('search_stocks', `Search Korean stocks by company name, symbol, or 6-digit stock code, and preview their related themes.

Use when the user asks:
- Find Samsung Electronics / 삼성전자
- I only know the company name, not the stock code
- 종목명으로 코드 찾고 관련 테마도 보고 싶어
- 삼성전자가 속한 테마 알려줘 / what themes is Samsung in?
- 005930 테마 알려줘 / which themes is this stock part of?

For 6-digit stock codes, automatically performs a detailed stock-to-theme lookup (replaces get_stock_theme).
For text queries, searches by company name and returns matching stocks with theme previews.`, {
        query: z
            .string()
            .min(1)
            .max(200)
            .describe('Company name or 6-digit stock code, e.g. "삼성전자", "SK하이닉스", "005930"'),
    }, async ({ query }) => {
        try {
            if (IS_SIX_DIGIT.test(query.trim())) {
                const [themeData, searchData] = await Promise.all([
                    fetchApi(`/api/tli/stocks/${query.trim()}/theme`).catch(() => null),
                    fetchApi('/api/tli/stocks/search', { q: query.trim() }).catch(() => null),
                ]);
                if (!themeData && (!searchData || (Array.isArray(searchData) && searchData.length === 0))) {
                    return {
                        content: [{ type: 'text', text: formatEmptyResult(CONTEXT, `No stock found for code "${query}". Verify the 6-digit Korean stock code.`) }],
                    };
                }
                const combined = { stockThemes: themeData, searchResults: searchData };
                return {
                    content: [{ type: 'text', text: formatResult(combined, CONTEXT) }],
                };
            }
            const data = await fetchApi('/api/tli/stocks/search', { q: query });
            if (Array.isArray(data) && data.length === 0) {
                return {
                    content: [{ type: 'text', text: formatEmptyResult(CONTEXT, `No stocks found for "${query}". Try a different company name or check the spelling.`) }],
                };
            }
            return {
                content: [{ type: 'text', text: formatResult(data, CONTEXT) }],
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: formatError(error) }],
                isError: true,
            };
        }
    });
};
