/**
 * 기술적 지표 아이콘 컴포넌트
 *
 * 지표명에 따라 적절한 SVG 아이콘을 렌더링합니다.
 * 모든 아이콘은 24x24 viewBox, 2px stroke width로 통일되어 있습니다.
 */

import { ICON_PATHS } from '../_constants/icon-paths';

interface IndicatorIconProps {
  /** 지표명 (한글) */
  name: string;
}

/** 공통 SVG 속성 */
const SVG_PROPS = {
  className: 'w-8 h-8',
  fill: 'none',
  stroke: 'currentColor',
  viewBox: '0 0 24 24',
  'aria-hidden': true as const,
} as const;

/** 공통 Path 속성 */
const PATH_PROPS = {
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  strokeWidth: 2,
} as const;

/**
 * 지표명 → 아이콘 경로 매핑
 *
 * 지표명에 키워드가 포함되어 있으면 해당 아이콘 경로를 반환합니다.
 */
function getIconPathsByName(name: string): readonly string[] {
  if (name.includes('RSI')) return ICON_PATHS.rsi;
  if (name.includes('MACD')) return ICON_PATHS.macd;
  if (name.includes('볼린저')) return ICON_PATHS.bollinger;
  if (name.includes('이동평균')) return ICON_PATHS.movingAverage;
  if (name.includes('스토캐스틱')) return ICON_PATHS.stochastic;
  if (name.includes('CCI')) return ICON_PATHS.cci;
  if (name.includes('거래량')) return ICON_PATHS.volume;
  if (name.includes('ADX')) return ICON_PATHS.adx;
  if (name.includes('일목균형표')) return ICON_PATHS.ichimoku;

  // 기본 폴백 아이콘 (RSI와 동일)
  return ICON_PATHS.rsi;
}

function IndicatorIcon({ name }: IndicatorIconProps) {
  const paths = getIconPathsByName(name);

  return (
    <svg {...SVG_PROPS}>
      {paths.map((d, index) => (
        <path key={index} {...PATH_PROPS} d={d} />
      ))}
    </svg>
  );
}

export default IndicatorIcon;