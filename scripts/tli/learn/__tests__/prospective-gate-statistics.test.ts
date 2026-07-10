import type { SpawnSyncReturns } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseCanonicalJsonV1 } from '../../../../lib/tli/canonical-json-v1'
import { resolvePinnedPythonScriptInvocation } from '../m1-runtime'
import {
  bridgeOutputBodySha256,
  parseProspectiveGateBootstrap,
} from '../prospective-gate-statistics-contract'
import {
  buildProspectiveGateBootstrapRequest,
  PROSPECTIVE_GATE_BRIDGE_SCRIPT,
  ProspectiveGateStatisticsError,
  runProspectiveGateStatistics,
  type ProspectiveGateStatisticRow,
} from '../prospective-gate-statistics'

const CYCLE_ID = '10000000-0000-4000-8000-000000000014'
const GATE_INPUT_SHA256 = 'a'.repeat(64)

const rows: readonly ProspectiveGateStatisticRow[] = [
  {
    originDate: '2026-07-13', themeId: 'beta', candidateProbability: 0.8,
    comparatorProbability: 0.6, outcome: true, regime: 'neutral',
  },
  {
    originDate: '2026-07-06', themeId: 'alpha', candidateProbability: 0.2,
    comparatorProbability: 0.4, outcome: false, regime: 'risk_off',
  },
]
const eligibleOrigins = [
  { originDate: '2026-07-13', regime: 'neutral' as const },
  { originDate: '2026-07-06', regime: 'risk_off' as const },
]

const bridgeOutput = (requestSha256: string) => {
  const body = {
    contract_version: 'bootstrap-v1' as const,
    method: 'theme_x_two_week_moving_block' as const,
    replicates: 10_000 as const,
    moving_block_length: 2 as const,
    ece_bin_count: 10 as const,
    gate_input_sha256: GATE_INPUT_SHA256,
    request_sha256: requestSha256,
    delta_brier: {
      seed: 101, point: '-0.1125', upper99: '-0.01', replicate_sha256: 'b'.repeat(64),
    },
    ece: {
      seed: 102, point: '0.10000000000000001', upper95: '0.11', replicate_sha256: 'c'.repeat(64),
    },
    regime_lower95: {
      risk_off: { seed: 103, point: '-0.1', lower95: '-0.01', replicate_sha256: 'd'.repeat(64) },
      neutral: null,
      risk_on: null,
    },
  }
  const provisional = { ...body, result_sha256: 'e'.repeat(64) }
  return { ...body, result_sha256: bridgeOutputBodySha256(provisional) }
}

const processResult = (status: number, stderr = ''): SpawnSyncReturns<string> => ({
  pid: 1, output: [null, '', stderr], stdout: '', stderr, status, signal: null, error: undefined,
})

describe('prospective gate statistics bridge', () => {
  it('builds one canonical, sorted, byte-deterministic request', () => {
    const first = buildProspectiveGateBootstrapRequest({
      cycleId: CYCLE_ID, gateInputSha256: GATE_INPUT_SHA256, eligibleOrigins, rows,
    })
    const second = buildProspectiveGateBootstrapRequest({
      cycleId: CYCLE_ID, gateInputSha256: GATE_INPUT_SHA256,
      eligibleOrigins: [...eligibleOrigins].reverse(), rows: [...rows].reverse(),
    })

    expect(first).toEqual(second)
    expect(first.request.rows.map((row) => `${row.origin_date}|${row.theme_id}`)).toEqual([
      '2026-07-06|alpha', '2026-07-13|beta',
    ])
    expect(first.request.eligible_origins.map((origin) => origin.origin_date)).toEqual([
      '2026-07-06', '2026-07-13',
    ])
    expect(first.requestSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('verifies the Python receipt and maps ineligible regime results to null', () => {
    const request = buildProspectiveGateBootstrapRequest({
      cycleId: CYCLE_ID, gateInputSha256: GATE_INPUT_SHA256, eligibleOrigins, rows,
    })
    const raw = bridgeOutput(request.requestSha256)
    const result = parseProspectiveGateBootstrap({
      value: raw,
      expectedGateInputSha256: GATE_INPUT_SHA256,
      expectedRequestSha256: request.requestSha256,
    })

    expect(result).toMatchObject({
      requestSha256: request.requestSha256,
      bridgeResultSha256: raw.result_sha256,
      bootstrap: {
        contractVersion: 'bootstrap-v1', replicates: 10_000,
        ece: { point: 0.1, upper95: 0.11 },
        regimeLower95: { neutral: null, risk_on: null },
      },
    })
    expect(result.bootstrap.resultSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it.each([
    ['result hash', (value: ReturnType<typeof bridgeOutput>) => ({ ...value, result_sha256: 'f'.repeat(64) })],
    ['input hash', (value: ReturnType<typeof bridgeOutput>) => ({ ...value, gate_input_sha256: 'f'.repeat(64) })],
    ['replicates', (value: ReturnType<typeof bridgeOutput>) => ({ ...value, replicates: 9_999 })],
    ['theme only', (value: ReturnType<typeof bridgeOutput>) => ({ ...value, method: 'theme_only' })],
    ['nonfinite decimal', (value: ReturnType<typeof bridgeOutput>) => ({
      ...value, ece: { ...value.ece, upper95: 'NaN' },
    })],
  ])('rejects a %s contract violation', (_label, mutate) => {
    const request = buildProspectiveGateBootstrapRequest({
      cycleId: CYCLE_ID, gateInputSha256: GATE_INPUT_SHA256, eligibleOrigins, rows,
    })
    expect(() => parseProspectiveGateBootstrap({
      value: mutate(bridgeOutput(request.requestSha256)),
      expectedGateInputSha256: GATE_INPUT_SHA256,
      expectedRequestSha256: request.requestSha256,
    })).toThrow()
  })

  it('runs the bridge once with canonical envelope bytes and parses its output', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tli-prospective-gate-'))
    let invocations = 0
    try {
      const result = runProspectiveGateStatistics({
        cycleId: CYCLE_ID,
        gateInputSha256: GATE_INPUT_SHA256,
        eligibleOrigins,
        rows,
        workDir: directory,
        runner: (args) => {
          invocations += 1
          const requestPath = args[0]
          const outputPath = args[1]
          if (requestPath === undefined || outputPath === undefined) return processResult(2, 'missing path')
          const envelopeBytes = readFileSync(requestPath, 'utf8')
          const envelope = parseCanonicalJsonV1(envelopeBytes)
          if (envelope === null || Array.isArray(envelope) || typeof envelope !== 'object') {
            return processResult(2, 'invalid envelope')
          }
          const requestSha256 = Reflect.get(envelope, 'request_sha256')
          if (typeof requestSha256 !== 'string') return processResult(2, 'missing request hash')
          writeFileSync(outputPath, JSON.stringify(bridgeOutput(requestSha256)))
          return processResult(0)
        },
      })

      expect(invocations).toBe(1)
      expect(result.bootstrap.replicates).toBe(10_000)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('fails closed on a nonzero process and pins uv/Python for production', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tli-prospective-gate-'))
    try {
      expect(() => runProspectiveGateStatistics({
        cycleId: CYCLE_ID, gateInputSha256: GATE_INPUT_SHA256, eligibleOrigins, rows, workDir: directory,
        runner: () => processResult(2, 'bootstrap rejected'),
      })).toThrowError(new ProspectiveGateStatisticsError('python_bridge_failed', 'bootstrap rejected'))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }

    const invocation = resolvePinnedPythonScriptInvocation({
      script: PROSPECTIVE_GATE_BRIDGE_SCRIPT,
      scriptArgs: ['input.json', 'output.json'],
      baseEnv: { NODE_ENV: 'test' },
    })
    expect(invocation.command).toBe('uv')
    expect(invocation.args).toEqual([
      'run', '--frozen', '--python', '3.13.11', '--script', PROSPECTIVE_GATE_BRIDGE_SCRIPT,
      'input.json', 'output.json',
    ])
  })
})
