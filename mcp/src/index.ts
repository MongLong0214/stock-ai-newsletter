#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerGetThemeRanking } from './tools/get-theme-ranking.js';
import { registerGetThemeDetail } from './tools/get-theme-detail.js';
import { registerGetThemeHistory } from './tools/get-theme-history.js';
import { registerSearchThemes } from './tools/search-themes.js';
import { registerGetStockTheme } from './tools/get-stock-theme.js';

const server = new McpServer({
  name: 'stockmatrix-mcp',
  version: '0.1.0',
});

registerGetThemeRanking(server);
registerGetThemeDetail(server);
registerGetThemeHistory(server);
registerSearchThemes(server);
registerGetStockTheme(server);

const main = async (): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('StockMatrix MCP server running on stdio');
};

main().catch((error: unknown) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
