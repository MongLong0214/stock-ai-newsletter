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
    server.tool('get_theme_ranking', '한국 주식시장 테마 생명주기 랭킹을 조회합니다. 단계별(초기/성장/정점/쇠퇴/재점화) 테마 목록과 점수를 반환합니다.', {
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
