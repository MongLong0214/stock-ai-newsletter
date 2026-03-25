import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult, formatError, formatEmptyResult } from '../fetch-helper.js';

const CONTEXT = `[StockMatrix Theme Changes]
Daily or weekly score changes. period=1d means vs previous day, 7d means vs 7 days ago.
movers: rising (score increased) and falling (score decreased), sorted by magnitude.
stageTransitions: themes that changed lifecycle stage.
newlyEmerging: themes that entered Emerging stage.
Use theme IDs with get_theme_detail for deeper analysis.`;

interface ChangesData {
  movers: {
    rising: unknown[];
    falling: unknown[];
  };
  stageTransitions: unknown[];
  newlyEmerging: unknown[];
}

const isEmpty = (data: ChangesData): boolean =>
  data.movers.rising.length === 0 &&
  data.movers.falling.length === 0 &&
  data.stageTransitions.length === 0 &&
  data.newlyEmerging.length === 0;

export const registerGetThemeChanges = (server: McpServer): void => {
  server.tool(
    'get_theme_changes',
    `Get recent score changes and stage transitions for Korean stock themes.

Use when the user asks:
- What themes changed the most today/this week?
- Which themes are rising or falling?
- Any stage transitions recently?
- 오늘 테마 변동, 급등/급락 테마
- 이번 주 생명주기 단계 변화한 테마
- 새로 떠오르는 테마 있어?

Returns movers (rising/falling by score change), stage transitions, and newly emerging themes.`,
    {
      period: z
        .enum(['1d', '7d'])
        .optional()
        .describe('Comparison period: 1d = vs yesterday (default), 7d = vs 7 days ago'),
    },
    async ({ period }) => {
      try {
        const data = await fetchApi<ChangesData>('/api/tli/changes', {
          period: period || '1d',
        });

        if (isEmpty(data)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: formatEmptyResult(
                  CONTEXT,
                  'No significant changes detected for this period. Try period=7d for a wider window, or use get_theme_ranking for current standings.',
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
    },
  );
};
