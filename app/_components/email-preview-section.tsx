'use client';

import { motion } from "framer-motion";
import { useReveal } from "@/hooks/use-reveal";

// 예시 데이터 (실제 이메일 템플릿과 동일한 구조)
const SAMPLE_STOCK = {
  name: "삼성전자",
  ticker: "KOSPI:005930",
  close_price: 75300,
  rationale: "SMA 완전정배열|EMA 골든크로스|RSI 58 강세권|MACD 양전환|거래량 165% 급증|볼린저 중상단|ATR 3.2% 적정|ADX 28 강한추세|OBV 지속상승|스토캐스틱 상승전환|SuperTrend 매수|52주 상위 72%",
  signals: {
    trend_score: 88,
    momentum_score: 85,
    volume_score: 90,
    volatility_score: 82,
    pattern_score: 87,
    sentiment_score: 84,
    overall_score: 86,
  },
  analysis_depth: {
    indicators_collected: 30,
    tier1_success: "10/10",
    tier2_success: "10/10",
    tier3_success: "10/10",
    data_quality: "100%",
  },
  evidence: {
    verification_sources: 5,
    golden_crosses: ["EMA 5x20", "MACD", "Stochastic"],
    technical_pattern: "상승 삼각수렴",
  },
};

function EmailPreviewSection() {
  const { ref: headerRef, isInView: headerInView } = useReveal<HTMLDivElement>({
    once: true,
    amount: 0.3,
  });

  const { ref: cardRef, isInView: cardInView } = useReveal<HTMLDivElement>({
    once: true,
    amount: 0.2,
  });

  return (
    <section id="sample" className="relative py-16 lg:py-20 px-6 lg:px-8 scroll-mt-24">
      <div className="max-w-4xl mx-auto relative z-10">
        {/* Simple Text Header - outside card */}
        <motion.div
          ref={headerRef}
          initial={{ opacity: 0, y: 40 }}
          animate={headerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
          className="text-center mb-8"
        >
          <p className="text-sm text-emerald-500 uppercase tracking-wider mb-4 font-medium">
            Newsletter Preview
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 leading-snug">
            매일 아침 받는
            <br />
            <span className="text-emerald-400">기술적 분석 데이터</span>
          </h2>
        </motion.div>

        {/* Email Card Preview */}
        <motion.div
          ref={cardRef}
          initial={{ opacity: 0, y: 60 }}
          animate={cardInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
          className="bg-slate-900/90 rounded-xl shadow-xl overflow-hidden border border-emerald-500/20 will-change-transform"
          style={{ transform: 'translateZ(0)' }}
        >
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
            <div className="mb-6">
              {SAMPLE_STOCK.rationale.split("|").map((reason, index) => (
                <div key={index} className="flex items-start gap-3 mb-3">
                  <span className="flex-shrink-0 w-1.5 h-1.5 bg-sky-500 rounded-full mt-2" />
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {reason.trim()}
                  </p>
                </div>
              ))}
            </div>

            {/* Technical Signals Scores */}
            <div className="pt-6 border-t border-slate-700/50 mb-6">
              <p className="text-xs font-semibold text-sky-500 uppercase tracking-wider mb-4">
                기술적 신호 점수
              </p>

              <div className="space-y-3">
                {/* Trend Score */}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">추세 점수</span>
                  <span className={`px-3 py-1 rounded-md text-sm font-bold ${
                    SAMPLE_STOCK.signals.trend_score >= 70
                      ? 'bg-green-500/20 text-green-400'
                      : SAMPLE_STOCK.signals.trend_score >= 40
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {SAMPLE_STOCK.signals.trend_score}점
                  </span>
                </div>

                {/* Momentum Score */}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">모멘텀 점수</span>
                  <span className={`px-3 py-1 rounded-md text-sm font-bold ${
                    SAMPLE_STOCK.signals.momentum_score >= 70
                      ? 'bg-green-500/20 text-green-400'
                      : SAMPLE_STOCK.signals.momentum_score >= 40
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {SAMPLE_STOCK.signals.momentum_score}점
                  </span>
                </div>

                {/* Volume Score */}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">거래량 점수</span>
                  <span className={`px-3 py-1 rounded-md text-sm font-bold ${
                    SAMPLE_STOCK.signals.volume_score >= 70
                      ? 'bg-green-500/20 text-green-400'
                      : SAMPLE_STOCK.signals.volume_score >= 40
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {SAMPLE_STOCK.signals.volume_score}점
                  </span>
                </div>

                {/* Volatility Score */}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">변동성 점수</span>
                  <span className={`px-3 py-1 rounded-md text-sm font-bold ${
                    SAMPLE_STOCK.signals.volatility_score >= 70
                      ? 'bg-green-500/20 text-green-400'
                      : SAMPLE_STOCK.signals.volatility_score >= 40
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {SAMPLE_STOCK.signals.volatility_score}점
                  </span>
                </div>

                {/* Pattern Score */}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">패턴 점수</span>
                  <span className={`px-3 py-1 rounded-md text-sm font-bold ${
                    SAMPLE_STOCK.signals.pattern_score >= 70
                      ? 'bg-green-500/20 text-green-400'
                      : SAMPLE_STOCK.signals.pattern_score >= 40
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {SAMPLE_STOCK.signals.pattern_score}점
                  </span>
                </div>

                {/* Sentiment Score */}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">심리 점수</span>
                  <span className={`px-3 py-1 rounded-md text-sm font-bold ${
                    SAMPLE_STOCK.signals.sentiment_score >= 70
                      ? 'bg-green-500/20 text-green-400'
                      : SAMPLE_STOCK.signals.sentiment_score >= 40
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {SAMPLE_STOCK.signals.sentiment_score}점
                  </span>
                </div>

                {/* Overall Score */}
                <div className="flex justify-between items-center pt-10 border-t border-slate-700/50">
                  <span className="text-base font-semibold text-white leading-none">종합 점수</span>
                  <span className={`inline-flex items-center justify-center px-4 py-2 rounded-lg text-base font-bold leading-none ${
                    SAMPLE_STOCK.signals.overall_score >= 70
                      ? 'bg-green-600 text-white'
                      : SAMPLE_STOCK.signals.overall_score >= 40
                      ? 'bg-yellow-600 text-white'
                      : 'bg-red-600 text-white'
                  }`}>
                    {SAMPLE_STOCK.signals.overall_score}점
                  </span>
                </div>
              </div>
            </div>

          </div>
        </motion.div>


      </div>
    </section>
  );
}

export default EmailPreviewSection;