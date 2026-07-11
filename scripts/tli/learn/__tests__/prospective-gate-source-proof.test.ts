import { describe, expect, it } from 'vitest'

const disableRepeatedScans = <Row>(rows: Row[]): Row[] => {
  Object.defineProperties(rows, {
    find: { value: () => { throw new Error('find scan is forbidden') } },
    filter: { value: () => { throw new Error('filter scan is forbidden') } },
    includes: { value: () => { throw new Error('includes scan is forbidden') } },
  })
  return rows
}

describe('prospective source-proof map assembly', () => {
  it('assembles source proof without repeated array scans', async () => {
    const { buildProspectiveExpectedThemes } = await import('../prospective-gate-source-proof')
    const result = buildProspectiveExpectedThemes({
      rawExpectedThemes: disableRepeatedScans([{
        forecast_origin_manifest_id: 'forecast-1',
        theme_id: 'theme-1',
        keyword_group_sha256: 'a'.repeat(64),
        forecast_interest_run_id: 'interest-1',
        forecast_interest_response_sha256: 'b'.repeat(64),
        news_observation_ids: ['news-1'],
        news_input_sha256: 'c'.repeat(64),
        input_status: 'usable' as const,
        abstain_reason: null,
      }]),
      forecasts: disableRepeatedScans([{
        id: 'forecast-1',
        forecast_cutoff: '2026-07-13T09:00:00.000Z',
      }]),
      interestRuns: disableRepeatedScans([{
        id: 'interest-1', source: 'naver_datalab', status: 'complete' as const,
        collected_at: '2026-07-13T08:00:00.000Z', completed_at: '2026-07-13T08:30:00.000Z',
      }]),
      interestObservations: disableRepeatedScans(Array.from({ length: 20 }, () => ({
        collection_run_id: 'interest-1', theme_id: 'theme-1',
      }))),
      newsObservations: disableRepeatedScans([{
        id: 'news-1', collection_run_id: 'news-run-1', collected_at: '2026-07-13T08:00:00.000Z',
      }]),
      newsRuns: disableRepeatedScans([{
        id: 'news-run-1', source: 'naver_news', status: 'complete' as const,
        collected_at: '2026-07-13T08:00:00.000Z', completed_at: '2026-07-13T08:30:00.000Z',
      }]),
    })

    expect(result).toEqual([expect.objectContaining({
      source_proof: {
        interest_run_status: 'complete',
        interest_run_source: 'naver_datalab',
        interest_run_before_cutoff: true,
        interest_observation_count: 20,
        interest_observation_run_count: 1,
        news_observation_count: 1,
        news_run_statuses: ['complete'],
        news_before_cutoff: true,
      },
    })])
  })

  it('preserves duplicate requested news-ID incompleteness semantics', async () => {
    const { buildProspectiveExpectedThemes } = await import('../prospective-gate-source-proof')
    const [row] = buildProspectiveExpectedThemes({
      rawExpectedThemes: [{
        forecast_origin_manifest_id: 'forecast-1', theme_id: 'theme-1',
        keyword_group_sha256: 'a'.repeat(64), forecast_interest_run_id: null,
        forecast_interest_response_sha256: null, news_observation_ids: ['news-1', 'news-1'],
        news_input_sha256: 'b'.repeat(64), input_status: 'usable', abstain_reason: null,
      }],
      forecasts: [{ id: 'forecast-1', forecast_cutoff: '2026-07-13T09:00:00.000Z' }],
      interestRuns: [], interestObservations: [],
      newsObservations: [{
        id: 'news-1', collection_run_id: 'news-run-1', collected_at: '2026-07-13T08:00:00.000Z',
      }],
      newsRuns: [{
        id: 'news-run-1', source: 'naver_news', status: 'complete',
        collected_at: '2026-07-13T08:00:00.000Z', completed_at: '2026-07-13T08:30:00.000Z',
      }],
    })

    expect(row?.source_proof.news_observation_count).toBe(1)
    expect(row?.source_proof.news_before_cutoff).toBe(false)
  })
})
