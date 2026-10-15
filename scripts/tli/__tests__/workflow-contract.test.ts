import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TLI_COLLECT_SCHEDULE_MODES,
  resolveTliCollectDispatch,
  resolveTliCollectMode,
} from '../ops/resolve-collect-mode'

interface WorkflowStep {
  readonly name?: string
  readonly id?: string
  readonly if?: string
  readonly run?: string
  readonly uses?: string
  readonly env?: Record<string, string>
  readonly with?: Record<string, unknown>
  readonly 'continue-on-error'?: boolean
}

interface Workflow {
  readonly on: {
    readonly schedule?: readonly { readonly cron: string }[]
    readonly workflow_dispatch?: { readonly inputs: Record<string, Record<string, unknown>> }
  }
  readonly jobs: Record<string, {
    readonly env?: Record<string, string>
    readonly permissions?: Record<string, string>
    readonly steps: readonly WorkflowStep[]
  }>
}

const readWorkflow = (file: string): Workflow => load(readFileSync(`.github/workflows/${file}`, 'utf8')) as Workflow

const collectWorkflow = readWorkflow('tli-collect-data.yml')
const weeklyLearnWorkflow = readWorkflow('tli-weekly-learn.yml')

const collectSteps = collectWorkflow.jobs['collect-and-score'].steps
const weeklyLearnJob = weeklyLearnWorkflow.jobs['weekly-learn']

const stepByName = (steps: readonly WorkflowStep[], name: string): WorkflowStep => {
  const step = steps.find((candidate) => candidate.name === name)
  if (!step) throw new Error(`workflow step '${name}' not found`)
  return step
}

const trainScript = readFileSync('scripts/tli/learn/train_m1.py', 'utf8')

/** PEP 723 인라인 메타데이터 블록 (`# /// script` ~ 닫는 `# ///`). */
const pep723Header = (() => {
  const start = trainScript.indexOf('# /// script')
  const end = trainScript.indexOf('# ///', start + '# /// script'.length)
  if (start < 0 || end < 0) throw new Error('train_m1.py PEP 723 header not found')
  return trainScript.slice(start, end)
})()

describe('resolveTliCollectMode', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps the remaining Sunday schedule to full', () => {
    expect(resolveTliCollectMode({ eventName: 'schedule', schedule: '0 17 * * 6' })).toBe('full')
  })

  it.each([
    ['full', 'full'],
    ['news-only', 'news-only'],
    ['datalab-only', 'datalab-only'],
  ])('maps dispatch input %s to %s', (dispatchMode, expected) => {
    expect(resolveTliCollectMode({ eventName: 'workflow_dispatch', dispatchMode })).toBe(expected)
  })

  it('defaults an empty dispatch input to full', () => {
    expect(resolveTliCollectMode({ eventName: 'workflow_dispatch', dispatchMode: '' })).toBe('full')
  })

  it('parses dispatch refresh, intended date, and run key', () => {
    expect(resolveTliCollectDispatch({
      eventName: 'workflow_dispatch',
      dispatchMode: 'datalab-only',
      dispatchDatalabRefresh: 'force',
      dispatchIntendedKstDate: '2026-09-02',
      dispatchRunKey: 'datalab-0900:2026-09-02',
      runnerKstDate: '2026-09-02',
    })).toEqual({
      mode: 'datalab-only',
      datalabRefresh: 'force',
      intendedKstDate: '2026-09-02',
      runKey: 'datalab-0900:2026-09-02',
      skipReason: null,
    })
  })

  it('defaults an empty dispatch refresh to reuse', () => {
    expect(resolveTliCollectDispatch({
      eventName: 'workflow_dispatch',
      dispatchMode: '',
      dispatchDatalabRefresh: '',
      dispatchIntendedKstDate: '',
      runnerKstDate: '2026-09-02',
    })).toEqual({
      mode: 'full',
      datalabRefresh: 'reuse',
      intendedKstDate: null,
      runKey: null,
      skipReason: null,
    })
  })

  it('marks a delayed dispatch on a different KST date as a quiet skip', () => {
    expect(resolveTliCollectDispatch({
      eventName: 'workflow_dispatch',
      dispatchMode: 'datalab-only',
      dispatchIntendedKstDate: '2026-09-01',
      runnerKstDate: '2026-09-02',
    })).toEqual({
      mode: 'datalab-only',
      datalabRefresh: 'reuse',
      intendedKstDate: '2026-09-01',
      runKey: null,
      skipReason: 'stale_dispatch',
    })
  })

  it('rejects an invalid intended KST date and refresh value', () => {
    expect(() => resolveTliCollectDispatch({
      eventName: 'workflow_dispatch',
      dispatchIntendedKstDate: '2026-02-30',
      runnerKstDate: '2026-09-02',
    })).toThrow(/invalid intended KST date/)
    expect(() => resolveTliCollectDispatch({
      eventName: 'workflow_dispatch',
      dispatchDatalabRefresh: 'maybe',
      runnerKstDate: '2026-09-02',
    })).toThrow(/unknown datalab refresh/)
  })

  // 기존 wall-clock 버그 회귀 방지: Sunday full cron이 60분 지연돼도 실제 시각 대신 schedule 문자열을 사용한다.
  it('keeps full when the Sunday cron starts 60 minutes late', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T18:03:27.000Z'))

    const wallClockHour = new Date().toISOString().slice(11, 13)
    expect(wallClockHour).not.toBe('17')

    expect(resolveTliCollectMode({ eventName: 'schedule', schedule: '0 17 * * 6' })).toBe('full')
  })

  it.each(['0 0 * * 1-6', '30 9 * * 1'])(
    'rejects the removed weekday schedule %s',
    (schedule) => {
      expect(() => resolveTliCollectMode({ eventName: 'schedule', schedule }))
        .toThrow(/unknown schedule cron/)
    },
  )

  it('rejects an unmapped schedule cron', () => {
    expect(() => resolveTliCollectMode({ eventName: 'schedule', schedule: '0 5 * * *' }))
      .toThrow(/unknown schedule cron/)
  })

  it('rejects a schedule event without a cron string', () => {
    expect(() => resolveTliCollectMode({ eventName: 'schedule', schedule: '' }))
      .toThrow(/missing github.event.schedule/)
  })

  it('rejects an unknown dispatch mode', () => {
    expect(() => resolveTliCollectMode({ eventName: 'workflow_dispatch', dispatchMode: 'partial' }))
      .toThrow(/unknown dispatch mode/)
  })

  it('rejects an unsupported event', () => {
    expect(() => resolveTliCollectMode({ eventName: 'push' })).toThrow(/unsupported event/)
  })

  it('never reads the wall clock', () => {
    const code = readFileSync('scripts/tli/ops/resolve-collect-mode.ts', 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n')
    expect(code).not.toMatch(/\bnew Date\b|\bDate\.now\b|date -u/)
  })
})

describe('tli-collect-data.yml contract', () => {
  it('keeps only the Sunday GitHub schedule and matches the resolver map', () => {
    const crons = (collectWorkflow.on.schedule ?? []).map((entry) => entry.cron)
    expect(crons).toEqual(['0 17 * * 6'])
    expect(crons).toEqual(Object.keys(TLI_COLLECT_SCHEDULE_MODES))
  })

  it('has no weekday GitHub schedule', () => {
    for (const { cron } of collectWorkflow.on.schedule ?? []) {
      const fields = cron.trim().split(/\s+/)
      expect(fields).toHaveLength(5)
      expect(fields[4]).toBe('6')
    }
  })

  it('maps every TLI Vercel Cron to an existing route, mode, and run key', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      crons: readonly { path: string; schedule: string }[]
    }
    const contracts = [
      { path: '/api/cron/tli-datalab', schedule: '0 0 * * 1-6', mode: 'datalab-only', runKeyPrefix: 'datalab-0900' },
      { path: '/api/cron/tli-news', schedule: '0 0 * * 1-6', mode: 'news-only', runKeyPrefix: 'news-0900' },
      { path: '/api/cron/tli-full', schedule: '30 7 * * 1-5', mode: 'full', runKeyPrefix: 'full-1630' },
      { path: '/api/cron/tli-full/backup', schedule: '0 10 * * 1-5', mode: 'full', runKeyPrefix: 'full-1900' },
      { path: '/api/cron/tli-news/monday-origin', schedule: '30 9 * * 1', mode: 'news-only', runKeyPrefix: 'origin-1830' },
    ] as const
    const tliCrons = vercel.crons.filter(({ path }) => path.startsWith('/api/cron/tli-'))

    expect(tliCrons).toEqual(contracts.map(({ path, schedule }) => ({ path, schedule })))
    for (const { path, mode, runKeyPrefix } of contracts) {
      const route = readFileSync(`app${path}/route.ts`, 'utf8')
      expect(route).toContain(`mode: '${mode}'`)
      expect(route).toContain(`runKeyPrefix: '${runKeyPrefix}'`)
    }
  })

  it('resolves the run mode from github.event.schedule instead of wall-clock', () => {
    const step = stepByName(collectSteps, 'Determine run mode')
    expect(step.id).toBe('mode')
    expect(step.run).toContain('scripts/tli/ops/resolve-collect-mode.ts')
    expect(step.env?.TLI_COLLECT_SCHEDULE).toBe('${{ github.event.schedule }}')
    expect(step.env?.TLI_COLLECT_DISPATCH_MODE).toBe('${{ github.event.inputs.mode }}')
    expect(step.env?.TLI_COLLECT_DISPATCH_DATALAB_REFRESH).toBe('${{ github.event.inputs.datalab_refresh }}')
    expect(step.env?.TLI_COLLECT_DISPATCH_INTENDED_KST_DATE).toBe('${{ github.event.inputs.intended_kst_date }}')
    expect(step.env?.TLI_COLLECT_DISPATCH_RUN_KEY).toBe('${{ github.event.inputs.run_key }}')
    expect(step.run).not.toMatch(/date -u/)

    const resolver = readFileSync('scripts/tli/ops/resolve-collect-mode.ts', 'utf8')
    expect(resolver).toContain("appendFileSync(outputPath, `skip_reason=${result.skipReason ?? ''}\\n`)")
    expect(resolver).toContain('::warning::stale DataLab dispatch skipped')
  })

  it('declares datalab-only dispatch controls and wires force refresh to collection', () => {
    const inputs = collectWorkflow.on.workflow_dispatch?.inputs
    expect(inputs?.mode?.options).toEqual(['full', 'news-only', 'datalab-only'])
    expect(inputs?.datalab_refresh?.options).toEqual(['reuse', 'force'])
    expect(inputs?.datalab_refresh?.default).toBe('reuse')
    expect(inputs).toHaveProperty('intended_kst_date')
    expect(inputs).toHaveProperty('run_key')

    const collection = stepByName(collectSteps, 'Run TLI Data Collection & Scoring')
    expect(collection.if).toBe("steps.mode.outputs.skip_reason == ''")
    expect(collection.env?.TLI_DATALAB_FORCE_REFRESH)
      .toBe("${{ steps.mode.outputs.datalab_refresh == 'force' && 'true' || 'false' }}")
    expect(collection.env?.TLI_DATALAB_DAILY_CEILING)
      .toBe('${{ vars.TLI_DATALAB_DAILY_CEILING }}')
  })

  it('never hides scientific gate failures behind continue-on-error', () => {
    expect(collectSteps.filter((step) => step['continue-on-error'] === true)).toEqual([])
  })

  it('uploads parity and watchlist results as artifacts', () => {
    const step = stepByName(collectSteps, 'Upload scientific gate artifacts')
    expect(step.uses).toMatch(/^actions\/upload-artifact@/)
    expect(step.if).toContain('always()')
    expect(step.if).toContain("steps.mode.outputs.skip_reason == ''")
  })

  it('fails the workflow only on the critical contract exit code', () => {
    const step = stepByName(collectSteps, 'Scientific gate result')
    expect(step.if).toContain('always()')
    expect(step.if).toContain("steps.mode.outputs.skip_reason == ''")
    expect(step.env?.PARITY_STATUS).toBe('${{ steps.parity.outputs.status }}')
    expect(step.env?.WATCHLIST_STATUS).toBe('${{ steps.watchlist.outputs.status }}')
    expect(step.run).toContain('3) echo "::error::')
    expect(step.run).toContain('*) echo "::warning::')
  })

  it('exposes both gate exit codes as step outputs', () => {
    const parity = stepByName(collectSteps, 'Prediction parity report')
    const watchlist = stepByName(collectSteps, 'TLI watchlist canary')
    expect(parity.if).toContain("steps.mode.outputs.skip_reason == ''")
    expect(watchlist.if).toContain("steps.mode.outputs.skip_reason == ''")
    expect(parity.run).toContain('echo "status=${status}" >> "$GITHUB_OUTPUT"')
    expect(watchlist.run).toContain('echo "status=${status}" >> "$GITHUB_OUTPUT"')
  })
})

describe('tli-weekly-learn.yml contract', () => {
  const steps = weeklyLearnJob.steps

  it('keeps the scheduled job read-only and inspects lifecycle state without evaluating a gate', () => {
    expect(weeklyLearnJob.permissions).toEqual({ contents: 'read' })
    const inspect = stepByName(steps, 'Inspect prospective lifecycle')
    expect(inspect.if).toContain("github.event_name == 'schedule'")
    expect(inspect.run).toContain('tli:weekly-learn -- inspect')
    expect(inspect.run).not.toContain('render-decision')
    expect(inspect.run).not.toContain('record-decision')
  })

  it('removes legacy repeated evaluation, promotion, rollback, extension, and retraining paths', () => {
    const workflowText = readFileSync('.github/workflows/tli-weekly-learn.yml', 'utf8')
    expect(workflowText).not.toMatch(
      /checkpoint-check|evaluate-challenger|promote-or-keep|train-new-challenger|rollback-check|extend_to_next_checkpoint/,
    )
  })

  it('records only a committed artifact from explicit dispatch with no verdict override', () => {
    const record = stepByName(steps, 'Record committed prospective decision')
    expect(record.if).toBe("github.event_name == 'workflow_dispatch' && inputs.operation == 'record-decision'")
    expect(record.run).toContain('--kind="${TLI_DECISION_KIND}"')
    expect(record.run).toContain('--cycle-id="${TLI_CYCLE_ID}"')
    expect(record.run).toContain('--evidence-commit="${TLI_EVIDENCE_COMMIT_SHA}"')
    expect(record.run).toContain('--dry-run="${TLI_DRY_RUN}"')
    expect(record.run).not.toMatch(/--pass|--decision=/)
    expect(record.env?.TLI_M1_PROMOTION_ENABLED).toBe('${{ vars.TLI_M1_PROMOTION_ENABLED }}')
  })

  it('declares the exact inspect and committed-record dispatch surface', () => {
    const inputs = weeklyLearnWorkflow.on.workflow_dispatch?.inputs
    expect(inputs?.operation?.options).toEqual(['inspect', 'record-decision'])
    expect(inputs?.decision_kind?.options).toEqual(['safety', 'final'])
    expect(inputs).toHaveProperty('cycle_id')
    expect(inputs).toHaveProperty('evidence_commit_sha')
  })

  it('fetches committed Git history and uploads the machine-readable result', () => {
    expect(stepByName(steps, 'Checkout code').with?.['fetch-depth']).toBe(0)
    const upload = stepByName(steps, 'Upload prospective gate result')
    expect(upload.if).toBe('always()')
    expect(upload.uses).toMatch(/^actions\/upload-artifact@/)
  })
})

describe('train_m1.py runtime contract', () => {
  it('pins every PEP 723 direct dependency to an exact version', () => {
    expect(pep723Header).toContain('requires-python = ">=3.13.11,<3.14"')
    expect(pep723Header).toContain('"numpy==2.5.1"')
    expect(pep723Header).toContain('"pydantic==2.13.4"')
    expect(pep723Header).toContain('"scikit-learn==1.9.0"')
    expect(pep723Header).toContain('"typer==0.26.8"')
    expect(pep723Header).not.toMatch(/"(numpy|pydantic|scikit-learn|typer)",/)
  })

  it('ships a committed script lockfile so --frozen resolves offline', () => {
    const lock = readFileSync('scripts/tli/learn/train_m1.py.lock', 'utf8')
    expect(lock).toContain('requires-python = ">=3.13.11, <3.14"')
    expect(lock).toContain('name = "numpy"')
    expect(lock).toContain('name = "scikit-learn"')
  })

  it('enforces the runtime contract before training starts', () => {
    expect(trainScript).toContain('enforce_runtime_contract()')
    expect(trainScript.indexOf('enforce_runtime_contract()')).toBeLessThan(trainScript.indexOf('run_training(input_path'))
  })
})
