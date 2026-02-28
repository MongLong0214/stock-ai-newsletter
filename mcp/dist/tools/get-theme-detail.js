import { z } from 'zod';
import { fetchApi, formatResult, formatError } from '../fetch-helper.js';
export const registerGetThemeDetail = (server) => {
    server.tool('get_theme_detail', '특정 테마의 상세 정보를 조회합니다. 테마 점수, 생명주기 단계, 관련 종목, 뉴스 등을 포함합니다.', {
        theme_id: z
            .string()
            .uuid('Theme ID must be a valid UUID')
            .describe('Theme UUID (e.g. "a1b2c3d4-e5f6-7890-abcd-ef1234567890")'),
    }, async ({ theme_id }) => {
        try {
            const data = await fetchApi(`/api/tli/themes/${theme_id}`);
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
