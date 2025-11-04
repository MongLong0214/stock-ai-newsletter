/**
 * 섹션 헤더 컴포넌트
 *
 * 기술적 지표 페이지의 제목과 소개 텍스트를 표시합니다.
 */

import { motion } from 'framer-motion';
import { createFadeInVariant, ANIMATION_DELAYS } from '../_constants/animations';

interface SectionHeaderProps {
  /** 페이지 제목 */
  title: string;
  /** 소개 텍스트 (HTML) */
  introduction: string;
}

function SectionHeader({ title, introduction }: SectionHeaderProps) {
  return (
    <motion.header
      {...createFadeInVariant(ANIMATION_DELAYS.header)}
      className="text-center mb-12"
    >
      <p className="text-sm text-emerald-500 uppercase tracking-wider mb-4 font-medium">
        Technical Indicators
      </p>
      <h2
        id="technical-indicators-heading"
        className="text-3xl md:text-4xl font-extralight text-emerald-500/80 tracking-tight mb-4"
      >
        {title}
      </h2>
      <div
        className="text-base md:text-lg text-slate-300 font-light tracking-wide leading-relaxed max-w-3xl mx-auto"
        dangerouslySetInnerHTML={{ __html: introduction }}
      />
    </motion.header>
  );
}

export default SectionHeader;
