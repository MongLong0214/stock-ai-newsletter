import React from 'react'
import { describe, expect, it, vi } from 'vitest'

const { useSearchParamsMock } = vi.hoisted(() => ({
  useSearchParamsMock: vi.fn(() => {
    throw new Error('useSearchParams must only run below the page Suspense boundary')
  }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: useSearchParamsMock,
}))

import SubscribePage from '@/app/subscribe/page'

describe('subscribe page prerender contract', () => {
  it('places the search-param consumer below an accessible Suspense boundary', () => {
    const page = SubscribePage() as React.ReactElement<{
      fallback: React.ReactElement<{ role?: string; 'aria-live'?: string }>
    }>

    expect(page.type).toBe(React.Suspense)
    expect(page.props.fallback.props.role).toBe('status')
    expect(page.props.fallback.props['aria-live']).toBe('polite')
    expect(useSearchParamsMock).not.toHaveBeenCalled()
  })
})
