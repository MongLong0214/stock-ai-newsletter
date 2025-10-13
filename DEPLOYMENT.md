# 배포 가이드

## GitHub Actions Cron Job 설정 (무료 ⭐)

매일 아침 **한국 시간 8시 30분**에 GPT-4, Claude 4.5, Gemini 2.5가 주식 추천을 분석하여 구독자들에게 이메일을 발송합니다.

**완전 무료**로 운영 가능합니다 (AI API 비용 제외).

## 배포 전 필수 환경 변수 설정

Vercel 대시보드에서 다음 환경 변수를 **모두** 설정해야 합니다:

### 1. Supabase (데이터베이스)
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 2. AI API Keys (세 모델 모두 필요)
```
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
GEMINI_API_KEY=your-gemini-api-key
```

### 3. AWS SES (이메일 발송)
```
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
```

### 4. Cron Job 보안
```
CRON_SECRET=최소_32자_이상의_랜덤_문자열_생성_필요
```
**생성 방법**: `openssl rand -base64 32`

### 5. Application URL
```
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```
(Vercel 배포 후 자동 생성되는 URL 입력)

## Cron Job 스케줄

- **스케줄**: `30 23 * * *` (UTC)
- **한국 시간**: 매일 오전 8시 30분
- **실행 내용**:
  1. GPT-4, Claude 4.5, Gemini 2.5에 동시 요청
  2. 각 AI가 전일 종가 기반으로 기술적 분석 수행
  3. 추천 종목 5개씩 선정
  4. 구독자 전체에게 이메일 발송
  5. Supabase에 발송 로그 저장

## 배포 순서

### 1. Supabase 데이터베이스 설정
```sql
-- subscribers 테이블 생성
CREATE TABLE subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- email_logs 테이블 생성
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscriber_count INTEGER NOT NULL,
  success_count INTEGER NOT NULL,
  fail_count INTEGER NOT NULL,
  gpt_recommendation TEXT,
  claude_recommendation TEXT,
  gemini_recommendation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. AWS SES 설정
1. AWS Console → Amazon SES
2. 발신 이메일 주소 인증 (Verify Email Address)
3. IAM 사용자 생성 (SES 전송 권한 부여)
4. Access Key ID와 Secret Access Key 발급

### 3. API Keys 발급
- **OpenAI**: https://platform.openai.com/api-keys
- **Anthropic**: https://console.anthropic.com/
- **Google AI Studio**: https://makersuite.google.com/app/apikey

### 4. Vercel 배포
```bash
# Vercel CLI 설치
npm install -g vercel

# 배포
vercel --prod

# 환경 변수 설정 (Vercel 대시보드에서 설정)
```

### 5. GitHub Actions Cron Job 설정

**GitHub Repository Secrets 설정**:

1. GitHub Repository → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** 클릭하여 다음 2개 추가:

```
Name: APP_URL
Value: https://your-vercel-app.vercel.app

Name: CRON_SECRET
Value: (openssl rand -base64 32로 생성한 값)
```

3. **코드 푸시**:
```bash
git add .
git commit -m "Setup GitHub Actions cron job"
git push
```

4. **자동 실행 확인**:
   - GitHub Repository → **Actions** 탭
   - "Daily Stock Newsletter" 워크플로우 확인
   - 매일 오전 8:30에 자동 실행됨

5. **수동 테스트** (선택사항):
   - Actions 탭 → "Daily Stock Newsletter" 선택
   - **Run workflow** 버튼 클릭

## 테스트 방법

### 로컬 테스트
```bash
# 개발 서버 실행
npm run dev

# Cron Job 엔드포인트 직접 호출
curl -X GET "http://localhost:3000/api/cron/send-recommendations" \
  -H "Authorization: Bearer your_cron_secret"
```

### 프로덕션 테스트
```bash
# Vercel 배포 후
curl -X GET "https://your-app.vercel.app/api/cron/send-recommendations" \
  -H "Authorization: Bearer your_cron_secret"
```

## 모니터링

- **GitHub Actions**: Actions 탭에서 워크플로우 실행 로그 확인
- **Vercel Functions**: Functions 탭에서 API 실행 로그 확인
- **Supabase**: `email_logs` 테이블에서 발송 이력 확인

## 주요 파일 구조

```
/
├── vercel.json              # Cron Job 스케줄 정의
├── app/api/cron/
│   └── send-recommendations/
│       └── route.ts         # Cron Job 엔드포인트
├── lib/
│   ├── ai-recommendations.ts # AI 추천 로직
│   ├── email.ts             # 이메일 발송 로직
│   ├── supabase.ts          # Supabase 클라이언트
│   └── env.ts               # 환경 변수 검증
└── .env.production.example  # 환경 변수 템플릿
```

## 문제 해결

### AI 추천이 실패하는 경우
- API Key가 유효한지 확인
- API 사용량 한도 확인
- 프롬프트가 너무 길지 않은지 확인 (max_tokens 조정)

### 이메일 발송이 실패하는 경우
- AWS SES에서 발신 이메일이 인증되었는지 확인
- IAM 권한이 올바른지 확인
- AWS 리전이 일치하는지 확인

### GitHub Actions Cron Job이 실행되지 않는 경우
- GitHub Repository Secrets (`APP_URL`, `CRON_SECRET`)가 올바르게 설정되었는지 확인
- `.github/workflows/daily-stock-newsletter.yml` 파일이 main 브랜치에 있는지 확인
- GitHub Actions 탭에서 워크플로우가 활성화되어 있는지 확인
- Vercel 앱의 환경 변수에 `CRON_SECRET`이 동일하게 설정되었는지 확인

## 비용 예상 (GitHub Actions 사용 시)

| 서비스 | 비용 |
|--------|------|
| **Vercel** (무료 플랜) | $0 |
| **GitHub Actions** | $0 |
| **Supabase** (무료 티어) | $0 |
| **AWS SES** | $0 (월 62,000통까지 무료) |
| **OpenAI GPT-4** | ~$0.60/월 |
| **Anthropic Claude** | ~$0.45/월 |
| **Google Gemini** | $0 |
| **총 예상 비용** | **~$1.05/월** |

구독자가 늘어나도 AWS SES 무료 티어 내에서 충분합니다!