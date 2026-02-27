/**
 * Phase 0 사전 검증 — Gate 1 + Gate 3
 *
 * Gate 1: 3일/5일/7일/14일 Stage 지속률 멀티 윈도우 실측
 * Gate 3: 3-Phase (Rising/Hot/Cooling) 시뮬레이션
 *
 * 실행: npx tsx scripts/tli/validate-stage-persistence.ts
 */
import { supabaseAdmin } from './supabase-admin'

interface LifecycleRow {
  theme_id: string
  score: number
  stage: string
  calculated_at: string
}

interface PredictionRow {
  id: string
  theme_id: string
  snapshot_date: string
  phase: string
  actual_stage: string | null
  phase_correct: boolean | null
}

const ALL_STAGES = ['Emerging', 'Growth', 'Peak', 'Decline', 'Dormant']

const STAGE_TO_3PHASE: Record<string, string> = {
  Emerging: 'Rising',
  Growth: 'Rising',
  Peak: 'Hot',
  Decline: 'Cooling',
  Dormant: 'Cooling',
}

const PHASE3_TO_STAGES: Record<string, string[]> = {
  Rising: ['Emerging', 'Growth'],
  Hot: ['Peak'],
  Cooling: ['Decline', 'Dormant'],
}

const PHASE5_TO_STAGES: Record<string, string[]> = {
  'pre-peak': ['Emerging', 'Growth'],
  'near-peak': ['Growth'],
  'at-peak': ['Peak', 'Growth'],
  'post-peak': ['Decline', 'Peak'],
  declining: ['Decline', 'Dormant'],
}

async function loadAllScores(): Promise<LifecycleRow[]> {
  const all: LifecycleRow[] = []
  let offset = 0
  const PAGE = 1000

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('lifecycle_scores')
      .select('theme_id, score, stage, calculated_at')
      .gte('calculated_at', '2026-01-01')
      .order('calculated_at', { ascending: true })
      .range(offset, offset + PAGE - 1)

    if (error) throw new Error(`lifecycle_scores 로딩 실패: ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

async function loadEvaluatedSnapshots(): Promise<PredictionRow[]> {
  const all: PredictionRow[] = []
  let offset = 0
  const PAGE = 1000

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('prediction_snapshots')
      .select('id, theme_id, snapshot_date, phase, actual_stage, phase_correct')
      .eq('status', 'evaluated')
      .range(offset, offset + PAGE - 1)

    if (error) throw new Error(`prediction_snapshots 로딩 실패: ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

// ─── Gate 1: 멀티 윈도우 Stage 지속률 ───
function gate1MultiWindow(scores: LifecycleRow[], scoreMap: Map<string, string>) {
  console.log('\n' + '═'.repeat(70))
  console.log('  GATE 1: 멀티 윈도우 Stage 지속률')
  console.log('═'.repeat(70))

  const windows = [3, 5, 7, 14]

  for (const days of windows) {
    console.log(`\n  ── ${days}일 윈도우 ──`)

    const stats: Record<string, { total: number; persisted: number }> = {}
    const transitions: Record<string, Record<string, number>> = {}

    for (const s of scores) {
      const tNDate = new Date(s.calculated_at)
      tNDate.setDate(tNDate.getDate() + days)
      const tNStr = tNDate.toISOString().slice(0, 10)

      const tNStage = scoreMap.get(`${s.theme_id}::${tNStr}`)
      if (!tNStage) continue

      if (!stats[s.stage]) stats[s.stage] = { total: 0, persisted: 0 }
      stats[s.stage].total++
      if (s.stage === tNStage) stats[s.stage].persisted++

      if (!transitions[s.stage]) transitions[s.stage] = {}
      transitions[s.stage][tNStage] = (transitions[s.stage][tNStage] || 0) + 1
    }

    // Stage별 지속률
    console.log('  Stage           | Total | Persisted | Rate')
    console.log('  ' + '-'.repeat(50))

    let grandTotal = 0
    let grandPersisted = 0

    for (const [stage, { total, persisted }] of Object.entries(stats).sort(
      (a, b) => b[1].total - a[1].total,
    )) {
      const pct = ((persisted / total) * 100).toFixed(1)
      console.log(
        `  ${stage.padEnd(16)} | ${String(total).padStart(5)} | ${String(persisted).padStart(9)} | ${pct}%`,
      )
      grandTotal += total
      grandPersisted += persisted
    }

    const overallPct = grandTotal > 0 ? ((grandPersisted / grandTotal) * 100).toFixed(1) : '0.0'
    console.log('  ' + '-'.repeat(50))
    console.log(
      `  ${'TOTAL'.padEnd(16)} | ${String(grandTotal).padStart(5)} | ${String(grandPersisted).padStart(9)} | ${overallPct}%`,
    )

    // 전이 행렬
    console.log(`\n  [전이 행렬] Stage(t) → Stage(t+${days})`)
    const header =
      '  ' + ''.padEnd(12) + ALL_STAGES.map((s) => s.slice(0, 7).padStart(8)).join('')
    console.log(header)

    for (const from of ALL_STAGES) {
      const row = transitions[from] || {}
      const total = Object.values(row).reduce((a, b) => a + b, 0)
      const cells = ALL_STAGES.map((to) => {
        const count = row[to] || 0
        const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0'
        return `${pct}%`.padStart(8)
      })
      console.log(`  ${from.padEnd(12)}${cells.join('')}`)
    }

    // 3-Phase 그룹 지속률
    const phase3Stats: Record<string, { total: number; persisted: number }> = {}
    for (const from of ALL_STAGES) {
      const row = transitions[from] || {}
      const fromPhase = STAGE_TO_3PHASE[from]
      if (!fromPhase) continue

      for (const [to, count] of Object.entries(row)) {
        const toPhase = STAGE_TO_3PHASE[to]
        if (!toPhase) continue

        if (!phase3Stats[fromPhase]) phase3Stats[fromPhase] = { total: 0, persisted: 0 }
        phase3Stats[fromPhase].total += count
        if (fromPhase === toPhase) phase3Stats[fromPhase].persisted += count
      }
    }

    console.log(`\n  [3-Phase 그룹 지속률] (${days}일)`)
    let p3Total = 0
    let p3Persisted = 0
    for (const [phase, { total, persisted }] of Object.entries(phase3Stats).sort(
      (a, b) => b[1].total - a[1].total,
    )) {
      const pct = ((persisted / total) * 100).toFixed(1)
      console.log(`  ${phase.padEnd(12)} ${String(total).padStart(5)} → ${pct}%`)
      p3Total += total
      p3Persisted += persisted
    }
    if (p3Total > 0) {
      console.log(
        `  ${'TOTAL'.padEnd(12)} ${String(p3Total).padStart(5)} → ${((p3Persisted / p3Total) * 100).toFixed(1)}%`,
      )
    }
  }

  // Gate 판정
  console.log('\n  ' + '─'.repeat(60))
  console.log('  [GATE 1 판정]')
  console.log('  7일 지속률 ≥ 40% → 시나리오 A (3-Phase + 7일)')
  console.log('  7일 지속률 35~40% → 시나리오 C (Binary)')
  console.log('  7일 지속률 < 35% → 시나리오 B (폐기→진단)')
}

// ─── Gate 3: 3-Phase 시뮬레이션 ───
function gate3ThreePhase(scores: LifecycleRow[], snapshots: PredictionRow[]) {
  console.log('\n' + '═'.repeat(70))
  console.log('  GATE 3: 3-Phase (Rising/Hot/Cooling) 시뮬레이션')
  console.log('═'.repeat(70))

  const stageMap = new Map<string, string>()
  for (const s of scores) {
    stageMap.set(`${s.theme_id}::${s.calculated_at}`, s.stage)
  }

  // 5-Phase 현재 결과 vs 3-Phase 시뮬레이션
  let total = 0
  let current5Correct = 0
  let threePhaseCorrect = 0

  const per3Phase: Record<string, { total: number; correct: number }> = {}

  for (const snap of snapshots) {
    if (!snap.actual_stage) continue

    const stageAtSnapshot = stageMap.get(`${snap.theme_id}::${snap.snapshot_date}`)
    if (!stageAtSnapshot) continue

    total++

    // 현재 5-Phase 결과
    if (snap.phase_correct === true) current5Correct++

    // 3-Phase 시뮬레이션: snapshot 시점의 stage → 3-Phase 예측
    const predicted3Phase = STAGE_TO_3PHASE[stageAtSnapshot]
    if (!predicted3Phase) continue

    const expected3Stages = PHASE3_TO_STAGES[predicted3Phase] || []
    const is3Correct = expected3Stages.includes(snap.actual_stage)
    if (is3Correct) threePhaseCorrect++

    if (!per3Phase[predicted3Phase]) per3Phase[predicted3Phase] = { total: 0, correct: 0 }
    per3Phase[predicted3Phase].total++
    if (is3Correct) per3Phase[predicted3Phase].correct++
  }

  const curr5Pct = ((current5Correct / total) * 100).toFixed(1)
  const three3Pct = ((threePhaseCorrect / total) * 100).toFixed(1)
  const delta = (threePhaseCorrect / total - current5Correct / total) * 100

  console.log(`\n  총 평가 건수: ${total}`)
  console.log(`\n  현재 5-Phase (14일): ${current5Correct}/${total} (${curr5Pct}%)`)
  console.log(`  3-Phase (14일):      ${threePhaseCorrect}/${total} (${three3Pct}%)`)
  console.log(`  개선 효과:           ${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp`)

  // Phase별 상세
  console.log('\n  [3-Phase별 적중률]')
  console.log('  Phase       | N     | Correct | Rate')
  console.log('  ' + '-'.repeat(45))

  for (const [phase, { total: t, correct }] of Object.entries(per3Phase).sort(
    (a, b) => b[1].total - a[1].total,
  )) {
    const pct = ((correct / t) * 100).toFixed(1)
    console.log(
      `  ${phase.padEnd(12)} | ${String(t).padStart(5)} | ${String(correct).padStart(7)} | ${pct}%`,
    )
  }

  // actual_stage → 3-Phase 분포
  console.log('\n  [actual_stage → 3-Phase 분포]')
  const actualDist: Record<string, number> = {}
  for (const snap of snapshots) {
    if (!snap.actual_stage) continue
    const phase = STAGE_TO_3PHASE[snap.actual_stage]
    if (phase) actualDist[phase] = (actualDist[phase] || 0) + 1
  }
  const totalWithStage = snapshots.filter((s) => s.actual_stage).length
  for (const [phase, count] of Object.entries(actualDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${phase.padEnd(12)} ${String(count).padStart(5)} (${((count / totalWithStage) * 100).toFixed(1)}%)`)
  }

  // Majority baseline
  const majorityPhase = Object.entries(actualDist).sort((a, b) => b[1] - a[1])[0]
  if (majorityPhase) {
    console.log(
      `\n  [Majority baseline] 전부 "${majorityPhase[0]}" 예측: ${((majorityPhase[1] / total) * 100).toFixed(1)}%`,
    )
  }

  console.log(`\n  [GATE 3 판정]`)
  if (Number(three3Pct) >= 55) {
    console.log(`  ✅ 3-Phase ${three3Pct}% — 14일에서도 유효. 7일 단축 시 60~65% 기대`)
  } else if (Number(three3Pct) >= 45) {
    console.log(`  ⚡ 3-Phase ${three3Pct}% — 미미. 7일 단축 시 +5~10pp 추가 기대`)
  } else {
    console.log(`  ⚠️  3-Phase ${three3Pct}% — 3-Phase로도 부족. Binary 또는 진단 전환 권고`)
  }
}

// ─── Main ───
async function main() {
  console.log('🔬 Phase 0 사전 검증 — Gate 1 + Gate 3')
  console.log('   멀티 윈도우 지속률 + 3-Phase 시뮬레이션\n')

  console.log('   데이터 로딩 중...')
  const [scores, snapshots] = await Promise.all([loadAllScores(), loadEvaluatedSnapshots()])
  console.log(`   lifecycle_scores: ${scores.length}건`)
  console.log(`   evaluated snapshots: ${snapshots.length}건`)

  // scoreMap 구축
  const scoreMap = new Map<string, string>()
  for (const s of scores) {
    scoreMap.set(`${s.theme_id}::${s.calculated_at}`, s.stage)
  }

  gate1MultiWindow(scores, scoreMap)
  gate3ThreePhase(scores, snapshots)

  console.log('\n' + '═'.repeat(70))
  console.log('  Phase 0 검증 완료')
  console.log('═'.repeat(70))
}

main().catch((err) => {
  console.error('실행 실패:', err)
  process.exit(1)
})
