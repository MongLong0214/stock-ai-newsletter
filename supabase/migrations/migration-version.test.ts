import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATION_DIR = resolve(process.cwd(), 'supabase', 'migrations')
const VERSIONED_MIGRATION = /^(\d+[a-z]?)_.+\.sql$/i

describe('Supabase migration file ordering', () => {
  it('uses unique version prefixes and preserves the 056 hardening sequence', async () => {
    const files = (await readdir(MIGRATION_DIR)).filter((file) => file.endsWith('.sql'))
    const versions = files.flatMap((file) => {
      const match = VERSIONED_MIGRATION.exec(file)
      return match ? [{ file, version: match[1].toLowerCase() }] : []
    })
    const counts = new Map<string, number>()

    for (const { version } of versions) {
      counts.set(version, (counts.get(version) ?? 0) + 1)
    }

    const duplicates = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([version]) => version)
      .sort()

    expect(duplicates).toEqual([])

    const ordered = files.sort((left, right) => left.localeCompare(right, 'en'))
    const dropIndexes = ordered.indexOf('056_drop_unused_indexes.sql')
    const lockdown = ordered.indexOf('056b_lockdown_stock_price_cache_writes.sql')
    const rateLimit = ordered.indexOf('057_rate_limit_and_double_optin.sql')

    expect(dropIndexes).toBeGreaterThanOrEqual(0)
    expect(lockdown).toBeGreaterThan(dropIndexes)
    expect(rateLimit).toBeGreaterThan(lockdown)
  })
})
