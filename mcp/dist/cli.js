#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequire } from 'node:module';
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
const { version } = require('../package.json');
const server = new McpServer({
    name: 'stockmatrix-mcp',
    version,
});
registerGetThemeRanking(server);
registerGetThemeDetail(server);
registerGetThemeHistory(server);
registerSearchThemes(server);
registerSearchStocks(server);
registerGetMarketSummary(server);
registerGetMethodology(server);
registerGetThemeChanges(server);
registerCompareThemes(server);
registerGetPredictions(server);
const main = async () => {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`StockMatrix MCP server v${version} running on stdio`);
};
main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
});
