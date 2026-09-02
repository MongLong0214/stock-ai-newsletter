import { appendFileSync } from 'node:fs'
import { getKSTDateString } from '@/lib/tli/date-utils'

/**
 * TLI 수집 실행 모드 resolver.
 *
 * wall-clock(`date -u +%H`)은 runner 큐 지연으로 cron 시각과 어긋나 모드를 오분류한다.
 * `github.event.schedule`은 실행이 지연돼도 트리거된 cron 문자열 그대로이므로 이것만 사용한다.
 */
export const TLI_COLLECT_MODES = ['full', 'news-only', 'datalab-only'] as const
export const TLI_DATALAB_REFRESH_MODES = ['reuse', 'force'] as const

export type TliCollectMode = typeof TLI_COLLECT_MODES[number]
export type TliDatalabRefreshMode = typeof TLI_DATALAB_REFRESH_MODES[number]

/** `.github/workflows/tli-collect-data.yml`의 `on.schedule` cron과 정확히 일치해야 한다. */
export const TLI_COLLECT_SCHEDULE_MODES: Readonly<Record<string, TliCollectMode>> = {
  '30 7 * * 1-5': 'full',
  '0 10 * * 1-5': 'full',
  '0 0 * * 1-6': 'news-only',
  '0 17 * * 6': 'full',
  '30 9 * * 1': 'news-only',
}

export const TLI_COLLECT_DISPATCH_DEFAULT_MODE: TliCollectMode = 'full'

const isTliCollectMode = (value: string): value is TliCollectMode => (
  (TLI_COLLECT_MODES as readonly string[]).includes(value)
)

const isTliDatalabRefreshMode = (value: string): value is TliDatalabRefreshMode => (
  (TLI_DATALAB_REFRESH_MODES as readonly string[]).includes(value)
)

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const isValidIsoDate = (value: string): boolean => {
  if (!ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]
}

export interface ResolveTliCollectModeInput {
  readonly eventName: string
  readonly schedule?: string | null
  readonly dispatchMode?: string | null
}

export interface ResolveTliCollectDispatchInput extends ResolveTliCollectModeInput {
  readonly dispatchDatalabRefresh?: string | null
  readonly dispatchIntendedKstDate?: string | null
  readonly dispatchRunKey?: string | null
  readonly runnerKstDate: string
}

export interface ResolvedTliCollectDispatch {
  readonly mode: TliCollectMode
  readonly datalabRefresh: TliDatalabRefreshMode
  readonly intendedKstDate: string | null
  readonly runKey: string | null
  readonly skipReason: 'stale_dispatch' | null
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

export function resolveTliCollectDispatch(
  input: ResolveTliCollectDispatchInput,
): ResolvedTliCollectDispatch {
  const mode = resolveTliCollectMode(input)
  if (input.eventName !== 'workflow_dispatch') {
    return {
      mode,
      datalabRefresh: 'reuse',
      intendedKstDate: null,
      runKey: null,
      skipReason: null,
    }
  }

  const refreshInput = input.dispatchDatalabRefresh?.trim() ?? ''
  const datalabRefresh = refreshInput === '' ? 'reuse' : refreshInput
  if (!isTliDatalabRefreshMode(datalabRefresh)) {
    throw new Error(
      `unknown datalab refresh '${datalabRefresh}'; expected one of ${TLI_DATALAB_REFRESH_MODES.join(', ')}`,
    )
  }

  const intendedKstDate = input.dispatchIntendedKstDate?.trim() || null
  if (intendedKstDate !== null) {
    if (!isValidIsoDate(intendedKstDate)) {
      throw new Error(`invalid intended KST date '${intendedKstDate}'; expected YYYY-MM-DD`)
    }
  }

  return {
    mode,
    datalabRefresh,
    intendedKstDate,
    runKey: input.dispatchRunKey?.trim() || null,
    skipReason: intendedKstDate !== null && intendedKstDate !== input.runnerKstDate
      ? 'stale_dispatch'
      : null,
  }
}

const isDirectRun = process.argv[1]?.includes('resolve-collect-mode') ?? false

if (isDirectRun) {
  try {
    const runnerKstDate = getKSTDateString()
    const result = resolveTliCollectDispatch({
      eventName: process.env.GITHUB_EVENT_NAME ?? '',
      schedule: process.env.TLI_COLLECT_SCHEDULE ?? null,
      dispatchMode: process.env.TLI_COLLECT_DISPATCH_MODE ?? null,
      dispatchDatalabRefresh: process.env.TLI_COLLECT_DISPATCH_DATALAB_REFRESH ?? null,
      dispatchIntendedKstDate: process.env.TLI_COLLECT_DISPATCH_INTENDED_KST_DATE ?? null,
      dispatchRunKey: process.env.TLI_COLLECT_DISPATCH_RUN_KEY ?? null,
      runnerKstDate,
    })
    const outputPath = process.env.GITHUB_OUTPUT
    if (outputPath) {
      appendFileSync(outputPath, `mode=${result.mode}\n`)
      appendFileSync(outputPath, `datalab_refresh=${result.datalabRefresh}\n`)
      appendFileSync(outputPath, `skip_reason=${result.skipReason ?? ''}\n`)
    }
    console.log(`mode=${result.mode}`)
    console.log(`datalab_refresh=${result.datalabRefresh}`)
    console.log(`skip_reason=${result.skipReason ?? ''}`)
    if (result.skipReason === 'stale_dispatch') {
      console.warn(
        `::warning::stale DataLab dispatch skipped: intended KST date ${result.intendedKstDate} does not match runner KST date ${runnerKstDate}`,
      )
    }
    if (result.runKey) console.log(`run_key=${result.runKey}`)
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
