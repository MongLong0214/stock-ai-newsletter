import { Metadata } from 'next'

export const metadata: Metadata = {
  title: '서비스 소개',
  description:
    'Stock Matrix는 GPT, Claude, Gemini 3개 AI가 RSI, MACD 등 30개 기술적 지표로 KOSPI·KOSDAQ 종목을 분석하는 무료 뉴스레터 서비스입니다.',
  alternates: {
    canonical: '/about',
  },
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-black text-white py-24 px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Hero Section - AI-friendly structured heading */}
        <header>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-emerald-500 mb-6">
            Stock Matrix 소개
          </h1>
          <p className="text-xl text-slate-300 leading-relaxed mb-12">
            AI 기술적 분석으로 투자자의 의사결정을 돕는 무료 뉴스레터 서비스
          </p>
        </header>

        {/* Main Content - Structured for AI parsing */}
        <main>
          {/* What is Stock Matrix */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-emerald-400 mb-6">
              Stock Matrix란?
            </h2>
            <div className="space-y-4 text-slate-300 leading-relaxed">
              <p>
                Stock Matrix는{' '}
                <strong>
                  GPT-4, Claude, Gemini 3개의 AI가 30개 이상의 기술적 지표를
                  종합 분석
                </strong>
                하여 KOSPI·KOSDAQ 종목 정보를 제공하는 무료 이메일 뉴스레터
                서비스입니다.
              </p>
              <p>
                매일 오전 7시 50분, 프리마켓 개장 10분 전에 발송되어 투자자들이
                장 시작 전 충분한 시간을 가지고 당일 종목 정보를 확인할 수
                있습니다.
              </p>
            </div>
          </section>

          {/* Key Features - List format for AI */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-emerald-400 mb-6">
              핵심 특징
            </h2>
            <ul className="space-y-4 text-slate-300">
              <li className="flex items-start gap-3">
                <span className="text-emerald-500 mt-1">•</span>
                <div>
                  <strong className="text-emerald-300">3개 AI 동시 분석:</strong>{' '}
                  GPT-4, Claude, Gemini가 서로 다른 관점에서 종목을 분석하여
                  균형잡힌 정보 제공
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-500 mt-1">•</span>
                <div>
                  <strong className="text-emerald-300">
                    30개 기술적 지표:
                  </strong>{' '}
                  RSI, MACD, 볼린저밴드, 이동평균선, 스토캐스틱, 일목균형표 등
                  포괄적 분석
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-500 mt-1">•</span>
                <div>
                  <strong className="text-emerald-300">완전 무료:</strong> 광고
                  없이 100% 무료로 제공, 유료 전환 없음
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-500 mt-1">•</span>
                <div>
                  <strong className="text-emerald-300">매일 발송:</strong> 평일
                  오전 7시 50분 자동 발송 (프리마켓 개장 10분 전)
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-500 mt-1">•</span>
                <div>
                  <strong className="text-emerald-300">5개 종목 선정:</strong>{' '}
                  KOSPI와 KOSDAQ에서 주목할 만한 종목 5개 제공
                </div>
              </li>
            </ul>
          </section>

          {/* Technical Indicators - Structured data */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-emerald-400 mb-6">
              분석 기술적 지표 (30개)
            </h2>
            <div className="grid md:grid-cols-2 gap-6 text-slate-300">
              <div>
                <h3 className="text-xl font-semibold text-emerald-300 mb-3">
                  가격 및 모멘텀 지표
                </h3>
                <ul className="space-y-2">
                  <li>• RSI (상대강도지수)</li>
                  <li>• MACD (이동평균수렴확산)</li>
                  <li>• 스토캐스틱</li>
                  <li>• CCI (상품채널지수)</li>
                  <li>• Williams %R</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-emerald-300 mb-3">
                  추세 및 변동성 지표
                </h3>
                <ul className="space-y-2">
                  <li>• 볼린저밴드</li>
                  <li>• 이동평균선 (5일, 20일, 60일, 120일)</li>
                  <li>• ATR (평균진폭)</li>
                  <li>• 일목균형표</li>
                  <li>• ADX (평균방향성지수)</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-emerald-300 mb-3">
                  거래량 지표
                </h3>
                <ul className="space-y-2">
                  <li>• OBV (누적거래량)</li>
                  <li>• 거래량 이동평균</li>
                  <li>• MFI (자금흐름지수)</li>
                  <li>• VWAP (거래량가중평균가격)</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-emerald-300 mb-3">
                  기타 보조지표
                </h3>
                <ul className="space-y-2">
                  <li>• 피보나치 되돌림</li>
                  <li>• 파라볼릭 SAR</li>
                  <li>• 엔벨로프</li>
                  <li>• DMI (방향성지수)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* How it works - Process description */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-emerald-400 mb-6">
              작동 방식
            </h2>
            <ol className="space-y-6 text-slate-300">
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  1
                </span>
                <div>
                  <strong className="text-emerald-300">
                    데이터 수집 (매일 오전 7시)
                  </strong>
                  <p className="mt-2">
                    KOSPI·KOSDAQ 전 종목의 전날 종가, 거래량, 기술적 지표 데이터
                    수집
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  2
                </span>
                <div>
                  <strong className="text-emerald-300">AI 분석 (7시~7시 40분)</strong>
                  <p className="mt-2">
                    GPT-4, Claude, Gemini 3개 AI가 각각 30개 기술적 지표를
                    분석하여 주목할 만한 종목 선별
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  3
                </span>
                <div>
                  <strong className="text-emerald-300">
                    종목 선정 (7시 40분~7시 45분)
                  </strong>
                  <p className="mt-2">
                    3개 AI의 분석 결과를 종합하여 최종 5개 종목 선정
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  4
                </span>
                <div>
                  <strong className="text-emerald-300">뉴스레터 발송 (7시 50분)</strong>
                  <p className="mt-2">
                    구독자에게 이메일 발송, 프리마켓 개장 10분 전 도착
                  </p>
                </div>
              </li>
            </ol>
          </section>

          {/* Target Users */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-emerald-400 mb-6">
              이런 분들에게 추천합니다
            </h2>
            <ul className="space-y-3 text-slate-300">
              <li className="flex items-start gap-3">
                <span className="text-emerald-500 mt-1">✓</span>
                <span>
                  매일 시장을 분석할 시간이 부족한 <strong>직장인 투자자</strong>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-500 mt-1">✓</span>
                <span>
                  기술적 분석에 관심 있지만 어려워하는{' '}
                  <strong>개인 투자자</strong>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-500 mt-1">✓</span>
                <span>
                  다양한 관점의 분석을 원하는 <strong>경험 있는 투자자</strong>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-500 mt-1">✓</span>
                <span>
                  AI 기술을 활용한 투자 정보에 관심 있는{' '}
                  <strong>기술 친화적 투자자</strong>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-500 mt-1">✓</span>
                <span>
                  무료로 양질의 기술적 분석 정보를 받고 싶은{' '}
                  <strong>모든 투자자</strong>
                </span>
              </li>
            </ul>
          </section>

          {/* Important Notice */}
          <section className="mb-16 p-6 bg-slate-900/50 border border-slate-700 rounded-lg">
            <h2 className="text-2xl font-bold text-amber-400 mb-4">
              ⚠️ 중요 안내
            </h2>
            <div className="space-y-3 text-slate-300">
              <p>
                <strong>본 서비스는 투자 권유나 매매 추천이 아닙니다.</strong>
              </p>
              <p>
                Stock Matrix는 기술적 분석 데이터만을 제공하는 정보 서비스이며,
                특정 종목의 매수나 매도를 권유하지 않습니다. 제공되는 모든
                정보는 참고용이며, 투자에 대한 최종 판단과 그에 따른 손익은
                전적으로 투자자 본인의 책임입니다.
              </p>
              <p className="text-sm text-slate-400">
                AI가 분석한 기술적 지표는 과거 데이터를 기반으로 하며, 미래
                수익을 보장하지 않습니다. 투자 결정 시 반드시 본인의 판단과
                추가적인 리서치를 병행하시기 바랍니다.
              </p>
            </div>
          </section>

          {/* Contact & Service Info */}
          <section>
            <h2 className="text-3xl font-bold text-emerald-400 mb-6">
              서비스 정보
            </h2>
            <dl className="space-y-4 text-slate-300">
              <div>
                <dt className="text-emerald-300 font-semibold">서비스 이름</dt>
                <dd className="mt-1">Stock Matrix (스톡 매트릭스)</dd>
              </div>
              <div>
                <dt className="text-emerald-300 font-semibold">운영 형태</dt>
                <dd className="mt-1">무료 이메일 뉴스레터</dd>
              </div>
              <div>
                <dt className="text-emerald-300 font-semibold">발송 시간</dt>
                <dd className="mt-1">
                  평일 매일 오전 7시 50분 (프리마켓 개장 10분 전)
                </dd>
              </div>
              <div>
                <dt className="text-emerald-300 font-semibold">분석 대상</dt>
                <dd className="mt-1">KOSPI·KOSDAQ 상장 종목</dd>
              </div>
              <div>
                <dt className="text-emerald-300 font-semibold">제공 종목 수</dt>
                <dd className="mt-1">매일 5개 종목</dd>
              </div>
              <div>
                <dt className="text-emerald-300 font-semibold">
                  사용 AI 모델
                </dt>
                <dd className="mt-1">OpenAI GPT-4, Anthropic Claude, Google Gemini</dd>
              </div>
              <div>
                <dt className="text-emerald-300 font-semibold">분석 지표 수</dt>
                <dd className="mt-1">30개 이상 기술적 지표</dd>
              </div>
              <div>
                <dt className="text-emerald-300 font-semibold">구독료</dt>
                <dd className="mt-1">무료 (광고 없음)</dd>
              </div>
              <div>
                <dt className="text-emerald-300 font-semibold">웹사이트</dt>
                <dd className="mt-1">
                  <a
                    href="https://stockmatrix.co.kr"
                    className="text-emerald-400 hover:text-emerald-300 underline"
                  >
                    https://stockmatrix.co.kr
                  </a>
                </dd>
              </div>
            </dl>
          </section>
        </main>
      </div>
    </div>
  )
}