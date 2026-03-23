import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import PillarBars from './pillar-bars'

describe('PillarBars', () => {
  it('renders a computed zero keyword similarity as 0% instead of 미산출', () => {
    const html = renderToStaticMarkup(
      <PillarBars
        featureSim={0.8}
        curveSim={0.7}
        keywordSim={0}
        idx={0}
      />,
    )

    expect(html).toContain('0%')
    expect(html).not.toContain('미산출')
  })

  it('renders 미산출 only when keyword similarity is null', () => {
    const html = renderToStaticMarkup(
      <PillarBars
        featureSim={0.8}
        curveSim={0.7}
        keywordSim={null}
        idx={0}
      />,
    )

    expect(html).toContain('미산출')
  })
})
