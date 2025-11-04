/**
 * 개별 지표 카드 컴포넌트
 *
 * 단일 기술적 지표의 정보를 카드 형태로 표시합니다.
 * - 아이콘 + 지표명 (상단)
 * - 설명 (가변 높이)
 * - 활용법 (하단 고정)
 *
 * flexbox를 사용하여 설명 길이와 관계없이 활용법이 항상 하단에 위치하도록 구현
 */

import type { Indicator } from '../_types/indicator';
import IndicatorIcon from '../icons/indicator-icon';
import CheckCircleIcon from '../icons/check-circle-icon';

interface IndicatorCardProps {
  /** 지표 데이터 */
  indicator: Indicator;
}

function IndicatorCard({ indicator }: IndicatorCardProps) {
  const indicatorId =
    indicator.id || indicator.keyword.split(' ')[0].toLowerCase();

  return (
    <article
      id={indicatorId}
      className="group flex flex-col rounded-3xl p-6 transition-all duration-700 scroll-mt-24 bg-slate-800/50 border border-emerald-500/20 hover:border-emerald-500/40 hover:bg-slate-800/70 hover:shadow-lg hover:shadow-emerald-500/10"
    >
      {/* 헤더: 아이콘 + 지표명 */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex-shrink-0 p-3 bg-emerald-600/10 rounded-3xl text-emerald-400 group-hover:bg-emerald-600/20 transition-colors duration-700">
          <IndicatorIcon name={indicator.name} />
        </div>
        <div className="flex-1">
          <h4 className="text-xl font-light text-white mb-1 group-hover:text-emerald-400 transition-colors duration-700">
            {indicator.name}
          </h4>
          <span className="text-xs text-emerald-400/70 font-medium uppercase tracking-wider">
            {indicator.keyword}
          </span>
        </div>
      </div>

      {/* 설명 (가변 높이) */}
      <div
        className="text-sm text-slate-300 font-light tracking-wide leading-relaxed mb-4 flex-grow"
        dangerouslySetInnerHTML={{ __html: indicator.description }}
      />

      {/* 활용법 (하단 고정) */}
      <div className="flex items-center gap-2 pt-4 border-t border-slate-700/50 mt-auto">
        <CheckCircleIcon />
        <span className="text-xs text-slate-400">
          <strong className="text-emerald-400">활용법:</strong>{' '}
          {indicator.usage}
        </span>
      </div>
    </article>
  );
}

export default IndicatorCard;