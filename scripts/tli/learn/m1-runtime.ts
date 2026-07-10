import { spawnSync, type SpawnSyncReturns } from 'node:child_process'

/**
 * master plan "첫 confirmatory 모델 계약": M1 과학 실행은 frozen script lockfile,
 * CPython 3.13.11, 고정 hash seed, BLAS single-thread에서만 허용된다.
 * 모든 train_m1.py 호출부는 이 모듈을 통해서만 프로세스를 띄운다.
 */
export const M1_TRAINING_SCRIPT = 'scripts/tli/learn/train_m1.py'
export const M1_SCIENTIFIC_TRAINING_SCRIPT = 'scripts/tli/learn/train_m1_scientific.py'
export const M1_PYTHON_VERSION = '3.13.11'

export const M1_DETERMINISM_ENV = {
  MKL_NUM_THREADS: '1',
  OMP_NUM_THREADS: '1',
  OPENBLAS_NUM_THREADS: '1',
  PYTHONHASHSEED: '0',
} as const

export const M1_TRAINING_COMMAND = 'uv'
export const PINNED_PYTHON_EXECUTABLE_ENV = 'TLI_PINNED_PYTHON_EXECUTABLE'

export const m1TrainingArgs = (scriptArgs: readonly string[]): readonly string[] => [
  'run',
  '--frozen',
  '--python',
  M1_PYTHON_VERSION,
  '--script',
  M1_TRAINING_SCRIPT,
  ...scriptArgs,
]

export const m1TrainingEnv = (
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => ({ ...base, ...M1_DETERMINISM_ENV })

export const resolvePinnedPythonScriptInvocation = (input: {
  readonly script: string
  readonly scriptArgs: readonly string[]
  readonly baseEnv?: NodeJS.ProcessEnv
}): {
  readonly command: string
  readonly args: readonly string[]
  readonly env: NodeJS.ProcessEnv
} => {
  const baseEnv = input.baseEnv ?? process.env
  const pinnedPython = baseEnv[PINNED_PYTHON_EXECUTABLE_ENV]
  return pinnedPython === undefined || pinnedPython.length === 0
    ? {
        command: M1_TRAINING_COMMAND,
        args: [
          'run', '--frozen', '--python', M1_PYTHON_VERSION, '--script', input.script,
          ...input.scriptArgs,
        ],
        env: m1TrainingEnv(baseEnv),
      }
    : {
        command: pinnedPython,
        args: [input.script, ...input.scriptArgs],
        env: m1TrainingEnv(baseEnv),
      }
}

/** train_m1.py는 runtime 계약 위반 시 학습 전에 exit 2로 중단한다. */
export const spawnM1Training = (scriptArgs: readonly string[]): SpawnSyncReturns<string> => {
  const invocation = resolvePinnedPythonScriptInvocation({ script: M1_TRAINING_SCRIPT, scriptArgs })
  return spawnSync(
    invocation.command,
    [...invocation.args],
    { cwd: process.cwd(), encoding: 'utf8', env: invocation.env },
  )
}

/** 과학 학습 adapter도 동일한 frozen Python/runtime 계약으로만 실행한다. */
export const spawnM1ScientificTraining = (scriptArgs: readonly string[]): SpawnSyncReturns<string> => {
  const invocation = resolvePinnedPythonScriptInvocation({
    script: M1_SCIENTIFIC_TRAINING_SCRIPT,
    scriptArgs,
  })
  return spawnSync(
    invocation.command,
    [...invocation.args],
    { cwd: process.cwd(), encoding: 'utf8', env: invocation.env },
  )
}
