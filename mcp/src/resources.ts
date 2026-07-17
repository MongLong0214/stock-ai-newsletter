import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fetchApi } from './fetch-helper.js';

/**
 * Read-only resources clients can attach as context without a tool round-trip.
 * Grounds agents in the scoring methodology and the current market snapshot.
 */
export const registerResources = (server: McpServer): void => {
  server.registerResource(
    'methodology',
    'stockmatrix://methodology',
    {
      title: 'TLI Methodology',
      description:
        'How the Theme Lifecycle Index (TLI) score and lifecycle stages are computed — components, weights, and stage thresholds. Attach for grounded interpretation of any theme score.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const data = await fetchApi('/api/tli/methodology');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );

  server.registerResource(
    'rankings',
    'stockmatrix://rankings',
    {
      title: 'Current Theme Rankings',
      description:
        "Today's Korean market theme rankings by TLI lifecycle score, grouped by stage, with the market summary. A live snapshot to attach as context.",
      mimeType: 'application/json',
    },
    async (uri) => {
      const data = await fetchApi('/api/tli/scores/ranking');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );
};
