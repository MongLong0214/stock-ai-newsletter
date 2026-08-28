import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

export type StockMarket = 'KOSPI' | 'KOSDAQ'

export interface StockMasterInput {
  readonly symbol: string
  readonly name: string
  readonly market: StockMarket
  readonly is_active: boolean
  readonly status_flags: Readonly<Record<string, string>>
}

export interface KisMasterParseError {
  readonly lineNumber: number
  readonly reason: string
}

export interface KisMasterParseResult {
  readonly rows: StockMasterInput[]
  readonly errors: KisMasterParseError[]
  readonly skippedNonStockCount: number
  readonly skippedLetteredCodeCount: number
}

type KisMasterLineResult =
  | { readonly kind: 'row'; readonly row: StockMasterInput }
  | { readonly kind: 'non_stock' }
  | { readonly kind: 'lettered_code' }

interface MasterLayout {
  readonly fileName: string
  readonly url: string
  readonly tailByteLength: number
  readonly tailWidths: readonly number[]
  readonly flagIndexes: {
    readonly securityGroup: number
    readonly shortTermOverheat: number
    readonly investmentCaution?: number
    readonly tradingSuspended: number
    readonly liquidationTrading: number
    readonly managedStock: number
    readonly marketWarning: number
    readonly marketWarningRiskNotice: number
    readonly unfaithfulDisclosure: number
    readonly reverseListing: number
  }
}

const KOSPI_TAIL_WIDTHS = [
  2, 1, 4, 4, 4,
  1, 1, 1, 1, 1,
  1, 1, 1, 1, 1,
  1, 1, 1, 1, 1,
  1, 1, 1, 1, 1,
  1, 1, 1, 1, 1,
  1, 9, 5, 5, 1,
  1, 1, 2, 1, 1,
  1, 2, 2, 2, 3,
  1, 3, 12, 12, 8,
  15, 21, 2, 7, 1,
  1, 1, 1, 1, 9,
  9, 9, 5, 9, 8,
  9, 3, 1, 1, 1,
] as const

const KOSDAQ_TAIL_WIDTHS = [
  2, 1,
  4, 4, 4, 1, 1,
  1, 1, 1, 1, 1,
  1, 1, 1, 1, 1,
  1, 1, 1, 1, 1,
  1, 1, 1, 1, 9,
  5, 5, 1, 1, 1,
  2, 1, 1, 1, 2,
  2, 2, 3, 1, 3,
  12, 12, 8, 15, 21,
  2, 7, 1, 1, 1,
  1, 9, 9, 9, 5,
  9, 8, 9, 3, 1,
  1, 1,
] as const

export const KIS_MASTER_LAYOUTS: Readonly<Record<StockMarket, MasterLayout>> = {
  KOSPI: {
    fileName: 'kospi_code.mst',
    url: 'https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip',
    tailByteLength: 227,
    tailWidths: KOSPI_TAIL_WIDTHS,
    flagIndexes: {
      securityGroup: 0,
      shortTermOverheat: 22,
      tradingSuspended: 34,
      liquidationTrading: 35,
      managedStock: 36,
      marketWarning: 37,
      marketWarningRiskNotice: 38,
      unfaithfulDisclosure: 39,
      reverseListing: 40,
    },
  },
  KOSDAQ: {
    fileName: 'kosdaq_code.mst',
    url: 'https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip',
    tailByteLength: 221,
    tailWidths: KOSDAQ_TAIL_WIDTHS,
    flagIndexes: {
      securityGroup: 0,
      shortTermOverheat: 17,
      investmentCaution: 20,
      tradingSuspended: 29,
      liquidationTrading: 30,
      managedStock: 31,
      marketWarning: 32,
      marketWarningRiskNotice: 33,
      unfaithfulDisclosure: 34,
      reverseListing: 35,
    },
  },
}

const decodeCp949 = (bytes: Uint8Array): string => new TextDecoder('euc-kr', { fatal: true }).decode(bytes)

const parseTailFields = (tail: Buffer, widths: readonly number[]): string[] => {
  const fields: string[] = []
  let offset = 0
  for (const width of widths) {
    fields.push(tail.subarray(offset, offset + width).toString('ascii').trim())
    offset += width
  }
  return fields
}

const isYes = (value: string): boolean => value.toUpperCase() === 'Y'

const parseKisMasterLineResult = (line: Uint8Array, market: StockMarket): KisMasterLineResult => {
  const layout = KIS_MASTER_LAYOUTS[market]
  const bytes = Buffer.from(line)
  if (bytes.length <= 21 + layout.tailByteLength) {
    throw new Error(`행 길이 부족: ${bytes.length} bytes`)
  }

  const headEnd = bytes.length - layout.tailByteLength
  const code = bytes.subarray(0, 9).toString('ascii').trim()
  const name = decodeCp949(bytes.subarray(21, headEnd)).trim()
  const tail = bytes.subarray(headEnd)
  const fields = parseTailFields(tail, layout.tailWidths)
  const indexes = layout.flagIndexes
  const securityGroup = fields[indexes.securityGroup] ?? ''

  if (securityGroup !== 'ST') return { kind: 'non_stock' }
  if (/[A-Za-z]/.test(code)) return { kind: 'lettered_code' }
  if (!/^\d{6}$/.test(code)) throw new Error(`주권 단축코드 형식 오류: ${code || '(empty)'}`)
  if (!name) throw new Error('종목명 누락')

  const tradingSuspended = fields[indexes.tradingSuspended] ?? ''
  const liquidationTrading = fields[indexes.liquidationTrading] ?? ''
  const managedStock = fields[indexes.managedStock] ?? ''
  const statusFlags: Record<string, string> = {
    security_group_code: securityGroup,
    short_term_overheat_code: fields[indexes.shortTermOverheat] ?? '',
    trading_suspended: tradingSuspended,
    liquidation_trading: liquidationTrading,
    managed_stock: managedStock,
    market_warning_code: fields[indexes.marketWarning] ?? '',
    market_warning_risk_notice: fields[indexes.marketWarningRiskNotice] ?? '',
    unfaithful_disclosure: fields[indexes.unfaithfulDisclosure] ?? '',
    reverse_listing: fields[indexes.reverseListing] ?? '',
  }
  if (indexes.investmentCaution !== undefined) {
    statusFlags.investment_caution = fields[indexes.investmentCaution] ?? ''
  }

  return {
    kind: 'row',
    row: {
      symbol: `${market}:${code}`,
      name,
      market,
      is_active: ![tradingSuspended, liquidationTrading, managedStock].some(isYes),
      status_flags: statusFlags,
    },
  }
}

export function parseKisMasterLine(line: Uint8Array, market: StockMarket): StockMasterInput | null {
  const result = parseKisMasterLineResult(line, market)
  return result.kind === 'row' ? result.row : null
}

const splitLines = (content: Buffer): Buffer[] => {
  const lines: Buffer[] = []
  let start = 0
  for (let index = 0; index <= content.length; index++) {
    if (index !== content.length && content[index] !== 0x0a) continue
    let line = content.subarray(start, index)
    if (line.at(-1) === 0x0d) line = line.subarray(0, -1)
    if (line.length > 0) lines.push(line)
    start = index + 1
  }
  return lines
}

export function parseKisMasterFile(content: Uint8Array, market: StockMarket): KisMasterParseResult {
  const rows: StockMasterInput[] = []
  const errors: KisMasterParseError[] = []
  let skippedNonStockCount = 0
  let skippedLetteredCodeCount = 0

  for (const [index, line] of splitLines(Buffer.from(content)).entries()) {
    try {
      const result = parseKisMasterLineResult(line, market)
      if (result.kind === 'row') rows.push(result.row)
      else if (result.kind === 'lettered_code') skippedLetteredCodeCount++
      else skippedNonStockCount++
    } catch (error: unknown) {
      errors.push({
        lineNumber: index + 1,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { rows, errors, skippedNonStockCount, skippedLetteredCodeCount }
}

const extractMasterFile = async (archive: Buffer, fileName: string): Promise<Buffer> => {
  const directory = await mkdtemp(join(tmpdir(), 'stock-master-'))
  const archivePath = join(directory, `${basename(fileName)}.zip`)
  try {
    await writeFile(archivePath, archive)
    return await new Promise<Buffer>((resolve, reject) => {
      execFile(
        'unzip',
        ['-p', archivePath, fileName],
        { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`KIS master 압축 해제 실패 (${fileName}): ${stderr.toString() || error.message}`))
            return
          }
          resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout))
        },
      )
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const downloadAndParseMaster = async (market: StockMarket): Promise<KisMasterParseResult> => {
  const layout = KIS_MASTER_LAYOUTS[market]
  const response = await fetch(layout.url)
  if (!response.ok) {
    throw new Error(`KIS ${market} master 다운로드 실패: HTTP ${response.status}`)
  }
  const content = await extractMasterFile(Buffer.from(await response.arrayBuffer()), layout.fileName)
  return parseKisMasterFile(content, market)
}

const logParseErrors = (market: StockMarket, errors: readonly KisMasterParseError[]): void => {
  if (errors.length === 0) return
  console.error(`   ❌ ${market} master 파싱 실패: ${errors.length}행`)
  for (const error of errors.slice(0, 20)) {
    console.error(`      line=${error.lineNumber} reason=${error.reason}`)
  }
  if (errors.length > 20) console.error(`      ... ${errors.length - 20}행 추가 실패`)
}

export async function loadStockMaster(): Promise<void> {
  const results: KisMasterParseResult[] = []
  for (const market of ['KOSPI', 'KOSDAQ'] as const) {
    console.log(`📥 ${market} master 다운로드 중...`)
    const result = await downloadAndParseMaster(market)
    logParseErrors(market, result.errors)
    console.log(
      `   parsed=${result.rows.length} skipped_non_stock=${result.skippedNonStockCount} skipped_lettered_code=${result.skippedLetteredCodeCount} parse_failed=${result.errors.length}`,
    )
    results.push(result)
  }

  const rows = results.flatMap((result) => result.rows)
  const updatedAt = new Date().toISOString()
  const { batchUpsert } = await import('@/scripts/tli/shared/supabase-batch')
  const failedCount = await batchUpsert(
    'stock_master',
    rows.map((row) => ({ ...row, updated_at: updatedAt })),
    'symbol',
    '종목 마스터',
  )
  if (failedCount > 0) throw new Error(`종목 마스터 저장 실패: ${failedCount}/${rows.length}행`)

  const parseFailedCount = results.reduce((sum, result) => sum + result.errors.length, 0)
  const skippedNonStockCount = results.reduce((sum, result) => sum + result.skippedNonStockCount, 0)
  const skippedLetteredCodeCount = results.reduce((sum, result) => sum + result.skippedLetteredCodeCount, 0)
  console.log(JSON.stringify({
    parsedRows: rows.length,
    upsertedRows: rows.length,
    skippedNonStockCount,
    skippedLetteredCodeCount,
    parseFailedCount,
  }))
}

const isDirectRun = /load-stock-master\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  loadStockMaster().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
