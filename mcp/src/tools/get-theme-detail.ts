import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';

export const registerGetThemeDetail = (server: McpServer): void => {
  server.tool(
    'get_theme_detail',
    'Get detailed info for a specific Korean stock theme. Returns score breakdown, lifecycle stage, prediction, top related stocks with price changes, and latest news. Use after get_theme_ranking or search_themes to drill into a specific theme. Answers questions like "tell me more about this theme", "what stocks are in this theme", "테마 상세 정보", "관련 종목 알려줘".',
    {
      theme_id: z
        .string()
        .uuid('Theme ID must be a valid UUID')
        .describe('Theme UUID (e.g. "a1b2c3d4-e5f6-7890-abcd-ef1234567890")'),
    },
    async ({ theme_id }) => {
      try {
        const data = await fetchApi(`/api/tli/themes/${theme_id}`);

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
