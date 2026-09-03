import { describe, expect, it, vi } from 'vitest'

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({ supabaseAdmin: {} }))

import { filterEligibleStudyOriginBindings } from '../origins/study-origin-eligibility-source'

const bindings = [
  { study_origin_manifest_id: 'study-origin-1', forecast_origin_manifest_id: 'forecast-1' },
  { study_origin_manifest_id: 'study-origin-2', forecast_origin_manifest_id: 'forecast-2' },
  { study_origin_manifest_id: 'study-origin-3', forecast_origin_manifest_id: 'forecast-3' },
]

describe('filterEligibleStudyOriginBindings', () => {
  it('eligible만 통과시키고 ineligible 및 판정 없는 origin은 제외한다', () => {
    const warn = vi.fn()
    const result = filterEligibleStudyOriginBindings(bindings, [
      { study_origin_manifest_id: 'study-origin-1', verdict: 'eligible' },
      { study_origin_manifest_id: 'study-origin-2', verdict: 'ineligible' },
    ], warn)

    expect(result).toEqual([bindings[0]])
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('study-origin-3'))
  })
})
