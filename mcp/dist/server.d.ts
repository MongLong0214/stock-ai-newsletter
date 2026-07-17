import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare const VERSION: string;
/** Register every StockMatrix tool on a server instance. Single source of truth for both stdio (cli) and hosted (sandbox) transports. */
export declare const registerAllTools: (server: McpServer) => void;
/** Build a fully configured StockMatrix MCP server with tools, workflow prompts, and resources. */
export declare const createServer: () => McpServer;
