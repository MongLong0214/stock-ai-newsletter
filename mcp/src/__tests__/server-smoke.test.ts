import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../server.js';

/**
 * End-to-end smoke test over the real MCP protocol: a client connects to the
 * server through an in-memory transport and lists its capabilities. This proves
 * every tool/prompt/resource registers without collision and is actually
 * advertised over the wire — something the static-source tests cannot catch.
 */
describe('MCP server capabilities (in-memory protocol handshake)', () => {
  const connect = async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'smoke-test', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return { client, server };
  };

  it('advertises all 11 tools with correct names, titles, and read-only annotations', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'compare_themes',
        'get_market_summary',
        'get_methodology',
        'get_predictions',
        'get_stock_themes',
        'get_theme_changes',
        'get_theme_detail',
        'get_theme_history',
        'get_theme_ranking',
        'search_stocks',
        'search_themes',
      ].sort()
    );

    for (const tool of tools) {
      expect(tool.title, `${tool.name} should have a title`).toBeTruthy();
      expect(tool.annotations?.readOnlyHint, `${tool.name} should be read-only`).toBe(true);
    }
  });

  it('advertises all 4 workflow prompts', async () => {
    const { client } = await connect();
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name).sort();
    expect(names).toEqual(
      ['find_investment_themes', 'market_briefing', 'stock_theme_check', 'theme_deep_dive'].sort()
    );
  });

  it('advertises both resources with stockmatrix:// URIs', async () => {
    const { client } = await connect();
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual(['stockmatrix://methodology', 'stockmatrix://rankings'].sort());
  });

  it('resolves a prompt with its argument interpolated', async () => {
    const { client } = await connect();
    const result = await client.getPrompt({
      name: 'theme_deep_dive',
      arguments: { theme: '반도체' },
    });
    const text = result.messages.map((m) => (m.content.type === 'text' ? m.content.text : '')).join('\n');
    expect(text).toContain('반도체');
    expect(text).toContain('search_themes');
  });
});
