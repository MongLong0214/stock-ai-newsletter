#!/usr/bin/env node

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerGetThemeRanking } from './tools/get-theme-ranking.js';
import { registerGetThemeDetail } from './tools/get-theme-detail.js';
import { registerGetThemeHistory } from './tools/get-theme-history.js';
import { registerSearchThemes } from './tools/search-themes.js';
import { registerGetStockTheme } from './tools/get-stock-theme.js';
import { registerGetMethodology } from './tools/get-methodology.js';

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
  registerGetStockTheme(s);
  registerGetMethodology(s);

  return s;
};

export const createSandboxServer = (): McpServer => createServer();

const server = createServer();

const main = async (): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`StockMatrix MCP server v${version} running on stdio`);
};

main().catch((error: unknown) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
