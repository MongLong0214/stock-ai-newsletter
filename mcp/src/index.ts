import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetThemeRanking } from './tools/get-theme-ranking.js';
import { registerGetThemeDetail } from './tools/get-theme-detail.js';
import { registerGetThemeHistory } from './tools/get-theme-history.js';
import { registerSearchThemes } from './tools/search-themes.js';
import { registerSearchStocks } from './tools/search-stocks.js';
import { registerGetMarketSummary } from './tools/get-market-summary.js';
import { registerGetMethodology } from './tools/get-methodology.js';
import { registerGetThemeChanges } from './tools/get-theme-changes.js';
import { registerCompareThemes } from './tools/compare-themes.js';
import { registerGetPredictions } from './tools/get-predictions.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const createServer = (): McpServer => {
  const s = new McpServer({
    name: 'stockmatrix-mcp',
    version,
  });

  registerGetThemeRanking(s);
  registerGetThemeDetail(s);
  registerGetThemeHistory(s);
  registerSearchThemes(s);
  registerSearchStocks(s);
  registerGetMarketSummary(s);
  registerGetMethodology(s);
  registerGetThemeChanges(s);
  registerCompareThemes(s);
  registerGetPredictions(s);

  return s;
};

export const createSandboxServer = (): McpServer => createServer();
