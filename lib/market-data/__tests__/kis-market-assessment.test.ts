import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateMarketAssessmentSnapshot,
  getKisMarketAssessmentSnapshot,
  type MarketAssessmentSnapshot,
  resetKisMarketAssessmentCacheForTest,
} from '../kis-market-assessment';
import { getMarketAssessmentPrompt } from '@/lib/prompts/korea/market-assessment';

function createJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function createHtmlResponse(html: string): Response {
  return new Response(Buffer.from(html, 'utf8'), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=euc-kr',
    },
  });
}

function createNaverVixSearchHtml(price: number, change: number, changePct: number): string {
  return `
    <section class="sc_new cs_stock cs_stock_same _cs_stock">
      <div class="spt_tlt">
        <h3>
          <a href="https://m.stock.naver.com/worldstock/index/.VIX" target="_blank">
            <span class="stk_nm">VIX</span>
            <span class="spt_con ${changePct < 0 ? 'dw' : 'up'}">
              <span class="blind">지수</span><strong>${price.toFixed(2)}</strong>
              <span class="n_ch">
                <span class="blind">전일대비</span><span class="ico">${changePct < 0 ? '하락' : '상승'}</span>
                <em>${Math.abs(change).toFixed(2)}</em>
                <em>(${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)</em>
              </span>
            </span>
          </a>
        </h3>
      </div>
      <p class="stk_info"><em>2026.03.10. 16:15</em> 장마감</p>
    </section>
  `;
}

function encodeDigits(value: string): string {
  return value
    .split('')
    .map((char) => {
      if (char === '.') return '<span class="jum">.</span>';
      if (char === ',') return '<span class="shim">,</span>';
      if (/\d/.test(char)) return `<span class="no${char}">${char}</span>`;
      return '';
    })
    .join('');
}

function createNaverFxDetailHtml(
  title: string,
  code: string,
  price: number,
  change: number,
  changePct: number,
  date = '2026.03.11 14:38'
): string {
  const absChange = Math.abs(change).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');

  return `
    <div class="h_company">
      <h2>${title}</h2>
      <div class="description"><span class="code2">${code}</span></div>
    </div>
    <div id="content">
      <div class="spot">
        <div class="today">
          <p class="no_today">
            <span class="txt_one usd">1달러 =</span>
            <em class="${changePct < 0 ? 'no_down' : 'no_up'}">${encodeDigits(price.toFixed(4))}</em>
            <span class="txt_money">${title}</span>
          </p>
          <p class="no_exday">
            <span class="txt_comparison">전일대비</span>
            <em class="${changePct < 0 ? 'no_down' : 'no_up'}">
              <span class="ico ${changePct < 0 ? 'down' : 'up'}"></span>
              ${encodeDigits(absChange)}
            </em>
            <em class="${changePct < 0 ? 'no_down' : 'no_up'}">
              <span class="parenthesis1">(</span>
              ${changePct < 0 ? '<span class="ico minus">-</span>' : '<span class="ico plus">+</span>'}${encodeDigits(Math.abs(changePct).toFixed(2))}<span class="per">%</span>
              <span class="parenthesis2">)</span>
            </em>
          </p>
        </div>
        <div class="exchange_info">
          <span class="date">${date}</span>
          <span class="standard">하나은행</span>
        </div>
      </div>
    </div>
  `;
}

function createNaverNewsSearchResponse(items: Array<{ title: string; originallink: string; description?: string; pubDate?: string }>): Response {
  return createJsonResponse({
    total: items.length,
    items: items.map((item) => ({
      title: item.title,
      link: item.originallink,
      originallink: item.originallink,
      description: item.description ?? '',
      pubDate: item.pubDate ?? 'Wed, 11 Mar 2026 09:00:00 +0900',
    })),
  });
}

function createNaverDomesticIndexBasicResponse(
  stockName: string,
  closePrice: number,
  change: number,
  changePct: number,
  itemCode = 'FUT'
): Response {
  return createJsonResponse({
    itemCode,
    symbolCode: itemCode,
    stockName,
    closePrice: closePrice.toFixed(2),
    compareToPreviousClosePrice: Math.abs(change).toFixed(2),
    compareToPreviousPrice: {
      name: change < 0 ? 'FALLING' : change > 0 ? 'RISING' : 'UNCHANGED',
    },
    fluctuationsRatio: Math.abs(changePct).toFixed(2),
    localTradedAt: '2026-03-11T15:00:59+09:00',
  });
}

function createNaverNationFuturesResponse(items: Array<{
  futuresName: string;
  futuresNameEng?: string;
  closePrice: number;
  change: number;
  changePct: number;
  reutersCode?: string;
}>): Response {
  return createJsonResponse(
    items.map((item) => ({
      reutersCode: item.reutersCode ?? 'NK225',
      futuresName: item.futuresName,
      futuresNameEng: item.futuresNameEng,
      closePrice: item.closePrice.toFixed(2),
      compareToPreviousClosePrice: Math.abs(item.change).toFixed(2),
      compareToPreviousPrice: {
        name: item.change < 0 ? 'FALLING' : item.change > 0 ? 'RISING' : 'UNCHANGED',
      },
      fluctuationsRatio: Math.abs(item.changePct).toFixed(2),
      localTradedAt: '2026-03-11T14:10:33+08:00',
    }))
  );
}

function createNaverNationIndexResponse(items: Array<{
  indexName: string;
  indexNameEng?: string;
  closePrice: number;
  change: number;
  changePct: number;
  reutersCode?: string;
}>): Response {
  return createJsonResponse(
    items.map((item) => ({
      reutersCode: item.reutersCode ?? 'N225',
      indexName: item.indexName,
      indexNameEng: item.indexNameEng,
      closePrice: item.closePrice.toFixed(2),
      compareToPreviousClosePrice: Math.abs(item.change).toFixed(2),
      compareToPreviousPrice: {
        name: item.change < 0 ? 'FALLING' : item.change > 0 ? 'RISING' : 'UNCHANGED',
      },
      fluctuationsRatio: Math.abs(item.changePct).toFixed(2),
      localTradedAt: '2026-03-11T15:00:00+09:00',
    }))
  );
}

function createForeignerIframeHtml(): string {
  return `
    <html>
      <body>
        <div class="sise_guide_date">26.03.09</div>
        <table class="type_1">
          <tr><th>종목명</th><th>수량</th><th>금액</th><th>당일거래량</th></tr>
          <tr><td><p class="tit"><a class="tltle" title="Samsung Electronics">Samsung Electronics</a></p></td><td class="number">-8,072</td><td class="number">-1,379,459</td><td class="number">43,066,020</td></tr>
          <tr><td><p class="tit"><a class="tltle" title="SK hynix">SK hynix</a></p></td><td class="number">-1,442</td><td class="number">-1,195,739</td><td class="number">7,253,621</td></tr>
          <tr><td><p class="tit"><a class="tltle" title="Doosan Enerbility">Doosan Enerbility</a></p></td><td class="number">-1,950</td><td class="number">-184,094</td><td class="number">7,957,034</td></tr>
          <tr><td><p class="tit"><a class="tltle" title="Hyundai Motor">Hyundai Motor</a></p></td><td class="number">-292</td><td class="number">-145,643</td><td class="number">1,913,094</td></tr>
          <tr><td><p class="tit"><a class="tltle" title="LIG Nex1">LIG Nex1</a></p></td><td class="number">-142</td><td class="number">-118,650</td><td class="number">884,005</td></tr>
        </table>
      </body>
    </html>
  `;
}

describe('kis-market-assessment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetKisMarketAssessmentCacheForTest();
    process.env.KIS_APP_KEY = 'testkey';
    process.env.KIS_APP_SECRET = 'dGVzdA==';
    process.env.KIS_BASE_URL = 'https://example.com';
    process.env.SERP_API_KEY = 'serp-test-key';
    process.env.NAVER_CLIENT_ID = 'naver-client-id';
    process.env.NAVER_CLIENT_SECRET = 'naver-client-secret';
  });

  it('builds a cached KIS snapshot and selects the nearest mini futures contract', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(createJsonResponse({ access_token: 'token-1' }))
      .mockResolvedValueOnce(
        createJsonResponse({
          rt_cd: '0',
          output1: {
            hts_kor_isnm: 'S&P500',
            ovrs_nmix_prpr: '6000.00',
            ovrs_nmix_prdy_vrss: '-210.00',
            prdy_ctrt: '-3.38',
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          rt_cd: '0',
          output1: {
            hts_kor_isnm: '다우존스 산업지수',
            ovrs_nmix_prpr: '42000.00',
            ovrs_nmix_prdy_vrss: '-900.00',
            prdy_ctrt: '-2.10',
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          rt_cd: '0',
          output1: {
            hts_kor_isnm: '나스닥 종합',
            ovrs_nmix_prpr: '22697.10',
            ovrs_nmix_prdy_vrss: '1.15',
            prdy_ctrt: '0.01',
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          rt_cd: '0',
          output: [
            {
              futs_shrn_iscd: 'A05604',
              hts_kor_isnm: '미니F 202604',
              futs_prpr: '812.00',
              futs_prdy_vrss: '-12.10',
              futs_prdy_ctrt: '-1.47',
              hts_rmnn_dynu: '31',
            },
            {
              futs_shrn_iscd: 'A05603',
              hts_kor_isnm: '미니F 202603',
              futs_prpr: '798.50',
              futs_prdy_vrss: '-24.80',
              futs_prdy_ctrt: '-3.01',
              hts_rmnn_dynu: '3',
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        createNaverDomesticIndexBasicResponse('코스피 200 선물', 799.1, -24.1, -2.94)
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          summary: {
            title: 'VIX',
            price: '29.50',
            price_movement: { value: 6.5, percentage: 28.2, movement: 'Up' },
          },
        })
      )
      .mockResolvedValueOnce(
        createHtmlResponse(createNaverVixSearchHtml(29.6, 6.4, 27.7))
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          summary: {
            title: 'USD/KRW',
            price: '1460.20',
            price_movement: { value: 18.2, percentage: 1.2, movement: 'Up' },
          },
        })
      )
      .mockResolvedValueOnce(
        createHtmlResponse(createNaverFxDetailHtml('미국 달러 USD', 'USDKRW', 1460.3, 18.1, 1.19))
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          summary: {
            title: 'USD/JPY',
            price: '157.80',
            price_movement: { value: 5.2, percentage: 3.4, movement: 'Up' },
          },
        })
      )
      .mockResolvedValueOnce(
        createHtmlResponse(createNaverFxDetailHtml('달러/일본 엔', 'USDJPY', 157.68, 5.15, 3.37, '2026.03.10'))
      )
      .mockResolvedValueOnce(
        createNaverNationFuturesResponse([
          {
            futuresName: '니케이 225 선물',
            futuresNameEng: 'SGX-DT Nikkei 225 Full Session Index Future cm1',
            closePrice: 53915,
            change: -1898.65,
            changePct: -3.4,
          },
        ])
      )
      .mockResolvedValueOnce(
        createNaverNationIndexResponse([
          {
            indexName: '니케이 225',
            indexNameEng: 'Nikkei 225',
            closePrice: 53983.38,
            change: -1835.45,
            changePct: -3.29,
          },
        ])
      )
      .mockResolvedValueOnce(
        createHtmlResponse(createForeignerIframeHtml())
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          organic_results: [
            {
              title: 'Tariff risk rises',
              snippet: 'New tariff escalation hit global markets.',
              link: 'https://example.com/event',
            },
            {
              title: 'Retaliatory tariffs expand',
              snippet: 'Retaliatory tariff threats added pressure across risk assets.',
              link: 'https://example.com/event-2',
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        createNaverNewsSearchResponse([
          {
            title: '보복관세 확대 우려에 글로벌 증시 긴장',
            originallink: 'https://news.example.com/tariff-1',
            description: '관세와 무역분쟁 우려가 다시 커졌다.',
          },
          {
            title: '미국 관세 발언에 위험자산 변동성 확대',
            originallink: 'https://finance.example.net/tariff-2',
            description: '보복관세 가능성이 거론됐다.',
          },
        ])
      )
      .mockResolvedValueOnce(createJsonResponse({ organic_results: [] }))
      .mockResolvedValueOnce(createNaverNewsSearchResponse([]))
      .mockResolvedValueOnce(createJsonResponse({ organic_results: [] }))
      .mockResolvedValueOnce(createNaverNewsSearchResponse([]))
      .mockResolvedValueOnce(createJsonResponse({ organic_results: [] }))
      .mockResolvedValueOnce(createNaverNewsSearchResponse([]))
      .mockResolvedValueOnce(createJsonResponse({ organic_results: [] }))
      .mockResolvedValueOnce(createNaverNewsSearchResponse([]));

    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getKisMarketAssessmentSnapshot();

    expect(snapshot.indicators.sp500.code).toBe('SPX');
    expect(snapshot.indicators.dowJones.code).toBe('.DJI');
    expect(snapshot.indicators.nasdaqComposite.code).toBe('COMP');
    expect(snapshot.indicators.kospi200MiniFutures.code).toBe('A05603');
    expect(snapshot.indicators.kospi200MiniFutures.contractName).toBe('미니F 202603');
    expect(snapshot.supplementary.kospi200Futures?.price).toBe(799.1);
    expect(snapshot.supplementary.kospi200Futures?.confirmed).toBe(false);
    expect(snapshot.indicators.vix?.price).toBe(29.5);
    expect(snapshot.indicators.vix?.validation).toBe('cross_checked');
    expect(snapshot.indicators.usdKrw?.change).toBe(18.2);
    expect(snapshot.indicators.usdKrw?.validation).toBe('cross_checked');
    expect(snapshot.indicators.usdJpy?.validation).toBe('cross_checked');
    expect(snapshot.supplementary.nikkeiFutures?.price).toBe(53915);
    expect(snapshot.supplementary.nikkeiFutures?.changePct).toBe(-3.4);
    expect(snapshot.supplementary.nikkeiFutures?.confirmed).toBe(true);
    expect(snapshot.supplementary.foreignerNetSelling?.topSellAmountMillion).toBe(3023585);
    expect(snapshot.events.tariffs.detected).toBe(true);
    expect(snapshot.events.tariffs.sourceCount).toBeGreaterThanOrEqual(3);

    const cachedSnapshot = await getKisMarketAssessmentSnapshot();
    expect(cachedSnapshot).toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledTimes(25);
  }, 15000);

  it('rejects overseas index responses that only return zero prices', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(createJsonResponse({ access_token: 'token-1' }))
      .mockResolvedValueOnce(
        createJsonResponse({
          rt_cd: '0',
          output1: {
            hts_kor_isnm: 'S&P500',
            ovrs_nmix_prpr: '0.00',
            ovrs_nmix_prdy_vrss: '0.00',
            prdy_ctrt: '0.00',
          },
        })
      );

    vi.stubGlobal('fetch', fetchMock);

    await expect(getKisMarketAssessmentSnapshot()).rejects.toThrow('S&P 500 returned an invalid price');
  });

  it('derives tier signals from the exact KIS snapshot', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(createJsonResponse({ access_token: 'token-1' }))
      .mockResolvedValueOnce(
        createJsonResponse({
          rt_cd: '0',
          output1: {
            hts_kor_isnm: 'S&P500',
            ovrs_nmix_prpr: '6000.00',
            ovrs_nmix_prdy_vrss: '-210.00',
            prdy_ctrt: '-3.38',
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          rt_cd: '0',
          output1: {
            hts_kor_isnm: '다우존스 산업지수',
            ovrs_nmix_prpr: '42000.00',
            ovrs_nmix_prdy_vrss: '-1100.00',
            prdy_ctrt: '-2.62',
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          rt_cd: '0',
          output1: {
            hts_kor_isnm: '나스닥 종합',
            ovrs_nmix_prpr: '22697.10',
            ovrs_nmix_prdy_vrss: '-476.63',
            prdy_ctrt: '-2.06',
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          rt_cd: '0',
          output: [
            {
              futs_shrn_iscd: 'A05603',
              hts_kor_isnm: '미니F 202603',
              futs_prpr: '798.50',
              futs_prdy_vrss: '-24.80',
              futs_prdy_ctrt: '-3.01',
              hts_rmnn_dynu: '3',
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        createNaverDomesticIndexBasicResponse('코스피 200 선물', 798.9, -25.1, -3.05)
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          summary: {
            title: 'VIX',
            price: '36.20',
            price_movement: { value: 11.4, percentage: 45.2, movement: 'Up' },
          },
        })
      )
      .mockResolvedValueOnce(
        createHtmlResponse(createNaverVixSearchHtml(36.1, 11.2, 44.8))
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          summary: {
            title: 'USD/KRW',
            price: '1475.82',
            price_movement: { value: 16.8, percentage: 1.1, movement: 'Up' },
          },
        })
      )
      .mockResolvedValueOnce(
        createHtmlResponse(createNaverFxDetailHtml('미국 달러 USD', 'USDKRW', 1475.9, 16.7, 1.10))
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          summary: {
            title: 'USD/JPY',
            price: '157.79',
            price_movement: { value: 5.6, percentage: 3.6, movement: 'Up' },
          },
        })
      )
      .mockResolvedValueOnce(
        createHtmlResponse(createNaverFxDetailHtml('달러/일본 엔', 'USDJPY', 157.75, 5.55, 3.58, '2026.03.10'))
      )
      .mockResolvedValueOnce(
        createNaverNationFuturesResponse([
          {
            futuresName: '니케이 225 선물',
            futuresNameEng: 'SGX-DT Nikkei 225 Full Session Index Future cm1',
            closePrice: 53915,
            change: -1898.65,
            changePct: -3.4,
          },
        ])
      )
      .mockResolvedValueOnce(
        createNaverNationIndexResponse([
          {
            indexName: '니케이 225',
            indexNameEng: 'Nikkei 225',
            closePrice: 53983.38,
            change: -1835.45,
            changePct: -3.29,
          },
        ])
      )
      .mockResolvedValueOnce(
        createHtmlResponse(createForeignerIframeHtml())
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          organic_results: [
            {
              title: 'Tariff risk rises',
              snippet: 'New tariff escalation hit global markets.',
              link: 'https://example.com/event',
            },
            {
              title: 'Retaliatory tariffs expand',
              snippet: 'Retaliatory tariff threats added pressure across risk assets.',
              link: 'https://example.com/event-2',
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        createNaverNewsSearchResponse([
          {
            title: '관세 충격에 글로벌 증시 긴장 고조',
            originallink: 'https://news.example.com/tariff-1',
            description: '무역분쟁과 보복관세 우려가 동반 확대됐다.',
          },
          {
            title: '보복관세 발언에 위험자산 변동성 확대',
            originallink: 'https://markets.example.net/tariff-2',
            description: '관세 충격이 재부각됐다.',
          },
        ])
      )
      .mockResolvedValueOnce(createJsonResponse({ organic_results: [] }))
      .mockResolvedValueOnce(createNaverNewsSearchResponse([]))
      .mockResolvedValueOnce(createJsonResponse({ organic_results: [] }))
      .mockResolvedValueOnce(createNaverNewsSearchResponse([]))
      .mockResolvedValueOnce(createJsonResponse({ organic_results: [] }))
      .mockResolvedValueOnce(createNaverNewsSearchResponse([]))
      .mockResolvedValueOnce(createJsonResponse({ organic_results: [] }))
      .mockResolvedValueOnce(createNaverNewsSearchResponse([]));

    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getKisMarketAssessmentSnapshot();
    const evidence = evaluateMarketAssessmentSnapshot(snapshot);
    const prompt = getMarketAssessmentPrompt({ snapshot, evidence });

    expect(evidence.tier1Signals).toContain('S&P 500 -3.38%');
    expect(evidence.tier1Signals).toContain('2 of 3 US indexes <= -2.5%');
    expect(evidence.tier1Signals).toContain('KOSPI200 mini futures -3.01%');
    expect(evidence.tier1Signals).toContain('VIX 36.20 / 11.40pt');
    expect(evidence.tier2Signals).toContain('USD/KRW +16.80 KRW');
    expect(evidence.tier2Signals).toContain('USD/JPY 5.60 JPY');
    expect(evidence.tier2Signals).toContain('Nikkei futures -3.40%');
    expect(evidence.tier2Signals).toContain('Foreigner net sell 3.02T KRW');
    expect(evidence.tier3Signals).toContain('Tariff / trade conflict');
    expect(prompt).toContain('API 숫자 스냅샷 (최우선 진실원)');
    expect(prompt).toContain('다시 검색해서 덮어쓰면 안 됩니다');
    expect(prompt).toContain('KOSPI 200 futures: 798.90');
    expect(prompt).toContain('Nikkei futures: 53915.00 -3.40%');
  }, 15000);

  it('keeps KOSPI mini crash signals when the direct futures quote is still single-source', () => {
    const snapshot: MarketAssessmentSnapshot = {
      fetchedAt: new Date().toISOString(),
      indicators: {
        sp500: {
          code: 'SPX',
          label: 'S&P 500',
          source: 'KIS',
          price: 6100,
          change: -60,
          changePct: -0.97,
          validation: 'direct',
          secondarySource: null,
          fetchedAt: new Date().toISOString(),
        },
        dowJones: {
          code: '.DJI',
          label: 'Dow Jones',
          source: 'KIS',
          price: 43000,
          change: -210,
          changePct: -0.49,
          validation: 'direct',
          secondarySource: null,
          fetchedAt: new Date().toISOString(),
        },
        nasdaqComposite: {
          code: 'COMP',
          label: 'NASDAQ Composite',
          source: 'KIS',
          price: 22800,
          change: -95,
          changePct: -0.41,
          validation: 'direct',
          secondarySource: null,
          fetchedAt: new Date().toISOString(),
        },
        kospi200MiniFutures: {
          code: 'A05603',
          label: 'KOSPI200 mini futures',
          contractName: '미니F 202603',
          remainingDays: 2,
          source: 'KIS',
          price: 849.52,
          change: -28.1,
          changePct: -3.20,
          validation: 'direct',
          secondarySource: null,
          fetchedAt: new Date().toISOString(),
        },
        vix: null,
        usdKrw: null,
        usdJpy: null,
      },
      supplementary: {
        kospi200Futures: {
          label: 'KOSPI 200 futures',
          query: 'KOSPI 200 futures',
          title: 'KOSPI 200 Futures',
          snippet: 'The current KOSPI 200 Futures price is 824.95.',
          link: 'https://example.com/kospi200',
          price: 824.95,
          change: null,
          changePct: null,
          confirmed: false,
          proxy: false,
          fetchedAt: new Date().toISOString(),
          source: 'NAVER_STOCK_API',
        },
        nikkeiFutures: null,
        foreignerNetSelling: null,
      },
      events: {
        tariffs: { detected: false, evidence: [] },
        geopolitics: { detected: false, evidence: [] },
        centralBankSurprise: { detected: false, evidence: [] },
        financialInstitutionFailure: { detected: false, evidence: [] },
        pandemic: { detected: false, evidence: [] },
      },
    };

    const evidence = evaluateMarketAssessmentSnapshot(snapshot);

    expect(evidence.tier1Signals).toContain('KOSPI200 mini futures -3.20%');
    expect(evidence.supportingNotes).toContain('KOSPI 200 futures 824.95 [single-source]');
    expect(evidence.supportingNotes).not.toContain('KOSPI quote mismatch 824.95 vs mini 849.52');
  });

  it('does not promote single-source or proxy Asia search signals into tier2', () => {
    const snapshot: MarketAssessmentSnapshot = {
      fetchedAt: new Date().toISOString(),
      indicators: {
        sp500: {
          code: 'SPX',
          label: 'S&P 500',
          source: 'KIS',
          price: 6100,
          change: -70,
          changePct: -1.13,
          validation: 'direct',
          secondarySource: null,
          fetchedAt: new Date().toISOString(),
        },
        dowJones: {
          code: '.DJI',
          label: 'Dow Jones',
          source: 'KIS',
          price: 43000,
          change: -420,
          changePct: -0.97,
          validation: 'direct',
          secondarySource: null,
          fetchedAt: new Date().toISOString(),
        },
        nasdaqComposite: {
          code: 'COMP',
          label: 'NASDAQ Composite',
          source: 'KIS',
          price: 22800,
          change: -180,
          changePct: -0.78,
          validation: 'direct',
          secondarySource: null,
          fetchedAt: new Date().toISOString(),
        },
        kospi200MiniFutures: {
          code: 'A05603',
          label: 'KOSPI200 mini futures',
          contractName: '미니F 202603',
          remainingDays: 2,
          source: 'KIS',
          price: 849.52,
          change: -9.1,
          changePct: -1.06,
          validation: 'direct',
          secondarySource: null,
          fetchedAt: new Date().toISOString(),
        },
        vix: null,
        usdKrw: null,
        usdJpy: null,
      },
      supplementary: {
        kospi200Futures: null,
        nikkeiFutures: {
          label: 'Nikkei 225 futures',
          query: 'Japan 225 futures today',
          title: 'Nikkei 225 Futures',
          snippet: 'The current Nikkei 225 Futures price is 53,915.0, down 3.40%.',
          link: 'https://example.com/nikkei',
          price: 53915,
          change: null,
          changePct: -3.4,
          confirmed: false,
          proxy: false,
          fetchedAt: new Date().toISOString(),
          source: 'NAVER_STOCK_API',
        },
        foreignerNetSelling: null,
      },
      events: {
        tariffs: { detected: false, evidence: [] },
        geopolitics: { detected: false, evidence: [] },
        centralBankSurprise: { detected: false, evidence: [] },
        financialInstitutionFailure: { detected: false, evidence: [] },
        pandemic: { detected: false, evidence: [] },
      },
    };

    const evidence = evaluateMarketAssessmentSnapshot(snapshot);

    expect(evidence.tier2Signals).not.toContain('Nikkei futures -3.40%');
    expect(evidence.supportingNotes).toContain('Nikkei 225 futures -3.40% [single-source]');
  });
});
