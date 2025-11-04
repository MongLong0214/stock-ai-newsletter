/**
 * 결론 + CTA 컴포넌트
 *
 * 구독 유도 메시지와 행동 유도 버튼을 표시합니다.
 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import { createFadeInVariant, ANIMATION_DELAYS } from '../_constants/animations';

interface ConclusionCTAProps {
  /** 결론 메시지 (HTML) */
  content: string;
}

function ConclusionCTA({ content }: ConclusionCTAProps) {
  return (
    <motion.div
      {...createFadeInVariant(ANIMATION_DELAYS.conclusion)}
      className="text-center bg-slate-800/30 border border-emerald-500/20 rounded-3xl p-8"
    >
      <div
        className="text-lg text-slate-200 font-light tracking-wide leading-relaxed mb-6"
        dangerouslySetInnerHTML={{ __html: content }}
      />
      <Link
        href="/subscribe"
        className="inline-block px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-lg rounded-3xl transition-all duration-700 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900"
        aria-label="무료 구독하고 AI 기술적 분석 받아보기"
      >
        무료 구독하고 AI 분석 받아보기
      </Link>
    </motion.div>
  );
}

export default ConclusionCTA;