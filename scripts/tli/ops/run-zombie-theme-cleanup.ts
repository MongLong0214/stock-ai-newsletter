import { config } from 'dotenv'
config({ path: '.env.local' })

import { cleanupScorelessZombieThemes } from '@/scripts/tli/themes/theme-lifecycle'

const apply = process.env.TLI_ZOMBIE_CLEANUP_APPLY === 'true'

cleanupScorelessZombieThemes({ dryRun: !apply })
  .then((result) => {
    console.log(JSON.stringify({
      dryRun: result.dryRun,
      candidates: result.candidates.length,
      mutations: result.mutations,
      themeIds: result.candidates.map((candidate) => candidate.id),
    }, null, 2))
  })
  .catch((error: unknown) => {
    console.error('점수 없는 활성 테마 cleanup 실패:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
