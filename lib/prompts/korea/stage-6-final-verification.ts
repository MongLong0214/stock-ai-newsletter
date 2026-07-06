/**
 * Stage 6: JSON 검증 엔진 프롬프트 빌더
 * 환각 방지를 위한 동적 날짜 주입
 */

import type { DateContext } from './types';

/**
 * Stage 6 프롬프트 생성
 *
 * @param context - 날짜 컨텍스트 (동적 주입)
 * @returns Stage 6 프롬프트 문자열
 */
export function getStage6FinalVerification(context: DateContext): string {
  const { targetDate, searchFormats, forbiddenYearThreshold } = context;

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STAGE 6: JSON 검증 엔진 - 사실관계 정밀 검증
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

실행 모드: 알고리즘 우선 | 배치 최적화 | 수학적 정밀성
임무: Stage 5 JSON 사실 검증 + 부정확 데이터 수정 + 검증된 JSON 출력

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 분석 기준일 (모든 검색에 사용)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 분석 기준일: ${targetDate.korean}
🔴 ISO 형식: ${targetDate.iso}
🔴 숫자 형식: ${targetDate.numeric}

📌 검색용 날짜 포맷:
   - Naver/Daum: "${searchFormats.naverStyle}"
   - KRX: "${searchFormats.krxStyle}"
   - ISO: "${searchFormats.isoStyle}"

⚠️ [target_date] 플레이스홀더 사용 금지 - 위 실제 날짜 사용!
⚠️ ${forbiddenYearThreshold}년 이전 데이터 절대 사용 금지!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

핵심_원칙:
  - 모든 수치/상태/가격은 검색 결과에서 확인 가능한 실제 현재 데이터만 사용한다.
  - ${targetDate.korean} 기준 값만 허용하며 과거 날짜 값은 사용 금지한다.
  - 검색 결과에 값/날짜가 명확하지 않으면 해당 지표를 삭제하고 "미검증" 표기를 금지한다.
  - 추정/보간/가정/전례값 사용을 금지하며, 확인되지 않은 값은 출력하지 않는다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

§1. 입력 인터페이스
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Stage5입력 {
  ticker: string;           // 형식: /^(KOSPI|KOSDAQ):\\d{6}$/
  name: string;             // 한글 회사명
  close_price: number;      // 전일 종가 (실시간, 정수 또는 실수)
  rationale: string;        // 파이프 구분 지표 문자열
  signals: {
    trend_score: number;      // 0-100 정수
    momentum_score: number;   // 0-100 정수
    volume_score: number;     // 0-100 정수
    volatility_score: number; // 0-100 정수
    pattern_score: number;    // 0-100 정수
    sentiment_score: number;  // 0-100 정수
    overall_score: number;    // 0-100 정수 (가중 평균)
  };
}

type Stage6입력타입 = Stage5입력[];  // 정확히 3개 종목

입력_검증_규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

필수_조건:
  종목.length === 3
  각 종목.ticker는 /^(KOSPI|KOSDAQ):\\d{6}$/ 형식 (시장구분은 실제 상장 시장과 일치)
  각 종목.close_price > 0
  각 종목.rationale !== ""

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

§2. 배치 검증 알고리즘
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

알고리즘 2.3: 배치 검색 실행 (Google Search Tool)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

도구_사양:
  도구명: Google Search (googleSearch)
  용도: 각 종목의 지표/종가를 배치 쿼리로 실검색하여 Stage 5 값과 대조

배치_검색_알고리즘
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

각 종목에 대해:

  // 배치 1: 핵심 숫자 지표
  검색쿼리_1 = 쿼리생성({
    종목코드: 종목.ticker.split(":")[1],
    종목명: 종목.name,
    키워드: ["RSI", "ADX", "ATR", "전일 종가"],
    날짜: "${searchFormats.naverStyle}",
    사이트필터: "finance.naver.com OR stockplus.com"
  })

  // 예시: "[종목명] [종목코드] RSI ADX ATR 전일 종가 ${searchFormats.naverStyle} site:finance.naver.com OR site:stockplus.com"

  // 배치 2: 거래량 및 가격 데이터
  검색쿼리_2 = 쿼리생성({
    종목코드: 종목.ticker.split(":")[1],
    키워드: ["전일 종가", "거래량", "평균거래량", "시가총액"],
    날짜: "${searchFormats.naverStyle}"
  })

  // 배치 3: 이동평균 및 추세 지표
  만약 종목.검증대상에 ("SMA"|"EMA"|"이평선") 포함:
    검색쿼리_3 = 쿼리생성({
      종목코드: 종목.ticker.split(":")[1],
      키워드: ["SMA", "EMA", "이동평균선", "정배열", "골든크로스"],
      날짜: "${searchFormats.naverStyle}"
    })

  // 배치 4: 오실레이터 (조건부)
  만약 종목.검증대상에 ("MACD"|"스토캐스틱"|"볼린저밴드") 포함:
    검색쿼리_4 = 쿼리생성({
      종목코드: 종목.ticker.split(":")[1],
      키워드: ["MACD", "스토캐스틱", "볼린저밴드"],
      날짜: "${searchFormats.naverStyle}"
    })

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

알고리즘 2.4: 실제 값 추출 (정밀 파싱) - 날짜 필터 적용
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

추출_실행
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

각 종목에 대해:
  실제값 = {}

  // 숫자 지표 추출
  추출패턴의 각 [지표명, 사양]에 대해:
    매칭배열 = []
    패턴 = new RegExp(사양.패턴)

    매칭 = null
    while ((매칭 = 패턴.exec(종목.검색결과텍스트)) !== null):
      원시값 = 사양.변환(매칭[1])

      // 날짜 필터: ${targetDate.iso} 값만 허용, 날짜 불명확 시 폐기
      만약 매칭.input에 "${searchFormats.naverStyle}" 또는 "${targetDate.iso}" 또는 "${searchFormats.dotStyle}" 표기가 없으면:
        계속

      만약 사양.검증(원시값):
        매칭배열.push({
          값: 원시값,
          출처: 매칭.input.substring(Math.max(0, 매칭.index - 50), 매칭.index + 50)
        })

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 환각 탐지 패턴 매칭 (강화)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

검증 시 아래 패턴이 발견되면 환각으로 간주:

패턴 1: 예시값 복사 의심
  IF close_price IN [75300, 142500, 215000, 52400, 85000, 50000, 100000]:
    → 재검색 필수 (이 값들은 프롬프트 예시값 또는 너무 깔끔한 값)
    → 검색 결과와 정확히 일치 확인 필요

패턴 2: 라운드 넘버 의심 (약한 신호 — 단독으로 제외 금지)
  IF close_price % 1000 == 0 AND close_price > 10000:
    → 재확인 권장. 단, 한국 주식 호가 단위 특성상 75,000원 같은
      라운드 종가는 정상적으로 존재하므로, 검색 결과와 일치하면 그대로 통과

패턴 3: 지표값 일관성 의심 (약한 신호 — 단독으로 제외 금지)
  IF RSI == 50 OR RSI == 55 OR RSI == 60 OR RSI == 65 OR RSI == 70:
    → 재확인 권장 (딱 떨어지는 값은 추정치일 가능성)
    → 검색 결과에서 동일 값이 확인되면 그대로 통과

패턴 4: 모든 지표가 긍정적
  IF 모든_지표_점수 >= 80:
    → 경고: 현실적이지 않음
    → 일부 지표는 중립/부정적이어야 정상

패턴 5: 날짜 불일치
  IF 검색결과_날짜 !== "${targetDate.iso}":
    → 해당 데이터 즉시 폐기
    → ${forbiddenYearThreshold}년 이전 데이터 절대 금지

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【close_price 2차 검증 의무】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Stage 6에서 모든 종목의 close_price를 반드시 재검증:

재검증_쿼리:
  "[종목명] [종목코드] 종가 ${searchFormats.naverStyle} site:finance.naver.com"

재검증_체크:
  □ Stage 2에서 기록한 값과 일치하는가?
  □ 검색 결과의 날짜가 ${targetDate.iso}와 정확한가?
  □ 3개 이상 소스에서 동일 값 확인했는가?

불일치 시:
  → 검색 결과 값으로 교체
  → 수정로그에 기록: "close_price 수정: [원본값] → [검색값] (검색결과)"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【최종 JSON 환각 체크리스트】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

JSON 출력 전 반드시 확인:

□ 1. close_price가 검색 결과에서 직접 추출된 값인가?
□ 2. rationale의 모든 수치에 출처가 있는가?
□ 3. 모든 날짜가 ${targetDate.iso}와 일치하는가?
□ 4. 점수 분포가 현실적인가? (모두 90점 이상은 의심)
□ 5. RSI/MACD 등 수치가 소수점 포함 실측값인가?

1개라도 미충족:
  → 해당 종목 재검증
  → 재검증 실패 시 제외

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

§4. 통합 오류 복구 시스템
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

알고리즘 4.2: 전체 검증 실패 처리
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

각 종목별_오류수 계산
실패_종목수 = 종목들.filter(종목 => 종목.검증실패 === true).length

만약 실패_종목수 >= 1:
  // 현재 데이터 확보 실패가 1개라도 있으면 즉시 중단

  로그.push({
    단계: "STAGE_6",
    상태: "재시도_필요",
    이유: "현재_데이터_확보_실패",
    실패종목수: 실패_종목수,
    조치: "STAGE_1부터_다른_종목으로_재시도"
  })

  // 재시도 신호 반환
  return JSON.stringify({
    error: "STAGE_6_VERIFICATION_FAILED",
    retry: true,
    details: {
      failed_stocks: 실패종목_목록,
      target_date: "${targetDate.iso}",
      recommendation: "STAGE 1부터 다른 종목으로 재시도 필요"
    }
  })

아니면:
  // 정상 처리: 검증된 종목 + 수정 로그 반환

  최종출력 = 종목들.map(종목 => ({
    ticker: 종목.ticker,
    name: 종목.name,
    close_price: 종목.close_price,
    rationale: 종목.수정된rationale,
    signals: 종목.조정된signals,
    verified_date: "${targetDate.iso}"
  }))

  return 최종출력

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

§5. 출력 인터페이스 및 검증
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Stage6출력 {
  ticker: string;           // /^(KOSPI|KOSDAQ):\\d{6}$/ (입력 ticker 그대로 유지, 시장구분 변조 금지)
  name: string;             // 한글 회사명
  close_price: number;      // 전일 종가 > 0
  rationale: string;        // 수정된 지표 문자열 (최소 10개)
  signals: {
    trend_score: number;      // 0-100 정수
    momentum_score: number;   // 0-100 정수
    volume_score: number;     // 0-100 정수
    volatility_score: number; // 0-100 정수
    pattern_score: number;    // 0-100 정수
    sentiment_score: number;  // 0-100 정수
    overall_score: number;    // 0-100 정수 (가중 평균)
  };
  verified_date: string;    // "${targetDate.iso}" 형식
}

type Stage6출력타입 = Stage6출력[];  // 정확히 3개 종목

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

§6. 실행 지시
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

이 사양서의 알고리즘을 사용하여 STAGE 6 실행:

실행_순서:
  1. Stage 5 JSON 파싱
  2. 배치 검증 실행
  3. 배치 검색 3-6개 실행 (날짜 필터: ${targetDate.iso})
  4. 실제 값 정밀 추출
  5. 지표 검증 및 수정
  6. 점수 재계산
  7. 통합 오류 복구
  8. 출력 검증
  9. 최종 JSON 반환

핵심_규칙:
  - GoogleSearchRetrieval API만 사용 (배치 최적화)
  - 모든 검색에 ${searchFormats.naverStyle} 또는 ${targetDate.iso} 포함
  - 검증 불가 시 즉시 삭제하고 재검증을 요청한다
  - 종목당 최소 10개 rationale 지표 필수
  - overall_score = 정확한 가중평균 공식
  - 검증 실패가 1개라도 있으면 재시도 신호 반환
  - 모든 오류는 복구 시도 후 로그 기록

STAGE 6 실행 시작.
기준일: ${targetDate.korean} (${targetDate.iso})
`;
}
