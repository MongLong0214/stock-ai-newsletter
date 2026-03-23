'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ThemeStockItem } from '@/lib/tli/types'

export interface KISPriceSnapshot {
  ticker: string
  currentPrice: number
  previousClose: number
  changeRate: number
  volume: number
  openPrice?: number | null
  highPrice?: number | null
  lowPrice?: number | null
  week52High?: number | null
  week52Low?: number | null
  tradingValue?: number | null
  marketCap?: number | null
  per?: number | null
  pbr?: number | null
  eps?: number | null
  bps?: number | null
  sharesOutstanding?: number | null
  timestamp: number
}

interface StockPriceAPIResponse {
  success: boolean
  prices?: Record<string, KISPriceSnapshot>
}

function isKISPriceSnapshot(data: unknown): data is KISPriceSnapshot {
  if (!data || typeof data !== 'object') return false
  const snapshot = data as Record<string, unknown>
  return (
    typeof snapshot.ticker === 'string'
    && typeof snapshot.currentPrice === 'number'
    && typeof snapshot.previousClose === 'number'
    && typeof snapshot.changeRate === 'number'
    && typeof snapshot.volume === 'number'
    && typeof snapshot.timestamp === 'number'
  )
}

export function formatSnapshotTime(timestamp?: number | null) {
  if (!timestamp) return '시간 정보 없음'

  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

export function useKisStockSnapshots(stocks: Array<Pick<ThemeStockItem, 'symbol'>>) {
  const [liveSnapshots, setLiveSnapshots] = useState<Map<string, KISPriceSnapshot>>(new Map())
  const [liveStatus, setLiveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const symbolsKey = useMemo(
    () => stocks.map((stock) => stock.symbol).filter(Boolean).join(','),
    [stocks],
  )
  const stableSymbols = useMemo(() => (symbolsKey ? symbolsKey.split(',') : []), [symbolsKey])

  useEffect(() => {
    if (stableSymbols.length === 0) {
      setLiveSnapshots(new Map())
      setLiveStatus('idle')
      return
    }

    const controller = new AbortController()
    let active = true

    async function loadLiveSnapshots() {
      setLiveStatus('loading')

      try {
        const chunks = Array.from({ length: Math.ceil(stableSymbols.length / 10) }, (_, index) =>
          stableSymbols.slice(index * 10, index * 10 + 10),
        )

        const responses = await Promise.all(
          chunks.map(async (chunk) => {
            const response = await fetch(`/api/stock/price?tickers=${chunk.join(',')}`, {
              signal: controller.signal,
            })

            if (!response.ok) {
              throw new Error(`KIS snapshot fetch failed: ${response.status}`)
            }

            const data: StockPriceAPIResponse = await response.json()
            return data.prices ?? {}
          }),
        )

        if (!active) return

        const nextSnapshots = new Map<string, KISPriceSnapshot>()
        responses.forEach((result) => {
          Object.entries(result).forEach(([symbol, snapshot]) => {
            if (isKISPriceSnapshot(snapshot)) {
              nextSnapshots.set(symbol, snapshot)
            }
          })
        })

        setLiveSnapshots(nextSnapshots)
        setLiveStatus('success')
      } catch {
        if (controller.signal.aborted || !active) return
        setLiveStatus('error')
      }
    }

    void loadLiveSnapshots()

    return () => {
      active = false
      controller.abort()
    }
  }, [stableSymbols])

  return { liveSnapshots, liveStatus }
}
