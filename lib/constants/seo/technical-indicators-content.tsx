/**
 * SEO-Optimized Technical Indicators Content for Stock Matrix Newsletter
 * Target: 800+ characters in Korean
 * Keywords: 기술적 지표, RSI, MACD, 볼린저밴드, 이동평균선, 스토캐스틱, 기술적 분석
 */

export const technicalIndicatorsContent = {
  title: "30가지 기술적 지표로 분석하는 AI 주식 투자 전략",

  introduction: {
    heading: "기술적 지표란 무엇인가요?",
    content: `<strong>기술적 지표</strong>는 주가의 과거 데이터를 수학적으로 분석하여 미래 가격 움직임을 예측하는 도구입니다.
    Stock Matrix는 30가지 이상의 <strong>기술적 분석</strong> 지표를 AI로 통합 분석하여,
    단일 지표만으로는 놓칠 수 있는 매매 시그널을 포착합니다.
    개별 투자자가 수십 개의 지표를 동시에 모니터링하기는 어렵지만,
    AI는 실시간으로 모든 지표를 종합하여 객관적인 투자 인사이트를 제공합니다.`
  },

  mainIndicators: {
    heading: "Stock Matrix가 활용하는 핵심 기술적 지표",
    indicators: [
      {
        id: "rsi",
        name: "RSI (상대강도지수)",
        keyword: "RSI 지표란",
        description: `<strong>RSI</strong>는 0~100 사이의 값으로 주식의 과매수·과매도 상태를 판단합니다.
        일반적으로 RSI가 70 이상이면 과매수 구간으로 조정 가능성이 높고,
        30 이하면 과매도 구간으로 반등 기회로 해석됩니다.
        14일 기준 RSI가 가장 많이 활용되며, 추세 전환의 선행 지표로 유용합니다.`,
        usage: "과열·침체 판단, 매수·매도 타이밍 포착"
      },
      {
        id: "macd",
        name: "MACD (이동평균 수렴·확산)",
        keyword: "MACD 골든크로스",
        description: `<strong>MACD</strong>는 단기(12일)와 장기(26일) 이동평균선의 차이를 분석하는 추세 지표입니다.
        MACD 선이 시그널 선을 상향 돌파하는 <strong>골든크로스</strong>는 매수 신호로,
        하향 돌파하는 데드크로스는 매도 신호로 해석됩니다.
        히스토그램의 크기 변화로 추세 강도도 파악할 수 있습니다.`,
        usage: "추세 전환 시점 파악, 매매 신호 확인"
      },
      {
        id: "bollinger",
        name: "볼린저 밴드 (Bollinger Bands)",
        keyword: "볼린저밴드 활용",
        description: `<strong>볼린저밴드</strong>는 이동평균선을 중심으로 표준편차를 이용한 상·하한선을 그린 지표입니다.
        주가가 상단 밴드에 닿으면 과매수, 하단 밴드에 닿으면 과매도 가능성을 시사합니다.
        밴드 폭이 좁아지는 스퀴즈(Squeeze) 구간 이후 큰 가격 변동이 나타나는 경향이 있어
        변동성 확대 시점을 예측하는 데 유용합니다.`,
        usage: "변동성 측정, 가격 범위 예측"
      },
      {
        id: "ma",
        name: "이동평균선 (Moving Average)",
        keyword: "이동평균선 골든크로스",
        description: `<strong>이동평균선</strong>은 일정 기간 주가의 평균값을 선으로 연결한 가장 기본적인 추세 지표입니다.
        단기 이동평균선(5일, 20일)이 장기 이동평균선(60일, 120일)을 상향 돌파하면 골든크로스로 상승 추세를,
        하향 돌파하면 데드크로스로 하락 추세를 나타냅니다.
        이동평균선은 지지선과 저항선 역할도 하며, 주가 흐름의 방향성을 명확히 보여줍니다.`,
        usage: "추세 방향 확인, 지지·저항 레벨 식별"
      },
      {
        id: "stochastic",
        name: "스토캐스틱 (Stochastic Oscillator)",
        keyword: "스토캐스틱 지표",
        description: `<strong>스토캐스틱</strong>은 일정 기간 최고가와 최저가 대비 현재가의 위치를 %로 나타내는 모멘텀 지표입니다.
        %K선과 %D선의 교차로 매매 시점을 포착하며, 80 이상은 과매수, 20 이하는 과매도 구간으로 판단합니다.
        RSI와 함께 사용하면 신호의 신뢰도가 높아지며, 단기 매매에 특히 효과적입니다.`,
        usage: "모멘텀 분석, 단기 매매 타이밍"
      },
      {
        id: "cci",
        name: "CCI (상품채널지수)",
        keyword: "CCI 지표",
        description: `<strong>CCI</strong>는 현재 가격이 평균 가격에서 얼마나 벗어났는지를 측정하는 지표입니다.
        +100 이상이면 상승 과열, -100 이하면 하락 과열로 해석하며,
        0선을 중심으로 매수·매도 신호를 판단합니다.`,
        usage: "추세 강도 측정, 과열 구간 포착"
      },
      {
        id: "obv",
        name: "거래량 지표 (Volume Indicators)",
        keyword: "OBV 거래량",
        description: `<strong>OBV(On Balance Volume)</strong> 등 거래량 지표는 가격 움직임과 거래량의 상관관계를 분석합니다.
        거래량이 증가하며 상승하면 상승세가 강하고, 거래량 감소와 함께 상승하면 추세 약화를 의미합니다.
        가격 변화를 확인하는 선행 지표로 활용됩니다.`,
        usage: "추세 확인, 가격 움직임 검증"
      },
      {
        id: "adx",
        name: "ADX (평균방향성지수)",
        keyword: "ADX 추세 강도",
        description: `<strong>ADX</strong>는 추세의 강도를 0~100 사이의 값으로 나타내는 지표입니다.
        ADX 값이 25 이상이면 강한 추세, 20 이하면 추세 없음(횡보) 구간으로 판단합니다.
        추세의 방향은 알려주지 않지만, 상승·하락 추세의 강도를 객관적으로 측정하여
        추세 추종 전략의 진입 시점을 파악하는 데 유용합니다.`,
        usage: "추세 강도 측정, 추세 확인"
      },
      {
        id: "ichimoku",
        name: "일목균형표 (Ichimoku Cloud)",
        keyword: "일목균형표 활용",
        description: `<strong>일목균형표</strong>는 전환선, 기준선, 선행스팬1·2, 후행스팬으로 구성된 종합 추세 지표입니다.
        구름대(선행스팬) 위에서 가격이 움직이면 상승 추세, 아래면 하락 추세로 해석합니다.
        전환선이 기준선을 상향 돌파하면 매수 신호, 하향 돌파하면 매도 신호입니다.
        5개 선이 종합적으로 지지·저항, 추세 방향, 매매 타이밍을 동시에 제공하는 강력한 분석 도구입니다.`,
        usage: "종합 추세 분석, 지지·저항 확인"
      }
    ]
  },

  aiIntegration: {
    heading: "AI가 30가지 지표를 종합 분석하는 방법",
    content: `Stock Matrix의 AI는 RSI, MACD, 볼린저밴드, 이동평균선, 스토캐스틱, CCI, ADX, OBV, 일목균형표, ATR, SuperTrend 등
    <strong>30가지 이상의 기술적 지표</strong>를 동시에 분석합니다.

    단일 지표만 보면 잘못된 신호(False Signal)를 받을 수 있지만,
    AI는 여러 지표가 동일한 방향을 가리킬 때만 강한 매매 신호로 판단하여 정확도를 높입니다.

    예를 들어, RSI가 과매도 구간이면서 MACD 골든크로스가 발생하고,
    볼린저밴드 하단에서 반등하며 거래량이 증가하는 종목은 강한 매수 신호로 해석됩니다.

    인간 투자자는 감정에 휘둘리기 쉽지만, AI는 <strong>데이터 기반의 객관적 분석</strong>으로
    일관된 투자 판단을 제공합니다.

    복잡한 차트 분석 없이도 AI가 정리한 핵심 시그널만 확인하면
    개인 투자자도 전문가 수준의 기술적 분석 인사이트를 얻을 수 있습니다.`
  },

  conclusion: {
    content: `Stock Matrix는 매일 오전 30가지 기술적 지표를 종합 분석한
    <strong>AI 주식 투자 리포트</strong>를 이메일로 발송합니다.
    복잡한 기술적 분석 공부 없이도 AI가 선별한 투자 아이디어를 받아보세요.`
  },

  cta: {
    text: "지금 무료 구독하고 AI 기술적 분석 리포트 받아보기",
    email: "aistockmatrix@gmail.com",
    website: "stockmatrix.co.kr"
  },

  // SEO Metadata
  seo: {
    title: "기술적 지표 완벽 가이드 | RSI, MACD, 볼린저밴드 활용법 - Stock Matrix",
    description: "RSI, MACD, 볼린저밴드 등 30가지 기술적 지표를 AI로 종합 분석하는 방법. 이동평균선 골든크로스, 스토캐스틱 매매 타이밍까지 완벽 정리",
    keywords: [
      "기술적 지표",
      "RSI 지표란",
      "MACD 골든크로스",
      "볼린저밴드 활용",
      "이동평균선",
      "스토캐스틱 지표",
      "기술적 분석",
      "주식 기술적 지표",
      "AI 주식 분석",
      "CCI 지표",
      "OBV 거래량",
      "차트 분석"
    ],
    ogTitle: "30가지 기술적 지표로 분석하는 AI 주식 투자 전략",
    ogDescription: "RSI·MACD·볼린저밴드를 포함한 30개 기술적 지표를 AI가 실시간 분석. 골든크로스부터 과매수·과매도 구간까지 자동 포착",
    canonicalUrl: "https://stockmatrix.co.kr/technical-indicators-guide"
  }
}

// React Component for rendering the content
export function TechnicalIndicatorsContent() {
  const { introduction, mainIndicators, aiIntegration, conclusion, cta } = technicalIndicatorsContent

  return (
    <article className="technical-indicators-content prose prose-lg max-w-4xl mx-auto px-4 py-8">
      {/* Introduction Section */}
      <section className="mb-12">
        <h2 className="text-3xl font-bold mb-6 text-gray-900">
          {introduction.heading}
        </h2>
        <div
          className="text-gray-700 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: introduction.content }}
        />
      </section>

      {/* Main Indicators Section */}
      <section className="mb-12">
        <h2 className="text-3xl font-bold mb-8 text-gray-900">
          {mainIndicators.heading}
        </h2>

        <div className="space-y-8">
          {mainIndicators.indicators.map((indicator, index) => (
            <div
              key={indicator.keyword}
              className="bg-gray-50 rounded-lg p-6 border border-gray-200 hover:border-blue-300 transition-colors"
            >
              <h3 className="text-2xl font-semibold mb-3 text-blue-600">
                {index + 1}. {indicator.name}
              </h3>

              <div
                className="text-gray-700 leading-relaxed mb-3"
                dangerouslySetInnerHTML={{ __html: indicator.description }}
              />

              <div className="flex items-start gap-2 mt-4 p-3 bg-blue-50 rounded border-l-4 border-blue-500">
                <span className="font-semibold text-blue-700 whitespace-nowrap">
                  활용법:
                </span>
                <span className="text-gray-800">{indicator.usage}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AI Integration Section */}
      <section className="mb-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-8 border border-blue-200">
        <h2 className="text-3xl font-bold mb-6 text-gray-900">
          {aiIntegration.heading}
        </h2>
        <div
          className="text-gray-700 leading-relaxed space-y-4 whitespace-pre-line"
          dangerouslySetInnerHTML={{ __html: aiIntegration.content }}
        />
      </section>

      {/* Conclusion Section */}
      <section className="mb-8">
        <div
          className="text-gray-700 leading-relaxed text-center text-lg"
          dangerouslySetInnerHTML={{ __html: conclusion.content }}
        />
      </section>

      {/* CTA Section */}
      <section className="text-center py-8 bg-blue-600 rounded-xl text-white">
        <p className="text-xl font-bold mb-4">{cta.text}</p>
        <div className="space-y-2">
          <p className="text-blue-100">
            <strong>이메일:</strong> {cta.email}
          </p>
          <p className="text-blue-100">
            <strong>웹사이트:</strong> {cta.website}
          </p>
        </div>
      </section>

      {/* Schema.org structured data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": technicalIndicatorsContent.seo.title,
            "description": technicalIndicatorsContent.seo.description,
            "author": {
              "@type": "Organization",
              "name": "Stock Matrix"
            },
            "publisher": {
              "@type": "Organization",
              "name": "Stock Matrix",
              "url": "https://stockmatrix.co.kr"
            },
            "keywords": technicalIndicatorsContent.seo.keywords.join(", "),
            "articleSection": "Investment Education",
            "inLanguage": "ko-KR"
          })
        }}
      />
    </article>
  )
}

export default TechnicalIndicatorsContent