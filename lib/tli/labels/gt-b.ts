export const GTB_LABELER_VERSION = 'gtb-v1'
export const GTB_HORIZON_DAYS = 5

export type GtBLabelStatus = 'final' | 'pending' | 'excluded'
export type GtBExcludeReason = 'insufficient_prices'

export interface GtBStockPricePair {
  readonly symbol: string
  readonly baseClose: number | null
  readonly futureClose: number | null
}

export interface GtBLabelInput {
  readonly stocks: readonly GtBStockPricePair[]
  readonly kospiBaseClose: number | null
  readonly kospiFutureClose: number | null
}

export interface GtBLabelResult {
  readonly status: GtBLabelStatus
  readonly basketExcessReturn: number | null
  readonly basketSize: number
  readonly excludeReason: GtBExcludeReason | null
  readonly labelerVersion: typeof GTB_LABELER_VERSION
}

const isValidClose = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value > 0

const stockReturn = (pair: GtBStockPricePair): number | null => {
  if (!isValidClose(pair.baseClose) || !isValidClose(pair.futureClose)) return null
  return pair.futureClose / pair.baseClose - 1
}

export function labelGtB(input: GtBLabelInput): GtBLabelResult {
  if (!isValidClose(input.kospiBaseClose) || !isValidClose(input.kospiFutureClose)) {
    return {
      status: 'pending',
      basketExcessReturn: null,
      basketSize: 0,
      excludeReason: null,
      labelerVersion: GTB_LABELER_VERSION,
    }
  }

  const returns = input.stocks.flatMap((pair) => {
    const value = stockReturn(pair)
    return value === null ? [] : [value]
  })
  const missingCount = input.stocks.length - returns.length
  if (missingCount > 2 || returns.length === 0) {
    return {
      status: 'excluded',
      basketExcessReturn: null,
      basketSize: returns.length,
      excludeReason: 'insufficient_prices',
      labelerVersion: GTB_LABELER_VERSION,
    }
  }

  const basketReturn = returns.reduce((sum, value) => sum + value, 0) / returns.length
  const kospiReturn = input.kospiFutureClose / input.kospiBaseClose - 1

  return {
    status: 'final',
    basketExcessReturn: basketReturn - kospiReturn,
    basketSize: returns.length,
    excludeReason: null,
    labelerVersion: GTB_LABELER_VERSION,
  }
}
