import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';

export const registerGetThemeHistory = (server: McpServer): void => {
  server.tool(
    'get_theme_history',
    '테마의 최근 30일 점수 이력을 조회합니다. 생명주기 추이를 파악할 수 있습니다.',
    {
      theme_id: z
        .string()
        .uuid('Theme ID must be a valid UUID')
        .describe('Theme UUID (e.g. "a1b2c3d4-e5f6-7890-abcd-ef1234567890")'),
    },
    async ({ theme_id }) => {
      try {
        const data = await fetchApi(
          `/api/tli/themes/${theme_id}/history`
        );

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
