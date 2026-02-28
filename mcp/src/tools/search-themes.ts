import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';

export const registerSearchThemes = (server: McpServer): void => {
  server.tool(
    'search_themes',
    '테마를 검색합니다. 이름(한국어/영문)으로 필터링하여 일치하는 테마의 점수, 단계 정보를 반환합니다.',
    {
      query: z
        .string()
        .min(1)
        .describe('Search query (theme name or related stock name, e.g. "AI", "반도체", "삼성전자")'),
    },
    async ({ query }) => {
      try {
        const data = await fetchApi('/api/tli/themes', { q: query });

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
