import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
/**
 * Read-only resources clients can attach as context without a tool round-trip.
 * Grounds agents in the scoring methodology and the current market snapshot.
 */
export declare const registerResources: (server: McpServer) => void;
