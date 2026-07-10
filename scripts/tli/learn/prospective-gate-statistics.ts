import type { SpawnSyncReturns } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { canonicalJsonV1 } from '../../../lib/tli/canonical-json-v1'
import { resolvePinnedPythonScriptInvocation } from './m1-runtime'
import {
  parseProspectiveGateBootstrap,
  prospectiveGateRequestSha256,
  type ProspectiveGateBootstrapReceipt,
} from './prospective-gate-statistics-contract'
import type { KospiRegime } from './prospective-gate-metrics'

export const PROSPECTIVE_GATE_BRIDGE_SCRIPT = 'scripts/tli/learn/prospective_gate_bridge.py'

export type ProspectiveGateStatisticRow = {
  readonly originDate: string
  readonly themeId: string
  readonly candidateProbability: number
  readonly comparatorProbability: number
  readonly outcome: boolean
  readonly regime: KospiRegime
}

export type ProspectiveGateEligibleOrigin = {
  readonly originDate: string
  readonly regime: KospiRegime
}

export type ProspectiveGateBridgeRunner = (
  args: readonly string[],
) => SpawnSyncReturns<string>

export class ProspectiveGateStatisticsError extends Error {
  readonly name = 'ProspectiveGateStatisticsError'

  constructor(readonly code: string, readonly detail: string) {
    super(`${code}: ${detail}`)
  }
}

const assertRows = (
  rows: readonly ProspectiveGateStatisticRow[],
  eligibleOrigins: readonly ProspectiveGateEligibleOrigin[],
): void => {
  if (rows.length === 0) {
    throw new ProspectiveGateStatisticsError('insufficient_bootstrap_origins', String(rows.length))
  }
  const originRegimes = new Map(eligibleOrigins.map((origin) => [origin.originDate, origin.regime]))
  if (eligibleOrigins.length < 2 || originRegimes.size !== eligibleOrigins.length
    || eligibleOrigins.some((origin) => !/^\d{4}-\d{2}-\d{2}$/.test(origin.originDate))) {
    throw new ProspectiveGateStatisticsError('invalid_eligible_origin_axis', String(eligibleOrigins.length))
  }
  const identities = new Set<string>()
  for (const row of rows) {
    const identity = `${row.originDate}\u0000${row.themeId}`
    if (identities.has(identity)) throw new ProspectiveGateStatisticsError('duplicate_exact_pair', identity)
    identities.add(identity)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.originDate) || row.themeId.length === 0
      || !Number.isFinite(row.candidateProbability) || row.candidateProbability < 0
      || row.candidateProbability > 1 || !Number.isFinite(row.comparatorProbability)
      || row.comparatorProbability < 0 || row.comparatorProbability > 1
      || originRegimes.get(row.originDate) !== row.regime) {
      throw new ProspectiveGateStatisticsError('invalid_bootstrap_row', identity)
    }
  }
}

export const buildProspectiveGateBootstrapRequest = (input: {
  readonly cycleId: string
  readonly gateInputSha256: string
  readonly eligibleOrigins: readonly ProspectiveGateEligibleOrigin[]
  readonly rows: readonly ProspectiveGateStatisticRow[]
}) => {
  assertRows(input.rows, input.eligibleOrigins)
  const request = {
    contract_version: 'prospective-gate-input-v1',
    cycle_id: input.cycleId,
    gate_input_sha256: input.gateInputSha256,
    eligible_origins: [...input.eligibleOrigins]
      .sort((left, right) => left.originDate.localeCompare(right.originDate))
      .map((origin) => ({ origin_date: origin.originDate, regime: origin.regime })),
    rows: [...input.rows]
      .sort((left, right) => left.originDate.localeCompare(right.originDate)
        || left.themeId.localeCompare(right.themeId))
      .map((row) => ({
        origin_date: row.originDate,
        theme_id: row.themeId,
        candidate_probability: row.candidateProbability,
        comparator_probability: row.comparatorProbability,
        outcome: row.outcome,
        regime: row.regime,
      })),
  } as const
  const canonicalRequestJson = canonicalJsonV1(request)
  return {
    request,
    canonicalRequestJson,
    requestSha256: prospectiveGateRequestSha256(request),
  }
}

export const spawnProspectiveGateBridge: ProspectiveGateBridgeRunner = (args) => {
  const invocation = resolvePinnedPythonScriptInvocation({
    script: PROSPECTIVE_GATE_BRIDGE_SCRIPT,
    scriptArgs: args,
  })
  return spawnSync(invocation.command, [...invocation.args], {
    cwd: process.cwd(), encoding: 'utf8', env: invocation.env,
  })
}

export function runProspectiveGateStatistics(input: {
  readonly cycleId: string
  readonly gateInputSha256: string
  readonly eligibleOrigins: readonly ProspectiveGateEligibleOrigin[]
  readonly rows: readonly ProspectiveGateStatisticRow[]
  readonly workDir: string
  readonly runner?: ProspectiveGateBridgeRunner
}): ProspectiveGateBootstrapReceipt {
  const built = buildProspectiveGateBootstrapRequest(input)
  mkdirSync(input.workDir, { recursive: true })
  const requestPath = join(input.workDir, 'prospective-gate-request.json')
  const outputPath = join(input.workDir, 'prospective-gate-output.json')
  writeFileSync(requestPath, canonicalJsonV1({
    canonical_request_json: built.canonicalRequestJson,
    request_sha256: built.requestSha256,
  }))
  const processResult = (input.runner ?? spawnProspectiveGateBridge)([requestPath, outputPath])
  if (processResult.status !== 0) {
    throw new ProspectiveGateStatisticsError(
      'python_bridge_failed',
      (processResult.stderr || processResult.stdout || `exit ${String(processResult.status)}`).trim(),
    )
  }
  let rawOutput: string
  try {
    rawOutput = readFileSync(outputPath, 'utf8')
  } catch (error) {
    throw new ProspectiveGateStatisticsError(
      'python_bridge_output_missing', error instanceof Error ? error.message : String(error),
    )
  }
  try {
    const value: unknown = JSON.parse(rawOutput)
    return parseProspectiveGateBootstrap({
      value,
      expectedGateInputSha256: input.gateInputSha256,
      expectedRequestSha256: built.requestSha256,
    })
  } catch (error) {
    throw new ProspectiveGateStatisticsError(
      'python_bridge_output_invalid', error instanceof Error ? error.message : String(error),
    )
  }
}
