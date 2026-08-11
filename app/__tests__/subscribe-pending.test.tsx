import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { trackEventMock, useStateMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  useStateMock: vi.fn(),
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, default: actual, useState: useStateMock }
})
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}))
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_target, tag) => tag }),
}))
vi.mock('@/components/animated-background', () => ({ default: () => null }))
vi.mock('@/hooks/use-countdown-to-tomorrow', () => ({
  useCountdownToTomorrow: () => ({ formatted: '내일' }),
}))
vi.mock('disposable-email-domains-js', () => ({ isDisposableEmail: () => false }))
vi.mock('@/lib/analytics/ga', () => ({ trackEvent: trackEventMock }))

import SubscribePage from '@/app/subscribe/page'

let states: unknown[]
let stateCursor: number

function renderSubscribeForm(): React.ReactElement {
  stateCursor = 0
  const page = SubscribePage() as React.ReactElement<{ children: React.ReactElement }>
  const subscribeContent = page.props.children
  const subscribeForm = (subscribeContent.type as () => React.ReactElement)()
  return (subscribeForm.type as () => React.ReactElement)()
}

function findElement(
  node: unknown,
  predicate: (element: React.ReactElement<Record<string, unknown>>) => boolean
): React.ReactElement<Record<string, unknown>> | undefined {
  if (!React.isValidElement<Record<string, unknown>>(node)) return undefined
  if (predicate(node)) return node

  return React.Children.toArray(node.props.children as React.ReactNode)
    .map((child) => findElement(child, predicate))
    .find(Boolean)
}

function textContent(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!React.isValidElement<Record<string, unknown>>(node)) return ''
  return React.Children.toArray(node.props.children as React.ReactNode).map(textContent).join('')
}

beforeEach(() => {
  states = []
  stateCursor = 0
  useStateMock.mockImplementation((initialState: unknown) => {
    const index = stateCursor++
    if (!(index in states)) states[index] = initialState
    return [states[index], (nextState: unknown) => { states[index] = nextState }]
  })
  trackEventMock.mockReset()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'pending' }), { status: 200 })
    )
  )
})

describe('subscribe form double opt-in', () => {
  it('shows a confirmation-email instruction, not a completed-subscription message, for a pending response', async () => {
    const initialTree = renderSubscribeForm()
    const emailInput = findElement(initialTree, (element) => element.props.id === 'email')
    const onEmailChange = emailInput?.props.onChange
    if (typeof onEmailChange !== 'function') throw new Error('Email input not found')
    onEmailChange({ target: { value: 'reader@example.com' } })

    const submittedTree = renderSubscribeForm()
    const form = findElement(submittedTree, (element) => element.type === 'form')
    const onSubmit = form?.props.onSubmit
    if (typeof onSubmit !== 'function') throw new Error('Subscription form not found')
    await onSubmit({ preventDefault: vi.fn() })

    const resultTree = renderSubscribeForm()
    const message = textContent(resultTree)

    expect(message).toContain('확인 이메일을 보냈습니다.')
    expect(message).toContain('확인 링크를 눌러 구독을 확인해주세요.')
    expect(message).not.toContain('구독이 완료되었습니다!')
    expect(trackEventMock).toHaveBeenCalledWith('generate_lead', expect.objectContaining({
      lead_type: 'pending_confirmation',
    }))
  })
})
