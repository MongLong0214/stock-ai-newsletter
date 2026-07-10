import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { computeStudyOriginScheduleSha256 } from '../offline-eval-study-lock'

const STUDY_ID = 'cli-study-todo-10'
const STUDY_SHA256 = 'a'.repeat(64)
const weeklyOrigin = (index: number) => new Date(Date.UTC(2026, 0, 5 + index * 7)).toISOString().slice(0, 10)
const origins = Array.from({ length: 26 }, (_unused, index) => ({
  originDate: weeklyOrigin(index),
  forecastCutoff: `${weeklyOrigin(index)}T09:00:00.000Z`,
}))
const rows = origins.flatMap((origin) => ['positive', 'negative'].map((themeId) => ({
  id: `${themeId}|${origin.originDate}`,
  themeId,
  baseDate: origin.originDate,
  futureDates: [origin.originDate],
  labelFinalizedAt: `${origin.originDate}T00:00:00.000Z`,
  labelSourceRunCompletedAt: `${origin.originDate}T00:00:00.000Z`,
  studyContractId: STUDY_ID,
  studyContractSha256: STUDY_SHA256,
  bablPhase: themeId === 'positive' ? 'rising' : 'cooling',
  interestReturn10d: themeId === 'positive' ? 1 : -1,
  interestSlope7d: null,
  newsMomentum: null,
  y: themeId === 'positive',
})))

const buildInput = (studyOrigins: typeof origins) => ({
  startDate: origins[0].originDate,
  endDate: origins.at(-1)?.originDate,
  labels: rows.map((row) => ({ themeId: row.themeId, baseDate: row.baseDate, y: row.y })),
  snapshots: [],
  featureRows: [],
  labelStatusCounts: { final: rows.length, censored: 0, excluded: 0, pending: 0 },
  m1Predictions: [],
  scientificBaseline: {
    datasetManifest: { study_contract_id: STUDY_ID, study_contract_sha256: STUDY_SHA256 },
    origins: studyOrigins,
    rows,
  },
})

describe('run-offline-eval external study lock', () => {
  it('accepts the trusted schedule and rejects a cutoff-only input rewrite', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tli-todo10-cli-'))
    try {
      const inputPath = join(directory, 'input.json')
      const rewrittenInputPath = join(directory, 'rewritten-input.json')
      const lockPath = join(directory, 'study-lock.json')
      const outputPath = join(directory, 'report.json')
      const markdownPath = join(directory, 'report.md')
      const lock = {
        studyContractId: STUDY_ID,
        studyContractSha256: STUDY_SHA256,
        studyOriginScheduleSha256: computeStudyOriginScheduleSha256({
          studyContractId: STUDY_ID,
          studyContractSha256: STUDY_SHA256,
          studyOriginSchedule: origins,
        }),
      }
      const rewrittenOrigins = origins.map((origin, index) => (
        index === 13 ? { ...origin, forecastCutoff: `${origin.originDate}T08:00:00.000Z` } : origin
      ))
      writeFileSync(inputPath, JSON.stringify(buildInput(origins)))
      writeFileSync(rewrittenInputPath, JSON.stringify(buildInput(rewrittenOrigins)))
      writeFileSync(lockPath, JSON.stringify(lock))
      const run = (path: string) => spawnSync(process.execPath, [
        '--import', 'tsx', 'scripts/tli/learn/run-offline-eval.ts',
        `--input=${path}`, `--study-lock=${lockPath}`,
        `--json-output=${outputPath}`, `--markdown-output=${markdownPath}`,
      ], { cwd: process.cwd(), encoding: 'utf8' })

      const accepted = run(inputPath)
      expect(accepted.status, accepted.stderr).toBe(0)
      expect(JSON.parse(readFileSync(outputPath, 'utf8')).reportVersion).toBe('tli-offline-eval-report-v2')
      const rejected = run(rewrittenInputPath)
      expect(rejected.status).toBe(1)
      expect(rejected.stderr).toMatch(/externally frozen study-origin schedule/)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }, 20_000)
})
