import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';
const CONTEXT = `[StockMatrix Theme Predictions]
Champion theme_predictions_v3 snapshots for Korean stock themes when TLI_PREDICTIONS_V3_EXPOSURE_ENABLED=true.
When exposure is disabled for rollback, the API returns dataSource=none with guidance.
Use pRise, CI bounds, abstain state, and trailing90d precision as the primary contract.
The phase field is deprecated compatibility derived from pRise and will be removed after 2026-09-15.
Chain with get_theme_detail(themeId) for deeper analysis of any predicted theme.`;
export const registerGetPredictions = (server) => {
    server.registerTool('get_predictions', {
        title: 'Theme Predictions',
        description: `Get champion probability prediction snapshots for Korean stock themes.

Use when the user asks:
- Which themes are rising / about to peak / cooling down?
- What is the pRise probability for a theme?
- Which themes are abstaining because data is still being collected?
- Show me predicted hot themes
- 상승세 테마 예측, 하락 전환 예상 테마
- 테마 생명주기 예측 결과를 보고 싶어

Returns v3 snapshot fields when exposure is enabled: pRise, ciLower, ciUpper, abstain, abstainReasons, modelVersion, trailing90d.topSignalPrecision, and deprecated phase compatibility. Returns dataSource=none when exposure is disabled for rollback.`,
        inputSchema: {
            phase: z
                .enum(['rising', 'hot', 'cooling'])
                .optional()
                .describe('Deprecated compatibility filter derived from pRise: rising >=0.6, hot >=0.4, cooling <0.4'),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
    }, async ({ phase }) => {
        try {
            const params = {};
            if (phase)
                params.phase = phase;
            const data = await fetchApi('/api/tli/predictions', params);
            if (!data.themes || data.themes.length === 0) {
                const guidance = data.guidance || 'Prediction data not yet available.';
                return {
                    content: [{ type: 'text', text: formatResult({ ...data, guidance }, CONTEXT) }],
                };
            }
            return {
                content: [{ type: 'text', text: formatResult(data, CONTEXT) }],
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: formatError(error) }],
                isError: true,
            };
        }
    });
};
