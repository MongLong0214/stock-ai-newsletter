import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';

const CONTEXT = `[StockMatrix Theme Predictions]
Lifecycle phase predictions for Korean stock themes based on analog comparison forecasting.
Shows which themes are rising, hot, or cooling with confidence levels and analog evidence.
Use to identify emerging opportunities (rising) or themes past peak (cooling).
Chain with get_theme_detail(themeId) for deeper analysis of any predicted theme.`;

interface PredictionTheme {
  id: string;
  name: string;
  score: number;
  stage: string;
  prediction: {
    phase: string;
    confidence: string;
    daysSinceEpisodeStart: number;
    expectedPeakDay: number;
    topAnalog: { name: string; similarity: number; peakDay: number } | null;
    evidenceQuality: string;
  };
}

interface PredictionResponse {
  phase: string | null;
  dataSource: string;
  themes: PredictionTheme[];
  guidance?: string;
}

export const registerGetPredictions = (server: McpServer): void => {
  server.tool(
    'get_predictions',
    `Get lifecycle phase predictions for Korean stock themes.

Use when the user asks:
- Which themes are rising / about to peak / cooling down?
- Show me predicted hot themes
- 상승세 테마 예측, 하락 전환 예상 테마
- 테마 생명주기 예측 결과를 보고 싶어

Returns themes with predicted phase (rising/hot/cooling), confidence, expected peak day, and top analog evidence.`,
    {
      phase: z
        .enum(['rising', 'hot', 'cooling'])
        .optional()
        .describe('Filter by predicted phase: rising (ascending), hot (at peak), cooling (declining)'),
    },
    async ({ phase }) => {
      try {
        const params: Record<string, string> = {};
        if (phase) params.phase = phase;

        const data = await fetchApi<PredictionResponse>('/api/tli/predictions', params);

        if (!data.themes || data.themes.length === 0) {
          const guidance = data.guidance || 'Prediction data not yet available.';
          return {
            content: [{ type: 'text' as const, text: formatResult({ ...data, guidance }, CONTEXT) }],
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
