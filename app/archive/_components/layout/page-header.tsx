/**
 * 분석 기록 페이지 헤더
 *
 * 페이지 제목과 설명을 표시합니다.
 */

import { motion } from 'framer-motion';
import {
  createFadeInUpVariant,
  STAGGER_DELAYS,
} from '../../_constants/animations';

function PageHeader() {
  return (
    <motion.header
      {...createFadeInUpVariant(STAGGER_DELAYS.header)}
      className="mb-12 text-center lg:text-left"
    >
      {/* 시각적 타이틀 — 시맨틱 h1은 archive/layout.tsx(SSR)에 있으므로 여기선 div로 중복 h1 방지 */}
      <motion.div
        {...createFadeInUpVariant(STAGGER_DELAYS.title)}
        className="mb-4 text-4xl sm:text-5xl lg:text-6xl font-extralight tracking-tight leading-[0.95]"
      >
        <span className="block text-emerald-500/90 mb-2">뉴스레터</span>
        <span className="block font-normal bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400">
          분석 기록
        </span>
      </motion.div>
      <motion.p
        {...createFadeInUpVariant(STAGGER_DELAYS.description)}
        className="text-lg text-white font-light leading-relaxed"
      >
        과거 발송된 AI 주식 분석 뉴스레터를 날짜별로 확인하세요
      </motion.p>
    </motion.header>
  );
}

export default PageHeader;