import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';
export const registerSearchThemes = (server) => {
    server.tool('search_themes', 'Search Korean stock market themes by keyword. Use when the user asks about a specific sector, industry, or investment theme like AI, semiconductors, EV, bio, defense, robots, nuclear, 반도체, 2차전지, 방산, 로봇, 원자력, or any topic related to Korean stock market themes. Also useful when the user mentions a Korean company name to find related themes. Returns matching themes with scores and lifecycle stages.', {
        query: z
            .string()
            .min(1)
            .max(200)
            .describe('Search query (theme name or related stock name, e.g. "AI", "반도체", "삼성전자")'),
    }, async ({ query }) => {
        try {
            const data = await fetchApi('/api/tli/themes', { q: query });
            return {
                content: [{ type: 'text', text: formatResult(data) }],
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
