import { fetchApi, formatResult, formatError } from '../fetch-helper.js';
const CONTEXT = `[StockMatrix Market Summary]
High-level Korean stock market theme briefing for AI agents.
Use as a first call when the user asks what is hot, what the market looks like today, or wants a concise overview before drilling into a theme.
Includes stage distribution, top themes, market coverage, endpoint references, and citation/disclaimer metadata.
Each theme in the response includes themeId for chaining to get_theme_detail.`;
export const registerGetMarketSummary = (server) => {
    server.tool('get_market_summary', `Get an AI-optimized summary of the Korean stock theme market.

Use when the user asks:
- What's happening in Korean stock themes right now?
- Give me a market overview before drilling down
- 오늘 한국 테마 시장 요약
- 현재 뜨는 테마와 시장 분포를 한 번에 보고 싶어

Returns a concise market overview, stage distribution, top themes, endpoint references, citation metadata, and disclaimer text.`, {}, async () => {
        try {
            const data = await fetchApi('/api/ai/summary');
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
