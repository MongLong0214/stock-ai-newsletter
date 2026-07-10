import { describe, expect, it } from 'vitest'

import {
  M1_SCIENTIFIC_TRAINING_SCRIPT,
  M1_TRAINING_SCRIPT,
  PINNED_PYTHON_EXECUTABLE_ENV,
  resolvePinnedPythonScriptInvocation,
} from '../m1-runtime'

describe('pinned Python process invocation', () => {
  it('keeps uv frozen as the default production launcher', () => {
    const invocation = resolvePinnedPythonScriptInvocation({
      script: M1_TRAINING_SCRIPT,
      scriptArgs: ['input.json', 'artifact.json'],
      baseEnv: { NODE_ENV: 'test' },
    })

    expect(invocation.command).toBe('uv')
    expect(invocation.args).toEqual([
      'run', '--frozen', '--python', '3.13.11', '--script', M1_TRAINING_SCRIPT,
      'input.json', 'artifact.json',
    ])
  })

  it('launches the scientific PIT adapter with the same frozen default', () => {
    const invocation = resolvePinnedPythonScriptInvocation({
      script: M1_SCIENTIFIC_TRAINING_SCRIPT,
      scriptArgs: ['training.json', 'sidecar.json', 'artifact.json', 'receipt.json'],
      baseEnv: { NODE_ENV: 'test' },
    })

    expect(invocation.command).toBe('uv')
    expect(invocation.args).toEqual([
      'run', '--frozen', '--python', '3.13.11', '--script', M1_SCIENTIFIC_TRAINING_SCRIPT,
      'training.json', 'sidecar.json', 'artifact.json', 'receipt.json',
    ])
  })

  it('can bypass only uv cache resolution while retaining runtime enforcement', () => {
    const invocation = resolvePinnedPythonScriptInvocation({
      script: M1_TRAINING_SCRIPT,
      scriptArgs: ['input.json', 'artifact.json'],
      baseEnv: {
        NODE_ENV: 'test',
        [PINNED_PYTHON_EXECUTABLE_ENV]: '/cache/pinned/bin/python',
        UV: '/usr/local/bin/uv',
      },
    })

    expect(invocation.command).toBe('/cache/pinned/bin/python')
    expect(invocation.args).toEqual([M1_TRAINING_SCRIPT, 'input.json', 'artifact.json'])
    expect(invocation.env).toMatchObject({
      UV: '/usr/local/bin/uv', PYTHONHASHSEED: '0', OMP_NUM_THREADS: '1',
      OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1',
    })
  })
})
