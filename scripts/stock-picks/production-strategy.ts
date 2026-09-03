import { createHash } from 'node:crypto'

import type { VolumeBreakoutParameters } from '@/scripts/stock-picks/strategies'

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical JSON은 유한수만 허용합니다')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Readonly<Record<string, unknown>>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    return `{${entries.map(([key, entryValue]) => (
      `${JSON.stringify(key)}:${canonicalJson(entryValue)}`
    )).join(',')}}`
  }
  throw new Error(`canonical JSON으로 직렬화할 수 없는 값입니다: ${typeof value}`)
}

export function hashCanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

/**
 * optimize-v3(2026-08-28, 공급 하한 반영)의 volumeBreakoutNoGapUp 최빈 fold 선택값.
 * 이 객체는 프로덕션과 frozen 연구 평가가 공유하는 단일 파라미터 원본이다.
 */
export const PRODUCTION_VOLUME_BREAKOUT_PARAMETERS: VolumeBreakoutParameters = {
  minTurnover: 500_000_000,
  minScore: 0,
  minVolumePercentile: 90,
  minDistanceFromHighPercent: 0,
  maxRsi: 75,
  excludeGapUp: true,
}

export const PRODUCTION_STRATEGY = {
  name: 'volumeBreakoutNoGapUp+volumeOnlyFill',
  version: 'v1-2026-09-03',
  parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
  fillTiers: ['breakout', 'volumeOnly'] as const,
  parametersHash: hashCanonicalJson({
    parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
    fillTiers: ['breakout', 'volumeOnly'],
    gateVersion: 'status-flags-v1',
  }),
} as const
