import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { collectNaverThemeList, type DiscoveredTheme } from '@/scripts/tli/collectors/naver-finance-theme-list'
import { populateKeywords } from '@/scripts/tli/themes/theme-keywords'
import { autoActivate, autoDeactivate, computeNextNaverSeenStreak } from '@/scripts/tli/themes/theme-lifecycle'
import { getKSTDate } from '@/scripts/tli/shared/utils'
import { buildOngoingStateChangeRow } from '@/scripts/tli/themes/theme-state-history'
import { buildDiscoveredThemeInsert, buildInitialStateHistoryInput } from '@/scripts/tli/themes/first-spike-date'

// ─────────────────────────────────────────────────────
// 1. 테마 발견: 네이버 금융 목록 → DB 비교 → 신규 삽입
// ─────────────────────────────────────────────────────

async function discoverNewThemes(discovered: DiscoveredTheme[]) {
  console.log('\n🆕 1단계: 신규 테마 발견 및 등록')

  // 기존 테마를 naverThemeId로 조회
  const { data: existingThemes, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, naver_theme_id, is_active, last_seen_on_naver, naver_seen_streak')

  if (error) throw new Error(`기존 테마 조회 실패: ${error.message}`)

  const existingByNaverId = new Map<string, typeof existingThemes[0]>()
  const existingByName = new Map<string, typeof existingThemes[0]>()
  for (const t of existingThemes || []) {
    if (t.naver_theme_id) existingByNaverId.set(t.naver_theme_id, t)
    existingByName.set(t.name, t)
  }

  const today = getKSTDate()
  let newCount = 0
  let updatedCount = 0
  const newThemeIds: Array<{ id: string; name: string; naverThemeId: string }> = []

  // Batch collect updates and inserts
  const existingUpdates: Array<{ id: string; last_seen_on_naver: string; naver_theme_id: string; naver_seen_streak: number }> = []
  const newInserts: Array<Record<string, unknown>> = []

  for (const theme of discovered) {
    const existingById = existingByNaverId.get(theme.naverThemeId)
    const existingByN = existingByName.get(theme.name)
    const existing = existingById || existingByN

    if (existing) {
      existingUpdates.push({
        id: existing.id,
        last_seen_on_naver: today,
        naver_theme_id: theme.naverThemeId,
        naver_seen_streak: computeNextNaverSeenStreak({
          previousStreak: existing.naver_seen_streak,
          previousSeenDate: existing.last_seen_on_naver,
          currentSeenDate: today,
        }),
      })
    } else {
      newInserts.push(buildDiscoveredThemeInsert({
        name: theme.name,
        naverThemeId: theme.naverThemeId,
        today,
        discoveredAt: new Date().toISOString(),
      }))
    }
  }

  // Batch update existing themes
  if (existingUpdates.length > 0) {
    for (let i = 0; i < existingUpdates.length; i += 500) {
      const batch = existingUpdates.slice(i, i + 500)
      // Use individual updates since upsert requires all columns
      for (const upd of batch) {
        await supabaseAdmin
          .from('themes')
          .update({
            last_seen_on_naver: upd.last_seen_on_naver,
            naver_theme_id: upd.naver_theme_id,
            naver_seen_streak: upd.naver_seen_streak,
          })
          .eq('id', upd.id)
      }
    }
    updatedCount = existingUpdates.length
  }

  // Batch insert new themes
  if (newInserts.length > 0) {
    for (let i = 0; i < newInserts.length; i += 500) {
      const batch = newInserts.slice(i, i + 500)
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('themes')
        .upsert(batch, { onConflict: 'name' })
        .select('id, name, naver_theme_id')

      if (insertError) {
        console.error(`   ⚠️ 배치 삽입 실패:`, insertError.message)
        continue
      }

      for (const t of inserted || []) {
        newThemeIds.push({ id: t.id, name: t.name, naverThemeId: t.naver_theme_id })

        // 신규 테마 state history 기록 (is_active: false로 생성됨)
        try {
          const stateRow = buildOngoingStateChangeRow(buildInitialStateHistoryInput({
            themeId: t.id,
            changeDate: today,
          }))
          await supabaseAdmin.from('theme_state_history_v2').insert(stateRow)
        } catch (stateErr: unknown) {
          console.error(`   ⚠️ state history 기록 실패 (계속): ${stateErr instanceof Error ? stateErr.message : String(stateErr)}`)
        }

        console.log(`   ✓ 신규 테마: ${t.name}`)
      }
    }
    newCount = newInserts.length
  }

  console.log(`\n   📊 결과: 신규 ${newCount}개 / 갱신 ${updatedCount}개`)
  return newThemeIds
}

// ─────────────────────────────────────────────────────
// 메인 오케스트레이터
// ─────────────────────────────────────────────────────

export async function discoverAndManageThemes() {
  console.log('🔍 테마 발견 파이프라인 시작\n')
  const startTime = Date.now()

  // 1) 네이버 금융 테마 목록 스크래핑
  const discovered = await collectNaverThemeList()

  // 2) 신규 테마 등록
  const newThemes = await discoverNewThemes(discovered)

  // 3) 신규 테마 키워드 자동 생성
  await populateKeywords(newThemes)

  // 4) 자동 활성화
  await autoActivate()

  // 5) 자동 비활성화
  await autoDeactivate()

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(`\n✨ 테마 발견 파이프라인 완료 (${duration}초)`)
}

// 직접 실행 시
const isDirectRun = process.argv[1]?.includes('discover-themes')
if (isDirectRun) {
  discoverAndManageThemes()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error('❌ 치명적 오류:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
