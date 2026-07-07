import { mkdtemp, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { FEATURE_NAMES } from '@/lib/tli/features/build-features'
import { loadM1ArtifactFromJsonFile, parseM1ModelArtifact, predictM1T1Probability } from '@/lib/tli/model/predict'
import type { M1ModelArtifact } from '@/lib/tli/model/m1'

const GOLDEN_VECTOR_FIXTURE_PATH = join(__dirname, 'fixtures', 'm1-golden-vector.json')

const makeGoldenArtifact = (): M1ModelArtifact => {
  const featureWeights = FEATURE_NAMES.map((_, index) => {
    if (index === 0) return 0.5
    if (index === 1) return -0.25
    return 0
  })
  const missingWeights = FEATURE_NAMES.map(() => 0)

  return {
    artifact_version: 'tli-model-artifact-v1',
    model_type: 'm1_logistic',
    feature_schema: FEATURE_NAMES,
    scaler: {
      median: FEATURE_NAMES.map(() => 0),
      mad: FEATURE_NAMES.map(() => 1),
    },
    coefficients: {
      intercept: -0.3,
      weights: [...featureWeights, ...missingWeights],
    },
    calibrator: {
      type: 'platt',
      a: -1.1,
      b: 0.2,
    },
    trained_at: '2026-08-02',
    train_range: ['2026-01-07', '2026-07-05'],
    labeler_version: 'gta-v1',
    seed: 42,
    sample_report: {},
  }
}

// C1: 실제 Python(scikit-learn) 산출물 대조. 픽스처가 없으면(로컬에 uv/네트워크가 없는 환경) 스킵된다.
// 재생성: `npm run tli:m1:golden-vector` (scripts/tli/learn/train_m1.py --golden-vector 모드,
// 고정 시드 42 합성 데이터로 학습 후 고정 입력 벡터의 기대 확률을 함께 기록한다).
describe.skipIf(!existsSync(GOLDEN_VECTOR_FIXTURE_PATH))('C1 M1 prediction runtime vs real Python artifact', () => {
  it('matches the actual Python-trained artifact within 1e-9', () => {
    const fixture = JSON.parse(readFileSync(GOLDEN_VECTOR_FIXTURE_PATH, 'utf8')) as {
      readonly artifact: M1ModelArtifact
      readonly inputRow: { readonly values: readonly number[]; readonly missingFlags: readonly boolean[] }
      readonly expectedProbability: number
    }
    const artifact = parseM1ModelArtifact(fixture.artifact)

    const probability = predictM1T1Probability({ artifact, row: fixture.inputRow })

    expect(probability).not.toBeNull()
    expect(probability).toBeCloseTo(fixture.expectedProbability, 9)
  })
})

// 아래는 TS로 손수 구성한 아티팩트를 사용하는 보조 테스트 — 위 픽스처가 없는 환경에서도 항상 실행된다.
describe('T-207 M1 prediction runtime (handcrafted artifact, always runs)', () => {
  it('matches the Python sklearn Platt golden vector within 1e-6', () => {
    const probability = predictM1T1Probability({
      artifact: makeGoldenArtifact(),
      row: {
        values: [
          1.4826,
          -2.9652,
          ...FEATURE_NAMES.slice(2).map(() => 0),
        ],
        missingFlags: FEATURE_NAMES.map(() => false),
      },
    })

    expect(probability).not.toBeNull()
    expect(probability).toBeCloseTo(0.6387631751488418, 10)
  })

  it('parses artifact JSON at the boundary before inference', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tli-m1-artifact-'))
    const path = join(dir, 'artifact.json')
    await writeFile(path, JSON.stringify(makeGoldenArtifact()), 'utf8')

    const artifact = await loadM1ArtifactFromJsonFile(path)

    expect(artifact.feature_schema).toEqual(FEATURE_NAMES)
    expect(predictM1T1Probability({
      artifact,
      row: {
        values: FEATURE_NAMES.map(() => 0),
        missingFlags: FEATURE_NAMES.map(() => false),
      },
    })).toBeGreaterThan(0)
  })

  it('rejects malformed artifact identities', () => {
    expect(() => parseM1ModelArtifact({
      ...makeGoldenArtifact(),
      artifact_version: 'wrong-version',
    })).toThrow(/artifact/i)
  })
})
