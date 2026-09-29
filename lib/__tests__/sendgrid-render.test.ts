import { describe, expect, it } from 'vitest'

import { generateNewsletterHTML, type StockNewsletterData } from '@/lib/sendgrid'

const RATIONALE_ITEMS = [
  '기준일 종가 105,000원',
  '당일 등락 1.2% 상승',
  'RSI 58.4 중립',
  '거래량비율 240% 급증',
  '60일 거래량 백분위 98.3점',
  '60일 신고가 1.1% 돌파',
  '20일선 괴리 4.2%',
  '20일 추세 기울기 0.35%/일',
  '20일 추세 적합도 R2 82.0점',
  '60일 추세 적합도 R2 76.0점',
  'MACD 히스토그램 124.50',
  'ATR14 2.8%',
  'ADX14 31.2점',
  'OBV20 기울기 182000',
  '120거래일 가격위치 88.0%',
  '연속상승 3일',
  '골든크로스 감지 1회·경과 4일',
  '20일 평균거래대금 925.4억원',
  'volumeBreakout 전략점수 87.5점',
] as const

const SIGNALS = {
  trend_score: 88,
  momentum_score: 79,
  volume_score: 94,
  volatility_score: 83,
  pattern_score: 91,
  sentiment_score: 76,
  overall_score: 87,
}

const makeCodePickData = (): StockNewsletterData => ({
  date: '2026-08-28',
  geminiAnalysis: JSON.stringify([
    {
      ticker: 'KOSPI:005930',
      name: '삼성전자',
      close_price: 105_000,
      rationale: RATIONALE_ITEMS
        .map((item, index) => index === 1 ? '<script>alert("xss")</script>' : item)
        .join('|'),
      signals: SIGNALS,
    },
    {
      ticker: 'KOSPI:000660',
      name: 'SK하이닉스',
      close_price: 274_500,
      rationale: RATIONALE_ITEMS.join('|'),
      signals: { ...SIGNALS, overall_score: 92 },
    },
    {
      ticker: 'KOSDAQ:035900',
      name: 'JYP Ent.',
      close_price: 81_300,
      rationale: RATIONALE_ITEMS.join('|'),
      signals: { ...SIGNALS, overall_score: 81 },
    },
  ]),
})

describe('generateNewsletterHTML', () => {
  it('keeps legacy technical-score ordering and labels', () => {
    const html = generateNewsletterHTML(makeCodePickData(), 'reader@example.com')
    expect(html.indexOf('SK하이닉스')).toBeLessThan(html.indexOf('삼성전자'))
    expect(html.indexOf('삼성전자')).toBeLessThan(html.indexOf('JYP Ent.'))
    expect(html).toContain('종합 점수')
    expect(html).not.toContain('선정 목표:')
    expect(html).not.toContain('선정 순위')
  })

  it('renders actual selection rank and the joint five-day target independently of technical score', () => {
    const data = makeCodePickData()
    const stocks = JSON.parse(data.geminiAnalysis).map((stock: object, index: number) => ({
      ...stock,
      selection: {
        strategy: 'test-five-day-target',
        rank: index + 1,
        objective: 'bullishThenTouch10Within5TradingDays',
      },
    }))
    data.geminiAnalysis = JSON.stringify(stocks.reverse())
    const html = generateNewsletterHTML(data, 'reader@example.com')

    expect(html.indexOf('삼성전자')).toBeLessThan(html.indexOf('SK하이닉스'))
    expect(html.indexOf('SK하이닉스')).toBeLessThan(html.indexOf('JYP Ent.'))
    expect(html).toContain('선정 순위 1위')
    expect(html).toContain('선정 순위 2위')
    expect(html).toContain('선정 순위 3위')
    expect(html).toContain('추천일 양봉 마감(종가 &gt; 시가)')
    expect(html).toContain('추천일 포함 5거래일 안에 추천일 시가 대비 장중 +10% 도달')
    expect(html).toContain('기술 참고 점수')
    expect(html).toContain('상승 확률이 아닙니다')
    expect(html).not.toContain('종합 점수')
  })

  it('renders the production code-pick shape without missing-value artifacts', () => {
    const html = generateNewsletterHTML(makeCodePickData(), 'reader@example.com')

    expect(html).toContain('삼성전자')
    expect(html).toContain('105,000')
    expect(html).toContain('SK하이닉스')
    expect(html).toContain('274,500')
    expect(html).toContain('JYP Ent.')
    expect(html).toContain('81,300')

    const rationaleBullets = html.match(
      /display: block; width: 4px; height: 4px; background-color: #0EA5E9/g,
    ) ?? []
    expect(rationaleBullets).toHaveLength(RATIONALE_ITEMS.length * 3)
    expect(html).not.toMatch(/undefined|NaN|null/)
  })

  it('escapes injected HTML in a rationale item', () => {
    const html = generateNewsletterHTML(makeCodePickData(), 'reader@example.com')

    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert("xss")</script>')
  })

  it('renders the crash_alert JSON path', () => {
    const data: StockNewsletterData = {
      date: '2026-08-28',
      geminiAnalysis: JSON.stringify({
        type: 'crash_alert',
        severity: 'critical',
        title: '글로벌 위험자산 급락 경보',
        market_overview: {
          kospi_futures: '-4.8%',
          vix: '41.2',
          usd_krw: '1,465원',
        },
        causes: [
          {
            factor: '미국 증시 급락',
            impact: 'high',
            detail: '주요 지수가 동반 하락했습니다.',
          },
        ],
        historical_context: '과거 변동성 확대 구간과 유사합니다.',
        outlook: '단기 변동성 확대 가능성이 높습니다.',
        investor_guidance: '과도한 레버리지를 피하고 위험을 점검하세요.',
      }),
    }

    const html = generateNewsletterHTML(data, 'reader@example.com')

    expect(html).toContain('긴급 시장 분석')
    expect(html).toContain('글로벌 위험자산 급락 경보')
    expect(html).toContain('KOSPI 선물')
    expect(html).toContain('-4.8%')
    expect(html).toContain('미국 증시 급락')
    expect(html).toContain('주요 지수가 동반 하락했습니다.')
  })
})
