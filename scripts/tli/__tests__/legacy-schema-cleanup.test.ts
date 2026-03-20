import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('legacy comparison maintenance cleanup', () => {
  it('removes maintenance scripts that still depend on retired legacy prediction tables', () => {
    expect(existsSync(join(process.cwd(), 'scripts/tli/validate-stage-persistence.ts'))).toBe(false)
    expect(existsSync(join(process.cwd(), 'scripts/tli/validate-horizon-fix.ts'))).toBe(false)
  })
})
