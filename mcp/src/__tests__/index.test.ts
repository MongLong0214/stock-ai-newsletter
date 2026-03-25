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

  it('registers 10 tools (7 original + 3 new, get_stock_theme removed)', () => {
    const registerCalls = indexSource.match(/register\w+\(s\)/g)
    expect(registerCalls).toHaveLength(10)
  })

  it('includes all expected tool registrations', () => {
    const expected = [
      'registerGetThemeRanking',
      'registerGetThemeDetail',
      'registerGetThemeHistory',
      'registerSearchThemes',
      'registerSearchStocks',
      'registerGetMarketSummary',
      'registerGetMethodology',
      'registerGetThemeChanges',
      'registerCompareThemes',
      'registerGetPredictions',
    ]
    for (const name of expected) {
      expect(indexSource).toContain(name)
    }
  })
})
