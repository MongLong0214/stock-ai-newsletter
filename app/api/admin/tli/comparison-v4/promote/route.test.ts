import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchWeightArtifactByVersion = vi.fn()
const fetchLatestCertificationCalibrationArtifact = vi.fn()
const buildArtifactBackedPromotionContext = vi.fn()
const resolveRequiredWeightArtifact = vi.fn((artifact) => artifact)

vi.mock('@/scripts/tli/level4/weight-artifact', () => ({
  fetchWeightArtifactByVersion,
}))

vi.mock('@/scripts/tli/level4/calibration-artifact', () => ({
  fetchLatestCertificationCalibrationArtifact,
}))

vi.mock('@/scripts/tli/level4/promotion-runtime', () => ({
  buildArtifactBackedPromotionContext,
  resolveRequiredWeightArtifact,
}))

// backfill guard: 항상 완료 상태로 mock
vi.mock('@/scripts/tli/themes/theme-state-history', () => ({
  isStateHistoryBackfillComplete: () => true,
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        count: 50,
        error: null,
        // .in() chain for loadRuns
        in: () => Promise.resolve({ data: [], error: null }),
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { production_version: 'algo-v4-prev' }, error: null }),
        }),
      }),
      update: () => ({
        in: () => Promise.resolve({ error: null }),
        eq: () => Promise.resolve({ error: null }),
      }),
      upsert: () => Promise.resolve({ error: null }),
    }),
    rpc: () => Promise.resolve({
      data: { promotedRunIds: ['run-1'], skippedRunIds: [], report: 'ok' },
      error: null,
    }),
  },
}))

describe('admin comparison v4 promote route', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, ADMIN_SECRET: 'secret' }
    fetchWeightArtifactByVersion.mockReset()
    fetchLatestCertificationCalibrationArtifact.mockReset()
    buildArtifactBackedPromotionContext.mockReset()
    resolveRequiredWeightArtifact.mockClear()
    fetchWeightArtifactByVersion.mockResolvedValue({
      weight_version: 'w-2026-03-12',
      source_surface: 'v2_certification',
      validation_metric_summary: {
        mrr: { meanDelta: 0.01, lower: 0.001, upper: 0.02 },
        ndcg: { meanDelta: 0.01, lower: 0.001, upper: 0.02 },
        precisionAt3: { meanDelta: 0.02, lower: 0.001, upper: 0.03 },
      },
    })
    fetchLatestCertificationCalibrationArtifact.mockResolvedValue({
      source_surface: 'v2_certification',
      calibration_version: 'cal-2026-03-12',
      ci_method: 'cluster_bootstrap',
      bootstrap_iterations: 1000,
      brier_score_before: 0.10,
      brier_score_after: 0.08,
      ece_before: 0.12,
      ece_after: 0.10,
    })
    buildArtifactBackedPromotionContext.mockReturnValue({
      gateVerdict: {
        passed: true,
        status: 'passed',
        summary: 'all release gates passed',
        failureReasons: [],
      },
      autoHold: {
        autoHoldEnabled: true,
        holdState: 'inactive',
        holdReason: null,
        holdReportDate: '2026-03-12',
      },
    })
  })

  it('returns 401 when authorization is missing', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost/api/admin/tli/comparison-v4/promote', {
      method: 'POST',
      body: JSON.stringify({ runIds: ['run-1'], productionVersion: 'algo-v4-prod' }),
    }))

    expect(response.status).toBe(401)
  })

  it('returns 400 when runIds are invalid', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost/api/admin/tli/comparison-v4/promote', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: JSON.stringify({ runIds: [], productionVersion: 'algo-v4-prod', weightVersion: 'w-2026-03-12' }),
    }))

    expect(response.status).toBe(400)
  })

  it('returns 200 with promotion summary on success', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost/api/admin/tli/comparison-v4/promote', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: JSON.stringify({ runIds: ['run-1'], productionVersion: 'algo-v4-prod', weightVersion: 'w-2026-03-12' }),
    }))

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.promotedRunIds).toEqual(['run-1'])
  })

  it('returns 409 when a requested weight version has no certification artifact', async () => {
    fetchWeightArtifactByVersion.mockRejectedValue(new Error('missing weight artifact'))

    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost/api/admin/tli/comparison-v4/promote', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: JSON.stringify({
        runIds: ['run-1'],
        productionVersion: 'algo-v4-prod',
        weightVersion: 'w-2026-03-12',
      }),
    }))

    expect(response.status).toBe(409)
  })

  it('returns 409 when artifact-backed promotion gate does not pass', async () => {
    buildArtifactBackedPromotionContext.mockReturnValue({
      gateVerdict: {
        passed: false,
        status: 'held',
        summary: 'release blocked: drift_auto_hold_active',
        failureReasons: ['drift_auto_hold_active'],
      },
      autoHold: {
        autoHoldEnabled: true,
        holdState: 'active',
        holdReason: 'drift_auto_hold_active',
        holdReportDate: '2026-03-12',
      },
    })

    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost/api/admin/tli/comparison-v4/promote', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: JSON.stringify({
        runIds: ['run-1'],
        productionVersion: 'algo-v4-prod',
        weightVersion: 'w-2026-03-12',
        driftArtifact: {
          drift_status: 'hold',
          candidate_concentration_gini: 0.21,
          baseline_candidate_concentration_gini: 0.20,
          censoring_ratio: 0.11,
          baseline_censoring_ratio: 0.10,
          low_confidence_serving_rate: 0.20,
          auto_hold_enabled: true,
          hold_report_date: '2026-03-12',
        },
      }),
    }))

    expect(response.status).toBe(409)
  })
})
