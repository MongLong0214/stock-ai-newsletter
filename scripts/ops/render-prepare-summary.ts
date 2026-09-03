import { readFile } from 'node:fs/promises'

interface PrepareSummary {
  readonly targetDate: string
  readonly signalDate: string
  readonly verdict: string
  readonly confidence: number
  readonly picksSource: string
  readonly picks: readonly {
    readonly rank: number
    readonly ticker: string
    readonly name: string
    readonly close_price: number
    readonly score: number
  }[]
  readonly collection: {
    readonly attemptedCalls: number
    readonly successCount: number
    readonly failureCount: number
    readonly exactDateCoverageRate: number
    readonly retriedSymbols: readonly string[]
    readonly recoveredSymbols: readonly string[]
    readonly indexFailed: boolean
  }
  readonly durationsSec: Readonly<Record<string, number>>
  readonly warnings: readonly string[]
}

function text(value: unknown): string {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function asSummary(value: unknown): PrepareSummary | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<PrepareSummary>
  if (
    typeof candidate.targetDate !== 'string'
    || typeof candidate.signalDate !== 'string'
    || typeof candidate.verdict !== 'string'
    || typeof candidate.confidence !== 'number'
    || typeof candidate.picksSource !== 'string'
    || !Array.isArray(candidate.picks)
    || !candidate.collection
    || !candidate.durationsSec
    || !Array.isArray(candidate.warnings)
  ) return null
  return candidate as PrepareSummary
}

export function renderPrepareSummary(value: unknown): string {
  const summary = asSummary(value)
  if (!summary) return '## Newsletter preparation summary\n\nSummary JSON is invalid.\n'

  const lines = [
    '## Newsletter preparation summary',
    '',
    '| Target date | Signal date | Verdict | Confidence | Picks source |',
    '|---|---|---|---:|---|',
    `| ${text(summary.targetDate)} | ${text(summary.signalDate)} | ${text(summary.verdict)} | ${summary.confidence} | ${text(summary.picksSource)} |`,
    '',
    '### Picks',
    '',
    '| Rank | Ticker | Name | Close | Score |',
    '|---:|---|---|---:|---:|',
    ...summary.picks.map((pick) => (
      `| ${pick.rank} | ${text(pick.ticker)} | ${text(pick.name)} | ${pick.close_price} | ${pick.score} |`
    )),
    '',
    '### Collection',
    '',
    '| Attempted | Success | Failed | Exact-date coverage | Retried | Recovered | Index failed |',
    '|---:|---:|---:|---:|---:|---:|---|',
    `| ${summary.collection.attemptedCalls} | ${summary.collection.successCount} | ${summary.collection.failureCount} | ${summary.collection.exactDateCoverageRate} | ${summary.collection.retriedSymbols.length} | ${summary.collection.recoveredSymbols.length} | ${summary.collection.indexFailed} |`,
    '',
    '### Durations (seconds)',
    '',
    '| Stage | Seconds |',
    '|---|---:|',
    ...Object.entries(summary.durationsSec).map(([stage, seconds]) => (
      `| ${text(stage)} | ${seconds} |`
    )),
    '',
    '### Warnings',
    '',
    ...(summary.warnings.length > 0
      ? summary.warnings.map((warning) => `- ${text(warning)}`)
      : ['- None']),
    '',
  ]
  return lines.join('\n')
}

export async function renderPrepareSummaryFile(path: string): Promise<string> {
  try {
    const content = await readFile(path, 'utf8')
    return renderPrepareSummary(JSON.parse(content))
  } catch {
    return `## Newsletter preparation summary\n\nSummary JSON is missing: ${text(path)}\n`
  }
}

const isDirectRun = /render-prepare-summary\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const path = process.argv[2] || process.env.PREPARE_SUMMARY_PATH
  // tsx는 루트 package.json에 type=module이 없어 CJS로 변환하므로 top-level await를 쓸 수 없다.
  const render = path
    ? renderPrepareSummaryFile(path)
    : Promise.resolve('## Newsletter preparation summary\n\nSummary JSON path is missing.\n')
  void render.then((output) => { process.stdout.write(output) })
}
