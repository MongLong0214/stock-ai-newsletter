import { z } from 'zod'
import { supabaseAdmin } from '../shared/supabase-admin'

const promotedModelRowSchema = z.object({
  model_version: z.string().min(1),
  status: z.literal('champion'),
  promoted_at: z.string().nullable(),
  previous_champion: z.string().nullable(),
})

const rolledBackModelRowSchema = z.object({
  model_version: z.string().min(1),
  status: z.literal('champion'),
  promoted_at: z.string().nullable(),
  rolled_back_model_version: z.string().min(1),
})

export interface ModelRegistryPromotionResult {
  readonly modelVersion: string
  readonly status: 'champion'
  readonly promotedAt: string | null
  readonly previousChampion: string | null
}

export async function promoteModelRegistryVersion(modelVersion: string): Promise<ModelRegistryPromotionResult> {
  const { data, error } = await supabaseAdmin.rpc('promote_model_registry_version', {
    p_model_version: modelVersion,
  })

  if (error) {
    throw new Error(`model_registry promotion failed: ${error.message}`)
  }

  const rows = z.array(promotedModelRowSchema).min(1).parse(data)
  const promoted = rows[0]
  return {
    modelVersion: promoted.model_version,
    status: promoted.status,
    promotedAt: promoted.promoted_at,
    previousChampion: promoted.previous_champion,
  }
}

/** ISO 8601 주차 기반 모델 버전 문자열 생성 (예: 2026-07-06 → 'm1-2026w28') */
export function buildIsoWeekModelVersion(dateIso: string, prefix = 'm1'): string {
  const [year, month, day] = dateIso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const dayNum = (date.getUTCDay() + 6) % 7 // Mon=0 ... Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3) // 해당 주의 목요일로 이동
  const isoYear = date.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return `${prefix}-${isoYear}w${String(week).padStart(2, '0')}`
}

export interface ModelRegistryChallengerRegistration {
  readonly modelVersion: string
  readonly modelType: string
  readonly coefficients: unknown
  readonly trainRange: readonly [string, string]
  readonly valMetrics: unknown
  readonly gateResult: unknown
}

const registeredChallengerRowSchema = z.object({
  model_version: z.string().min(1),
  status: z.literal('challenger'),
  promoted_at: z.string().nullable(),
  archived_model_version: z.string().nullable(),
})

export interface ModelRegistryChallengerRegistrationResult {
  readonly modelVersion: string
  readonly status: 'challenger'
  readonly archivedModelVersion: string | null
}

/**
 * 신규 학습된 M1 challenger 아티팩트를 model_registry에 등록.
 * 기존 challenger가 있으면 archived로 전환 후 신규 행을 challenger로 삽입/갱신한다 (A2).
 */
export async function registerModelRegistryChallenger(
  input: ModelRegistryChallengerRegistration,
): Promise<ModelRegistryChallengerRegistrationResult> {
  const { data, error } = await supabaseAdmin.rpc('register_model_registry_challenger', {
    p_model_version: input.modelVersion,
    p_model_type: input.modelType,
    p_coefficients: input.coefficients,
    p_train_start: input.trainRange[0],
    p_train_end: input.trainRange[1],
    p_val_metrics: input.valMetrics,
    p_gate_result: input.gateResult,
  })

  if (error) {
    throw new Error(`model_registry challenger registration failed: ${error.message}`)
  }

  const rows = z.array(registeredChallengerRowSchema).min(1).parse(data)
  const registered = rows[0]
  return {
    modelVersion: registered.model_version,
    status: registered.status,
    archivedModelVersion: registered.archived_model_version,
  }
}

export interface ModelRegistryRollbackResult {
  readonly modelVersion: string
  readonly status: 'champion'
  readonly promotedAt: string | null
  readonly rolledBackModelVersion: string
}

export async function rollbackModelRegistryVersion(modelVersion: string): Promise<ModelRegistryRollbackResult> {
  const { data, error } = await supabaseAdmin.rpc('rollback_model_registry_version', {
    p_target_model_version: modelVersion,
  })

  if (error) {
    throw new Error(`model_registry rollback failed: ${error.message}`)
  }

  const rows = z.array(rolledBackModelRowSchema).min(1).parse(data)
  const restored = rows[0]
  return {
    modelVersion: restored.model_version,
    status: restored.status,
    promotedAt: restored.promoted_at,
    rolledBackModelVersion: restored.rolled_back_model_version,
  }
}
