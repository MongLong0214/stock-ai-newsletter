import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const searchStocksSource = readFileSync(
  resolve(__dirname, '../tools/search-stocks.ts'),
  'utf-8'
)

describe('search_stocks 6-digit auto-detection (static analysis)', () => {
  it('search_stocks detects 6-digit code pattern', () => {
    expect(searchStocksSource).toMatch(/IS_SIX_DIGIT|\\d\{6\}|sixDigit|isExactCode/)
  })

  it('search_stocks calls stock-to-theme endpoint for codes', () => {
    expect(searchStocksSource).toContain('/api/tli/stocks/')
    expect(searchStocksSource).toContain('/theme')
  })

  it('search_stocks calls search endpoint for text', () => {
    expect(searchStocksSource).toContain('/api/tli/stocks/search')
  })

  it('search_stocks uses formatEmptyResult for empty results', () => {
    expect(searchStocksSource).toContain('formatEmptyResult')
  })
})

describe('empty result guidance across tools (static analysis)', () => {
  const toolFiles = [
    { name: 'get-theme-ranking', path: '../tools/get-theme-ranking.ts' },
    { name: 'search-themes', path: '../tools/search-themes.ts' },
    { name: 'get-theme-detail', path: '../tools/get-theme-detail.ts' },
    { name: 'get-theme-history', path: '../tools/get-theme-history.ts' },
  ]

  for (const { name, path } of toolFiles) {
    it(`${name} imports formatEmptyResult or handles empty`, () => {
      const source = readFileSync(resolve(__dirname, path), 'utf-8')
      const hasEmptyHandling =
        source.includes('formatEmptyResult') ||
        source.includes('No ') ||
        source.includes('empty') ||
        source.includes('not found')
      expect(hasEmptyHandling).toBe(true)
    })
  }
})
