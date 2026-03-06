import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';

export const registerGetThemeHistory = (server: McpServer): void => {
  server.tool(
    'get_theme_history',
    'Get 30-day score history for a Korean stock theme. Use when the user asks about theme trend over time, momentum changes, whether a theme is gaining or losing interest, "이 테마 추세가 어때?", "최근 한달 흐름", or wants to see historical data for a theme. Returns daily scores to analyze lifecycle trajectory.',
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
