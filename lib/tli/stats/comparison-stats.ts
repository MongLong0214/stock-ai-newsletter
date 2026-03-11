export interface TemporalSplitConfig {
  trainRatio: number
  validationRatio: number
  embargoDays: number
}

export interface RollingFold<T> {
  train: T[]
  validation: T[]
  embargo: T[]
  test: T[]
}

function dateKey(input: { runDate: string }) {
  return input.runDate
}

function compareDateStrings(a: string, b: string) {
  return a.localeCompare(b)
}

function diffCalendarDays(from: string, to: string) {
  const fromTime = new Date(from).getTime()
  const toTime = new Date(to).getTime()
  return Math.round((toTime - fromTime) / 86_400_000)
}

export function createEmbargoedTemporalSplits(
  dates: string[],
  config: TemporalSplitConfig,
): RollingFold<string> {
  const sorted = [...new Set(dates)].sort(compareDateStrings)
  if (sorted.length === 0) return { train: [], validation: [], embargo: [], test: [] }
  const trainEnd = Math.max(1, Math.floor(sorted.length * config.trainRatio))
  const validationEnd = Math.max(trainEnd + 1, Math.floor(sorted.length * (config.trainRatio + config.validationRatio)))
  const validation = sorted.slice(trainEnd, validationEnd)
  const validationLastDate = validation[validation.length - 1]

  let embargoEnd = validationEnd
  if (validationLastDate) {
    while (embargoEnd < sorted.length && diffCalendarDays(validationLastDate, sorted[embargoEnd]) <= config.embargoDays) {
      embargoEnd++
    }
  }

  return {
    train: sorted.slice(0, trainEnd),
    validation,
    embargo: sorted.slice(validationEnd, embargoEnd),
    test: sorted.slice(embargoEnd),
  }
}

export function assignRollingOriginFolds<T extends { runDate: string }>(
  observations: T[],
  minFolds = 3,
): RollingFold<T>[] {
  const sorted = [...observations].sort((a, b) => compareDateStrings(dateKey(a), dateKey(b)))
  const groupedDates = [...new Set(sorted.map(item => dateKey(item)))]
  const groupToItems = new Map<string, T[]>()
  for (const item of sorted) {
    const key = dateKey(item)
    const existing = groupToItems.get(key) || []
    existing.push(item)
    groupToItems.set(key, existing)
  }

  if (groupedDates.length < minFolds * 3) {
    const fallbackDates = createEmbargoedTemporalSplits(groupedDates, {
      trainRatio: 0.6,
      validationRatio: 0.2,
      embargoDays: 14,
    })
    return [
      {
        train: fallbackDates.train.flatMap(date => groupToItems.get(date) || []),
        validation: fallbackDates.validation.flatMap(date => groupToItems.get(date) || []),
        embargo: fallbackDates.embargo.flatMap(date => groupToItems.get(date) || []),
        test: fallbackDates.test.flatMap(date => groupToItems.get(date) || []),
      },
    ]
  }

  const foldSize = Math.max(1, Math.floor(groupedDates.length / (minFolds + 3)))
  const folds: RollingFold<T>[] = []
  for (let i = 0; i < minFolds; i++) {
    const testStart = Math.max(0, groupedDates.length - foldSize * (minFolds - i))
    const testEnd = Math.min(groupedDates.length, testStart + foldSize)
    const testDates = groupedDates.slice(testStart, testEnd)
    const testFirstDate = testDates[0]

    let embargoStart = testStart
    if (testFirstDate) {
      while (embargoStart > 0 && diffCalendarDays(groupedDates[embargoStart - 1], testFirstDate) <= 14) {
        embargoStart--
      }
    }

    const validationEnd = embargoStart
    const validationStart = Math.max(0, validationEnd - foldSize)
    const trainDates = groupedDates.slice(0, validationStart)
    const validationDates = groupedDates.slice(validationStart, validationEnd)
    const embargoDates = groupedDates.slice(validationEnd, testStart)

    folds.push({
      train: trainDates.flatMap(date => groupToItems.get(date) || []),
      validation: validationDates.flatMap(date => groupToItems.get(date) || []),
      embargo: embargoDates.flatMap(date => groupToItems.get(date) || []),
      test: testDates.flatMap(date => groupToItems.get(date) || []),
    })
  }
  return folds.filter(f => f.train.length > 0 && f.validation.length > 0 && f.test.length > 0)
}

export interface PairedValue {
  id: string
  value: number
}

export function computePairedDelta(baseline: PairedValue[], candidate: PairedValue[]) {
  const baselineMap = new Map(baseline.map(item => [item.id, item.value]))
  const deltas: number[] = []

  for (const item of candidate) {
    const base = baselineMap.get(item.id)
    if (base == null) continue
    deltas.push(item.value - base)
  }

  if (deltas.length === 0) return { meanDelta: NaN, count: 0, deltas: [] }
  const meanDelta = deltas.reduce((sum, value) => sum + value, 0) / deltas.length
  return { meanDelta, count: deltas.length, deltas }
}

export interface ClusterBootstrapInput {
  clusterId: string
  id: string
  baseline: number
  candidate: number
}

export interface ClusterBootstrapOptions {
  iterations?: number
  confidenceLevel?: number
  seed?: number
}

export interface PowerAnalysisReportInput {
  primaryMetric: string
  margin: number
  minimumDetectableEffect: number
  clusterCount: number
  eligibleRuns: number
  confidenceLevel: number
}

export function clusterBootstrapPairedDelta(
  rows: ClusterBootstrapInput[],
  options: ClusterBootstrapOptions = {},
) {
  const iterations = options.iterations ?? 1000
  const confidenceLevel = options.confidenceLevel ?? 0.95
  let seed = options.seed ?? 42

  const nextRandom = () => {
    seed = (seed * 1664525 + 1013904223) | 0
    return (seed >>> 0) / 0x100000000
  }

  const clusters = [...new Set(rows.map(row => row.clusterId))]
  const byCluster = new Map<string, ClusterBootstrapInput[]>()
  for (const row of rows) {
    const list = byCluster.get(row.clusterId) || []
    list.push(row)
    byCluster.set(row.clusterId, list)
  }

  const observed = computePairedDelta(
    rows.map(row => ({ id: row.id, value: row.baseline })),
    rows.map(row => ({ id: row.id, value: row.candidate })),
  )

  if (observed.count === 0) {
    return {
      meanDelta: NaN,
      lower: NaN,
      upper: NaN,
      clusterCount: clusters.length,
      observationCount: rows.length,
    }
  }

  const bootstrapMeans: number[] = []
  for (let i = 0; i < iterations; i++) {
    const sample: ClusterBootstrapInput[] = []
    for (let c = 0; c < clusters.length; c++) {
      const picked = clusters[Math.floor(nextRandom() * clusters.length)]
      sample.push(...(byCluster.get(picked) || []))
    }
    const sampled = computePairedDelta(
      sample.map(row => ({ id: row.id, value: row.baseline })),
      sample.map(row => ({ id: row.id, value: row.candidate })),
    )
    bootstrapMeans.push(sampled.meanDelta)
  }

  bootstrapMeans.sort((a, b) => a - b)
  const alpha = 1 - confidenceLevel
  // One-sided CI per PRD §8.3: lower = percentile(alpha), upper = percentile(1-alpha)
  const lowerIndex = Math.max(0, Math.floor(alpha * iterations))
  const upperIndex = Math.min(iterations - 1, Math.floor((1 - alpha) * iterations))

  return {
    meanDelta: observed.meanDelta,
    lower: bootstrapMeans[lowerIndex] ?? observed.meanDelta,
    upper: bootstrapMeans[upperIndex] ?? observed.meanDelta,
    clusterCount: clusters.length,
    observationCount: rows.length,
  }
}

export function renderPowerAnalysisReport(input: PowerAnalysisReportInput) {
  return [
    '# Comparison v4 Power Analysis',
    '',
    `- Primary Metric: ${input.primaryMetric}`,
    `- Non-Inferiority Margin: ${input.margin}`,
    `- Minimum Detectable Effect: ${input.minimumDetectableEffect}`,
    `- Cluster Count: ${input.clusterCount}`,
    `- Eligible Runs: ${input.eligibleRuns}`,
    `- Confidence Level: ${input.confidenceLevel}`,
    '',
    'This report is generated from the comparison v4 statistical configuration.',
  ].join('\n')
}
