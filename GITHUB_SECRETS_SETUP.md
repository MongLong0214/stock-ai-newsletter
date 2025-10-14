# GitHub Secrets 설정 가이드

GitHub Actions에서 뉴스레터를 자동으로 발송하려면 다음 Secrets를 설정해야 합니다.

## Secrets 설정 방법

1. GitHub 저장소 페이지로 이동
2. **Settings** 탭 클릭
3. 왼쪽 사이드바에서 **Secrets and variables** → **Actions** 클릭
4. **New repository secret** 버튼 클릭
5. 아래 목록의 각 Secret을 추가

## 필수 Secrets 목록

### 1. AI API Keys

#### `GEMINI_API_KEY` (필수 - 현재 활성화)
- **설명**: Google Gemini API 키
- **값**: `AIzaSy...`
- **획득 방법**: https://makersuite.google.com/app/apikey

#### `OPENAI_API_KEY` (선택 - 현재 비활성화)
- **설명**: OpenAI GPT API 키
- **값**: `sk-proj-...`
- **획득 방법**: https://platform.openai.com/api-keys
- **참고**: 나중에 GPT 활성화 시 필요

#### `ANTHROPIC_API_KEY` (선택 - 현재 비활성화)
- **설명**: Anthropic Claude API 키
- **값**: `sk-ant-api03-...`
- **획득 방법**: https://console.anthropic.com/settings/keys
- **참고**: 나중에 Claude 활성화 시 필요

### 2. Supabase (데이터베이스)

#### `NEXT_PUBLIC_SUPABASE_URL`
- **설명**: Supabase 프로젝트 URL
- **값**: `https://xxxxxxxx.supabase.co`
- **획득 방법**: Supabase 프로젝트 → Settings → API

#### `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **설명**: Supabase Anon/Public 키
- **값**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **획득 방법**: Supabase 프로젝트 → Settings → API

### 3. SendGrid (이메일 발송)

#### `SENDGRID_API_KEY`
- **설명**: SendGrid API 키
- **값**: `SG.xxxxxx...`
- **획득 방법**: SendGrid → Settings → API Keys → Create API Key
- **권한**: Full Access 또는 Mail Send 권한 필요

#### `SENDGRID_FROM_EMAIL`
- **설명**: 발신 이메일 주소
- **값**: `noreply@stockmatrix.co.kr`
- **참고**: SendGrid에서 인증된 도메인/이메일이어야 함

#### `SENDGRID_FROM_NAME`
- **설명**: 발신자 이름
- **값**: `주식 AI 뉴스레터`

### 4. Application

#### `NEXT_PUBLIC_APP_URL`
- **설명**: 프로덕션 도메인 URL
- **값**: `https://stockmatrix.co.kr`
- **참고**: 수신거부 링크에 사용됨

## Secrets 확인 방법

1. GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions**
2. 모든 Secret이 목록에 표시되는지 확인
3. Secret의 값은 보안상 표시되지 않음 (정상)

## GitHub Actions 수동 실행

Secrets 설정 후 수동으로 테스트하려면:

1. GitHub 저장소 → **Actions** 탭
2. 왼쪽에서 **Daily Stock Newsletter** 워크플로우 선택
3. 오른쪽 상단 **Run workflow** 버튼 클릭
4. **Run workflow** 다시 클릭하여 실행 확인
5. 실행 결과 확인

## 자동 실행 스케줄

- **실행 시간**: 매일 오전 7:30 KST (한국 시간)
- **Cron 표현식**: `30 22 * * *` (UTC 22:30 = KST 07:30 다음날)
- **작업 내용**:
  1. Gemini API로 주식 분석
  2. Supabase에서 활성 구독자 조회
  3. SendGrid로 이메일 발송

## 문제 해결

### Actions 실행 실패 시

1. **Actions 탭**에서 실패한 워크플로우 클릭
2. 빨간색 표시된 Step 클릭하여 로그 확인
3. 주요 에러 메시지 확인:
   - `Unauthorized`: Secret 값이 잘못됨
   - `API key not set`: Secret 이름이 잘못됨
   - `Database error`: Supabase 설정 확인
   - `SendGrid error`: SendGrid API 키 또는 발신 이메일 확인

### Secret 값 업데이트

1. **Settings** → **Secrets and variables** → **Actions**
2. 수정할 Secret 클릭
3. **Update secret** 클릭
4. 새 값 입력 후 저장

## 보안 주의사항

⚠️ **절대로 Secret 값을 코드에 직접 작성하지 마세요!**
- Secret 값은 GitHub Secrets에만 저장
- `.env.local` 파일은 `.gitignore`에 포함되어야 함
- 공개 저장소에서는 특히 주의

## 추가 정보

- GitHub Actions 문서: https://docs.github.com/en/actions
- Secrets 관리 가이드: https://docs.github.com/en/actions/security-guides/encrypted-secrets