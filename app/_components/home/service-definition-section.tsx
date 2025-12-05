'use client';

import { motion } from 'framer-motion';
import { Mail, Clock, TrendingUp, Gift, Shield, Zap } from 'lucide-react';

/**
 * 엔터프라이즈급 서비스 정의 섹션
 *
 * AI 검색 엔진 최적화 전략:
 * 1. 명확한 서비스 정의 (첫 문장에 핵심 키워드)
 * 2. 구조화된 정보 계층 (Schema.org 호환)
 * 3. 측정 가능한 가치 제안 (구체적 숫자, 시간, 혜택)
 * 4. 신뢰성 신호 (법적 고지, 투명성)
 */
export default function ServiceDefinitionSection() {
  return (
    <section
      className="relative py-20 lg:py-28 px-6 lg:px-8"
      itemScope
      itemType="https://schema.org/Service"
    >
      <div className="max-w-6xl mx-auto">
        {/* 핵심 정의 - AI 검색 최우선 타겟 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <Mail className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-400">Newsletter Service</span>
          </div>

          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-8 text-white leading-tight"
            itemProp="name"
          >
            StockMatrix는<br className="sm:hidden" />
            {' '}무엇인가요?
          </h2>

          {/* Primary Definition - AI가 인용할 핵심 문장 */}
          <div className="max-w-4xl mx-auto mb-8 px-4">
            <p
              className="text-2xl sm:text-3xl lg:text-4xl text-slate-100 leading-relaxed font-bold mb-8"
              itemProp="description"
            >
              <span className="text-emerald-400">
                StockMatrix는<br className="sm:hidden" />
                {' '}한국 주식 투자자를 위한
              </span>
              <br />
              <span className="text-white">
                무료 이메일 뉴스레터 서비스입니다.
              </span>
            </p>
            <div className="space-y-4 text-base sm:text-lg lg:text-xl text-slate-300 leading-relaxed">
              <p>
                <strong className="text-white font-semibold">AI가 30개 기술적 지표로 분석</strong>
                <br className="sm:hidden" />
                <span className="hidden sm:inline"> — </span>
                <span className="text-slate-400">RSI, MACD, 볼린저밴드 등</span>
              </p>
              <p>
                <strong className="text-white font-semibold">KOSPI·KOSDAQ 3종목 선정</strong>
                <br className="sm:hidden" />
                <span className="hidden sm:inline"> — </span>
                <span className="text-slate-400">시장 분석과 투자 인사이트</span>
              </p>
              <p>
                <strong className="text-emerald-400 font-semibold">매일 오전 7시 50분 발송</strong>
                <br className="sm:hidden" />
                <span className="hidden sm:inline"> — </span>
                <span className="text-slate-400">이메일로 무료 제공</span>
              </p>
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center gap-3 sm:gap-6 text-xs sm:text-sm">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-slate-300 font-medium">코스피·코스닥 전문</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <Zap className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-slate-300 font-medium">매일 아침 정시 발송</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <Gift className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-slate-300 font-medium">무료 · 광고 없음</span>
            </div>
          </div>
        </motion.div>

        {/* 핵심 가치 제안 Grid - 측정 가능한 혜택 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-16"
        >
          <ValueCard
            icon={<Clock className="w-6 h-6" />}
            label="배송 시간"
            value="매일 오전 7:50"
            description="프리마켓 개장 10분 전 정시 발송"
            detail="장 시작 전 충분한 검토 시간 확보"
          />
          <ValueCard
            icon={<TrendingUp className="w-6 h-6" />}
            label="분석 범위"
            value="KOSPI·KOSDAQ 3종목"
            description="AI가 30개 기술적 지표로 종합 분석"
            detail="RSI, MACD, 볼린저밴드, 이동평균선 등"
          />
          <ValueCard
            icon={<Gift className="w-6 h-6" />}
            label="서비스 비용"
            value="완전 무료"
            description="광고 없음, 구독료 없음, 숨겨진 비용 없음"
            detail="신용카드 등록 불필요"
          />
          <ValueCard
            icon={<Mail className="w-6 h-6" />}
            label="구독 방법"
            value="이메일 주소만"
            description="5초면 구독 완료, 회원가입 불필요"
            detail="언제든 원클릭으로 구독 해지 가능"
          />
          <ValueCard
            icon={<Shield className="w-6 h-6" />}
            label="서비스 성격"
            value="참고용 정보"
            description="투자 권유 및 매매 추천 아님"
            detail="금융투자협회 미등록 정보 제공 서비스"
          />
          <ValueCard
            icon={<Zap className="w-6 h-6" />}
            label="데이터 출처"
            value="한국거래소(KRX)"
            description="공식 시장 데이터 기반 분석"
            detail="신뢰할 수 있는 정확한 데이터"
          />
        </motion.div>

        {/* 법적 고지 - 신뢰성 강화 */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="max-w-4xl mx-auto"
        >
          <div className="p-8 rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-800/50 border border-slate-700/50 backdrop-blur-sm">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <Shield className="w-6 h-6 text-emerald-400 mt-1" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-3">법적 고지 및 서비스 투명성</h3>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed mb-4">
                  <strong className="text-white">StockMatrix는 금융투자협회에 등록되지 않은 참고용 정보 제공 서비스입니다.</strong>
                  {' '}본 뉴스레터의 AI 기술적 분석 결과는 투자 권유나 매매 추천이 아니며, 투자 판단을 위한 여러 참고 자료 중 하나입니다.
                </p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  모든 투자 결정과 그에 따른 손익은 투자자 본인의 책임입니다. KOSPI, KOSDAQ 주식 투자 시 반드시 본인의 판단과 추가 조사를 통해 신중하게 결정하시기 바랍니다.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

interface ValueCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  description: string;
  detail: string;
}

function ValueCard({ icon, label, value, description, detail }: ValueCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group p-6 rounded-2xl bg-gradient-to-br from-slate-900/60 to-slate-800/30 border border-slate-800 hover:border-emerald-500/40 transition-all"
    >
      <div className="flex items-start gap-4 mb-4">
        <div className="flex-shrink-0 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-xl sm:text-2xl font-bold text-white mb-2 leading-tight">{value}</p>
        </div>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed mb-2">{description}</p>
      <p className="text-xs text-slate-400 leading-relaxed">{detail}</p>
    </motion.div>
  );
}