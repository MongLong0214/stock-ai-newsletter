/** GDDA Evaluator — Sequential State Machine for TLI Parameter Optimization */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { calculateLifecycleScore } from '../../lib/tli/calculator'
import { applyEMASmoothing, resolveStageWithHysteresis } from '../../lib/tli/score-smoothing'
import {
  DEFAULT_TLI_PARAMS,
  computeWActivity,
  type TLIParams,
} from '../../lib/tli/constants/tli-params'
import type { Stage, InterestMetric, NewsMetric } from '../../lib/tli/types'
import type { HistoricalData, HistoricalTheme } from './dump-data'

// ── Types ──

export interface EvalResult {
  gdda: number | null
  growthHR: number
  declineHR: number
  growthCount: number
  declineCount: number
  flipRate: number
  stabilityPenalty: number
  samplePenalty: number
}

export interface SplitConfig {
  mode: 'train' | 'val' | 'all'
  evalStart: string
  evalEnd: string
}

interface ThemeState {
  prevSmoothed: number | undefined
  prevStage: Stage | null
  prevCandidate: Stage | undefined
  recentSmoothed: number[]
  prevCalculatedAt: string | undefined
}

// ── Constraint Validation ──

function validateConstraints(params: TLIParams): boolean {
  // Monotonicity: dormant < emerging < growth < peak
  if (params.stage_dormant >= params.stage_emerging) return false
  if (params.stage_emerging >= params.stage_growth) return false
  if (params.stage_growth >= params.stage_peak) return false

  // w_activity bounds: 0.05 <= w_activity <= 0.25
  const wActivity = computeWActivity(params)
  if (wActivity < 0.05 || wActivity > 0.25) return false

  return true
}

// ── Date Helpers ──

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return toDateStr(d)
}

function daysBetweenDates(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z')
  const db = new Date(b + 'T00:00:00Z')
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}

// ── Data Slicing Helpers ──

/**
 * Get metrics up to (and including) a given date, sorted descending (most recent first).
 * Returns at most `windowDays` entries.
 */
function getInterestMetricsUpTo(
  theme: HistoricalTheme,
  date: string,
  windowDays: number,
): InterestMetric[] {
  const cutoffStart = addDays(date, -(windowDays - 1))

  return theme.interestMetrics
    .filter(m => m.time <= date && m.time >= cutoffStart)
    .sort((a, b) => (a.time > b.time ? -1 : a.time < b.time ? 1 : 0))
    .slice(0, windowDays)
    .map(m => ({
      id: '',
      theme_id: theme.id,
      time: m.time,
      source: 'datalab',
      raw_value: m.raw_value,
      normalized: m.normalized,
    }))
}

function getNewsMetricsUpTo(
  theme: HistoricalTheme,
  date: string,
  windowDays: number,
): NewsMetric[] {
  const cutoffStart = addDays(date, -(windowDays - 1))

  return theme.newsMetrics
    .filter(m => m.time <= date && m.time >= cutoffStart)
    .sort((a, b) => (a.time > b.time ? -1 : a.time < b.time ? 1 : 0))
    .slice(0, windowDays)
    .map(m => ({
      id: '',
      theme_id: theme.id,
      time: m.time,
      article_count: m.article_count,
      growth_rate: null,
    }))
}

/**
 * Compute mean of raw_value for interest metrics in a specific date range [startDate, endDate].
 * Returns null if fewer than 1 data points exist.
 */
function computeRawAvg(
  theme: HistoricalTheme,
  startDate: string,
  endDate: string,
): number | null {
  const values = theme.interestMetrics
    .filter(m => m.time >= startDate && m.time <= endDate)
    .map(m => m.raw_value)

  if (values.length === 0) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

// ── Train/Val Split ──

export function determineSplit(
  data: HistoricalData,
  params: TLIParams,
): SplitConfig {
  const allDates = getAllSortedDates(data)
  if (allDates.length === 0) {
    return { mode: 'all', evalStart: data.dateRange.from, evalEnd: data.dateRange.to }
  }

  const totalDays = allDates.length
  const gap = 7
  const minValDays = 14

  // Try primary: ensure validation has enough samples
  // We simulate to count growth/decline samples, but for simplicity,
  // use a date-based heuristic: val needs at least 14 days
  const tPrimary = totalDays - gap - minValDays
  if (tPrimary > 0) {
    return {
      mode: 'val',
      evalStart: allDates[tPrimary + gap] ?? allDates[allDates.length - 1],
      evalEnd: allDates[allDates.length - 1],
    }
  }

  // Fallback: all
  return { mode: 'all', evalStart: allDates[0], evalEnd: allDates[allDates.length - 1] }
}

function getAllSortedDates(data: HistoricalData): string[] {
  const dateSet = new Set<string>()
  for (const theme of data.themes) {
    for (const m of theme.interestMetrics) {
      dateSet.add(m.time)
    }
  }
  return Array.from(dateSet).sort()
}

function getSplitRange(
  data: HistoricalData,
  params: TLIParams,
  splitMode: 'train' | 'val' | 'all',
): { evalStart: string; evalEnd: string } {
  const allDates = getAllSortedDates(data)
  if (allDates.length === 0) {
    return { evalStart: data.dateRange.from, evalEnd: data.dateRange.to }
  }

  if (splitMode === 'all') {
    return { evalStart: allDates[0], evalEnd: allDates[allDates.length - 1] }
  }

  const totalDays = allDates.length
  const gap = 7
  const minValDays = 14

  const tPrimary = totalDays - gap - minValDays
  if (tPrimary <= 0) {
    // Fallback to all
    return { evalStart: allDates[0], evalEnd: allDates[allDates.length - 1] }
  }

  if (splitMode === 'train') {
    return { evalStart: allDates[0], evalEnd: allDates[tPrimary - 1] ?? allDates[0] }
  }

  // val
  const valStartIdx = Math.min(tPrimary + gap, allDates.length - 1)
  return { evalStart: allDates[valStartIdx], evalEnd: allDates[allDates.length - 1] }
}

// ── Core Evaluation ──

export function computeGDDA(
  growthHits: number,
  growthTotal: number,
  declineHits: number,
  declineTotal: number,
  flipCount: number,
  totalEvalDays: number,
): EvalResult {
  const growthHR = growthTotal > 0 ? growthHits / growthTotal : 0
  const declineHR = declineTotal > 0 ? declineHits / declineTotal : 0

  const gddaRaw = (growthHR + declineHR) / 2

  // Stage Stability Penalty
  const flipRate = totalEvalDays > 0 ? flipCount / totalEvalDays : 0
  const stabilityPenalty = flipRate > 0.30 ? 0.8 : 1.0

  // Graduated Sample Penalty
  const samplePenalty =
    Math.min(growthTotal / 10, 1.0) * Math.min(declineTotal / 5, 1.0)

  const gdda = gddaRaw * stabilityPenalty * samplePenalty

  return {
    gdda,
    growthHR,
    declineHR,
    growthCount: growthTotal,
    declineCount: declineTotal,
    flipRate,
    stabilityPenalty,
    samplePenalty,
  }
}

export function runEvaluation(
  data: HistoricalData,
  params: TLIParams,
  splitMode: 'train' | 'val' | 'all',
): EvalResult {
  // Constraint validation
  if (!validateConstraints(params)) {
    return {
      gdda: null,
      growthHR: 0,
      declineHR: 0,
      growthCount: 0,
      declineCount: 0,
      flipRate: 0,
      stabilityPenalty: 1.0,
      samplePenalty: 1.0,
    }
  }

  const { evalStart, evalEnd } = getSplitRange(data, params, splitMode)

  let growthHits = 0
  let growthTotal = 0
  let declineHits = 0
  let declineTotal = 0
  let flipCount = 0
  let totalEvalDays = 0

  for (const theme of data.themes) {
    // Sort all interest metrics ascending by time
    const sortedMetrics = [...theme.interestMetrics].sort((a, b) =>
      a.time < b.time ? -1 : a.time > b.time ? 1 : 0,
    )

    if (sortedMetrics.length === 0) continue

    // Get all unique dates for this theme (ascending)
    const themeDates = sortedMetrics.map(m => m.time)
    const uniqueDates = Array.from(new Set(themeDates)).sort()

    // Initialize state machine
    const state: ThemeState = {
      prevSmoothed: undefined,
      prevStage: null,
      prevCandidate: undefined,
      recentSmoothed: [],
      prevCalculatedAt: undefined,
    }

    let prevEvalStage: Stage | null = null

    for (const date of uniqueDates) {
      // Slice metrics up to this date
      const interestSlice = getInterestMetricsUpTo(theme, date, 30)
      const newsSlice = getNewsMetricsUpTo(theme, date, 14)

      // Calculate lifecycle score with params
      const result = calculateLifecycleScore({
        interestMetrics: interestSlice,
        newsMetrics: newsSlice,
        firstSpikeDate: theme.firstSpikeDate,
        today: date,
        config: params,
      })

      if (result === null) continue

      // Apply EMA smoothing (with Cautious Decay + age-dependent alpha)
      const smoothed = applyEMASmoothing(
        result.score,
        state.prevSmoothed,
        state.recentSmoothed,
        {
          components: result.components,
          firstSpikeDate: theme.firstSpikeDate,
          today: date,
        },
      )

      // Resolve stage with hysteresis
      const interestSlice14d = getInterestMetricsUpTo(theme, date, 14)
      const stageResult = resolveStageWithHysteresis({
        rawScore: result.score,
        smoothedScore: smoothed,
        components: result.components,
        prevStage: state.prevStage,
        prevCandidate: state.prevCandidate as Stage | undefined,
        prevCalculatedAt: state.prevCalculatedAt,
        today: date,
        interestMetrics14d: interestSlice14d,
      })

      // HIT/MISS judgment (only within eval range)
      const inRange = date >= evalStart && date <= evalEnd
      if (inRange) {
        totalEvalDays++

        // Stage flip tracking (all stages)
        if (prevEvalStage !== null && prevEvalStage !== stageResult.finalStage) {
          flipCount++
        }
        prevEvalStage = stageResult.finalStage

        if (stageResult.finalStage === 'Growth' || stageResult.finalStage === 'Decline') {
          // Current 7-day raw average: [date-6, date]
          const current7dStart = addDays(date, -6)
          const currentAvg = computeRawAvg(theme, current7dStart, date)

          // Future 7-day raw average: [date+1, date+7]
          const futureStart = addDays(date, 1)
          const futureEnd = addDays(date, 7)
          const futureAvg = computeRawAvg(theme, futureStart, futureEnd)

          // Skip if insufficient future data
          const futureDays = theme.interestMetrics.filter(
            m => m.time >= futureStart && m.time <= futureEnd,
          ).length
          if (futureDays < 7 || currentAvg === null || futureAvg === null) {
            // Skip -- insufficient future data
          } else {
            if (stageResult.finalStage === 'Growth') {
              growthTotal++
              if (futureAvg > currentAvg) growthHits++
            } else {
              // Decline
              declineTotal++
              if (futureAvg <= currentAvg) declineHits++
            }
          }
        }
      }

      // Update state
      state.prevSmoothed = smoothed
      state.prevStage = stageResult.finalStage
      state.prevCandidate = result.components.raw.stage_candidate as Stage | undefined
      state.prevCalculatedAt = date
      state.recentSmoothed = [...state.recentSmoothed, smoothed].slice(-7)
    }
  }

  return computeGDDA(growthHits, growthTotal, declineHits, declineTotal, flipCount, totalEvalDays)
}

// ── CLI Entry Point ──

function parseArgs(): { params: Partial<TLIParams>; split: 'train' | 'val' | 'all'; dataPath: string } {
  const args = process.argv.slice(2)
  let params: Partial<TLIParams> = {}
  let split: 'train' | 'val' | 'all' = 'all'
  let dataPath = path.resolve(__dirname, 'historical-data.json')

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--params' && args[i + 1]) {
      try {
        params = JSON.parse(args[i + 1]) as Partial<TLIParams>
      } catch {
        console.error('Invalid JSON for --params')
        process.exit(1)
      }
      i++
    } else if (args[i] === '--split' && args[i + 1]) {
      const val = args[i + 1]
      if (val === 'train' || val === 'val' || val === 'all') {
        split = val
      } else {
        console.error(`Invalid --split value: ${val}`)
        process.exit(1)
      }
      i++
    } else if (args[i] === '--data-path' && args[i + 1]) {
      dataPath = args[i + 1]
      i++
    }
  }

  return { params, split, dataPath }
}

function main() {
  const { params, split, dataPath } = parseArgs()

  // Load historical data
  let rawData: string
  try {
    rawData = readFileSync(dataPath, 'utf-8')
  } catch {
    console.error(`Failed to read data file: ${dataPath}`)
    process.exit(1)
  }

  const data = JSON.parse(rawData) as HistoricalData
  const fullParams: TLIParams = { ...DEFAULT_TLI_PARAMS, ...params }

  const result = runEvaluation(data, fullParams, split)

  // Output JSON for Optuna
  console.log(JSON.stringify(result))
}

// Only run main when executed directly
if (typeof require !== 'undefined' && require.main === module) {
  main()
}
