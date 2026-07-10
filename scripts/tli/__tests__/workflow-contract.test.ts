import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TLI_COLLECT_SCHEDULE_MODES,
  resolveTliCollectMode,
} from '../ops/resolve-collect-mode'

interface WorkflowStep {
  readonly name?: string
  readonly id?: string
  readonly if?: string
  readonly run?: string
  readonly uses?: string
  readonly env?: Record<string, string>
  readonly 'continue-on-error'?: boolean
}

interface Workflow {
  readonly on: { readonly schedule?: readonly { readonly cron: string }[] }
  readonly jobs: Record<string, { readonly env?: Record<string, string>; readonly steps: readonly WorkflowStep[] }>
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

  it.each([
    ['30 7 * * 1-5', 'full'],
    ['0 0 * * 1-6', 'news-only'],
    ['0 17 * * 6', 'full'],
    ['30 9 * * 1', 'news-only'],
  ])('maps schedule %s to %s', (schedule, expected) => {
    expect(resolveTliCollectMode({ eventName: 'schedule', schedule })).toBe(expected)
  })

  it.each([
    ['full', 'full'],
    ['news-only', 'news-only'],
  ])('maps dispatch input %s to %s', (dispatchMode, expected) => {
    expect(resolveTliCollectMode({ eventName: 'workflow_dispatch', dispatchMode })).toBe(expected)
  })

  it('defaults an empty dispatch input to full', () => {
    expect(resolveTliCollectMode({ eventName: 'workflow_dispatch', dispatchMode: '' })).toBe('full')
  })

  // 기존 wall-clock 버그 재현: 00:00 cron이 60분 지연돼 01:xx UTC에 시작하면 `date -u +%H`는 full을 낸다.
  it('keeps news-only when the 00:00 cron starts 60 minutes late', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T01:03:27.000Z'))

    const wallClockHour = new Date().toISOString().slice(11, 13)
    expect(wallClockHour).not.toBe('00')

    expect(resolveTliCollectMode({ eventName: 'schedule', schedule: '0 0 * * 1-6' })).toBe('news-only')
  })

  it('keeps full when the 07:30 cron starts 60 minutes late', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T08:30:00.000Z'))

    expect(resolveTliCollectMode({ eventName: 'schedule', schedule: '30 7 * * 1-5' })).toBe('full')
  })

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
  it('declares exactly the cron strings the resolver maps', () => {
    const crons = (collectWorkflow.on.schedule ?? []).map((entry) => entry.cron)
    expect([...crons].sort()).toEqual(Object.keys(TLI_COLLECT_SCHEDULE_MODES).sort())
  })

  it('resolves the run mode from github.event.schedule instead of wall-clock', () => {
    const step = stepByName(collectSteps, 'Determine run mode')
    expect(step.id).toBe('mode')
    expect(step.run).toContain('scripts/tli/ops/resolve-collect-mode.ts')
    expect(step.env?.TLI_COLLECT_SCHEDULE).toBe('${{ github.event.schedule }}')
    expect(step.env?.TLI_COLLECT_DISPATCH_MODE).toBe('${{ github.event.inputs.mode }}')
    expect(step.run).not.toMatch(/date -u/)
  })

  it('never hides scientific gate failures behind continue-on-error', () => {
    expect(collectSteps.filter((step) => step['continue-on-error'] === true)).toEqual([])
  })

  it('uploads parity and watchlist results as artifacts', () => {
    const step = stepByName(collectSteps, 'Upload scientific gate artifacts')
    expect(step.uses).toMatch(/^actions\/upload-artifact@/)
    expect(step.if).toContain('always()')
  })

  it('fails the workflow only on the critical contract exit code', () => {
    const step = stepByName(collectSteps, 'Scientific gate result')
    expect(step.if).toContain('always()')
    expect(step.env?.PARITY_STATUS).toBe('${{ steps.parity.outputs.status }}')
    expect(step.env?.WATCHLIST_STATUS).toBe('${{ steps.watchlist.outputs.status }}')
    expect(step.run).toContain('3) echo "::error::')
    expect(step.run).toContain('*) echo "::warning::')
  })

  it('exposes both gate exit codes as step outputs', () => {
    expect(stepByName(collectSteps, 'Prediction parity report').run).toContain('echo "status=${status}" >> "$GITHUB_OUTPUT"')
    expect(stepByName(collectSteps, 'TLI watchlist canary').run).toContain('echo "status=${status}" >> "$GITHUB_OUTPUT"')
  })
})

describe('tli-weekly-learn.yml contract', () => {
  const steps = weeklyLearnJob.steps

  it('pins uv 0.9.25 and CPython 3.13.11 instead of setup-python + pip', () => {
    expect(weeklyLearnJob.env?.UV_VERSION).toBe('0.9.25')
    expect(weeklyLearnJob.env?.PYTHON_VERSION).toBe('3.13.11')
    expect(steps.some((step) => step.uses?.startsWith('actions/setup-python'))).toBe(false)
    expect(steps.some((step) => step.run?.includes('pip install'))).toBe(false)

    expect(stepByName(steps, 'Setup pinned uv').run).toContain('https://astral.sh/uv/${UV_VERSION}/install.sh')
    const verify = stepByName(steps, 'Verify pinned uv and CPython')
    expect(verify.run).toContain('uv python install "${PYTHON_VERSION}"')
    expect(verify.run).toContain('exit 1')
  })

  it('runs training with the deterministic hash seed and BLAS single-thread env', () => {
    const step = stepByName(steps, 'train-new-challenger')
    expect(step.env?.PYTHONHASHSEED).toBe('0')
    expect(step.env?.OMP_NUM_THREADS).toBe('1')
    expect(step.env?.OPENBLAS_NUM_THREADS).toBe('1')
    expect(step.env?.MKL_NUM_THREADS).toBe('1')
    expect(step.env?.TLI_TRAINING_CODE_GIT_SHA).toBe('${{ github.sha }}')
  })

  it('skips training on a not-due checkpoint and on an extend gate result', () => {
    const step = stepByName(steps, 'train-new-challenger')
    expect(step.if).toContain("steps.checkpoint-check.outputs.checkpoint_due == 'true'")
    expect(step.if).toContain("steps.evaluate-challenger.outputs.gate_action != 'extend_to_next_checkpoint'")
    expect(step.if).not.toContain('workflow_dispatch')
  })

  it('publishes the gate action needed to gate training', () => {
    const step = stepByName(steps, 'evaluate-challenger')
    expect(step.id).toBe('evaluate-challenger')
    expect(step.run).toContain('gate_action=')
  })

  it('surfaces a frozen registry as an explicit disabled result, not a success', () => {
    const step = stepByName(steps, 'registration status')
    expect(step.run).toContain('registration_disabled')
    expect(step.run).toContain('::warning::')
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
