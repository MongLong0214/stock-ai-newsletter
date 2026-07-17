import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('MCP index module (static analysis)', () => {
  const indexSource = readFileSync(
    resolve(__dirname, '../index.ts'),
    'utf-8'
  )

  const cliSource = readFileSync(
    resolve(__dirname, '../cli.ts'),
    'utf-8'
  )

  const serverSource = readFileSync(
    resolve(__dirname, '../server.ts'),
    'utf-8'
  )

  it('index.ts does not contain main() call', () => {
    expect(indexSource).not.toMatch(/\bmain\s*\(/)
  })

  it('index.ts does not import StdioServerTransport', () => {
    expect(indexSource).not.toContain('StdioServerTransport')
  })

  it('index.ts exports createSandboxServer', () => {
    expect(indexSource).toContain('export const createSandboxServer')
  })

  it('index.ts does not have shebang', () => {
    expect(indexSource).not.toMatch(/^#!/)
  })

  it('cli.ts has shebang', () => {
    expect(cliSource).toMatch(/^#!\/usr\/bin\/env node/)
  })

  it('cli.ts contains main() call', () => {
    expect(cliSource).toMatch(/\bmain\s*\(/)
  })

  it('cli.ts imports StdioServerTransport', () => {
    expect(cliSource).toContain('StdioServerTransport')
  })

  it('package.json bin points to dist/cli.js', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')
    )
    expect(pkg.bin['stockmatrix-mcp']).toBe('dist/cli.js')
  })

  it('package.json main points to dist/index.js', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')
    )
    expect(pkg.main).toBe('dist/index.js')
  })

  it('index.ts delegates to the shared server module (no inline tool registration)', () => {
    expect(indexSource).toContain("from './server.js'")
    expect(indexSource).not.toMatch(/registerGet\w+\(/)
  })

  it('server.ts registers all 11 tools exactly once each', () => {
    const expected = [
      'registerGetThemeRanking',
      'registerGetThemeDetail',
      'registerGetThemeHistory',
      'registerSearchThemes',
      'registerSearchStocks',
      'registerGetStockThemes',
      'registerGetMarketSummary',
      'registerGetMethodology',
      'registerGetThemeChanges',
      'registerCompareThemes',
      'registerGetPredictions',
    ]
    expect(expected).toHaveLength(11)
    for (const name of expected) {
      expect(serverSource).toContain(`${name}(server)`)
    }
  })

  it('server.ts wires workflow prompts and resources', () => {
    expect(serverSource).toContain('registerPrompts(server)')
    expect(serverSource).toContain('registerResources(server)')
  })
})
