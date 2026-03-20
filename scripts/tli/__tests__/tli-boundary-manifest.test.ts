import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TLI_BOUNDARY_MANIFEST } from '../tli-boundary-manifest'

function listFilesRecursively(root: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === '__tests__') continue
      results.push(...listFilesRecursively(full))
    } else {
      results.push(relative(process.cwd(), full))
    }
  }
  return results.sort()
}

describe('tli boundary manifest', () => {
  it('classifies every non-test file in the unified scripts/tli tree', () => {
    const files = [
      ...listFilesRecursively(join(process.cwd(), 'scripts/tli')),
    ].sort()

    expect(Object.keys(TLI_BOUNDARY_MANIFEST).sort()).toEqual(files)
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
