import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('TLI4-003 calibration artifact writer', () => {
  it('adds a migration for certification calibration artifact persistence with required columns', () => {
    const migrationDir = join(process.cwd(), 'supabase', 'migrations')
    const sql = readdirSync(migrationDir)
      .filter((name) => name.endsWith('.sql'))
      .map((name) => readFileSync(join(migrationDir, name), 'utf8'))
      .join('\n')

    expect(sql).toMatch(/calibration_artifact/i)
    expect(sql).toMatch(/source_surface/i)
    expect(sql).toMatch(/ci_method/i)
    expect(sql).toMatch(/bootstrap_iterations/i)
  })

  it('writes versioned calibration artifact rows with read-after-write verification metadata', async () => {
    const mod = await import('../level4/calibration-artifact')

    const row = mod.buildCalibrationArtifactRow({
      calibration_version: 'cal-2026-03-12',
      source_surface: 'v2_certification',
      source_run_date_from: '2026-02-01',
      source_run_date_to: '2026-02-29',
      source_row_count: 240,
      positive_count: 18,
      calibration_method: 'isotonic',
      ci_method: 'cluster_bootstrap',
      bootstrap_iterations: 4000,
      brier_score_before: 0.2666,
      brier_score_after: 0.0453,
      ece_before: 0.4344,
      ece_after: 0,
      bin_summary: [{ bucket: 0, mean_predicted: 0.52, empirical_rate: 0.04, count: 24 }],
      created_at: '2026-03-12T00:00:00Z',
    })

    expect(row).toMatchObject({
      source_surface: 'v2_certification',
      ci_method: 'cluster_bootstrap',
      bootstrap_iterations: 4000,
      calibration_version: 'cal-2026-03-12',
    })

    expect(
      mod.validateCalibrationArtifactReadback({
        written: row,
        read: { ...row },
      }),
    ).toEqual({ ok: true, mismatches: [] })
  })

  it('persists a calibration artifact through an upsert + single-row readback path', async () => {
    const mod = await import('../level4/calibration-artifact')
    const stored: { row?: unknown } = {}

    const client = {
      from(table: string) {
        expect(table).toBe('calibration_artifact')
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
        }
      },
    }

    const row = mod.buildCalibrationArtifactRow({
      calibration_version: 'cal-2026-03-12',
      source_surface: 'v2_certification',
      source_run_date_from: '2026-02-01',
      source_run_date_to: '2026-02-29',
      source_row_count: 240,
      positive_count: 18,
      calibration_method: 'isotonic',
      ci_method: 'cluster_bootstrap',
      bootstrap_iterations: 4000,
      brier_score_before: 0.2666,
      brier_score_after: 0.0453,
      ece_before: 0.4344,
      ece_after: 0,
      bin_summary: [{ bucket: 0, mean_predicted: 0.52, empirical_rate: 0.04, count: 24 }],
      created_at: '2026-03-12T00:00:00Z',
    })

    const persisted = await mod.upsertCalibrationArtifact(client, row)

    expect(persisted).toMatchObject({
      calibration_version: 'cal-2026-03-12',
      source_surface: 'v2_certification',
    })
  })

  it('accepts tiny floating-point readback differences', async () => {
    const mod = await import('../level4/calibration-artifact')
    const row = mod.buildCalibrationArtifactRow({
      calibration_version: 'cal-2026-03-12',
      source_surface: 'v2_certification',
      source_run_date_from: '2026-02-01',
      source_run_date_to: '2026-02-29',
      source_row_count: 240,
      positive_count: 18,
      calibration_method: 'isotonic',
      ci_method: 'cluster_bootstrap',
      bootstrap_iterations: 4000,
      brier_score_before: 0.2666,
      brier_score_after: 0.0453,
      ece_before: 0.4344,
      ece_after: 0,
      bin_summary: [{ bucket: 0, mean_predicted: 0.52, empirical_rate: 0.04, count: 24 }],
      created_at: '2026-03-12T00:00:00Z',
    })

    expect(
      mod.validateCalibrationArtifactReadback({
        written: row,
        read: {
          ...row,
          brier_score_before: 0.26660000000000006,
          brier_score_after: 0.04530000000000001,
        },
      }),
    ).toEqual({ ok: true, mismatches: [] })
  })
})
