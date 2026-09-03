import { execFileSync } from 'node:child_process'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { renderPrepareSummary, renderPrepareSummaryFile } from './render-prepare-summary'

const summaryFixture = {
  targetDate: '2026-09-02',
  signalDate: '2026-09-01',
  verdict: 'normal',
  confidence: 0.91,
  picksSource: 'code',
  picks: [1, 2, 3].map((rank) => ({
    rank,
    ticker: `KOSPI:00000${rank}`,
    name: `종목 ${rank}`,
    close_price: rank * 1_000,
    score: 90 - rank,
  })),
  collection: {
    attemptedCalls: 100,
    successCount: 98,
    failureCount: 2,
    exactDateCoverageRate: 0.98,
    retriedSymbols: ['A', 'B'],
    recoveredSymbols: ['A'],
    indexFailed: false,
  },
  durationsSec: { assessment: 1, collection: 10, total: 12 },
  warnings: ['fixture warning'],
}

const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs')
const tsxBin = existsSync(tsxCli) ? tsxCli : path.resolve('node_modules/.bin/tsx')
const scriptPath = path.resolve('scripts/ops/render-prepare-summary.ts')

describe('renderPrepareSummary', () => {
  it('renders operational fields, three picks, counts, durations, and warnings', () => {
    const markdown = renderPrepareSummary(summaryFixture)

    expect(markdown).toContain('| 2026-09-02 | 2026-09-01 | normal | 0.91 | code |')
    expect(markdown).toContain('| 3 | KOSPI:000003 | 종목 3 | 3000 | 87 |')
    expect(markdown).toContain('| 100 | 98 | 2 | 0.98 | 2 | 1 | false |')
    expect(markdown).toContain('| total | 12 |')
    expect(markdown).toContain('- fixture warning')
  })

  it('reports a missing summary file without throwing', async () => {
    await expect(renderPrepareSummaryFile('/definitely/missing/summary.json'))
      .resolves.toContain('Summary JSON is missing')
  })
})

describe('renderPrepareSummary CLI', () => {
  // 모듈 import 테스트는 tsx CJS 변환 경로(top-level await 금지)를 타지 않으므로 실제 CLI 실행으로 고정.
  it('prints a missing-file message via tsx without throwing', () => {
    const stdout = execFileSync(
      process.execPath,
      [tsxBin, scriptPath, '/definitely/missing/cli-summary.json'],
      { encoding: 'utf8' },
    )
    expect(stdout).toContain('Summary JSON is missing')
  })

  it('renders a valid summary JSON via tsx', () => {
    const targetPath = path.join(os.tmpdir(), `prepare-summary-cli-${process.pid}.json`)
    writeFileSync(targetPath, JSON.stringify(summaryFixture))
    try {
      const stdout = execFileSync(
        process.execPath,
        [tsxBin, scriptPath, targetPath],
        { encoding: 'utf8' },
      )
      expect(stdout).toContain('| Target date | Signal date |')
    } finally {
      unlinkSync(targetPath)
    }
  })
})
