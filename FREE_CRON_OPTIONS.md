# 무료 Cron Job 실행 방법

Vercel Pro Plan 없이 무료로 매일 뉴스레터를 발송하는 방법들입니다.

## ⭐ 방법 1: GitHub Actions (가장 추천)

### 장점
- ✅ 완전 무료
- ✅ GitHub 계정만 있으면 사용 가능
- ✅ 설정 간단
- ✅ 신뢰성 높음
- ✅ 로그 확인 용이

### 설정 방법

1. **GitHub Repository Secrets 설정**
   - GitHub Repository → Settings → Secrets and variables → Actions
   - 다음 두 개의 Secret 추가:
     ```
     APP_URL: https://your-vercel-app.vercel.app
     CRON_SECRET: your_32_char_secret_here
     ```

2. **워크플로우 파일 이미 생성됨**
   - `.github/workflows/daily-stock-newsletter.yml` 파일 확인
   - Git에 커밋하고 푸시

3. **푸시 후 자동 실행**
   ```bash
   git add .
   git commit -m "Add GitHub Actions cron job"
   git push
   ```

4. **수동 실행 테스트**
   - GitHub → Actions 탭 → Daily Stock Newsletter
   - "Run workflow" 버튼 클릭

### 모니터링
- GitHub Actions 탭에서 실행 로그 실시간 확인 가능

---

## 방법 2: Render.com Cron Jobs

### 장점
- ✅ 무료 티어 제공
- ✅ Web Service + Cron Job 함께 호스팅 가능
- ✅ 설정 간단

### 설정 방법

1. **Render.com 계정 생성**
   - https://render.com 회원가입

2. **New Cron Job 생성**
   - Dashboard → New → Cron Job
   - Command 입력:
     ```bash
     curl -X GET "https://your-app.vercel.app/api/cron/send-recommendations" \
       -H "Authorization: Bearer $CRON_SECRET"
     ```
   - Schedule: `30 23 * * *` (한국 시간 08:30)

3. **환경 변수 설정**
   - `CRON_SECRET` 추가

### 비용
- 무료 (월 750시간 제공, Cron Job은 초 단위 실행이므로 충분)

---

## 방법 3: EasyCron (무료 티어)

### 장점
- ✅ 전용 Cron 서비스
- ✅ 무료 티어 제공
- ✅ 웹 UI로 간편 설정

### 설정 방법

1. **EasyCron 가입**
   - https://www.easycron.com/user/register
   - 무료: 1일 1개 작업 실행 가능

2. **Cron Job 생성**
   - URL: `https://your-app.vercel.app/api/cron/send-recommendations`
   - Cron Expression: `30 23 * * *`
   - Custom Headers:
     ```
     Authorization: Bearer your_cron_secret
     ```

### 제한사항
- 무료: 1일 1개 작업만 실행 가능 (우리에게는 충분)

---

## 방법 4: cron-job.org

### 장점
- ✅ 완전 무료
- ✅ 가입 없이 사용 가능
- ✅ 간단한 설정

### 설정 방법

1. **cron-job.org 접속**
   - https://cron-job.org/en/

2. **Create cronjob 클릭**
   - URL: `https://your-app.vercel.app/api/cron/send-recommendations`
   - Schedule: `30 23 * * *`
   - Advanced → Custom Headers:
     ```
     Authorization: Bearer your_cron_secret
     ```

### 제한사항
- 무료: 1분에 1회 실행 가능 (충분함)

---

## 방법 5: Railway.app

### 장점
- ✅ 무료 티어 제공 ($5 크레딧/월)
- ✅ Vercel과 유사한 배포 경험
- ✅ Cron Job 기능 내장

### 설정 방법

1. **Railway.app 가입**
   - https://railway.app

2. **New Project → Deploy from GitHub**
   - Repository 연결

3. **Cron Job 설정**
   - Settings → Cron Jobs
   - Schedule: `30 23 * * *`
   - Command:
     ```bash
     curl -X GET "${{RAILWAY_STATIC_URL}}/api/cron/send-recommendations" \
       -H "Authorization: Bearer ${{CRON_SECRET}}"
     ```

### 비용
- 무료 티어: $5 크레딧/월 (충분함)

---

## 추천 조합

### 최고의 무료 조합 (추천 ⭐⭐⭐)
```
Vercel (무료) - 웹 애플리케이션 호스팅
    +
GitHub Actions (무료) - Cron Job 실행
    +
Supabase (무료) - 데이터베이스
    +
AWS SES (무료 티어) - 이메일 발송
```

**총 비용**: $0 (완전 무료)

### 설정 순서
1. ✅ Vercel에 앱 배포 (무료)
2. ✅ GitHub Repository에 코드 푸시
3. ✅ GitHub Secrets 설정 (`APP_URL`, `CRON_SECRET`)
4. ✅ `.github/workflows/daily-stock-newsletter.yml` 커밋 & 푸시
5. ✅ GitHub Actions 탭에서 실행 확인

---

## 현재 구현 상태 ✅

모든 코드가 이미 구현되어 있습니다:

### 1. Cron Job 엔드포인트
- ✅ `/app/api/cron/send-recommendations/route.ts`
- ✅ CRON_SECRET으로 보안 처리
- ✅ 3개 AI 병렬 실행
- ✅ 이메일 발송
- ✅ 로그 저장

### 2. AI 연동
- ✅ GPT-4 (`lib/ai-recommendations.ts`)
- ✅ Claude 4.5 (`lib/ai-recommendations.ts`)
- ✅ Gemini 2.5 (`lib/ai-recommendations.ts`)
- ✅ 전일 종가 기반 분석 프롬프트

### 3. 이메일 발송
- ✅ AWS SES 연동 (`lib/email.ts`)
- ✅ HTML 이메일 템플릿
- ✅ 배치 발송 (50명씩)
- ✅ 구독 취소 링크

### 4. Cron Job 트리거
- ✅ GitHub Actions 워크플로우 (`.github/workflows/daily-stock-newsletter.yml`)
- ✅ Render.com 설정 파일 (`render.yaml`)

---

## 즉시 사용 가능 🚀

```bash
# 1. GitHub에 푸시
git add .
git commit -m "Add free cron job with GitHub Actions"
git push

# 2. GitHub Secrets 설정
# APP_URL: https://your-vercel-app.vercel.app
# CRON_SECRET: (openssl rand -base64 32로 생성)

# 3. 완료! 매일 오전 8:30에 자동 실행됩니다.
```

---

## 테스트

### GitHub Actions 수동 실행
1. GitHub Repository → Actions 탭
2. "Daily Stock Newsletter" 워크플로우 선택
3. "Run workflow" 버튼 클릭

### 직접 API 호출 테스트
```bash
curl -X GET "https://your-vercel-app.vercel.app/api/cron/send-recommendations" \
  -H "Authorization: Bearer your_cron_secret" \
  -w "\nStatus: %{http_code}\n"
```

---

## 예상 비용

| 서비스 | 비용 |
|--------|------|
| Vercel (무료 플랜) | $0 |
| GitHub Actions | $0 |
| Supabase (무료 티어) | $0 |
| AWS SES | $0 (월 62,000통까지 무료) |
| OpenAI GPT-4 | ~$0.60/월 (일 1회) |
| Anthropic Claude | ~$0.45/월 (일 1회) |
| Google Gemini | $0 (무료 티어) |
| **총 예상 비용** | **~$1.05/월** |

구독자가 늘어나도 AWS SES 무료 티어 내에서 충분합니다!