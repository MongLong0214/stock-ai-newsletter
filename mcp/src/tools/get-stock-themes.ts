import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult, formatError, formatEmptyResult } from '../fetch-helper.js';

const CONTEXT = `[StockMatrix Stock → Themes]
Reverse lookup: given a Korean stock code, returns every active TLI theme the stock belongs to, sorted by theme score (0-100, highest first).
Each entry includes the theme's lifecycle stage, reigniting flag, and the stock's relevance within that theme.
Use this to judge whether a specific stock sits inside currently hot or rising themes — the theme's momentum often explains the stock's moves.`;

export const registerGetStockThemes = (server: McpServer): void => {
  server.registerTool(
    'get_stock_themes',
    {
      title: 'Stock → Themes',
      description: `Find every Korean market theme a specific stock belongs to, each with its current TLI lifecycle score and stage.

Use when the user asks about:
- Which themes/sectors a stock belongs to
- Whether a specific stock is part of any hot/trending/rising theme
- 삼성전자(005930)가 속한 테마, 이 종목 관련 테마, 내 종목이 뜨는 테마에 있는지
- Why a stock is moving (via its theme membership and momentum)

Input is a 6-digit Korean stock code (e.g. 005930 Samsung Electronics, 000660 SK Hynix). To find a code from a company name, use search_stocks first. Returns themes sorted by score, each with lifecycle stage and the stock's relevance in that theme.`,
      inputSchema: {
        symbol: z
          .string()
          .regex(/^\d{6}$/, 'Korean stock code must be 6 digits')
          .describe(
            'Korean stock code — exactly 6 digits (e.g. "005930" Samsung Electronics, "000660" SK Hynix)'
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ symbol }) => {
      try {
        const data = await fetchApi<unknown[]>(`/api/tli/stocks/${symbol}/theme`);

        if (Array.isArray(data) && data.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: formatEmptyResult(
                  CONTEXT,
                  `No active themes found for stock ${symbol}. The stock may not be tracked in any current TLI theme, or the code may be incorrect. Use search_stocks to look up a valid 6-digit code by company name.`
                ),
              },
            ],
          };
        }

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
