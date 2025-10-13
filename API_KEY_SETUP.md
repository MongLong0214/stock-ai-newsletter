# LLM API 키 발급 가이드

각 AI 서비스의 API 키를 발급받고 설정하는 방법입니다.

## 1. OpenAI (GPT-4o) API 키 발급

### 발급 방법
1. **OpenAI Platform 접속**: https://platform.openai.com/signup
2. **계정 생성 또는 로그인**
3. **API Keys 페이지 이동**: https://platform.openai.com/api-keys
4. **"Create new secret key" 버튼 클릭**
5. **키 이름 입력** (예: "stock-newsletter")
6. **API 키 복사** (⚠️ 한 번만 표시되므로 반드시 복사!)

### 가격 정보
- **무료 크레딧**: 신규 가입 시 $5 무료 크레딧 제공 (3개월 유효)
- **GPT-4o 가격**:
  - Input: $2.50 / 1M tokens
  - Output: $10.00 / 1M tokens
- **예상 비용**: 매일 1회 실행 시 월 $5-10 예상

### API 키 형식
- `sk-proj-...` 또는 `sk-...` 형태 (48-51자)

---

## 2. Anthropic (Claude Sonnet 4.5) API 키 발급

### 발급 방법
1. **Anthropic Console 접속**: https://console.anthropic.com/
2. **계정 생성 또는 로그인** (Google 계정으로 가능)
3. **API Keys 메뉴 클릭**: https://console.anthropic.com/settings/keys
4. **"Create Key" 버튼 클릭**
5. **키 이름 입력** (예: "stock-newsletter")
6. **API 키 복사** (⚠️ 한 번만 표시되므로 반드시 복사!)

### 가격 정보
- **무료 크레딧**: 신규 가입 시 $5 무료 크레딧 제공
- **Claude Sonnet 4.5 가격**:
  - Input: $3.00 / 1M tokens
  - Output: $15.00 / 1M tokens
- **예상 비용**: 매일 1회 실행 시 월 $6-12 예상

### API 키 형식
- `sk-ant-api03-...` 형태 (108자)

---

## 3. Google (Gemini 2.0 Flash) API 키 발급

### 발급 방법
1. **Google AI Studio 접속**: https://aistudio.google.com/app/apikey
2. **Google 계정으로 로그인**
3. **"Get API key" 또는 "Create API key" 버튼 클릭**
4. **새 프로젝트 선택 또는 기존 프로젝트 선택**
5. **API 키 복사**

### 가격 정보
- **무료 할당량**:
  - Gemini 2.0 Flash: 1,500 requests/day (RPD)
  - 1,000,000 tokens/minute (TPM)
- **유료 전환 후**:
  - Input: $0.075 / 1M tokens
  - Output: $0.30 / 1M tokens
- **예상 비용**: 무료 할당량 내에서 충분히 사용 가능!

### API 키 형식
- `AIza...` 형태 (39자)

---

## 4. 환경 변수 설정

발급받은 API 키를 `.env.local` 파일에 추가하세요:

```bash
# 프로젝트 루트에서 실행
cp .env.example .env.local  # .env.example이 있다면
```

`.env.local` 파일에 다음 내용 추가:

```env
# OpenAI API Key
OPENAI_API_KEY=sk-proj-your-actual-key-here

# Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key-here

# Google Gemini API Key
GEMINI_API_KEY=AIzaYour-actual-key-here

# 기타 필수 환경 변수들 (기존에 설정되어 있어야 함)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
CRON_SECRET=your-32-character-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 5. API 키 테스트

모든 API 키를 설정한 후 다음 명령어로 테스트:

```bash
npm run test:llm
```

또는 직접 실행:

```bash
npx tsx scripts/test-llm-apis.ts
```

---

## 비용 최적화 팁

### 1. 가장 저렴한 옵션 선택
**추천 조합**: Gemini 2.0 Flash만 사용
- Gemini는 무료 할당량(1,500 req/day)이 매우 크므로 매일 1-3회 실행 시 **완전 무료**
- 성능도 GPT-4/Claude와 유사한 수준

### 2. 선택적 사용
`.env.local`에서 사용하지 않을 API 키는 주석 처리:

```env
# OPENAI_API_KEY=sk-proj-...
# ANTHROPIC_API_KEY=sk-ant-api03-...
GEMINI_API_KEY=AIzaYour-key  # Gemini만 사용
```

### 3. 실행 빈도 조절
- **테스트 기간**: 주 1-2회만 실행하여 API 사용량 확인
- **정식 운영**: 매일 1회 또는 주 3회 실행으로 비용 절감

---

## 보안 주의사항

⚠️ **중요**: API 키는 절대 GitHub에 커밋하지 마세요!

`.gitignore`에 다음이 포함되어 있는지 확인:

```
.env
.env.local
.env*.local
```

API 키가 GitHub에 실수로 노출된 경우:
1. 즉시 해당 키를 삭제 (각 플랫폼의 API Keys 페이지에서)
2. 새 키를 발급받아 교체

---

## 문제 해결

### "API 키가 설정되지 않았습니다" 에러
- `.env.local` 파일이 프로젝트 루트에 있는지 확인
- API 키가 정확히 복사되었는지 확인 (앞뒤 공백 없이)
- 개발 서버 재시작: `npm run dev` 종료 후 재실행

### "401 Unauthorized" 에러
- API 키가 올바른지 확인
- API 키가 활성화되어 있는지 플랫폼에서 확인
- 유료 플랜 가입 필요 여부 확인 (OpenAI는 무료 크레딧 소진 후 유료 전환 필요)

### "429 Rate Limit" 에러
- 무료 할당량 초과: 24시간 대기 또는 유료 플랫폼 업그레이드
- 너무 빠른 요청: 재시도 로직이 자동으로 처리함

---

## 다음 단계

API 키 설정 완료 후:
1. ✅ LLM API 테스트: `npm run test:llm`
2. ✅ 이메일 연동 테스트
3. ✅ 전체 Cron Job 테스트
4. ✅ GitHub Actions 배포