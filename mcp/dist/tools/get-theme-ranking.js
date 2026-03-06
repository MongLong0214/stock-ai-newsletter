import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';
const VALID_STAGES = [
    'emerging',
    'growth',
    'peak',
    'decline',
    'reigniting',
];
export const registerGetThemeRanking = (server) => {
    server.tool('get_theme_ranking', 'Get Korean stock market theme rankings with lifecycle scores. Use when the user asks about trending stock themes, hot investment sectors, market momentum, what themes are rising/falling in Korea, 한국 주식 테마 랭킹, 요즘 뜨는 테마, 상승/하락 테마, or any question about KOSPI/KOSDAQ theme trends. Returns themes ranked by score with lifecycle stage (emerging/growth/peak/decline/reigniting) and related stocks.', {
        stage: z
            .enum(VALID_STAGES)
            .optional()
            .describe('Filter by lifecycle stage: emerging (초기), growth (성장), peak (정점), decline (쇠퇴), reigniting (재점화)'),
    }, async ({ stage }) => {
        try {
            const data = await fetchApi('/api/tli/scores/ranking');
            if (stage) {
                const stageData = data[stage];
                const summary = data.summary;
                return {
                    content: [
                        {
                            type: 'text',
                            text: formatResult({ stage, themes: stageData, summary }),
                        },
                    ],
                };
            }
            return {
                content: [{ type: 'text', text: formatResult(data) }],
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
