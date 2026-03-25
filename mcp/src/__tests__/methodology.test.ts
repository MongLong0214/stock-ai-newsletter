import { describe, it, expect } from 'vitest'

// Direct test of the methodology section handling logic
// We extract the logic from get-methodology.ts to test independently

describe('methodology section handling', () => {
  // Simulate the METHODOLOGY object structure
  const METHODOLOGY = {
    scoring: {
      range: '0-100',
      components: [
        { name: 'interest', weight: '30.4%' },
        { name: 'newsMomentum', weight: '36.6%' },
      ],
    },
    limitations: [
      'Naver DataLab 5-keyword batch limit',
      'News momentum is article-count-based',
      'Data collection intervals mean latest changes may not be reflected',
    ],
    stages: {
      order: 'Dormant → Emerging → Growth → Peak → Decline',
    },
  }

  const SECTION_KEY_MAP: Record<string, string> = {
    data_sources: 'dataSources',
    update_schedule: 'updateSchedule',
    data_flow: 'dataFlow',
    database_tables: 'databaseTables',
  }

  function buildSectionResult(selected: string) {
    const mappedKey = (SECTION_KEY_MAP[selected] || selected) as keyof typeof METHODOLOGY
    const sectionData = METHODOLOGY[mappedKey]
    return {
      section: selected,
      ...(Array.isArray(sectionData)
        ? { items: sectionData }
        : typeof sectionData === 'object'
          ? sectionData
          : { value: sectionData }),
    }
  }

  it('returns items array for limitations section', () => {
    const result = buildSectionResult('limitations')
    expect(result).toEqual({
      section: 'limitations',
      items: expect.any(Array),
    })
    expect((result as Record<string, unknown>).items).toHaveLength(3)
  })

  it('returns object for scoring section', () => {
    const result = buildSectionResult('scoring')
    expect(result).toHaveProperty('section', 'scoring')
    expect(result).toHaveProperty('range', '0-100')
    expect(result).toHaveProperty('components')
  })

  it('returns object for stages section', () => {
    const result = buildSectionResult('stages')
    expect(result).toHaveProperty('section', 'stages')
    expect(result).toHaveProperty('order')
  })
})
