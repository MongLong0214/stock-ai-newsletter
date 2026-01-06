/**
 * 한국 주식 분석 프롬프트 타입 정의
 * 환각(Hallucination) 방지를 위한 런타임 날짜 컨텍스트
 */

/**
 * 날짜 정보 구조체
 */
export interface DateInfo {
  /** Date 객체 */
  date: Date;
  /** 한국어 전체 포맷: "2026년 1월 6일 (월요일)" */
  korean: string;
  /** ISO 포맷: "2026-01-06" */
  iso: string;
  /** 숫자 포맷: "20260106" */
  numeric: string;
}

/**
 * 검색용 날짜 포맷 (target_date 전용)
 */
export interface TargetDateInfo extends DateInfo {
  /** 검색용 한국어: "2026년 1월 6일" (요일 없음) */
  koreanForSearch: string;
}

/**
 * 다양한 검색 서비스별 날짜 포맷
 * 각 서비스마다 인식하는 날짜 형식이 다름
 */
export interface SearchFormats {
  /** Naver 스타일: "2026년 1월 6일" */
  naverStyle: string;
  /** KRX 스타일: "2026/01/06" */
  krxStyle: string;
  /** ISO 스타일: "2026-01-06" */
  isoStyle: string;
  /** 점 스타일: "2026.01.06" */
  dotStyle: string;
}

/**
 * 프롬프트 빌더에 주입되는 날짜 컨텍스트
 * 모든 stage에서 동일한 날짜 정보 사용 보장
 */
export interface DateContext {
  /** 오늘 날짜 정보 (프롬프트 실행 시점) */
  today: DateInfo;
  /** 전일 거래일 정보 (분석 기준일) */
  targetDate: TargetDateInfo;
  /** 검색 서비스별 날짜 포맷 */
  searchFormats: SearchFormats;
  /** 현재 연도 */
  currentYear: number;
  /** 금지 연도 임계값 (이 연도 이전 데이터 사용 금지) */
  forbiddenYearThreshold: number;
}
