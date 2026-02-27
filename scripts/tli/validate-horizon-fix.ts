/**
 * Gate 2: 평가 함수 horizon 오염 수정 검증
 *
 * 기존 evaluated 스냅샷에 대해:
 * - (A) 기존 방식: 최신 stage 기준 phase_correct
 * - (B) 수정 방식: snapshot_date + 14일 기준 stage로 phase_correct 재산정
 *
 * 실행: npx tsx scripts/tli/validate-horizon-fix.ts
 */
import { supabaseAdmin } from './supabase-admin'

const EVALUATION_WINDOW = 14

const PHASE_TO_STAGES: Record<string, string[]> = {
  'pre-peak': ['Emerging', 'Growth'],
  'near-peak': ['Growth'],
  'at-peak': ['Peak', 'Growth'],
  'post-peak': ['Decline', 'Peak'],
  declining: ['Decline', 'Dormant'],
}

async function main() {
  console.log('🔬 Gate 2: 평가 함수 horizon 오염 검증\n')

  // 1. evaluated 스냅샷 로딩
  const { data: snapshots, error: snapErr } = await supabaseAdmin
    .from('prediction_snapshots')
    .select('id, theme_id, snapshot_date, phase, actual_stage, phase_correct')
    .eq('status', 'evaluated')
    .order('snapshot_date', { ascending: true })

  if (snapErr || !snapshots?.length) {
    console.error('스냅샷 로딩 실패:', snapErr?.message)
    return
  }

  // 2. 전체 lifecycle_scores 로딩
  const themeIds = [...new Set(snapshots.map((s) => s.theme_id))]
  const allScores: { theme_id: string; score: number; stage: string; calculated_at: string }[] = []
  let offset = 0
  const PAGE = 1000

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('lifecycle_scores')
      .select('theme_id, score, stage, calculated_at')
      .in('theme_id', themeIds)
      .order('calculated_at', { ascending: true })
      .range(offset, offset + PAGE - 1)

    if (error) throw new Error(`lifecycle_scores 로딩 실패: ${error.message}`)
    if (!data?.length) break
    allScores.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }

  console.log(`  스냅샷: ${snapshots.length}건, lifecycle_scores: ${allScores.length}건\n`)

  // 3. theme_id + date → score/stage 맵
  const scoreMap = new Map<string, { score: number; stage: string }>()
  for (const s of allScores) {
    scoreMap.set(`${s.theme_id}::${s.calculated_at}`, { score: s.score, stage: s.stage })
  }

  // theme_id → 날짜 리스트 (가장 가까운 날짜 찾기용)
  const datesByTheme = new Map<string, string[]>()
  for (const s of allScores) {
    const list = datesByTheme.get(s.theme_id) || []
    list.push(s.calculated_at)
    datesByTheme.set(s.theme_id, list)
  }

  // 4. 비교
  let total = 0
  let originalCorrect = 0
  let fixedCorrect = 0
  let matched = 0
  let unmatched = 0

  const perPhaseOriginal: Record<string, { total: number; correct: number }> = {}
  const perPhaseFixed: Record<string, { total: number; correct: number }> = {}

  for (const snap of snapshots) {
    if (!snap.actual_stage || !snap.phase) continue

    total++

    // (A) 기존 결과 (DB에 저장된 phase_correct)
    const origCorrect = snap.phase_correct === true
    if (origCorrect) originalCorrect++

    if (!perPhaseOriginal[snap.phase]) perPhaseOriginal[snap.phase] = { total: 0, correct: 0 }
    perPhaseOriginal[snap.phase].total++
    if (origCorrect) perPhaseOriginal[snap.phase].correct++

    // (B) 수정: snapshot_date + EVALUATION_WINDOW에 가장 가까운 stage
    const targetDate = new Date(snap.snapshot_date)
    targetDate.setDate(targetDate.getDate() + EVALUATION_WINDOW)
    const targetTime = targetDate.getTime()

    const dates = datesByTheme.get(snap.theme_id) || []
    let closestDate: string | null = null
    let closestDiff = Infinity

    for (const d of dates) {
      const diff = Math.abs(new Date(d).getTime() - targetTime)
      if (diff < closestDiff) {
        closestDiff = diff
        closestDate = d
      }
    }

    const MAX_TOLERANCE_MS = 3 * 86_400_000
    if (!closestDate || closestDiff > MAX_TOLERANCE_MS) {
      unmatched++
      continue
    }

    matched++
    const targetScore = scoreMap.get(`${snap.theme_id}::${closestDate}`)
    if (!targetScore) continue

    const expectedStages = PHASE_TO_STAGES[snap.phase] || []
    const fixCorrect = expectedStages.includes(targetScore.stage)
    if (fixCorrect) fixedCorrect++

    if (!perPhaseFixed[snap.phase]) perPhaseFixed[snap.phase] = { total: 0, correct: 0 }
    perPhaseFixed[snap.phase].total++
    if (fixCorrect) perPhaseFixed[snap.phase].correct++
  }

  // 5. 결과 출력
  console.log('═'.repeat(60))
  console.log('  Horizon 오염 수정 전/후 비교')
  console.log('═'.repeat(60))

  const origPct = ((originalCorrect / total) * 100).toFixed(1)
  const fixPct = matched > 0 ? ((fixedCorrect / matched) * 100).toFixed(1) : 'N/A'
  const delta = matched > 0 ? (fixedCorrect / matched - originalCorrect / total) * 100 : 0

  console.log(`\n  총 스냅샷: ${total}건`)
  console.log(`  타겟 날짜 매칭: ${matched}건 (${unmatched}건 3일 이내 데이터 없음)`)
  console.log(`\n  기존 (최신 stage):     ${originalCorrect}/${total} (${origPct}%)`)
  console.log(`  수정 (target date):    ${fixedCorrect}/${matched} (${fixPct}%)`)
  console.log(`  차이:                  ${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp`)

  // Phase별 비교
  console.log('\n  [Phase별 비교]')
  console.log('  Phase         | 기존         | 수정         | Delta')
  console.log('  ' + '-'.repeat(55))

  const allPhases = [...new Set([...Object.keys(perPhaseOriginal), ...Object.keys(perPhaseFixed)])]
  for (const phase of allPhases.sort()) {
    const orig = perPhaseOriginal[phase] || { total: 0, correct: 0 }
    const fix = perPhaseFixed[phase] || { total: 0, correct: 0 }
    const oPct = orig.total > 0 ? ((orig.correct / orig.total) * 100).toFixed(1) : 'N/A'
    const fPct = fix.total > 0 ? ((fix.correct / fix.total) * 100).toFixed(1) : 'N/A'
    const d =
      orig.total > 0 && fix.total > 0
        ? ((fix.correct / fix.total - orig.correct / orig.total) * 100).toFixed(1)
        : 'N/A'
    console.log(
      `  ${phase.padEnd(14)} | ${String(orig.correct).padStart(3)}/${String(orig.total).padStart(3)} (${oPct.padStart(5)}%) | ${String(fix.correct).padStart(3)}/${String(fix.total).padStart(3)} (${fPct.padStart(5)}%) | ${d}pp`,
    )
  }

  console.log(`\n  [판정]`)
  if (Math.abs(delta) < 2) {
    console.log(`  ✅ 오염 영향 미미 (${delta.toFixed(1)}pp) — 기존 47.2% 수치 신뢰 가능`)
  } else if (delta > 0) {
    console.log(`  ⚡ 수정 후 적중률 상승 (+${delta.toFixed(1)}pp) — 기존 수치가 보수적이었음`)
  } else {
    console.log(`  ⚠️  수정 후 적중률 하락 (${delta.toFixed(1)}pp) — 기존 수치가 부풀려져 있었음`)
  }
}

main().catch((err) => {
  console.error('실행 실패:', err)
  process.exit(1)
})
