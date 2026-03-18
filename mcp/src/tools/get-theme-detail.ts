import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';

const CONTEXT = `[StockMatrix Theme Detail]
Score components (Bayesian-optimized weights):
  - interest (30.4%): Naver DataLab search volume — 7-day avg vs 30-day baseline
  - newsMomentum (36.6%): Naver News article count — weekly change rate
  - volatility (10.4%): Interest time-series standard deviation
  - activity (22.6%): Related stock price changes, volume intensity, data coverage
Score stabilization: Cautious Decay (3-signal majority vote prevents false drops) → Bollinger Clamp → Age-adaptive EMA smoothing.
Stage transitions use Markov constraints + 2-day hysteresis.
Comparisons: 3-Pillar similarity (feature + curve + keyword) with Mutual Rank, threshold ≥ 0.40.`;

export const registerGetThemeDetail = (server: McpServer): void => {
  server.tool(
    'get_theme_detail',
    `Get detailed analysis for a specific Korean stock theme.

Returns: TLI score breakdown (4 components with weights), lifecycle stage, 24h/7d score changes, prediction outlook, top related stocks with price changes, latest news headlines, and similar theme comparisons.

Use after get_theme_ranking or search_themes to drill into a specific theme. Answers: "tell me more about this theme", "what stocks are in this theme", "테마 상세 정보", "관련 종목 알려줘", "이 테마 전망".`,
    {
      theme_id: z
        .string()
        .uuid('Theme ID must be a valid UUID')
        .describe('Theme UUID from ranking or search results'),
    },
    async ({ theme_id }) => {
      try {
        const data = await fetchApi(`/api/tli/themes/${theme_id}`);

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