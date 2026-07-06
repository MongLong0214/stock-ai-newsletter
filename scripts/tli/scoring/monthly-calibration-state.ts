import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import {
  getKstMonthStart,
  MONTHLY_CALIBRATION_MARKER_TYPE,
} from '@/scripts/tli/scoring/monthly-calibration-schedule'

export async function loadMonthlyCalibrationRunDates(kstDate: string): Promise<string[]> {
  const monthStart = getKstMonthStart(kstDate)
  const { data, error } = await supabaseAdmin
    .from('confidence_calibration')
    .select('calculated_at')
    .eq('calibration_type', MONTHLY_CALIBRATION_MARKER_TYPE)
    .gte('calculated_at', monthStart)
    .lte('calculated_at', kstDate)

  if (error) {
    throw new Error(`월간 재교정 실행 기록 조회 실패: ${error.message}`)
  }

  return (data ?? []).map((row) => row.calculated_at)
}

export async function recordMonthlyCalibrationRun(kstDate: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('confidence_calibration')
    .upsert({
      calculated_at: kstDate,
      calibration_type: MONTHLY_CALIBRATION_MARKER_TYPE,
      sample_size: 0,
    }, { onConflict: 'calculated_at,calibration_type' })

  if (error) {
    throw new Error(`월간 재교정 실행 기록 저장 실패: ${error.message}`)
  }
}
