'use client'

export type TimeRange = '7d' | '14d' | '30d'

interface TimeRangeOption {
  value: TimeRange
  label: string
  days: number
}

const OPTIONS: TimeRangeOption[] = [
  { value: '7d', label: '7D', days: 7 },
  { value: '14d', label: '14D', days: 14 },
  { value: '30d', label: '30D', days: 30 },
]

interface LifecycleCurveTimeRangeProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

export const LifecycleCurveTimeRange = ({ value, onChange }: LifecycleCurveTimeRangeProps) => {
  return (
    <div className="inline-flex items-center gap-1 p-0.5 rounded-md bg-slate-800/40 border border-slate-700/40">
      {OPTIONS.map((opt) => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`
              px-2.5 py-1 rounded text-[10px] font-mono font-medium transition-colors
              ${isActive
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                : 'border border-transparent text-slate-500 hover:text-slate-300'
              }
            `}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/** 시간 범위에 따라 데이터 슬라이싱 */
export function sliceByTimeRange<T>(data: T[], range: TimeRange): T[] {
  const days = OPTIONS.find((o) => o.value === range)?.days ?? 30
  if (data.length <= days) return data
  return data.slice(-days)
}

/** 범위 내 점수 변동 (첫날→마지막날 delta) */
export function calcRangeDelta(
  data: Array<{ score: number }>,
  range: TimeRange
): { label: string; value: number } {
  const rangeLabel = range === '7d' ? '7일간' : range === '14d' ? '14일간' : '30일간'
  if (data.length < 2) return { label: rangeLabel, value: 0 }

  const first = data[0].score
  const last = data[data.length - 1].score
  return { label: rangeLabel, value: Number((last - first).toFixed(1)) }
}
