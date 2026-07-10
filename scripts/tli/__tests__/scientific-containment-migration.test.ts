import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/045_tli_scientific_containment.sql',
)

let sql = ''
let normalizedSql = ''

beforeAll(() => {
  sql = readFileSync(migrationPath, 'utf8')
  normalizedSql = sql.replace(/\s+/g, ' ').trim()
})

describe('TLI scientific containment migration', () => {
  it('applies the entire containment change atomically', () => {
    expect(normalizedSql).toMatch(/^BEGIN;/)
    expect(normalizedSql).toMatch(/COMMIT;$/)
  })

  it('adds the exact model registry scientific-state columns without Todo 12 constraints', () => {
    expect(normalizedSql).toContain(
      "scientific_claim_status TEXT NOT NULL DEFAULT 'unvalidated' CHECK (scientific_claim_status IN ('unvalidated','eligible','invalidated'))",
    )
    expect(normalizedSql).toContain(
      "scientific_release_status TEXT NOT NULL DEFAULT 'blocked' CHECK (scientific_release_status IN ('blocked','internal','public'))",
    )
    expect(normalizedSql).toContain('scientific_claim_reason TEXT')
    expect(normalizedSql).toContain('invalidated_at TIMESTAMPTZ')
    expect(normalizedSql).toContain('experiment_cycle_id UUID NULL')
    expect(sql).not.toMatch(/experiment_cycle_id\s+UUID[^,;]*(?:REFERENCES|UNIQUE)/i)
  })

  it('invalidates every legacy M1 row and archives active legacy challengers', () => {
    expect(normalizedSql).toMatch(
      /UPDATE public\.model_registry SET[\s\S]*scientific_claim_status = 'invalidated'[\s\S]*scientific_release_status = 'blocked'[\s\S]*scientific_claim_reason = 'legacy_non_pit_evidence'[\s\S]*invalidated_at = COALESCE\(invalidated_at, now\(\)\)[\s\S]*status = CASE WHEN status = 'challenger' THEN 'archived' ELSE status END[\s\S]*WHERE \(model_type = 'm1_logistic' OR model_version LIKE 'm1-%'\)/,
    )
  })

  it('keeps B-Abl descriptive and blocked from public scientific release', () => {
    expect(normalizedSql).toMatch(
      /UPDATE public\.model_registry SET[\s\S]*scientific_claim_status = 'unvalidated'[\s\S]*scientific_release_status = 'blocked'[\s\S]*scientific_claim_reason = 'descriptive_phase_only'[\s\S]*WHERE \(model_type = 'b_abl' OR model_version LIKE 'b-abl-%'\)/,
    )
  })

  it('marks legacy gta-v1 labels as exploratory-only with an exact reason', () => {
    expect(normalizedSql).toContain(
      "scientific_use_status TEXT NOT NULL DEFAULT 'exploratory_only' CHECK (scientific_use_status IN ('exploratory_only','confirmatory_eligible'))",
    )
    expect(normalizedSql).toContain(
      "scientific_use_reason TEXT NOT NULL DEFAULT 'legacy_non_pit_evidence'",
    )
    expect(normalizedSql).toMatch(
      /labeler_version <> 'gta-v1' OR \(\s*scientific_use_status = 'exploratory_only' AND scientific_use_reason = 'legacy_non_pit_evidence'\s*\)/,
    )
  })

  it('revokes every legacy registry RPC from all previously usable roles', () => {
    const roles = 'PUBLIC, anon, authenticated, service_role'
    expect(normalizedSql).toContain(
      `REVOKE EXECUTE ON FUNCTION public.promote_model_registry_version(TEXT) FROM ${roles}`,
    )
    expect(normalizedSql).toContain(
      `REVOKE EXECUTE ON FUNCTION public.rollback_model_registry_version(TEXT) FROM ${roles}`,
    )
    expect(normalizedSql).toContain(
      `REVOKE EXECUTE ON FUNCTION public.register_model_registry_challenger(TEXT, TEXT, JSONB, DATE, DATE, JSONB, JSONB) FROM ${roles}`,
    )
  })

  it('installs an unconditional registry mutation guard only after the backfills', () => {
    expect(normalizedSql).toMatch(/BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public\.model_registry/)
    expect(normalizedSql).toMatch(/RAISE EXCEPTION[\s\S]*Todo 12/i)

    const finalBackfillIndex = normalizedSql.lastIndexOf('UPDATE public.model_registry')
    const triggerIndex = normalizedSql.indexOf('CREATE TRIGGER')
    expect(finalBackfillIndex).toBeGreaterThan(-1)
    expect(triggerIndex).toBeGreaterThan(finalBackfillIndex)
  })

  it('is append/backfill-only and does not alter the prediction-row schema', () => {
    expect(sql).not.toMatch(/\bDROP\b/i)
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(sql).not.toMatch(/\bTRUNCATE\s+TABLE\b/i)
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+(?:public\.)?theme_predictions_v3/i)
    expect(sql).not.toMatch(/experiment_cycle_id\s+UUID[^,;]*REFERENCES/i)
  })
})
