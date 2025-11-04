/**
 * 아카이브 페이지 헤더
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
      <motion.h1
        {...createFadeInUpVariant(STAGGER_DELAYS.title)}
        className="mb-4 text-4xl sm:text-5xl lg:text-6xl font-extralight tracking-tight leading-[0.95]"
      >
        <span className="block text-emerald-500/90 mb-2">Newsletter</span>
        <span className="block font-normal bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400">
          Archive
        </span>
      </motion.h1>
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