import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
/** Hosted-transport entry point (Smithery / streamable HTTP). Kept as a named export for build tooling that expects it. */
export declare const createSandboxServer: () => McpServer;
export { createServer, registerAllTools, VERSION } from './server.js';
