/**
 * 지표 그리드 컴포넌트
 *
 * 기술적 지표 카드들을 반응형 3열 그리드로 표시합니다.
 */

import { motion } from 'framer-motion';
import { technicalIndicatorsContent } from '@/lib/constants/seo/technical-indicators-content';
import type { Indicator } from '../_types/indicator';
import { createFadeInVariant, ANIMATION_DELAYS } from '../_constants/animations';
import IndicatorCard from '../cards/indicator-card';

interface IndicatorsGridProps {
  /** 표시할 지표 목록 */
  indicators: Indicator[];
}

function IndicatorsGrid({ indicators }: IndicatorsGridProps) {
  return (
    <motion.div
      {...createFadeInVariant(ANIMATION_DELAYS.indicatorsGrid)}
      className="mb-16"
    >
      <h3 className="text-2xl md:text-3xl font-extralight text-emerald-500/80 tracking-tight mb-8 text-center">
        {technicalIndicatorsContent.mainIndicators.heading}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {indicators.map((indicator) => (
          <IndicatorCard key={indicator.keyword} indicator={indicator} />
        ))}
      </div>
    </motion.div>
  );
}

export default IndicatorsGrid;