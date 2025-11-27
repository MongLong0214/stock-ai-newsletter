// 환경변수를 가장 먼저 로드
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// 로컬 환경에서만 .env.local 로드
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
}

import { sendStockNewsletter } from '@/lib/sendgrid';
import { getNasdaqGeminiRecommendation } from '@/lib/llm/nasdaq/gemini';

async function sendNasdaqEmailToMe() {
  console.log('🇺🇸 NASDAQ 뉴스레터 테스트 이메일 발송 시작...\n');

  try {
    // 테스트 수신자 (본인 이메일)
    const testRecipient = {
      email: 'chowonil0214@naver.com',
      name: '테스트',
    };

    console.log(`📧 수신자: ${testRecipient.email}\n`);

    // NASDAQ Gemini AI 분석 실행
    console.log('🤖 NASDAQ Gemini 분석 실행 중...\n');
    const geminiAnalysis = await getNasdaqGeminiRecommendation();

    // GPT, Claude는 서비스 준비 중 (빈 문자열)
    const gptAnalysis = '';
    const claudeAnalysis = '';

    // 뉴스레터 데이터 생성
    const newsletterData = {
      gptAnalysis,
      claudeAnalysis,
      geminiAnalysis,
      date: new Date().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Seoul',
      }),
    };

    console.log(`📅 발송 날짜: ${newsletterData.date}\n`);
    console.log('📧 이메일 발송 중...\n');

    // SendGrid로 뉴스레터 전송
    await sendStockNewsletter([testRecipient], newsletterData);

    console.log('\n━'.repeat(80));
    console.log('✨ NASDAQ 테스트 이메일 발송 완료!');
    console.log('━'.repeat(80));
    console.log(`\n📬 ${testRecipient.email}로 NASDAQ 뉴스레터 발송 완료`);
    console.log(`📅 발송 날짜: ${newsletterData.date}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ NASDAQ 테스트 이메일 발송 실패:', error);
    process.exit(1);
  }
}

sendNasdaqEmailToMe();