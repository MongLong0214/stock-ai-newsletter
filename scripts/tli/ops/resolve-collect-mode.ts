import { appendFileSync } from 'node:fs'

/**
 * TLI 수집 실행 모드 resolver.
 *
 * wall-clock(`date -u +%H`)은 runner 큐 지연으로 cron 시각과 어긋나 모드를 오분류한다.
 * `github.event.schedule`은 실행이 지연돼도 트리거된 cron 문자열 그대로이므로 이것만 사용한다.
 */
export const TLI_COLLECT_MODES = ['full', 'news-only'] as const

export type TliCollectMode = typeof TLI_COLLECT_MODES[number]

/** `.github/workflows/tli-collect-data.yml`의 `on.schedule` cron과 정확히 일치해야 한다. */
export const TLI_COLLECT_SCHEDULE_MODES: Readonly<Record<string, TliCollectMode>> = {
  '30 7 * * 1-5': 'full',
  '0 0 * * 1-6': 'news-only',
  '0 17 * * 6': 'full',
  '30 9 * * 1': 'news-only',
}

export const TLI_COLLECT_DISPATCH_DEFAULT_MODE: TliCollectMode = 'full'

const isTliCollectMode = (value: string): value is TliCollectMode => (
  (TLI_COLLECT_MODES as readonly string[]).includes(value)
)

export interface ResolveTliCollectModeInput {
  readonly eventName: string
  readonly schedule?: string | null
  readonly dispatchMode?: string | null
}

export function resolveTliCollectMode(input: ResolveTliCollectModeInput): TliCollectMode {
  if (input.eventName === 'schedule') {
    const schedule = input.schedule?.trim() ?? ''
    if (schedule === '') throw new Error('schedule event is missing github.event.schedule')
    const mode = TLI_COLLECT_SCHEDULE_MODES[schedule]
    if (mode === undefined) {
      const known = Object.keys(TLI_COLLECT_SCHEDULE_MODES).map((cron) => `'${cron}'`).join(', ')
      throw new Error(`unknown schedule cron '${schedule}'; add it to TLI_COLLECT_SCHEDULE_MODES (known: ${known})`)
    }
    return mode
  }

  if (input.eventName === 'workflow_dispatch') {
    const dispatchMode = input.dispatchMode?.trim() ?? ''
    if (dispatchMode === '') return TLI_COLLECT_DISPATCH_DEFAULT_MODE
    if (!isTliCollectMode(dispatchMode)) {
      throw new Error(`unknown dispatch mode '${dispatchMode}'; expected one of ${TLI_COLLECT_MODES.join(', ')}`)
    }
    return dispatchMode
  }

  throw new Error(`unsupported event '${input.eventName}'; expected schedule or workflow_dispatch`)
}

const isDirectRun = process.argv[1]?.includes('resolve-collect-mode') ?? false

if (isDirectRun) {
  try {
    const mode = resolveTliCollectMode({
      eventName: process.env.GITHUB_EVENT_NAME ?? '',
      schedule: process.env.TLI_COLLECT_SCHEDULE ?? null,
      dispatchMode: process.env.TLI_COLLECT_DISPATCH_MODE ?? null,
    })
    const outputPath = process.env.GITHUB_OUTPUT
    if (outputPath) appendFileSync(outputPath, `mode=${mode}\n`)
    console.log(mode)
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
