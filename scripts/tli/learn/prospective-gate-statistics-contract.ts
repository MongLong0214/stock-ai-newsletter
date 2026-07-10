import { createHash } from 'node:crypto'

import { z } from 'zod'

import { canonicalJsonV1 } from '../../../lib/tli/canonical-json-v1'
import {
  bootstrapResultSha256,
  type BootstrapResult,
  type BootstrapResultCore,
} from './prospective-gate-final'

const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const decimal = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/)
const seed = z.number().int().nonnegative().safe()

const upperStatistic = z.object({
  seed,
  point: decimal,
  upper99: decimal,
  replicate_sha256: sha256,
}).strict()

const eceStatistic = z.object({
  seed,
  point: decimal,
  upper95: decimal,
  replicate_sha256: sha256,
}).strict()

const lowerStatistic = z.object({
  seed,
  point: decimal,
  lower95: decimal,
  replicate_sha256: sha256,
}).strict()

const bridgeOutputSchema = z.object({
  contract_version: z.literal('bootstrap-v1'),
  method: z.literal('theme_x_two_week_moving_block'),
  replicates: z.literal(10_000),
  moving_block_length: z.literal(2),
  ece_bin_count: z.literal(10),
  gate_input_sha256: sha256,
  request_sha256: sha256,
  delta_brier: upperStatistic,
  ece: eceStatistic,
  regime_lower95: z.object({
    risk_off: lowerStatistic.nullable(),
    neutral: lowerStatistic.nullable(),
    risk_on: lowerStatistic.nullable(),
  }).strict(),
  result_sha256: sha256,
}).strict()

type BridgeOutput = z.infer<typeof bridgeOutputSchema>

const finiteDecimal = (value: string): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new TypeError(`nonfinite bootstrap decimal: ${value}`)
  return parsed
}

const flattenBridgeValue = (prefix: string, value: unknown): readonly string[] => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value).sort().flatMap((key) => (
      flattenBridgeValue(`${prefix}.${key}`, Reflect.get(value, key))
    ))
  }
  if (value === null) return [`${prefix}=null`]
  if (typeof value === 'string' || typeof value === 'number') return [`${prefix}=${String(value)}`]
  throw new TypeError(`unsupported bridge hash value at ${prefix}`)
}

const bridgeBody = (output: BridgeOutput) => ({
  contract_version: output.contract_version,
  method: output.method,
  replicates: output.replicates,
  moving_block_length: output.moving_block_length,
  ece_bin_count: output.ece_bin_count,
  gate_input_sha256: output.gate_input_sha256,
  request_sha256: output.request_sha256,
  delta_brier: output.delta_brier,
  ece: output.ece,
  regime_lower95: output.regime_lower95,
})

export const bridgeOutputBodySha256 = (value: unknown): string => {
  const output = bridgeOutputSchema.parse(value)
  const material = flattenBridgeValue('bootstrap', bridgeBody(output)).join('\n')
  return createHash('sha256').update(material, 'utf8').digest('hex')
}

export type ProspectiveGateBootstrapReceipt = {
  readonly requestSha256: string
  readonly bridgeResultSha256: string
  readonly bootstrap: BootstrapResult
}

export const parseProspectiveGateBootstrap = (input: {
  readonly value: unknown
  readonly expectedGateInputSha256: string
  readonly expectedRequestSha256: string
}): ProspectiveGateBootstrapReceipt => {
  const output = bridgeOutputSchema.parse(input.value)
  if (output.gate_input_sha256 !== input.expectedGateInputSha256) {
    throw new TypeError('bootstrap gate input hash mismatch')
  }
  if (output.request_sha256 !== input.expectedRequestSha256) {
    throw new TypeError('bootstrap request hash mismatch')
  }
  if (bridgeOutputBodySha256(output) !== output.result_sha256) {
    throw new TypeError('bootstrap bridge result hash mismatch')
  }
  const regimeLower95 = Object.fromEntries(Object.entries(output.regime_lower95).map(([regime, result]) => [
    regime,
    result === null ? null : {
      seed: result.seed,
      lower95: finiteDecimal(result.lower95),
      replicateSha256: result.replicate_sha256,
    },
  ])) as BootstrapResultCore['regimeLower95']
  const core: BootstrapResultCore = {
    contractVersion: output.contract_version,
    method: output.method,
    replicates: output.replicates,
    movingBlockLength: output.moving_block_length,
    eceBinCount: output.ece_bin_count,
    inputSha256: output.gate_input_sha256,
    deltaBrier: {
      seed: output.delta_brier.seed,
      point: finiteDecimal(output.delta_brier.point),
      upper99: finiteDecimal(output.delta_brier.upper99),
      replicateSha256: output.delta_brier.replicate_sha256,
    },
    ece: {
      seed: output.ece.seed,
      point: finiteDecimal(output.ece.point),
      upper95: finiteDecimal(output.ece.upper95),
      replicateSha256: output.ece.replicate_sha256,
    },
    regimeLower95,
  }
  return {
    requestSha256: output.request_sha256,
    bridgeResultSha256: output.result_sha256,
    bootstrap: { ...core, resultSha256: bootstrapResultSha256(core) },
  }
}

export const prospectiveGateRequestSha256 = (request: unknown): string => (
  createHash('sha256').update(canonicalJsonV1(request), 'utf8').digest('hex')
)
