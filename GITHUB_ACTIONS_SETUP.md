# GitHub Actions Cron Job 설정 가이드

## 📋 개요

GitHub Actions를 사용하여 **완전 무료**로 매일 아침 8시 30분에 주식 추천 뉴스레터를 자동 발송합니다.

## ✅ 전제 조건

- Vercel에 앱이 배포되어 있어야 함
- GitHub Repository가 준비되어 있어야 함
- Vercel 환경 변수가 모두 설정되어 있어야 함

## 🚀 설정 단계

### 1단계: CRON_SECRET 생성

터미널에서 실행:

```bash
openssl rand -base64 32
```

출력된 문자열을 복사해두세요 (예: `abc123XYZ456...`)

### 2단계: Vercel 환경 변수 설정

1. Vercel 대시보드 접속
2. 프로젝트 선택 → **Settings** → **Environment Variables**
3. 다음 변수 추가:

```
Name: CRON_SECRET
Value: (1단계에서 생성한 문자열)
Environment: Production
```

### 3단계: GitHub Repository Secrets 설정

1. GitHub Repository 접속
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret** 클릭
4. 다음 2개의 Secret 추가:

#### Secret 1: APP_URL
```
Name: APP_URL
Value: https://your-vercel-app.vercel.app
```
(Vercel 대시보드에서 확인한 실제 URL 입력)

#### Secret 2: CRON_SECRET
```
Name: CRON_SECRET
Value: (1단계에서 생성한 동일한 문자열)
```

⚠️ **중요**: `CRON_SECRET`은 Vercel과 GitHub에서 **동일한 값**이어야 합니다!

### 4단계: 코드 푸시

워크플로우 파일이 이미 준비되어 있으므로, 단순히 푸시만 하면 됩니다:

```bash
git add .
git commit -m "Setup GitHub Actions cron job"
git push origin main
```

### 5단계: 워크플로우 확인

1. GitHub Repository → **Actions** 탭
2. "Daily Stock Newsletter" 워크플로우 확인
3. 녹색 체크마크가 표시되면 성공!

## 🧪 수동 테스트

자동 실행을 기다리지 않고 바로 테스트하려면:

1. GitHub → **Actions** 탭
2. "Daily Stock Newsletter" 선택
3. **Run workflow** 버튼 클릭
4. **Run workflow** 확인

실행 로그에서 결과를 확인할 수 있습니다.

## 📅 실행 스케줄

- **시간**: 매일 오전 8시 30분 (한국 시간)
- **UTC**: 23:30 (UTC+9 = 한국)
- **Cron 표현식**: `30 23 * * *`

## 🔍 모니터링

### GitHub Actions 로그
- GitHub → Actions 탭
- 각 실행 항목 클릭하여 상세 로그 확인

### Vercel Functions 로그
- Vercel 대시보드 → Functions 탭
- API 호출 로그 확인

### Supabase 발송 이력
- Supabase 대시보드
- `email_logs` 테이블 확인

## ❌ 문제 해결

### 워크플로우가 실행되지 않는 경우

#### 체크리스트:
- [ ] `.github/workflows/daily-stock-newsletter.yml` 파일이 main 브랜치에 있는가?
- [ ] GitHub Actions Secrets (`APP_URL`, `CRON_SECRET`)가 설정되었는가?
- [ ] Vercel 환경 변수에 `CRON_SECRET`이 설정되었는가?
- [ ] Vercel과 GitHub의 `CRON_SECRET` 값이 동일한가?

#### 해결 방법:

**1. Secrets 확인**
```bash
# GitHub → Settings → Secrets and variables → Actions
# APP_URL과 CRON_SECRET이 있는지 확인
```

**2. 워크플로우 파일 확인**
```bash
cat .github/workflows/daily-stock-newsletter.yml
```

**3. 수동 실행 테스트**
- Actions 탭에서 "Run workflow" 버튼으로 테스트

### HTTP 401 Unauthorized 에러

**원인**: `CRON_SECRET`이 일치하지 않음

**해결**:
1. Vercel 환경 변수 확인
2. GitHub Secrets 확인
3. 둘 다 동일한 값으로 설정

### HTTP 500 Internal Server Error

**원인**: API 키나 다른 환경 변수 문제

**해결**:
1. Vercel 환경 변수 모두 확인
2. Vercel Functions 로그에서 상세 에러 확인

## 💰 비용

완전 무료입니다!

| 항목 | 비용 |
|------|------|
| GitHub Actions | $0 (무료 분당 2,000분/월) |
| Vercel 호스팅 | $0 (무료 플랜) |
| Supabase | $0 (무료 티어) |
| AWS SES | $0 (월 62,000통 무료) |

AI API만 사용량에 따라 과금 (~$1/월)

## 📁 관련 파일

```
.github/workflows/daily-stock-newsletter.yml  # 워크플로우 정의
app/api/cron/send-recommendations/route.ts    # Cron Job 엔드포인트
lib/ai-recommendations.ts                      # AI 추천 로직
lib/email.ts                                   # 이메일 발송
```

## 🎉 완료!

이제 매일 아침 8시 30분에 자동으로 뉴스레터가 발송됩니다!