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

  it('writes a versioned weight artifact row and validates readback', async () => {
    const mod = await import('../level4/weight-artifact')

    const row = mod.buildWeightArtifactRow({
      weight_version: 'w-2026-03-12',
      source_surface: 'v2_certification',
      w_feature: 0.45,
      w_curve: 0.45,
      w_keyword: 0.10,
      sector_penalty: 0.88,
      curve_bucket_policy: {
        long: { w_feature: 0.35, w_curve: 0.55, w_keyword: 0.10 },
        medium: { w_feature: 0.55, w_curve: 0.35, w_keyword: 0.10 },
        short: { w_feature: 0.90, w_curve: 0.00, w_keyword: 0.10 },
      },
      validation_metric_summary: {
        baseline_mrr: 0.0636,
        candidate_mrr: 0.0709,
        baseline_ndcg: 0.0717,
        candidate_ndcg: 0.0773,
      },
      ci_lower: -0.0006,
      ci_upper: 0.0154,
      ci_method: 'cluster_bootstrap',
      bootstrap_iterations: 2000,
      created_at: '2026-03-12T00:00:00Z',
    })

    expect(row).toMatchObject({
      weight_version: 'w-2026-03-12',
      source_surface: 'v2_certification',
      ci_method: 'cluster_bootstrap',
    })

    expect(mod.validateWeightArtifactReadback({
      written: row,
      read: { ...row },
    })).toEqual({ ok: true, mismatches: [] })
  })

  it('fetches a certification-grade weight artifact by version and rejects legacy artifacts', async () => {
    const mod = await import('../level4/weight-artifact')
    const row = mod.buildWeightArtifactRow({
      weight_version: 'w-2026-03-12',
      source_surface: 'v2_certification',
      w_feature: 0.45,
      w_curve: 0.45,
      w_keyword: 0.10,
      sector_penalty: 0.88,
      curve_bucket_policy: {
        long: { w_feature: 0.35, w_curve: 0.55, w_keyword: 0.10 },
        medium: { w_feature: 0.55, w_curve: 0.35, w_keyword: 0.10 },
        short: { w_feature: 0.90, w_curve: 0.00, w_keyword: 0.10 },
      },
      validation_metric_summary: {
        baseline_mrr: 0.0636,
        candidate_mrr: 0.0709,
        baseline_ndcg: 0.0717,
        candidate_ndcg: 0.0773,
      },
      ci_lower: -0.0006,
      ci_upper: 0.0154,
      ci_method: 'cluster_bootstrap',
      bootstrap_iterations: 2000,
      created_at: '2026-03-12T00:00:00Z',
    })

    const client = {
      from(table: string) {
        expect(table).toBe('weight_artifact')
        return {
          upsert(inputRow: typeof row) {
            return {
              select() {
                return {
                  single: async () => ({ data: inputRow, error: null }),
                }
              },
            }
          },
          select() {
            return {
              eq(column: string, value: string) {
                expect(column).toBe('weight_version')
                expect(value).toBe('w-2026-03-12')
                return {
                  maybeSingle: async () => ({ data: row, error: null }),
                }
              },
            }
          },
        }
      },
    }

    await expect(mod.upsertWeightArtifact(client, row)).resolves.toMatchObject({
      weight_version: 'w-2026-03-12',
    })
    await expect(mod.fetchWeightArtifactByVersion(client, 'w-2026-03-12')).resolves.toMatchObject({
      weight_version: 'w-2026-03-12',
    })

    const legacyClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { ...row, source_surface: 'legacy_diagnostic' },
                    error: null,
                  }),
                }
              },
            }
          },
        }
      },
    }

    await expect(mod.fetchWeightArtifactByVersion(legacyClient, 'w-2026-03-12')).rejects.toThrow(/certification/i)
  })

  it('fetches the latest certification-grade weight artifact', async () => {
    const mod = await import('../level4/weight-artifact')
    const rows = [
      {
        weight_version: 'w-old',
        source_surface: 'v2_certification',
        w_feature: 0.4,
        w_curve: 0.6,
        w_keyword: 0,
        sector_penalty: 0.85,
        curve_bucket_policy: {},
        validation_metric_summary: {},
        ci_lower: 0,
        ci_upper: 0,
        ci_method: 'cluster_bootstrap',
        bootstrap_iterations: 1000,
        created_at: '2026-03-11T00:00:00Z',
      },
      {
        weight_version: 'w-new',
        source_surface: 'v2_certification',
        w_feature: 0.5,
        w_curve: 0.4,
        w_keyword: 0.1,
        sector_penalty: 0.85,
        curve_bucket_policy: {},
        validation_metric_summary: {},
        ci_lower: 0,
        ci_upper: 0,
        ci_method: 'cluster_bootstrap',
        bootstrap_iterations: 1000,
        created_at: '2026-03-12T00:00:00Z',
      },
    ]

    const client = {
      from(table: string) {
        expect(table).toBe('weight_artifact')
        return {
          select() {
            return {
              in() {
                return {
                  order() {
                    return {
                      limit() {
                        return {
                          maybeSingle: async () => ({ data: rows[1], error: null }),
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      },
    }

    await expect(mod.fetchLatestCertificationWeightArtifact(client)).resolves.toMatchObject({
      weight_version: 'w-new',
    })
  })

  it('normalizes non-finite CI bounds to zero before persistence', async () => {
    const mod = await import('../level4/weight-artifact')

    const row = mod.buildWeightArtifactRow({
      weight_version: 'w-nan',
      source_surface: 'v2_certification',
      w_feature: 0.45,
      w_curve: 0.45,
      w_keyword: 0.10,
      sector_penalty: 0.88,
      curve_bucket_policy: {
        long: { w_feature: 0.35, w_curve: 0.55, w_keyword: 0.10 },
        medium: { w_feature: 0.55, w_curve: 0.35, w_keyword: 0.10 },
        short: { w_feature: 0.90, w_curve: 0.00, w_keyword: 0.10 },
      },
      validation_metric_summary: {},
      ci_lower: Number.NaN,
      ci_upper: Number.POSITIVE_INFINITY,
      ci_method: 'cluster_bootstrap',
      bootstrap_iterations: 1000,
      created_at: '2026-03-12T00:00:00Z',
    })

    expect(row.ci_lower).toBe(0)
    expect(row.ci_upper).toBe(0)
  })
})
