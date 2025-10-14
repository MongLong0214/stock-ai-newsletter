import { motion } from "framer-motion";

// 예시 데이터 (실제 이메일 템플릿과 동일한 구조)
const SAMPLE_STOCK = {
  name: "SK하이닉스",
  ticker: "000660",
  close_price: 428000,
  rationale: "[분산진입] 428,000원 중심 양방향 대응|20일 이평선 지지 확인|RSI 55 중립 상승|MACD 양전환 신호|거래량 평균 대비 145% 증가|ADX 25 추세 형성 단계|SuperTrend 매수 전환",
  levels: {
    entry1: 426000,
    entry2: 428000,
    entry3: 430000,
    sl1: 418000,
    sl2: 410000,
    sl3: 402000,
  },
};

function EmailPreviewSection() {
  return (
    <section className="relative py-16 lg:py-20 px-6 lg:px-8">
      <div className="max-w-4xl mx-auto relative z-10">
        {/* Simple Text Header - outside card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-8"
        >
          <p className="text-sm text-emerald-500 uppercase tracking-wider mb-4 font-medium">
            Newsletter Preview
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 leading-snug">
            매일 아침 받는
            <br />
            <span className="text-emerald-400">투자 인사이트</span>
          </h2>
          <p className="text-lg text-slate-400">
            AI 3개가 분석한 총 9개 종목 중 1개 예시
          </p>
        </motion.div>

        {/* Email Card Preview */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="bg-slate-900/90 rounded-xl shadow-xl overflow-hidden border border-emerald-500/20 will-change-transform"
          style={{ transform: 'translateZ(0)' }}
        >
          {/* AI Badge */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-700/50">
            <span className="inline-block px-4 py-2 bg-emerald-600 text-white text-xs font-semibold tracking-wider rounded-md">
              Gemini
            </span>
          </div>

          {/* Stock Card Content */}
          <div className="p-6">
            {/* Stock Header */}
            <div className="flex justify-between items-start mb-6 pb-6 border-b border-slate-700/50">
              <div>
                <h3 className="text-2xl font-semibold text-white mb-1">
                  {SAMPLE_STOCK.name}
                </h3>
                <p className="text-sm font-medium text-slate-400 uppercase tracking-wide">KOSPI:{SAMPLE_STOCK.ticker}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-400 mb-2">
                  전일 종가
                </p>
                <div className="inline-flex items-baseline gap-1 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                  <span className="text-2xl font-bold text-emerald-400 tabular-nums">
                    {SAMPLE_STOCK.close_price.toLocaleString()}
                  </span>
                  <span className="text-sm font-medium text-slate-400">원</span>
                </div>
              </div>
            </div>

            {/* Rationale */}
            <div className="mb-8">
              {SAMPLE_STOCK.rationale.split("|").map((reason, index) => (
                <div key={index} className="flex items-start gap-3 mb-3">
                  <span className="flex-shrink-0 w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2" />
                  <p className="text-base text-slate-300 leading-relaxed">
                    {reason.trim()}
                  </p>
                </div>
              ))}
            </div>

            {/* Entry & Stop-Loss Levels */}
            <div className="pt-6 border-t border-slate-700/50">
              {/* Entry Levels */}
              <div className="mb-6">
                <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-3">
                  진입 기회
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { level: "1단계", price: SAMPLE_STOCK.levels.entry1 },
                    { level: "2단계", price: SAMPLE_STOCK.levels.entry2 },
                    { level: "3단계", price: SAMPLE_STOCK.levels.entry3 },
                  ].map((entry) => (
                    <div
                      key={entry.level}
                      className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-center"
                    >
                      <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                        {entry.level}
                      </p>
                      <p className="text-lg font-bold text-emerald-300 tabular-nums">
                        {entry.price.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stop-Loss Levels */}
              <div>
                <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">
                  손절 라인
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { level: "1단계", price: SAMPLE_STOCK.levels.sl1 },
                    { level: "2단계", price: SAMPLE_STOCK.levels.sl2 },
                    { level: "3단계", price: SAMPLE_STOCK.levels.sl3 },
                  ].map((sl) => (
                    <div
                      key={sl.level}
                      className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center"
                    >
                      <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-2">
                        {sl.level}
                      </p>
                      <p className="text-lg font-bold text-red-300 tabular-nums">
                        {sl.price.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Additional Info with Beta Badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.0, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 flex flex-col items-center gap-4"
        >
          {/* Beta Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-medium text-emerald-400">
              베타 테스트 진행 중 • 무료 구독자 모집
            </span>
          </div>

          {/* Service Info */}
          <p className="text-sm text-slate-400 text-center">
            현재 <span className="text-emerald-400 font-semibold">Gemini</span> 3종목 제공 중{" "}
            <span className="text-slate-500">· GPT, Claude 추가 예정</span>
          </p>
        </motion.div>
      </div>
    </section>
  );
}

export default EmailPreviewSection;