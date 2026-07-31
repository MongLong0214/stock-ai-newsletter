export type LlmBudgetFailureReason = 'deadline' | 'call_limit' | 'output_token_limit' | 'call_timeout' | 'aborted'

export class LlmExecutionBudgetError extends Error {
  readonly name = 'LlmExecutionBudgetError'

  constructor(
    readonly reason: LlmBudgetFailureReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

export interface LlmExecutionBudgetOptions {
  readonly deadlineMs: number
  readonly maxCalls: number
  readonly maxReservedOutputTokens: number
  readonly signal?: AbortSignal
  readonly now?: () => number
}

export interface RunBudgetedCallOptions<T> {
  readonly label: string
  readonly timeoutMs: number
  readonly reservedOutputTokens: number
  readonly operation: (signal: AbortSignal) => Promise<T>
}

/** Run-scoped LLM budget. One instance must be shared across all stages and retries. */
export class LlmExecutionBudget {
  readonly startedAt: number
  readonly deadlineAt: number
  private readonly now: () => number
  private readonly parentSignal?: AbortSignal
  private usedCalls = 0
  private reservedOutputTokens = 0

  constructor(private readonly options: LlmExecutionBudgetOptions) {
    if (options.deadlineMs <= 0 || options.maxCalls <= 0 || options.maxReservedOutputTokens <= 0) {
      throw new Error('LLM execution budget limits must be positive')
    }
    this.now = options.now ?? Date.now
    this.parentSignal = options.signal
    this.startedAt = this.now()
    this.deadlineAt = this.startedAt + options.deadlineMs
  }

  get callsUsed(): number {
    return this.usedCalls
  }

  get outputTokensReserved(): number {
    return this.reservedOutputTokens
  }

  remainingMs(): number {
    return Math.max(0, this.deadlineAt - this.now())
  }

  assertAvailable(): void {
    if (this.parentSignal?.aborted) {
      throw new LlmExecutionBudgetError('aborted', 'LLM generation was externally aborted')
    }
    if (this.remainingMs() <= 0) {
      throw new LlmExecutionBudgetError('deadline', 'LLM generation global deadline exhausted')
    }
  }

  async runCall<T>(input: RunBudgetedCallOptions<T>): Promise<T> {
    this.assertAvailable()
    if (this.usedCalls >= this.options.maxCalls) {
      throw new LlmExecutionBudgetError(
        'call_limit',
        `LLM call budget exhausted before ${input.label} (${this.usedCalls}/${this.options.maxCalls})`,
      )
    }
    if (this.reservedOutputTokens + input.reservedOutputTokens > this.options.maxReservedOutputTokens) {
      throw new LlmExecutionBudgetError(
        'output_token_limit',
        `LLM output-token budget exhausted before ${input.label}`,
      )
    }

    this.usedCalls++
    this.reservedOutputTokens += input.reservedOutputTokens
    const controller = new AbortController()
    const onParentAbort = () => controller.abort(this.parentSignal?.reason)
    this.parentSignal?.addEventListener('abort', onParentAbort, { once: true })

    const remaining = this.remainingMs()
    const timeoutMs = Math.min(input.timeoutMs, remaining)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const deadlineExpired = this.remainingMs() <= 0
        reject(new LlmExecutionBudgetError(
          deadlineExpired ? 'deadline' : 'call_timeout',
          deadlineExpired
            ? `LLM generation global deadline exhausted during ${input.label}`
            : `LLM call timed out after ${timeoutMs}ms: ${input.label}`,
        ))
        controller.abort()
      }, timeoutMs)
    })

    try {
      return await Promise.race([input.operation(controller.signal), timeout])
    } catch (error: unknown) {
      if (this.parentSignal?.aborted) {
        throw new LlmExecutionBudgetError('aborted', `LLM generation aborted during ${input.label}`, {
          cause: error,
        })
      }
      throw error
    } finally {
      if (timer) clearTimeout(timer)
      this.parentSignal?.removeEventListener('abort', onParentAbort)
    }
  }

  async sleep(ms: number): Promise<void> {
    this.assertAvailable()
    if (ms <= 0) return
    if (ms >= this.remainingMs()) {
      throw new LlmExecutionBudgetError('deadline', 'LLM generation deadline cannot accommodate retry delay')
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.parentSignal?.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      const onAbort = () => {
        clearTimeout(timer)
        reject(new LlmExecutionBudgetError('aborted', 'LLM generation aborted during delay'))
      }
      this.parentSignal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}
