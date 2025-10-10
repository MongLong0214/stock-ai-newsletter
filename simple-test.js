// 간단한 Gemini API 테스트
require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require('@google/genai');

const genAI = new GoogleGenAI({});

// 새 SDK의 모델 이름들
const modelsToTry = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

async function testModel(modelName) {
  try {
    console.log(`\n🧪 테스트 중: ${modelName}`);

    const response = await genAI.models.generateContent({
      model: modelName,
      contents: '안녕하세요'
    });
    const text = response.text;

    console.log(`✅ 성공! 응답: ${text.substring(0, 50)}...`);
    return modelName;

  } catch (error) {
    console.log(`❌ 실패: ${error.message.substring(0, 80)}...`);
    return null;
  }
}

async function findWorkingModel() {
  console.log('🔍 Gemini API 키 테스트 중...\n');
  console.log('API Key:', process.env.GEMINI_API_KEY ? '✅ 설정됨' : '❌ 없음');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const modelName of modelsToTry) {
    const workingModel = await testModel(modelName);
    if (workingModel) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`\n🎉 작동하는 모델 발견: ${workingModel}`);
      console.log('\n이 모델명을 코드에 사용하세요!');
      return;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n❌ 모든 모델 테스트 실패');
  console.log('\n💡 해결 방법:');
  console.log('1. Google AI Studio (https://ai.google.dev) 접속');
  console.log('2. 새 API 키 발급');
  console.log('3. .env.local의 GEMINI_API_KEY 교체');
}

findWorkingModel();