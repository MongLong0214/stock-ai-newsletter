/**
 * JSON-LD 스키마 설정
 * 구조화된 데이터를 위한 스키마 설명
 */

import type { SchemaConfig } from './types';
import { siteConfig } from './config';

export const NAVER_DATALAB_DATASET_SCHEMA = {
  '@type': 'Dataset',
  name: '네이버 데이터랩 검색어 트렌드',
  description: '네이버 통합검색에서 특정 검색어가 검색된 횟수를 기간 내 최대값 100 기준 상대 지표로 제공하는 네이버의 공개 검색 트렌드 데이터.',
  url: 'https://datalab.naver.com/keyword/trendSearch.naver',
  creator: {
    '@type': 'Organization',
    name: '네이버',
    url: 'https://www.naver.com',
  },
} as const;

const {
  serviceName,
  markets,
  stockCount,
  deliveryTime,
  indicatorCount,
} = siteConfig;

export const schemaConfig: SchemaConfig = {
  websiteDesc: `한국 주식 투자자를 위한 무료 AI 주식 분석 뉴스레터 서비스입니다. AI가 RSI, MACD, 볼린저밴드 등 기술적 지표로 분석한 ${markets} ${stockCount}개 종목을 매일 ${deliveryTime} 이메일로 제공하며, 웹사이트에서는 ${siteConfig.themeCountFloor}+ 테마 생명주기와 관련 종목 분석을 확인할 수 있습니다.`,
  serviceName: `${serviceName} - 코스피 코스닥 주식 AI 기술적 분석 뉴스레터`,
  serviceDesc: `한국 주식 투자자를 위한 무료 AI 주식 분석 뉴스레터 서비스입니다. AI가 RSI(상대강도지수), MACD(이동평균수렴확산), 볼린저밴드, 이동평균선 등 ${indicatorCount}개 기술적 지표로 분석한 ${markets} ${stockCount}개 종목을 매일 ${deliveryTime} 무료 이메일로 발송합니다. 웹사이트에서는 200+ 테마 생명주기 데이터를 추가로 제공합니다. 투자 권유나 매매 추천이 아닌 참고용 기술적 분석 정보만 제공합니다.`,
} as const;
