import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';
const CONTEXT = `[StockMatrix Theme Search]
Results include TLI score (0-100), lifecycle stage, and theme ID for drill-down.
Use theme_id with get_theme_detail for full analysis or get_theme_history for 30-day trend.
Stages: Emerging (초기) → Growth (성장) → Peak (정점) → Decline (하락), with Reigniting (재점화) for comeback themes.`;
export const registerSearchThemes = (server) => {
    server.tool('search_themes', `Search Korean stock market themes by keyword (Korean or English).

Use when the user asks about a specific sector, industry, or investment theme. Searches theme names and related stock names.

Examples: "AI", "반도체" (semiconductor), "2차전지" (EV battery), "방산" (defense), "로봇" (robotics), "원자력" (nuclear), "삼성전자" (Samsung).

Returns matching themes with TLI scores and lifecycle stages. Use the returned theme_id with get_theme_detail or get_theme_history for deeper analysis.`, {
        query: z
            .string()
            .min(1)
            .max(200)
            .describe('Search query — theme name, sector keyword, or stock name (Korean or English)'),
    }, async ({ query }) => {
        try {
            const data = await fetchApi('/api/tli/themes', { q: query });
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
