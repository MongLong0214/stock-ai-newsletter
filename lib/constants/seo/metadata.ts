/**
 * 페이지 메타데이터 설정
 * Title, Description 등 페이지 메타 정보
 */

import type { MetadataConfig } from './types';
import { siteConfig } from './config';

const {
  deliveryTimeShort,
  indicatorCount,
  markets,
  stockCount,
  deliveryTime,
} = siteConfig;

export const metadataConfig: MetadataConfig = {
  title: `매일 ${deliveryTimeShort} AI 주식분석 무료 | StockMatrix`,
  titleTemplate: '%s | StockMatrix',
  description: `RSI·MACD·볼린저밴드·이동평균선·스토캐스틱 등 ${indicatorCount}개 지표로 AI가 분석한 ${markets} ${stockCount}종목을 매일 ${deliveryTime} 무료 이메일 발송. 투자 참고용 기술적 분석 뉴스레터. 지금 무료 구독하세요.`,
  descriptionShort: `${markets} ${stockCount}개 종목, AI 기술적 분석 뉴스레터 무료 발송`,
} as const;