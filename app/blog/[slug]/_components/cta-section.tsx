import Link from 'next/link';
import { ArrowRight, Mail } from 'lucide-react';

/**
 * CTA 섹션 컴포넌트
 * Stock Matrix 구독 유도
 */
export function CTASection() {
  return (
    <section className="mt-16 p-8 md:p-10 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-slate-900/50 to-slate-900/30 border border-emerald-500/20 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.1),transparent_50%)]" />

      <div className="relative">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/20">
            <Mail className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-white">매일 아침 주식 분석을 받아보세요</h3>
        </div>

        <p className="text-slate-300 mb-6 max-w-xl">
          Stock Matrix는 30개 기술지표를 분석해 매일 오전 7시 50분 유망 종목 3개를 선정합니다.
          무료로 구독하고 데이터 기반 투자를 시작하세요.
        </p>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/subscribe"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-lg transition-colors"
          >
            무료 구독하기
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/archive"
            className="inline-flex items-center gap-2 px-6 py-3 border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors"
          >
            지난 분석 보기
          </Link>
        </div>
      </div>
    </section>
  );
}