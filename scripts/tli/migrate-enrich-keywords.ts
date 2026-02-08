import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from './supabase-admin'
import { enrichThemeKeywords } from './theme-keywords'

/** 배치 upsert 헬퍼 */
async function upsertBatch(
  rows: Array<{ theme_id: string; keyword: string; source: string; is_primary: boolean; weight: number }>,
  batchSize = 500
) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabaseAdmin
      .from('theme_keywords')
      .upsert(batch, { onConflict: 'theme_id,keyword,source' })

    if (error) {
      throw new Error(`배치 upsert 실패: ${error.message}`)
    }
  }
}

/** 메인 마이그레이션 로직 */
export async function migrateEnrichKeywords() {
  console.log('━'.repeat(80))
  console.log('🔄 테마 키워드 마이그레이션 시작')
  console.log('━'.repeat(80))

  // 1) 모든 활성 테마 조회
  const { data: themes, error } = await supabaseAdmin
    .from('themes')
    .select('id, name')
    .eq('is_active', true)

  if (error) {
    throw new Error(`테마 조회 실패: ${error.message}`)
  }

  if (!themes || themes.length === 0) {
    console.log('\n⊘ 활성 테마 없음 - 마이그레이션 종료')
    return
  }

  console.log(`\n📊 ${themes.length}개 활성 테마 발견`)

  // 2) 각 테마에 대해 키워드 생성
  const allKeywordRows: Array<{
    theme_id: string
    keyword: string
    source: string
    is_primary: boolean
    weight: number
  }> = []

  for (const theme of themes) {
    const keywords = enrichThemeKeywords(theme.name)

    for (const k of keywords) {
      allKeywordRows.push({
        theme_id: theme.id,
        keyword: k.keyword,
        source: k.source,
        is_primary: k.isPrimary,
        weight: k.isPrimary ? 1.0 : 0.8,
      })
    }

    console.log(`   ✓ ${theme.name}: ${keywords.length}개 키워드 생성`)
  }

  // 3) 배치 upsert
  console.log(`\n💾 ${allKeywordRows.length}개 키워드 저장 중...`)
  await upsertBatch(allKeywordRows)

  console.log('\n━'.repeat(80))
  console.log(`✨ 마이그레이션 완료 (${themes.length}개 테마, ${allKeywordRows.length}개 키워드)`)
  console.log('━'.repeat(80))
}

// 직접 실행 시
const isDirectRun = process.argv[1]?.includes('migrate-enrich-keywords')
if (isDirectRun) {
  migrateEnrichKeywords()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error('❌ 치명적 오류:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
