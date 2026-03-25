import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult, formatError, formatEmptyResult } from '../fetch-helper.js';

const CONTEXT = `[StockMatrix Theme History — 30-day]
Daily TLI scores with stage transitions. Use to identify:
- Trend direction: rising scores = growing interest, falling = declining
- Stage transitions: stage changes require 2 consecutive days (hysteresis)
- Score stability: Cautious Decay prevents false drops from data gaps
- Momentum: EMA smoothing adapts to theme age (newer themes react faster)
Scores are 0-100, computed from interest + news + volatility + activity.`;

export const registerGetThemeHistory = (server: McpServer): void => {
  server.tool(
    'get_theme_history',
    `Get 30-day score history for a Korean stock theme.

Returns daily TLI scores and stage transitions for trend analysis. Use when the user asks about theme momentum over time, whether a theme is gaining or losing interest, or wants to see historical trajectory.

Answers: "이 테마 추세가 어때?", "최근 한달 흐름", "is this theme gaining or losing momentum?", "show me the trend".`,
    {
      theme_id: z
        .string()
        .uuid('Theme ID must be a valid UUID')
        .describe('Theme UUID from ranking or search results'),
    },
    async ({ theme_id }) => {
      try {
        const data = await fetchApi(
          `/api/tli/themes/${theme_id}/history`
        );

        if (!data || (Array.isArray(data) && data.length === 0)) {
          return {
            content: [{ type: 'text' as const, text: formatEmptyResult(CONTEXT, `No history data found for theme "${theme_id}". The theme may be too new or inactive.`) }],
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