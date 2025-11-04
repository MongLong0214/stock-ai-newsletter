/**
 * 기술적 지표 타입 정의
 */

/** 개별 지표 데이터 */
export interface Indicator {
  /** 지표 고유 ID (옵션) */
  id?: string;
  /** 지표명 (한글) */
  name: string;
  /** 지표 키워드 (영문) */
  keyword: string;
  /** 지표 설명 (HTML) */
  description: string;
  /** 활용법 */
  usage: string;
}