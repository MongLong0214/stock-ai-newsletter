import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';

export const registerGetStockTheme = (server: McpServer): void => {
  server.tool(
    'get_stock_theme',
    '특정 종목이 속한 테마를 조회합니다. 종목 코드로 관련 테마 정보를 확인할 수 있습니다.',
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
