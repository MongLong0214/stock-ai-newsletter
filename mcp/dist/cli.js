#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, VERSION } from './server.js';
const main = async () => {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`StockMatrix MCP server v${VERSION} running on stdio`);
};
main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
});
