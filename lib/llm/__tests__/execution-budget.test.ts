import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  LlmExecutionBudget,
  LlmExecutionBudgetError,
} from '@/lib/llm/execution-budget'

const createBudget = (overrides: Partial<ConstructorParameters<typeof LlmExecutionBudget>[0]> = {}) =>
  new LlmExecutionBudget({
    deadlineMs: 1_000,
    maxCalls: 2,
    maxReservedOutputTokens: 20,
    ...overrides,
  })

afterEach(() => {
  vi.useRealTimers()
})

describe('LlmExecutionBudget', () => {
  it('enforces one shared call ceiling across sequential stages', async () => {
    const budget = createBudget({ maxCalls: 1 })
    await expect(budget.runCall({
      label: 'stage-1', timeoutMs: 100, reservedOutputTokens: 5,
      operation: async () => 'ok',
    })).resolves.toBe('ok')

    await expect(budget.runCall({
      label: 'stage-2', timeoutMs: 100, reservedOutputTokens: 5,
      operation: async () => 'unexpected',
    })).rejects.toMatchObject({ reason: 'call_limit' })
  })

  it('reserves worst-case output tokens before dispatching a call', async () => {
    const budget = createBudget({ maxReservedOutputTokens: 5 })
    await expect(budget.runCall({
      label: 'too-expensive', timeoutMs: 100, reservedOutputTokens: 6,
      operation: async () => 'unexpected',
    })).rejects.toMatchObject({ reason: 'output_token_limit' })
    expect(budget.callsUsed).toBe(0)
  })

  it('rejects before dispatch after the global deadline', () => {
    let now = 100
    const budget = createBudget({ deadlineMs: 10, now: () => now })
    now = 111

    expect(() => budget.assertAvailable()).toThrowError(LlmExecutionBudgetError)
    expect(() => budget.assertAvailable()).toThrow(/global deadline exhausted/)
  })

  it('aborts an in-flight operation at the per-call timeout', async () => {
    vi.useFakeTimers()
    const budget = createBudget({ deadlineMs: 1_000 })
    const promise = budget.runCall({
      label: 'slow-call',
      timeoutMs: 25,
      reservedOutputTokens: 5,
      operation: (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('sdk aborted')), { once: true })
      }),
    })

    const rejection = expect(promise).rejects.toMatchObject({ reason: 'call_timeout' })
    await vi.advanceTimersByTimeAsync(25)
    await rejection
  })

  it('propagates external abort and aborts the in-flight SDK signal', async () => {
    const controller = new AbortController()
    const budget = createBudget({ signal: controller.signal })
    let sdkSignalAborted = false
    const promise = budget.runCall({
      label: 'external-abort',
      timeoutMs: 500,
      reservedOutputTokens: 5,
      operation: (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          sdkSignalAborted = true
          reject(new Error('sdk aborted'))
        }, { once: true })
      }),
    })

    controller.abort()
    await expect(promise).rejects.toMatchObject({ reason: 'aborted' })
    expect(sdkSignalAborted).toBe(true)
  })
})
