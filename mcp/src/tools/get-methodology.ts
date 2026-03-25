import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchApi, formatResult } from '../fetch-helper.js';

const SECTIONS = [
  'scoring',
  'stabilization',
  'stages',
  'comparison',
  'prediction',
  'data_sources',
  'update_schedule',
  'runtime',
  'data_flow',
  'database_tables',
  'limitations',
  'all',
] as const;

const METHODOLOGY_FALLBACK = {
  fallback: true,
  scoring: {
    range: '0-100',
    components: [
      { name: 'interest', weight: '30.4%' },
      { name: 'newsMomentum', weight: '36.6%' },
      { name: 'volatility', weight: '10.4%' },
      { name: 'activity', weight: '22.6%' },
    ],
  },
  disclaimer: 'Full methodology unavailable — showing cached summary. Try again later.',
};

const CONTEXT = `[StockMatrix TLI Methodology]
Comprehensive documentation of the TLI (Theme Lifecycle Index) algorithm — scoring, stages, stabilization, comparison, prediction, data sources, pipeline, and database schema.`;

export const registerGetMethodology = (server: McpServer): void => {
  server.tool(
    'get_methodology',
    `Get the TLI (Theme Lifecycle Index) algorithm methodology — how scores, stages, and predictions work.

Use when the user asks:
- How are theme scores calculated?
- What do the lifecycle stages mean?
- How does the prediction work?
- What data sources, schedules, runtime pipeline, or database tables power TLI?
- TLI 알고리즘 설명, 점수 산출 방식, 단계 판정 기준
- What data sources are used?
- TLI 수집 파이프라인, 업데이트 주기, 비교 파이프라인, 데이터 테이블

Returns structured documentation of the scoring algorithm, data collection pipeline, runtime orchestration, database tables, stage determination, stabilization techniques, comparison analysis, and prediction methodology.`,
    {
      section: z
        .enum(SECTIONS)
        .optional()
        .describe('Specific section: scoring, stabilization, stages, comparison, prediction, data_sources, update_schedule, runtime, data_flow, database_tables, limitations, or all (default: all)'),
    },
    async ({ section }) => {
      try {
        const params = section ? { section } : undefined;
        const data = await fetchApi('/api/tli/methodology', params);

        return {
          content: [{ type: 'text' as const, text: formatResult(data, CONTEXT) }],
        };
      } catch {
        return {
          content: [{ type: 'text' as const, text: formatResult(METHODOLOGY_FALLBACK, CONTEXT) }],
        };
      }
    }
  );
};
