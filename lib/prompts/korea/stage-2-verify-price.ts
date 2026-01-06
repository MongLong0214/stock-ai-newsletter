/**
 * Stage 2: 전일 종가 초정밀 검증 프롬프트 빌더
 * 환각 방지를 위한 동적 날짜 주입
 */

import type { DateContext } from './types';

/**
 * Stage 2 프롬프트 생성
 *
 * @param context - 날짜 컨텍스트 (동적 주입)
 * @returns Stage 2 프롬프트 문자열
 */
export function getStage2VerifyPrice(context: DateContext): string {
  const { today, targetDate, searchFormats, forbiddenYearThreshold } = context;

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STAGE 2: 필터링 된 30개 종목 전일 종가 초정밀 검증 v5.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚨🚨🚨 치명적 경고: 이 단계 실패 시 전체 분석 무효 🚨🚨🚨

⚠️ 검증된 전일 종가는 최종 JSON에 포함됩니다

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 날짜 컨텍스트 (사전 계산됨 - 신뢰하세요)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 오늘 날짜: ${today.korean}
🔴 분석 기준일 (target_date): ${targetDate.korean}
🔴 ISO 형식: ${targetDate.iso}
🔴 숫자 형식: ${targetDate.numeric}

⚠️ 위 날짜는 시스템에서 자동 계산된 정확한 값입니다.
⚠️ 주말/공휴일이 이미 제외되어 있습니다.
⚠️ 아래 검색 포맷을 그대로 사용하세요!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 검색용 날짜 포맷 (복사해서 사용)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Naver/Daum용: "${searchFormats.naverStyle}"
KRX용: "${searchFormats.krxStyle}"
ISO용: "${searchFormats.isoStyle}"
점 형식: "${searchFormats.dotStyle}"

══════════════════════════════════════════════════════════════
STEP 1: 5개 소스 동시 조회 (Google Search 필수)
══════════════════════════════════════════════════════════════

🔴 MANDATORY: 반드시 5개 소스 모두 Google Search로 조회!
🔴 위에서 제공된 정확한 날짜 포맷 사용!

소스1: 네이버증권
검색: "종목명 ${searchFormats.naverStyle} 종가 site:finance.naver.com"
확인: ✓종가(정수) ✓거래일(${targetDate.iso}) ✓거래량
기록: 소스1_가격 = [금액]원 (거래일: ${targetDate.iso})

소스2: 한국거래소
검색: "종목명 ${targetDate.numeric} 종가 site:data.krx.co.kr"
확인: ✓종가(정수) ✓거래일
기록: 소스2_가격 = [금액]원 (거래일: ${targetDate.iso})

소스3: 다음금융
검색: "종목명 ${searchFormats.isoStyle} 주가 site:finance.daum.net"
확인: ✓종가(정수) ✓거래일
기록: 소스3_가격 = [금액]원 (거래일: ${targetDate.iso})

소스4: 인베스팅닷컴
검색: "종목명 ${searchFormats.isoStyle} stock price KRW site:investing.com"
확인: ✓종가(KRW정수) ✓거래일
기록: 소스4_가격 = [금액]원 (거래일: ${targetDate.iso})

소스5: 서울경제/한국경제
검색: "종목명 ${searchFormats.naverStyle} 시세 site:sedaily.com"
또는: "종목명 ${searchFormats.naverStyle} 시세 site:hankyung.com"
확인: ✓종가(정수) ✓거래일
기록: 소스5_가격 = [금액]원 (거래일: ${targetDate.iso})

══════════════════════════════════════════════════════════════
STEP 2: 일치성 검증
══════════════════════════════════════════════════════════════

IF 5개 소스 중 3개 이상 정확히 일치:
   ✅ verified_close_price = 일치하는_값 (정수)
   ✅ confidence = 100%

ELSE IF 5개 소스 중 2개 일치 AND 둘 다 신뢰도 높은 소스:
   (신뢰도 높은 소스: naver, investing, krx, company_official)
   ⚠️ verified_close_price = 일치하는_값 (정수)
   ⚠️ confidence = 80%

ELSE:
   ❌ confidence < 80%
   ❌ 해당 종목 즉시 제외
   ❌ 다음 후보로 이동

══════════════════════════════════════════════════════════════
❌ 절대 금지 검색어
══════════════════════════════════════════════════════════════
❌ "종목명 전일 종가" (날짜 미지정)
❌ "종목명 어제 주가" (상대적 표현)
❌ "종목명 최근 종가" (모호함)
❌ "종목명 주가" (날짜 없음)
❌ [target_date] 플레이스홀더 사용 (실제 날짜 사용!)

✅ 올바른 형식
══════════════════════════════════════════════════════════════
✅ "종목명 ${searchFormats.naverStyle} 종가 site:도메인"
✅ "종목명 ${targetDate.numeric} 종가 site:도메인"
✅ "종목명 ${searchFormats.isoStyle} 주가 site:도메인"
✅ 정확한 날짜 포함 필수
✅ site: 도메인 지정 권장

══════════════════════════════════════════════════════════════
STEP 3: 합리성 검증 (Sanity Checks)
══════════════════════════════════════════════════════════════

일간변동률 검증:
  daily_change = ABS((전일 종가 - 전전일 종가) / 전전일 종가) × 100

  IF daily_change > 30%:
    🚨 상한가/하한가/거래정지 의심
    - "종목명 상한가 ${searchFormats.isoStyle} site:krx.co.kr" 검색
    - "종목명 공시 ${searchFormats.isoStyle} site:dart.fss.or.kr" 검색
    - 이상 확인 시 ❌ 종목 제외

  IF daily_change > 15% AND <= 30%:
    ⚠️ 급등/급락 재검증
    - "종목명 공시 ${searchFormats.isoStyle}" 검색
    - 중요 뉴스 확인

거래량 검증:
  volume_ratio = 전일거래량 / 평균20일거래량

  IF volume_ratio < 0.1:
    ⚠️ 유동성 부족 - 재검토

  IF volume_ratio > 10:
    🚨 이상 급등
    - "종목명 급등 이유 ${searchFormats.isoStyle}" 검색
    - 작전 의심 시 ❌ 제외

══════════════════════════════════════════════════════════════
STEP 4: 타임스탬프 동기화 검증
══════════════════════════════════════════════════════════════

검증:
  ✓ 모든 소스 거래일자 = ${targetDate.iso}?
  ✓ 장 마감(15:30) 이후 데이터?
  ✓ 확정 종가 (장중 가격 X)?

IF 불일치:
  ❌ 종목 제외
  ❌ 다른 거래일 혼용 금지

══════════════════════════════════════════════════════════════
절대 금지 (Zero Tolerance)
══════════════════════════════════════════════════════════════

❌ "약 XX원", "~원대", "추정", "근사치"
❌ 범위 (예: "75,000-76,000원")
❌ 단일 소스만으로 확정
❌ 캐시 데이터 재사용
❌ 소수점 가격 (75,300.5원)
❌ 날짜 없는 검색
❌ 모호한 표현 ("최근", "현재")
❌ ${forbiddenYearThreshold}년 이전 데이터 사용

══════════════════════════════════════════════════════════════
검증 완료 기준
══════════════════════════════════════════════════════════════

✅ 5개 중 3개 이상 정확히 일치 (100% confidence)
✅ 거래일자 = ${targetDate.iso} 확인
✅ 합리성 검증 통과
✅ 타임스탬프 동기화 확인
✅ 정수형 가격
✅ 장 마감 후 확정 종가

→ 모든 통과 후 STAGE 3 진행
→ 하나라도 실패 시 종목 제외

✅ 검증된 전일 종가는 close_price 필드로 JSON에 포함

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【검색 결과 파싱 필수 형식】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

각 소스 검색 후 반드시 아래 형식으로 기록:

소스1_결과:
  검색쿼리: "종목명 ${searchFormats.naverStyle} 종가 site:finance.naver.com"
  검색성공: true/false
  원문발췌: "... 종목명(종목코드) 종가 XX,XXX원 (${searchFormats.dotStyle}) ..."
  추출값: [정수]
  날짜확인: ${targetDate.iso} ✓

⚠️ 검색성공: false인 경우:
→ 추출값: null (절대로 값을 채우지 마세요)
→ 원문발췌: "검색 결과 없음" 또는 "날짜 불일치"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【검색 실패 시 의무 행동】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5개 소스 중 3개 미만 성공 시:

STEP A: 추가 검색 시도 (최대 3회)
  - 다른 날짜 형식: "${searchFormats.dotStyle}", "${searchFormats.krxStyle}"
  - 종목코드로 재검색: "종목코드 종가 ${searchFormats.isoStyle}"

STEP B: 추가 검색도 실패 시
  → 해당 종목 즉시 제외
  → close_price: null 표기
  → 다음 후보 종목으로 이동

⛔ 절대 금지:
  - "대략적인 값" 사용
  - "이전에 알고 있던 값" 사용
  - "계산으로 추정한 값" 사용
  - 학습 데이터에서 기억한 값 사용

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【STAGE 2 최종 출력 형식】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STAGE 2 완료: 30개 종목 전일 종가 검증 완료
기준일: ${targetDate.korean} (${targetDate.iso})

【종목 1】
ticker: [거래소:종목코드]
name: [종목명]
close_price: [검색으로 확인된 정수값]
confidence: 100%
verified_date: ${targetDate.iso}

【종목 2】
ticker: [거래소:종목코드]
name: [종목명]
close_price: [검색으로 확인된 정수값]
confidence: 100%
verified_date: ${targetDate.iso}

... (30개 종목 모두 동일한 형식)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 30개 종목 모두 전일 종가 검증 완료
✅ 기준일: ${targetDate.iso}
→ STAGE 3으로 전달
`;
}

