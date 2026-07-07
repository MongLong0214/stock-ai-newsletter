process.env.DOTENV_CONFIG_QUIET = 'true'

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from 'dotenv'
import { z } from 'zod'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { buildReflexivityReport } from './reflexivity-report'
import { loadReflexivityReport, type LoadReflexivityReportOptions } from './reflexivity-loader'

config({ path: '.env.local' })

const ExposureSourceSchema = z.enum(['newsletter_content_text_match', 'fixture'])
const ExposureEventSchema = z.object({
  themeId: z.string().min(1),
  exposureDate: z.string().min(10),
  source: ExposureSourceSchema,
  newsletterId: z.string().min(1).optional(),
  matchedName: z.string().min(1).optional(),
  subscriberCount: z.number().nullable().optional(),
})
const InterestMetricRowSchema = z.object({
  themeId: z.string().min(1),
  date: z.string().min(10),
  rawValue: z.number().nullable(),
})
const ThemeLabelRowSchema = z.object({
  themeId: z.string().min(1),
  baseDate: z.string().min(10),
  yBinary: z.boolean().nullable(),
  labelStatus: z.string().optional(),
  gLogRatio: z.number().nullable().optional(),
})
const FixtureInputSchema = z.object({
  asOfDate: z.string().min(10),
  quarterStart: z.string().min(10),
  quarterEnd: z.string().min(10),
  allThemeIds: z.string().min(1).array(),
  exposureEvents: ExposureEventSchema.array(),
  interestRows: InterestMetricRowSchema.array(),
  labelRows: ThemeLabelRowSchema.array(),
  eventWindowDays: z.number().int().positive().optional(),
  minComparableEvents: z.number().int().positive().optional(),
  liftThreshold: z.number().nonnegative().optional(),
  labelLiftThreshold: z.number().nonnegative().optional(),
  extractionMode: ExposureSourceSchema.optional(),
})

const args = process.argv.slice(2)

function readArg(name: string, fallback: string | null = null): string | null {
  const exact = `--${name}`
  const prefix = `${exact}=`
  const match = args.find((arg) => arg === exact || arg.startsWith(prefix))
  if (!match) return fallback
  return match === exact ? '' : match.slice(prefix.length)
}

function readPositiveIntegerArg(name: string): number | undefined {
  const value = readArg(name)
  if (value === null) return undefined
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`)
  }
  return parsed
}

function readNonNegativeNumberArg(name: string): number | undefined {
  const value = readArg(name)
  if (value === null) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative number`)
  }
  return parsed
}

function quarterStartFor(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`invalid --as-of date: ${dateString}`)
  }
  const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3
  return `${date.getUTCFullYear()}-${String(quarterMonth + 1).padStart(2, '0')}-01`
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path: string, payload: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`)
}

async function main(): Promise<void> {
  const inputPath = readArg('input')
  const jsonOutput = readArg('json-output')

  if (inputPath) {
    const fixture = FixtureInputSchema.parse(readJson(inputPath))
    const report = buildReflexivityReport(fixture)
    if (jsonOutput) writeJson(jsonOutput, report)
    console.log(JSON.stringify(report))
    return
  }

  const asOfDate = readArg('as-of', getKSTDateString()) ?? getKSTDateString()
  const quarterStart = readArg('quarter-start', quarterStartFor(asOfDate)) ?? quarterStartFor(asOfDate)
  const quarterEnd = readArg('quarter-end', asOfDate) ?? asOfDate
  const eventWindowDays = readPositiveIntegerArg('event-window-days')
  const minComparableEvents = readPositiveIntegerArg('min-comparable-events')
  const liftThreshold = readNonNegativeNumberArg('lift-threshold')
  const labelLiftThreshold = readNonNegativeNumberArg('label-lift-threshold')
  const options = {
    asOfDate,
    quarterStart,
    quarterEnd,
    ...(eventWindowDays === undefined ? {} : { eventWindowDays }),
    ...(minComparableEvents === undefined ? {} : { minComparableEvents }),
    ...(liftThreshold === undefined ? {} : { liftThreshold }),
    ...(labelLiftThreshold === undefined ? {} : { labelLiftThreshold }),
  } satisfies LoadReflexivityReportOptions
  const report = await loadReflexivityReport(options)

  if (jsonOutput) writeJson(jsonOutput, report)
  console.log(JSON.stringify(report))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
