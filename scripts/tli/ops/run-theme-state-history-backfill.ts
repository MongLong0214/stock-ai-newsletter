import { config } from 'dotenv'
config({ path: '.env.local' })

import { backfillThemeStateHistory } from '@/scripts/tli/themes/theme-state-history-backfill'

export { backfillThemeStateHistory }

async function main() {
  await backfillThemeStateHistory()
}

const isDirectRun = process.argv[1]?.includes('run-theme-state-history-backfill')
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
