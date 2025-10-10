import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
  maxRetries: 2,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 30000,
  maxRetries: 2,
});

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

async function retry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retry(fn, retries - 1, delay * 2);
  }
}

export async function getGPTRecommendation(): Promise<string> {
  try {
    const result = await retry(async () => {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: '당신은 20년 경력의 한국 주식 시장 전문 애널리스트입니다.',
          },
          { role: 'user', content: STOCK_PROMPT },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });
      return completion.choices[0]?.message?.content || null;
    });

    if (!result) throw new Error('Empty response');
    return result;
  } catch (error) {
    console.error('GPT Error:', error);
    return '⚠️ GPT 추천을 가져올 수 없습니다. 잠시 후 다시 시도해주세요.';
  }
}

export async function getClaudeRecommendation(): Promise<string> {
  try {
    const result = await retry(async () => {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [{ role: 'user', content: STOCK_PROMPT }],
      });
      const textContent = message.content.find((block) => block.type === 'text');
      return textContent && textContent.type === 'text' ? textContent.text : null;
    });

    if (!result) throw new Error('Empty response');
    return result;
  } catch (error) {
    console.error('Claude Error:', error);
    return '⚠️ Claude 추천을 가져올 수 없습니다. 잠시 후 다시 시도해주세요.';
  }
}

export async function getGeminiRecommendation(): Promise<string> {
  try {
    const result = await retry(async () => {
      const response = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: STOCK_PROMPT,
        config: {
          maxOutputTokens: 3000,
          temperature: 0.7
        }
      });
      return response.text || '';
    });

    if (!result) throw new Error('Empty response');
    return result;
  } catch (error) {
    console.error('Gemini Error:', error);
    return '⚠️ Gemini 추천을 가져올 수 없습니다. 잠시 후 다시 시도해주세요.';
  }
}