// Gemini API 테스트 스크립트
require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require('@google/genai');

const genAI = new GoogleGenAI({});

const STOCK_PROMPT = `당신은 월스트리트에서 경력 20년차 업계 상위 0.1% 실력의 프로페셔널 'K-Stock Tactical Analyst'입니다.
KOSPI/KOSDAQ 상장 종목 중 1주 내 최소 10% 이상 상승이 높은 확률로 가능한 종목 5개를 기술적 지표를 분석하여 추천합니다.

**절대 금지 사항:**
* 뉴스·공시·재무제표·애널리스트 리포트·정책 언급 일체 금지
* 기술적 분석에만 집중

**분석 지표 (모두 참고):**
1. 가격/모멘텀 지표: 이동평균선(5,10,20,60,120일), RSI(14), Stochastic(14,3,3), MACD(12,26,9)
2. 거래량 지표: 거래량 추세, OBV, CMF(20), MFI(14)
3. 변동성 지표: ATR(14), 볼린저밴드(20,2σ)
4. 추세 지표: ADX(14), Parabolic SAR, SuperTrend(10,3)
5. 시장 심리: A/D Line, Chaikin Oscillator, 체결강도

**추천 기준:**
- 상승 모멘텀이 시작되거나 지속 중인 종목
- 거래량이 뒷받침되는 움직임
- 주요 지지선/저항선 돌파
- 과매수/과매도 구간 고려

**JSON 형식으로만 출력:**
[
  {
    "ticker": "KOSPI:005930",
    "name": "삼성전자",
    "current_price": 75000,
    "rationale": "EMA20 상향돌파(+2.3%)|RSI 58 중립권 상승|MACD 히스토그램 양전환|거래량 3일 평균 165% 급증|ADX 28 추세 강화|Stochastic 골든크로스 발생",
    "entry_price": 74500,
    "stop_loss": 72000
  }
]

**출력 규칙:**
- ticker: "KOSPI|KOSDAQ:6자리코드"
- name: 한글 종목명
- current_price: 현재가 추정치 (정수)
- rationale: 파이프(|) 구분 6~8개 핵심 근거, 구체적 수치 포함
- entry_price: 진입가 (현재가의 -0.5% ~ -2%)
- stop_loss: 손절가 (현재가의 -8% ~ -10%)

**절대 금지:**
- JSON 외 텍스트·주석·마크다운
- 코드블록 마커 없이 순수 JSON만 출력
- 뉴스·공시·재무·이벤트 언급

상위 5개 종목을 추천 순위대로 JSON 배열로 출력하세요.`;

async function testGemini() {
  console.log('🚀 Gemini API 테스트 시작...\n');
  console.log('API Key:', process.env.GEMINI_API_KEY ? '✅ 설정됨' : '❌ 없음');
  console.log('API Key 앞 20자:', process.env.GEMINI_API_KEY?.substring(0, 20) + '...\n');

  try {
    console.log('📡 Gemini에 요청 전송 중...\n');
    const startTime = Date.now();

    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: STOCK_PROMPT,
      config: {
        maxOutputTokens: 3000,
        temperature: 0.7
      }
    });
    const result = response.text;

    const duration = Date.now() - startTime;

    console.log('✅ 응답 성공! (소요 시간:', duration, 'ms)\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Gemini 추천 결과:\n');
    console.log(result);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // JSON 파싱 테스트
    try {
      const cleanedResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanedResult);
      console.log('✅ JSON 파싱 성공!');
      console.log('📈 추천 종목 수:', parsed.length);
      parsed.forEach((stock, index) => {
        console.log(`\n${index + 1}. ${stock.name} (${stock.ticker})`);
        console.log(`   현재가: ${stock.current_price?.toLocaleString()}원`);
        console.log(`   진입가: ${stock.entry_price?.toLocaleString()}원`);
        console.log(`   손절가: ${stock.stop_loss?.toLocaleString()}원`);
      });
    } catch (parseError) {
      console.log('⚠️ JSON 파싱 실패 (응답은 받았지만 형식이 다름)');
      console.log('파싱 에러:', parseError.message);
    }

  } catch (error) {
    console.error('❌ Gemini API 에러:\n');
    console.error('에러 타입:', error.constructor.name);
    console.error('에러 메시지:', error.message);

    if (error.message.includes('API_KEY_INVALID')) {
      console.error('\n💡 해결 방법: API 키가 올바른지 확인하세요.');
      console.error('   Google AI Studio (https://ai.google.dev)에서 새 키 발급');
    } else if (error.message.includes('quota')) {
      console.error('\n💡 해결 방법: API 사용량 한도 초과. 잠시 후 다시 시도하세요.');
    } else if (error.message.includes('timeout')) {
      console.error('\n💡 해결 방법: 네트워크 연결을 확인하세요.');
    }

    console.error('\n전체 에러 정보:', error);
  }
}

testGemini();