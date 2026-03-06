import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';

export const registerGetStockTheme = (server: McpServer): void => {
  server.tool(
    'get_stock_theme',
    'Find which investment themes a Korean stock belongs to. Use when the user asks about a specific stock code like 005930 (Samsung), 000660 (SK Hynix), 373220 (LG Energy), or any 6-digit Korean stock code. Answers "삼성전자 무슨 테마야?", "what themes is this stock part of?", "이 종목 관련 테마". Returns all associated themes with scores and stages.',
    {
      symbol: z
        .string()
        .regex(/^\d{6}$/, 'Korean stock code must be 6 digits')
        .describe('Korean stock code (e.g. "005930" for Samsung Electronics, "000660" for SK Hynix)'),
    },
    async ({ symbol }) => {
      try {
        const data = await fetchApi(`/api/tli/stocks/${symbol}/theme`);

        return {
          content: [{ type: 'text' as const, text: formatResult(data) }],
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
