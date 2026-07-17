import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
/**
 * Curated workflow prompts. These surface as one-click slash commands in MCP clients
 * (Claude Desktop, Cursor, …) and steer the agent through multi-tool workflows —
 * the fastest path from "installed" to "getting real value".
 */
export declare const registerPrompts: (server: McpServer) => void;
