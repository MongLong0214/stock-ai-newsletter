import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';

const CONTEXT = `[StockMatrix Stock-to-Theme Lookup]
Shows all investment themes a specific Korean stock belongs to, with each theme's TLI score and lifecycle stage.
A stock can belong to multiple themes simultaneously. Use the returned theme_id with get_theme_detail for full analysis.
Common codes: 005930 (삼성전자), 000660 (SK하이닉스), 373220 (LG에너지솔루션), 035420 (NAVER), 035720 (카카오).`;

export const registerGetStockTheme = (server: McpServer): void => {
  server.tool(
    'get_stock_theme',
    `Find which investment themes a Korean stock belongs to.

Use when the user asks about a specific stock by its 6-digit code. Returns all associated themes with TLI scores and lifecycle stages.

Answers: "삼성전자 무슨 테마야?", "what themes is this stock part of?", "이 종목 관련 테마", "005930 테마 알려줘".`,
    {
      symbol: z
        .string()
        .regex(/^\d{6}$/, 'Korean stock code must be 6 digits')
        .describe('6-digit Korean stock code (e.g. "005930" for Samsung, "000660" for SK Hynix)'),
    },
    async ({ symbol }) => {
      try {
        const data = await fetchApi(`/api/tli/stocks/${symbol}/theme`);

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