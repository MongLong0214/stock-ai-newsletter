/**
 * 페이지 메타데이터 설정
 * Title, Description 등 페이지 메타 정보
 */

import type { MetadataConfig } from './types';
import { siteConfig } from './config';

const { indicatorCount, markets, stockCount, deliveryTime } = siteConfig;

export const metadataConfig: MetadataConfig = {
  title: 'StockMatrix | 무료 AI 주식 분석 뉴스레터',
  titleTemplate: '%s | StockMatrix',
  description: `한국 주식 투자자를 위한 무료 AI 주식 분석 뉴스레터. 매일 ${deliveryTime} AI가 ${indicatorCount}개 기술지표로 분석한 ${markets} ${stockCount}종목을 이메일로 제공합니다. 웹사이트에서는 250+ 테마 생명주기와 관련 종목 분석도 확인할 수 있습니다.`,
  descriptionShort: `매일 ${deliveryTime}, ${markets} ${stockCount}종목을 AI로 분석해 무료 이메일로 제공하는 한국 주식 뉴스레터. 웹사이트에서 250+ 테마 분석 제공`,
} as const;
