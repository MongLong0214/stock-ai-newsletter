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
  websiteDesc: `AI가 RSI, MACD, 볼린저밴드 등 기술적 지표로 분석한 ${markets} ${stockCount}개 종목의 참고용 데이터를 매일 ${deliveryTime} 무료로 받아보세요. 한국 주식 투자자를 위한 무료 뉴스레터 서비스로 투자 권유가 아닌 기술적 분석 정보를 이메일로 제공합니다.`,
  serviceName: `${serviceName} - 코스피 코스닥 주식 AI 기술적 분석 뉴스레터`,
  serviceDesc: `AI가 RSI(상대강도지수), MACD(이동평균수렴확산), 볼린저밴드, 이동평균선 등 ${indicatorCount}개 기술적 지표로 분석한 ${markets} ${stockCount}개 종목의 참고용 데이터를 매일 ${deliveryTime} 무료 이메일로 발송하는 뉴스레터 서비스. 투자 권유나 매매 추천이 아닌 기술적 분석 정보만 제공하며, 한국 주식 투자 의사결정을 돕는 참고용 뉴스레터입니다.`,
} as const;