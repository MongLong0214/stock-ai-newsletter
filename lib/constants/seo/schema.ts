/**
 * JSON-LD 스키마 설정
 * 구조화된 데이터를 위한 스키마 설명
 */

import type { SchemaConfig } from './types';
import { siteConfig } from './config';

const {
  serviceName,
  markets,
  stockCount,
  deliveryTime,
  indicatorCount,
} = siteConfig;

export const schemaConfig: SchemaConfig = {
  websiteDesc: `AI가 RSI, MACD, 볼린저밴드 등 기술적 지표로 분석한 ${markets} ${stockCount}개 종목의 참고용 데이터를 매일 ${deliveryTime} 무료로 받아보세요. 투자 권유가 아닌 기술적 분석 뉴스레터`,
  serviceName: `${serviceName} - AI 주식 기술적 분석 뉴스레터`,
  serviceDesc: `AI가 RSI(상대강도지수), MACD(이동평균수렴확산), 볼린저밴드, 이동평균선 등 ${indicatorCount}개 기술적 지표로 분석한 ${markets} ${stockCount}개 종목의 참고용 데이터를 매일 ${deliveryTime} 무료 이메일 발송. 투자 권유나 매매 추천이 아닌 기술적 분석 정보만 제공하는 뉴스레터.`,
} as const;