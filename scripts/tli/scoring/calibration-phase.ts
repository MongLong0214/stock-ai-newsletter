import { isKoreanTradingDate } from '@/lib/tli/trading-calendar'
import { calibrateNoiseThreshold } from '@/scripts/tli/scoring/calibrate-noise'
import { calibrateConfidence } from '@/scripts/tli/scoring/calibrate-confidence'
import { calibrateWeights } from '@/scripts/tli/scoring/calibrate-weights'
import { loadCalibrationsFromDB } from '@/scripts/tli/scoring/load-calibrations'
import {
  planMonthlyCalibration,
  type MonthlyCalibrationDecision,
} from '@/scripts/tli/scoring/monthly-calibration-schedule'
import {
  loadMonthlyCalibrationRunDates,
  recordMonthlyCalibrationRun,
} from '@/scripts/tli/scoring/monthly-calibration-state'

export async function runCalibrationPhase(kstNow: Date): Promise<void> {
  console.log('\n📥 3.5단계: 교정값 로드')
  try {
    await loadCalibrationsFromDB()
  } catch (error: unknown) {
    console.warn('   ⚠️ 교정값 로드 실패 (기본값 사용):', error instanceof Error ? error.message : String(error))
  }

  const kstDate = kstNow.toISOString().split('T')[0]
  const eligibleRun = isKoreanTradingDate(kstDate)
  let monthlyDecision: MonthlyCalibrationDecision = 'deferred'
  try {
    monthlyDecision = planMonthlyCalibration({
      kstDate,
      eligibleRun,
      runDates: await loadMonthlyCalibrationRunDates(kstDate),
    })
  } catch (error: unknown) {
    console.warn('   ⚠️ 월간 재교정 실행 기록 조회 실패 (다음 실행에서 재시도):', error instanceof Error ? error.message : String(error))
  }

  if (monthlyDecision === 'executed') {
    console.log('\n🔬 3.5b단계: 월간 과학적 재교정')
    const calibStart = Date.now()

    try { await calibrateNoiseThreshold() }
    catch (error: unknown) { console.warn('   ⚠️ 노이즈 교정 실패:', error instanceof Error ? error.message : String(error)) }

    try { await calibrateConfidence() }
    catch (error: unknown) { console.warn('   ⚠️ Confidence 교정 실패:', error instanceof Error ? error.message : String(error)) }

    try { await calibrateWeights() }
    catch (error: unknown) { console.warn('   ⚠️ 가중치 교정 실패:', error instanceof Error ? error.message : String(error)) }

    const calibDuration = ((Date.now() - calibStart) / 1000).toFixed(1)
    console.log(`   ⏱️ 재교정 완료: ${calibDuration}초`)
    try {
      await recordMonthlyCalibrationRun(kstDate)
    } catch (error: unknown) {
      console.warn('   ⚠️ 월간 재교정 실행 기록 저장 실패:', error instanceof Error ? error.message : String(error))
    }
  } else if (monthlyDecision === 'deferred') {
    console.log('   ⊘ 월간 재교정 연기 (eligible full run 아님)')
  } else {
    console.log('   ⊘ 월간 재교정 생략 (이번 달 이미 실행)')
  }
}
