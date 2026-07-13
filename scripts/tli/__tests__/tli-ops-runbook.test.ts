import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const runbookPath = join(process.cwd(), 'docs/tli-ops-runbook.md')

let runbook = ''

beforeAll(() => {
  runbook = readFileSync(runbookPath, 'utf8')
})

describe('TLI scientific migration forward-recovery runbook', () => {
  it('covers every committed migration from 045 through 052', () => {
    expect(runbook).toContain('## Migrations 045–052 Forward Recovery')
    for (const migration of ['045', '046', '047', '048', '049', '050', '051', '052']) {
      expect(runbook).toMatch(new RegExp(`\\| ${migration} \\|`))
    }
  })

  it('requires preserved evidence and forbids destructive down migration recovery', () => {
    for (const fragment of [
      'Never run a down migration',
      'schema-only',
      'data-only',
      'application Git SHA',
      'pg_get_functiondef',
      'pg_get_triggerdef',
      'role_table_grants',
    ]) {
      expect(runbook).toContain(fragment)
    }
  })

  it('defines application rollback compatibility, forward-fix, and verification gates', () => {
    for (const fragment of [
      'Application rollback decision',
      'Forward-fix procedure',
      '045 deterministic state recovery',
      '048/049 identity collision check',
      '050–052 function, trigger, and ACL verification',
      'Stop conditions',
    ]) {
      expect(runbook).toContain(fragment)
    }
    expect(runbook).toContain('theme_id, base_date, horizon_days, label_type')
    expect(runbook).not.toContain('theme_id, base_date, horizon_days, method')
  })
})
