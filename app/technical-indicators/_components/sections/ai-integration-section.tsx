/**
 * AI 통합 섹션 컴포넌트
 *
 * AI가 30개 이상의 기술적 지표를 종합 분석하는 방식을 설명합니다.
 */

import { motion } from 'framer-motion';
import { createFadeInVariant, ANIMATION_DELAYS } from '../_constants/animations';

interface AIIntegrationSectionProps {
  /** 섹션 제목 */
  heading: string;
  /** 섹션 내용 (HTML) */
  content: string;
}

function AIIntegrationSection({
  heading,
  content,
}: AIIntegrationSectionProps) {
  return (
    <motion.div
      {...createFadeInVariant(ANIMATION_DELAYS.aiIntegration)}
      className="bg-gradient-to-br from-slate-800/50 to-emerald-900/10 border border-emerald-500/20 rounded-3xl p-8 md:p-10 mb-12"
    >
      <h3 className="text-2xl md:text-3xl font-extralight text-emerald-500/80 tracking-tight mb-6">
        {heading}
      </h3>
      <div
        className="text-base text-slate-300 font-light tracking-wide leading-relaxed space-y-4 whitespace-pre-line"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </motion.div>
  );
}

export default AIIntegrationSection;