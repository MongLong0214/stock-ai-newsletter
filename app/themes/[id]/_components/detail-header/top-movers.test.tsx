import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TopMovers from './top-movers'

Object.assign(globalThis, { React })

const stocks = [
  { symbol: '005930', name: '삼성전자', market: 'KOSPI', currentPrice: 70_000, priceChangePct: 1.25, volume: 100 },
  { symbol: '000660', name: 'SK하이닉스', market: 'KOSPI', currentPrice: 180_000, priceChangePct: 5.5, volume: 200 },
  { symbol: '035420', name: 'NAVER', market: 'KOSPI', currentPrice: 210_000, priceChangePct: -0.5, volume: 300 },
  { symbol: '035720', name: '카카오', market: 'KOSPI', currentPrice: 50_000, priceChangePct: 3.75, volume: 400 },
  { symbol: '247540', name: '에코프로비엠', market: 'KOSDAQ', currentPrice: 120_000, priceChangePct: 2.5, volume: 500 },
]

describe('TopMovers', () => {
  it.each(['idle', 'loading'] as const)('%s 상태에서는 4행 스켈레톤만 렌더한다', (liveStatus) => {
    const html = renderToStaticMarkup(<TopMovers stocks={stocks} liveStatus={liveStatus} />)

    expect(html.match(/rounded-xl border border-slate-700\/20 bg-slate-800\/20 p-3\.5/g)).toHaveLength(4)
    expect(html).toContain('등락률 내림차순')
    expect(html).not.toContain('삼성전자')
    expect(html).not.toContain('SK하이닉스')
  })

  it('success 상태에서는 등락률 내림차순으로 상위 4행을 렌더한다', () => {
    const html = renderToStaticMarkup(<TopMovers stocks={stocks} liveStatus="success" />)
    const names = ['SK하이닉스', '카카오', '에코프로비엠', '삼성전자']

    expect(html).not.toContain('animate-pulse')
    expect(html).not.toContain('NAVER')
    names.forEach((name) => expect(html).toContain(name))
    expect(names.map((name) => html.indexOf(name))).toEqual(
      [...names].map((name) => html.indexOf(name)).sort((a, b) => a - b),
    )
  })

  it('error 상태에서는 stored 값을 렌더한다', () => {
    const html = renderToStaticMarkup(<TopMovers stocks={stocks} liveStatus="error" />)

    expect(html).not.toContain('animate-pulse')
    expect(html).toContain('SK하이닉스')
    expect(html).toContain('+5.50%')
  })

  it('종목이 없으면 기존 빈 상태를 렌더한다', () => {
    const html = renderToStaticMarkup(<TopMovers stocks={[]} liveStatus="loading" />)

    expect(html).toContain('시세 데이터를 준비하고 있어요')
    expect(html).not.toContain('animate-pulse')
  })

  it('등락률이 전무하면 기존 빈 상태를 렌더한다', () => {
    const html = renderToStaticMarkup(
      <TopMovers
        stocks={[{ ...stocks[0], priceChangePct: null }]}
        liveStatus="loading"
      />,
    )

    expect(html).toContain('시세 데이터를 준비하고 있어요')
    expect(html).not.toContain('animate-pulse')
  })
})
