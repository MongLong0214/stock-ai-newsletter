/**
 * 페이지 메타데이터 설정
 * Title, Description 등 페이지 메타 정보
 */

import type { MetadataConfig } from './types';
import { siteConfig } from './config';

const { indicatorCount, markets, stockCount, deliveryTime } = siteConfig;

export const metadataConfig: MetadataConfig = {
  title: `StockMatrix — 한국 주식 무료 투자 뉴스레터`,
  titleTemplate: '%s | StockMatrix',
  description: `매일 ${deliveryTime} AI가 ${indicatorCount}개 기술지표로 분석한 ${markets} ${stockCount}종목 정보와 250+ 테마 생명주기를 무료 이메일로 제공하는 투자 뉴스레터.`,
  descriptionShort: `종목 분석·시장 전망·경제지표 업데이트를 이메일 뉴스레터로 전달하는 투자 의사결정 지원 서비스`,
} as const;