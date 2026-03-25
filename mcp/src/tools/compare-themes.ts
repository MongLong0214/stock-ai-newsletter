import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';

const CONTEXT = `[StockMatrix Theme Comparison]
Compare 2–5 Korean stock market themes side-by-side.
Shows each theme's current TLI score, lifecycle stage, 7-day sparkline,
pairwise similarity (from comparison algorithm), overlapping stocks, and any warnings.
Use when the user asks to compare or contrast multiple themes.`;

export const registerCompareThemes = (server: McpServer): void => {
  server.tool(
    'compare_themes',
    `Compare 2–5 Korean stock market themes side-by-side with lifecycle scores, similarity, and overlapping stocks.

Use when the user asks:
- Compare semiconductor and AI themes
- How similar are these themes?
- 반도체 vs AI 테마 비교, 테마 간 유사도
- Which theme is stronger right now?
- Do these themes share the same stocks?

Returns each theme's score/stage/sparkline, pairwise similarity scores, and overlapping stocks.`,
    {
      theme_ids: z
        .array(z.string().uuid())
        .min(2)
        .max(5)
        .describe('Array of 2–5 theme UUIDs to compare'),
    },
    async ({ theme_ids }) => {
      try {
        const data = await fetchApi<Record<string, unknown>>('/api/tli/compare', {
          ids: theme_ids.join(','),
        });

        return {
          content: [{ type: 'text' as const, text: formatResult(data, CONTEXT) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: formatError(error) }],
          isError: true,
        };
      }
    }
  );
};
