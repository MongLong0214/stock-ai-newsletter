import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('TLI4-014 weight artifact writer', () => {
  it('adds a migration for certification weight artifact persistence with required columns', () => {
    const migrationDir = join(process.cwd(), 'supabase', 'migrations')
    const sql = readdirSync(migrationDir)
      .filter((name) => name.endsWith('.sql'))
      .map((name) => readFileSync(join(migrationDir, name), 'utf8'))
      .join('\n')

    expect(sql).toMatch(/weight_artifact/i)
    expect(sql).toMatch(/weight_version/i)
    expect(sql).toMatch(/curve_bucket_policy/i)
    expect(sql).toMatch(/ci_method/i)
    expect(sql).toMatch(/bootstrap_iterations/i)
  })

  it('writes versioned weight artifact rows with read-after-write verification metadata', async () => {
    const mod = await import('../level4/weight-artifact')

    const row = mod.buildWeightArtifactRow({
      weight_version: 'w-2026-03-12',
      source_surface: 'v2_certification',
      w_feature: 0.35,
      w_curve: 0.65,
      w_keyword: 0,
      sector_penalty: 0.9,
      curve_bucket_policy: {
        gte14: { feature: 0.35, curve: 0.65 },
        gte7: { feature: 0.55, curve: 0.45 },
        lt7: { feature: 1, curve: 0 },
      },
      validation_metric_summary: {
        mrr: { meanDelta: 0.012, lower: 0.003, upper: 0.021 },
        ndcg: { meanDelta: 0.009, lower: 0.001, upper: 0.017 },
      },
      ci_lower: 0.003,
      ci_upper: 0.021,
      ci_method: 'cluster_bootstrap',
      bootstrap_iterations: 1000,
      created_at: '2026-03-12T00:00:00Z',
    })

    expect(row).toMatchObject({
      source_surface: 'v2_certification',
      weight_version: 'w-2026-03-12',
      ci_method: 'cluster_bootstrap',
      bootstrap_iterations: 1000,
    })

    expect(
      mod.validateWeightArtifactReadback({
        written: row,
        read: { ...row },
      }),
    ).toEqual({ ok: true, mismatches: [] })
  })

  it('persists and fetches a certification-grade weight artifact by version', async () => {
    const mod = await import('../level4/weight-artifact')
    const stored: { row?: unknown } = {}

    const client = {
      from(table: string) {
        expect(table).toBe('weight_artifact')
        return {
          upsert(row: unknown) {
            stored.row = row
            return {
              select() {
                return {
                  async single() {
                    return { data: stored.row, error: null }
                  },
                }
              },
            }
          },
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: stored.row, error: null }),
                }
              },
            }
          },
        }
      },
    }

    const row = mod.buildWeightArtifactRow({
      weight_version: 'w-2026-03-12',
      source_surface: 'v2_certification',
      w_feature: 0.35,
      w_curve: 0.65,
      w_keyword: 0,
      sector_penalty: 0.9,
      curve_bucket_policy: {
        gte14: { feature: 0.35, curve: 0.65 },
        gte7: { feature: 0.55, curve: 0.45 },
        lt7: { feature: 1, curve: 0 },
      },
      validation_metric_summary: {
        mrr: { meanDelta: 0.012, lower: 0.003, upper: 0.021 },
        ndcg: { meanDelta: 0.009, lower: 0.001, upper: 0.017 },
      },
      ci_lower: 0.003,
      ci_upper: 0.021,
      ci_method: 'cluster_bootstrap',
      bootstrap_iterations: 1000,
      created_at: '2026-03-12T00:00:00Z',
    })

    await mod.upsertWeightArtifact(client, row)
    const fetched = await mod.fetchWeightArtifactByVersion(client, 'w-2026-03-12')

    expect(fetched.weight_version).toBe('w-2026-03-12')
    expect(fetched.source_surface).toBe('v2_certification')
  })
})