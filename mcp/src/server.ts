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
import { registerGetStockThemes } from './tools/get-stock-themes.js';
import { registerPrompts } from './prompts.js';
import { registerResources } from './resources.js';

const require = createRequire(import.meta.url);
export const VERSION = (require('../package.json') as { version: string }).version;

/** Register every StockMatrix tool on a server instance. Single source of truth for both stdio (cli) and hosted (sandbox) transports. */
export const registerAllTools = (server: McpServer): void => {
  registerGetThemeRanking(server);
  registerGetThemeDetail(server);
  registerGetThemeHistory(server);
  registerSearchThemes(server);
  registerSearchStocks(server);
  registerGetStockThemes(server);
  registerGetMarketSummary(server);
  registerGetMethodology(server);
  registerGetThemeChanges(server);
  registerCompareThemes(server);
  registerGetPredictions(server);
};

/** Build a fully configured StockMatrix MCP server with tools, workflow prompts, and resources. */
export const createServer = (): McpServer => {
  const server = new McpServer({
    name: 'stockmatrix-mcp',
    version: VERSION,
  });
  registerAllTools(server);
  registerPrompts(server);
  registerResources(server);
  return server;
};
