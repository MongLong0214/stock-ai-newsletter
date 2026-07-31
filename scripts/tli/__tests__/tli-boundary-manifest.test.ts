import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TLI_BOUNDARY_MANIFEST } from '../tli-boundary-manifest'

const IGNORED_DIRECTORIES = new Set(['__tests__', '__pycache__'])

/**
 * 매니페스트가 분류하는 대상은 저장소에 커밋된 파일이다.
 *
 * 디스크를 직접 훑으면 gitignore된 optimizer 산출물(historical-data.json 등)이 로컬에만
 * 나타나 CI는 통과하고 로컬만 깨진다. git ls-files는 추적 파일만 돌려주므로 실행 환경과
 * 무관하게 같은 목록을 준다.
 */
function listTrackedFiles(root: string): string[] {
  return execFileSync('git', ['ls-files', '-z', '--', root], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((path) => !path.split('/').some((segment) => IGNORED_DIRECTORIES.has(segment)))
    .sort()
}

describe('tli boundary manifest', () => {
  it('classifies every non-test file in the unified scripts/tli tree', () => {
    expect(Object.keys(TLI_BOUNDARY_MANIFEST).sort()).toEqual(listTrackedFiles('scripts/tli'))
  })

  it('uses only approved boundary categories', () => {
    const allowed = new Set(['runtime', 'ops', 'research', 'docs', 'artifact'])
    for (const value of Object.values(TLI_BOUNDARY_MANIFEST)) {
      expect(allowed.has(value)).toBe(true)
    }
  })

  it('keeps non-optimizer research files under scripts/tli/research/', () => {
    const researchFiles = Object.entries(TLI_BOUNDARY_MANIFEST)
      .filter(([, category]) => category === 'research')
      .map(([path]) => path)
      .filter((path) => !path.startsWith('scripts/tli/research/optimizer/'))

    for (const path of researchFiles) {
      expect(path.startsWith('scripts/tli/research/')).toBe(true)
    }
  })

  it('keeps runtime imports out of ops and research layers', () => {
    const violations: string[] = []
    const runtimeFiles = Object.entries(TLI_BOUNDARY_MANIFEST)
      .filter(([path, category]) => category === 'runtime' && path.endsWith('.ts'))
      .map(([path]) => path)

    for (const importer of runtimeFiles) {
      const source = readFileSync(resolve(process.cwd(), importer), 'utf8')
      const imports = source.matchAll(
        /\bfrom\s+['"]([^'"]+)['"]|(?:\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g,
      )
      for (const match of imports) {
        const specifier = match[1] ?? match[2]
        let targetBase: string | null = null
        if (specifier.startsWith('@/')) {
          targetBase = specifier.slice(2)
        } else if (specifier.startsWith('.')) {
          targetBase = relative(
            process.cwd(),
            resolve(process.cwd(), dirname(importer), specifier),
          )
        }
        if (targetBase === null) continue

        const target = [targetBase, `${targetBase}.ts`, `${targetBase}/index.ts`]
          .find((candidate) => candidate in TLI_BOUNDARY_MANIFEST)
        if (!target) continue
        const targetCategory = TLI_BOUNDARY_MANIFEST[target]
        if (targetCategory === 'ops' || targetCategory === 'research') {
          violations.push(`${importer} -> ${target} (${targetCategory})`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('does not keep any archive_candidate files once cleanup is complete', () => {
    const archiveCandidates = Object.entries(TLI_BOUNDARY_MANIFEST)
      .filter(([, category]) => category === 'archive_candidate')

    expect(archiveCandidates).toEqual([])
  })

  it('keeps optimizer research files under scripts/tli/research/optimizer/', () => {
    const optimizerFiles = Object.keys(TLI_BOUNDARY_MANIFEST)
      .filter((path) => path.includes('optimizer'))

    for (const path of optimizerFiles) {
      expect(path.startsWith('scripts/tli/research/optimizer/')).toBe(true)
    }
  })
})
