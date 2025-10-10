# 🤖 AI 주식 추천 뉴스레터

매일 아침 8시 50분, GPT-4 · Claude · Gemini가 분석한 주식 추천을 이메일로 받아보세요.

## 📋 시작하기 전 준비물

다음 서비스의 계정과 API 키가 필요합니다:

- [ ] **Supabase** (무료) - 데이터베이스
- [ ] **OpenAI** (유료) - GPT-4 API
- [ ] **Anthropic** (유료) - Claude API
- [ ] **Google AI Studio** (무료) - Gemini API
- [ ] **Resend** (무료 플랜 가능) - 이메일 발송
- [ ] **Vercel** (무료) - 배포 및 Cron Job

---

## 🚀 Step 1: Supabase 데이터베이스 설정

### 1-1. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) 접속 → 로그인
2. **New Project** 클릭
3. 프로젝트 이름, 비밀번호 설정 → **Create new project**
4. 프로젝트 생성 완료까지 2-3분 대기

### 1-2. 데이터베이스 테이블 생성

1. Supabase Dashboard → **SQL Editor** 클릭
2. **New Query** 클릭
3. 아래 SQL 전체 복사 → 붙여넣기 → **Run** 클릭

```sql
-- 구독자 테이블
CREATE TABLE subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 이메일 인덱스 (성능 최적화)
CREATE INDEX idx_subscribers_email ON subscribers(email);
CREATE INDEX idx_subscribers_is_active ON subscribers(is_active);

-- 이메일 발송 로그 테이블
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_count INTEGER NOT NULL,
  success_count INTEGER NOT NULL,
  fail_count INTEGER NOT NULL,
  gpt_recommendation TEXT,
  claude_recommendation TEXT,
  gemini_recommendation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS 정책 (Row Level Security)
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- 공개 읽기/쓰기 허용
CREATE POLICY "Allow public insert" ON subscribers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON subscribers FOR UPDATE USING (true);
CREATE POLICY "Allow public select" ON subscribers FOR SELECT USING (true);
CREATE POLICY "Allow public insert logs" ON email_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select logs" ON email_logs FOR SELECT USING (true);
```

### 1-3. Supabase API 키 복사

1. Supabase Dashboard → **Settings** (왼쪽 하단 톱니바퀴) → **API**
2. 복사할 정보:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Project API keys** → `anon public` 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 🔑 Step 2: API 키 발급받기

### 2-1. OpenAI API 키

1. [platform.openai.com](https://platform.openai.com) 접속 → 로그인
2. 우측 상단 프로필 → **API keys**
3. **Create new secret key** → 이름 입력 → **Create**
4. 키 복사 (한 번만 표시됨!) → `OPENAI_API_KEY`

> ⚠️ **비용**: GPT-4 사용 시 요금 발생 (~$0.03/요청)

### 2-2. Anthropic Claude API 키

1. [console.anthropic.com](https://console.anthropic.com) 접속 → 로그인
2. **API Keys** → **Create Key**
3. 키 복사 → `ANTHROPIC_API_KEY`

> ⚠️ **비용**: Claude 사용 시 요금 발생 (~$0.015/요청)

### 2-3. Google Gemini API 키

1. [ai.google.dev](https://ai.google.dev) 접속 → 로그인
2. **Get API key in Google AI Studio** 클릭
3. **Create API key** → 키 복사 → `GEMINI_API_KEY`

> ✅ **무료**: 현재 Gemini Pro는 무료 (제한 있음)

 ### 2-4. Resend API 키 및 도메인 인증

1. [resend.com](https://resend.com) 접속 → 로그인
2. **API Keys** → **Create API Key**
3. 키 이름 입력 → **Add** → 키 복사 → `RESEND_API_KEY`

> ✅ **무료**: 월 100통까지 무료

#### 📧 도메인 인증 (프로덕션 배포 전 필수)

Resend 무료 계정은 자신의 이메일로만 테스트 발송 가능합니다. 실제 구독자에게 발송하려면 도메인 인증이 필요합니다.

**옵션 1: 도메인이 있는 경우**
1. Resend Dashboard → **Domains** → **Add Domain**
2. 본인 도메인 입력 (예: `example.com`)
3. DNS 레코드 추가 (TXT, MX, CNAME)
4. **Verify Domain** 클릭하여 인증 완료

**옵션 2: 도메인이 없는 경우**
1. Vercel에 먼저 배포 (Step 5)
2. 자동 생성된 `your-app.vercel.app` 도메인 사용
3. Resend에서 vercel.app 서브도메인 인증 가능

> 📝 **자세한 배포 가이드**: `DEPLOYMENT_GUIDE.md` 참조

---

## 💻 Step 3: 로컬 환경 설정

### 3-1. 환경 변수 파일 생성

```bash
# 프로젝트 루트에서
cp .env.local.example .env.local
```

### 3-2. .env.local 파일 수정

에디터로 `.env.local` 열어서 아래 값들을 실제 키로 교체:

```bash
# Supabase (Step 1-3에서 복사)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# AI API Keys (Step 2에서 복사)
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIzaSy...

# Email (Step 2-4에서 복사)
RESEND_API_KEY=re_...

# Cron Job 보안 (아래 명령어로 생성)
CRON_SECRET=생성된_랜덤_문자열

# 로컬 테스트용
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3-3. CRON_SECRET 생성

```bash
# macOS/Linux
openssl rand -base64 32

# 또는 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 출력된 값을 CRON_SECRET에 붙여넣기
```

---

## 🧪 Step 4: 로컬 테스트

### 4-1. 개발 서버 시작

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 열기

### 4-2. 구독 기능 테스트

1. **홈페이지** → **지금 무료 구독하기** 클릭
2. 테스트 이메일 입력 → **무료 구독하기**
3. ✅ "구독 신청이 완료되었습니다!" 메시지 확인

### 4-3. Supabase에서 데이터 확인

1. Supabase Dashboard → **Table Editor** → `subscribers` 테이블
2. 방금 입력한 이메일이 보이는지 확인

### 4-4. Cron Job 테스트 (메일 발송)

새 터미널 열어서:

```bash
# .env.local에서 CRON_SECRET 값 복사한 후
curl -X GET http://localhost:3000/api/cron/send-recommendations \
  -H "Authorization: Bearer 여기에_CRON_SECRET_붙여넣기"
```

**예상 결과:**
```json
{
  "success": true,
  "message": "메일 발송 완료",
  "subscribers": 1,
  "sent": 1,
  "failed": 0,
  "duration": 15234
}
```

### 4-5. 이메일 수신 확인

- 입력한 이메일 받은편지함 확인
- GPT, Claude, Gemini 추천이 포함된 메일 확인

> ⚠️ **참고**: Resend 무료 플랜은 인증된 도메인에서만 발송 가능합니다. 테스트 시 본인 이메일로만 발송하세요.

### 4-6. 구독 취소 테스트

1. 받은 이메일 하단의 **구독 취소** 링크 클릭
2. ✅ "구독이 취소되었습니다." 메시지 확인

---

## 🌐 Step 5: Vercel 배포

### 5-1. Vercel CLI 설치 (처음이라면)

```bash
npm install -g vercel
vercel login
```

### 5-2. 프로젝트 배포

```bash
# 프로젝트 루트에서
vercel

# 질문에 답변:
# Set up and deploy? → Y
# Which scope? → 본인 계정 선택
# Link to existing project? → N
# Project name? → stock-ai-newsletter (또는 원하는 이름)
# In which directory? → ./ (엔터)
# Override settings? → N
```

배포 완료 후 URL 복사 (예: `https://stock-ai-newsletter.vercel.app`)

### 5-3. 프로덕션 환경 변수 설정

**방법 1: Vercel Dashboard (권장)**

1. [vercel.com/dashboard](https://vercel.com/dashboard) 접속
2. 방금 배포한 프로젝트 클릭
3. **Settings** → **Environment Variables**
4. 아래 변수들을 **하나씩** 추가:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIzaSy...
RESEND_API_KEY=re_...
CRON_SECRET=로컬과_동일한_값
NEXT_PUBLIC_APP_URL=https://your-project.vercel.app
```

**방법 2: CLI로 설정**

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
# 값 입력 → 엔터
# Production? → Y

# 모든 환경 변수 반복...
```

### 5-4. 재배포

```bash
vercel --prod
```

---

## ⏰ Step 6: Cron Job 설정

### 6-1. Vercel Cron 자동 설정 확인

1. Vercel Dashboard → 프로젝트 선택
2. **Settings** → **Cron Jobs**
3. `send-recommendations` Job이 보이는지 확인
4. 스케줄: `50 23 * * *` (UTC 23:50 = KST 08:50)

> ✅ `vercel.json`이 있으면 자동으로 Cron이 설정됩니다!

### 6-2. Cron Job 수동 테스트

```bash
# 프로덕션 URL로 테스트
curl -X GET https://your-project.vercel.app/api/cron/send-recommendations \
  -H "Authorization: Bearer 여기에_CRON_SECRET"
```

---

## ✅ Step 7: 최종 확인

### 7-1. 프로덕션에서 구독 테스트

1. `https://your-project.vercel.app` 접속
2. 이메일 입력하여 구독
3. Cron 엔드포인트 호출하여 메일 발송 테스트
4. 이메일 수신 확인

### 7-2. 다음날 아침 8시 50분에 자동 발송 확인

- 매일 오전 8시 50분에 자동으로 메일 발송됨
- Vercel Dashboard → **Deployments** → **Functions**에서 로그 확인 가능

---

## 🎯 완료! 🎉

이제 매일 아침 자동으로 AI 주식 추천 메일이 발송됩니다!

## 📊 모니터링

### 발송 로그 확인

Supabase Dashboard → Table Editor → `email_logs`에서 발송 통계 확인

### Vercel 로그 확인

1. Vercel Dashboard → 프로젝트 선택
2. **Deployments** → 가장 최근 배포 클릭
3. **Functions** → `api/cron/send-recommendations` 클릭
4. 실행 로그 확인

---

## 🔧 문제 해결

### "Unauthorized" 에러
- `.env.local`과 Vercel의 `CRON_SECRET`이 일치하는지 확인

### 이메일이 안 옴
1. Resend Dashboard에서 이메일 발송 로그 확인
2. 스팸 폴더 확인
3. Resend 도메인 인증 확인 (프로덕션 환경)

### AI API 에러
- API 키가 올바른지 확인
- OpenAI/Anthropic 계정에 크레딧이 있는지 확인
- API Rate Limit 확인

### Supabase 연결 에러
- `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 확인
- Supabase 프로젝트가 활성 상태인지 확인

---

## 💰 예상 비용

| 서비스 | 무료 한도 | 초과 시 비용 |
|--------|-----------|--------------|
| Supabase | 500MB DB, 무제한 API | 무료 플랜으로 충분 |
| Vercel | 100GB 대역폭, Cron 무료 | 무료 플랜으로 충분 |
| Resend | 월 100통 | $0.10/100통 |
| Gemini | 무료 (제한 있음) | 무료 |
| GPT-4 | - | ~$0.03/요청 |
| Claude | - | ~$0.015/요청 |

**구독자 100명 기준 월 비용:**
- Gemini만 사용: **$0** (무료)
- GPT-4 + Claude + Gemini: **~$150** (100명 × 30일 × $0.05)

---

## 🚀 개선 아이디어

- [ ] Grok API 추가
- [ ] 주식 차트 이미지 포함
- [ ] 구독자 관리 대시보드
- [ ] 주간 요약 레포트
- [ ] 카카오톡 알림 연동
- [ ] 맞춤형 추천 (관심 종목 설정)

---

## 📄 라이선스

MIT License

## 💬 문의

이슈나 질문이 있으시면 GitHub Issues를 통해 남겨주세요!