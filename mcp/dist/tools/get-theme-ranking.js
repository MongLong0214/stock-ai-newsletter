import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';
const VALID_STAGES = [
    'emerging',
    'growth',
    'peak',
    'decline',
    'reigniting',
];
const STAGE_DESCRIPTIONS = {
    emerging: 'score < growth threshold, early interest signal',
    growth: 'score ≥ 40 with stable/rising trend — expanding interest',
    peak: 'score ≥ 71 or high score + news surge — maximum attention',
    decline: 'falling trend + score drop + declining news coverage',
    reigniting: 'previously declined theme showing renewed growth',
};
const CONTEXT = `[StockMatrix TLI Ranking]
Scores: 0-100 (Bayesian-optimized weighted sum of 4 components: interest 30%, news momentum 37%, volatility 10%, activity 23%).
Stages: Emerging → Growth → Peak → Decline → Dormant (with possible Reigniting). Stage transitions require 2 consecutive days of same candidate (hysteresis).
Higher score = stronger theme momentum. Stage indicates lifecycle position.`;
export const registerGetThemeRanking = (server) => {
    server.tool('get_theme_ranking', `Get Korean stock market theme rankings with lifecycle scores (TLI: Theme Lifecycle Index).

Use when the user asks about:
- Trending stock themes, hot investment sectors, market momentum
- What themes are rising/falling in Korea
- 한국 주식 테마 랭킹, 요즘 뜨는 테마, 상승/하락 테마
- KOSPI/KOSDAQ theme trends

Returns themes ranked by score (0-100) with lifecycle stage and related stocks. Scores are computed from search interest (Naver DataLab), news momentum, market volatility, and stock activity — all optimized via Bayesian optimization.`, {
        stage: z
            .enum(VALID_STAGES)
            .optional()
            .describe('Filter by lifecycle stage: emerging (초기 — early interest), growth (성장 — expanding), peak (정점 — maximum attention), decline (하락 — fading), reigniting (재점화 — comeback)'),
    }, async ({ stage }) => {
        try {
            const data = await fetchApi('/api/tli/scores/ranking');
            if (stage) {
                const stageData = data[stage];
                const summary = data.summary;
                const stageContext = `${CONTEXT}\nFiltered: ${stage} — ${STAGE_DESCRIPTIONS[stage]}`;
                return {
                    content: [
                        {
                            type: 'text',
                            text: formatResult({ stage, themes: stageData, summary }, stageContext),
                        },
                    ],
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
