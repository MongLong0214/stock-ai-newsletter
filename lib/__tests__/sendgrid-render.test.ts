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

  it('renders original scores and technical rationale for stored picks with selection metadata', () => {
    const data = makeCodePickData()
    const stocks = JSON.parse(data.geminiAnalysis).map((stock: { rationale: string }, index: number) => ({
      ...stock,
      rationale: `${stock.rationale}|공동 목표 모델 순위 ${index + 1}위|선정 목표 발행일 양봉·시가 대비 5거래일 내 +10% 터치|변동성 안정 순위 ${index + 1}위|선정 경로 저변동 안정`,
      selection: {
        strategy: 'test-five-day-target',
        rank: index + 1,
        objective: 'bullishThenTouch10Within5TradingDays',
      },
    }))
    data.geminiAnalysis = JSON.stringify(stocks.reverse())
    const html = generateNewsletterHTML(data, 'reader@example.com')

    expect(html.indexOf('SK하이닉스')).toBeLessThan(html.indexOf('삼성전자'))
    expect(html.indexOf('삼성전자')).toBeLessThan(html.indexOf('JYP Ent.'))
    expect(html.match(/종합 점수/g)).toHaveLength(3)
    for (const score of [92, 87, 81]) expect(html).toContain(`>${score}점</span>`)
    for (const phrase of ['선정 순위', '선정 목표', '공동 목표 모델 순위', '기술 참고 점수',
      '추천일 양봉 마감', '추천일 포함 5거래일', '상승 확률이 아닙니다',
      '변동성 안정 순위', '선정 경로 저변동 안정']) {
      expect(html).not.toContain(phrase)
    }
    expect(html.match(/display: block; width: 4px; height: 4px; background-color: #0EA5E9/g))
      .toHaveLength(RATIONALE_ITEMS.length * 3)
    for (const item of RATIONALE_ITEMS) expect(html).toContain(item)
    expect(JSON.parse(data.geminiAnalysis)).toEqual(stocks)

  })

  it('titles model-contribution scores separately from legacy technical scores', () => {
    const legacy = generateNewsletterHTML(makeCodePickData(), 'reader@example.com')
    expect(legacy).toContain('기술적 신호 점수')
    expect(legacy).not.toContain('종합 점수 기여도')
    const data = makeCodePickData()
    const stocks = JSON.parse(data.geminiAnalysis) as Array<{ signals: Record<string, unknown> }>
    stocks[0]!.signals = { ...stocks[0]!.signals, basis: 'model_contribution' }
    const html = generateNewsletterHTML({ ...data, geminiAnalysis: JSON.stringify(stocks) }, 'reader@example.com')
    expect(html.match(/종합 점수 기여도 · 50 = 영향 없음/g)).toHaveLength(1)
    expect(html.match(/기술적 신호 점수<\/p>/g)).toHaveLength(2)
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

  it('colors only signed declines red, not hyphens inside observation timestamps', () => {
    const overview = {
      kospi_futures: '-3.93% (야간; 2026-11-02T21:00:00.000Z)',
      kosdaq_futures: '-2.34% (야간; 2026-11-02T21:00:00.000Z)',
      dow_close: '0.41% (관측 2026-11-02T21:00:00.000Z)',
      usd_krw: '1346.43원 (0.98%; 관측 2026-11-02T21:03:00.000Z; 갱신 지연)',
      vix: '21.15 (관측 2026-11-02T21:15:01.000Z)',
      nasdaq_close: '1341.34원 (-0.31%; 관측 2026-11-03T00:18:00.000Z)',
    }
    const html = generateNewsletterHTML({
      date: '2026-11-03',
      geminiAnalysis: JSON.stringify({
        type: 'crash_alert', severity: 'warning', title: '시장 급락 위험 경고', market_overview: overview,
        causes: [{ factor: '야간선물 급락', impact: 'high', detail: '야간선물이 하락했습니다.' }],
        historical_context: '과거 사례', outlook: '전망', investor_guidance: '점검',
      }),
    }, 'reader@example.com')
    const colorOf = (value: string) => html.split('<tr>').find(row => row.includes(`>${value}<`))?.match(/color: (#[0-9A-F]{6}); text-align: right/)?.[1]
    expect(colorOf(overview.kospi_futures)).toBe('#DC2626')
    expect(colorOf(overview.kosdaq_futures)).toBe('#DC2626')
    expect(colorOf(overview.nasdaq_close)).toBe('#DC2626')
    expect(colorOf(overview.dow_close)).toBe('#0F172A')
    expect(colorOf(overview.usd_krw)).toBe('#0F172A')
    expect(colorOf(overview.vix)).toBe('#0F172A')
  })
})
