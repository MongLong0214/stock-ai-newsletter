# 🚀 프로덕션 배포 가이드 (수익화 프로젝트)

## 현재 상태

✅ **배포 완료**: https://stock-ai-newsletter.vercel.app
⚠️ **Deployment Protection 활성화 상태** → 즉시 해제 필요

---

## 🔴 긴급: Deployment Protection 해제 (필수)

현재 사이트 접근 시 Vercel 로그인이 요구됩니다. 수익화를 위해 **즉시 해제**해야 합니다.

### 해결 방법

1. https://vercel.com/monglong0214s-projects/stock-ai-newsletter/settings/deployment-protection 접속
2. **"Deployment Protection"** 스위치를 **OFF**로 변경
3. 저장

완료 후 https://stock-ai-newsletter.vercel.app 이 공개 접근 가능해집니다.

---

## 📧 이메일 발송 설정 (프로덕션)

### 현재 제약사항
- Resend 무료 플랜: **weplay0628@gmail.com**로만 발송 가능
- 실제 구독자에게 발송하려면 **도메인 인증 필수**

### 도메인 인증 방법

#### 옵션 1: 커스텀 도메인 사용 (권장)

1. **도메인 구매** (예: stockai.kr, 주식ai.com 등)
   - Namecheap, GoDaddy, Cloudflare 등에서 구매

2. **Vercel에 도메인 연결**
   - https://vercel.com/monglong0214s-projects/stock-ai-newsletter/settings/domains
   - 구매한 도메인 입력 → DNS 레코드 설정

3. **Resend에 도메인 추가**
   - https://resend.com/domains
   - "Add Domain" 클릭
   - 구매한 도메인 입력
   - DNS 레코드 추가:
     ```
     Type    Name            Value
     TXT     @               v=spf1 include:resend.com ~all
     MX      @               feedback-smtp.us-east-1.amazonses.com (Priority: 10)
     CNAME   resend._domainkey  [Resend 제공값]
     ```
   - "Verify Domain" 클릭

4. **환경 변수 업데이트**
   - Vercel Dashboard → Environment Variables
   - `EMAIL_FROM` 업데이트: `AI 주식 추천 <noreply@stockai.kr>`
   - `NEXT_PUBLIC_APP_URL` 업데이트: `https://stockai.kr`

#### 옵션 2: Vercel 도메인 사용 (무료)

1. **Resend에 vercel.app 서브도메인 추가**
   - Domain: `stock-ai-newsletter.vercel.app`
   - DNS는 Vercel이 자동 관리

2. **환경 변수 업데이트**
   - `EMAIL_FROM`: `AI 주식 추천 <noreply@stock-ai-newsletter.vercel.app>`

---

## 🔑 환경 변수 최종 확인

### Vercel Production 환경 변수

```bash
# 데이터베이스
NEXT_PUBLIC_SUPABASE_URL=https://imdpcnlglynrqhzxqtmn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# AI API (선택사항)
GEMINI_API_KEY=AIzaSyDEP1eXNFbbW8DhlY7KjnUL-iqKLpfDzjU
OPENAI_API_KEY=sk-proj-... (옵션)
ANTHROPIC_API_KEY=sk-ant-... (옵션)

# 이메일
RESEND_API_KEY=re_6iJuL81a_9evTDvRG2HirDAtWAXEHXa5Y
EMAIL_FROM=AI 주식 추천 <noreply@your-domain.com>  # 도메인 인증 후 업데이트

# 보안
CRON_SECRET=WXn82g45+mlEtGZNL8PPL2a7d/OCLe1dMcjFZu+2kwc=

# 앱 URL
NEXT_PUBLIC_APP_URL=https://stock-ai-newsletter.vercel.app  # 커스텀 도메인 사용 시 업데이트
```

### 업데이트 방법

https://vercel.com/monglong0214s-projects/stock-ai-newsletter/settings/environment-variables

---

## ⏰ Cron Job 확인

### 자동 실행 확인

- **스케줄**: 매일 오전 8시 50분 (KST)
- **UTC 시간**: 23:50 (전날)
- **설정 파일**: `vercel.json`

### 수동 테스트

```bash
curl -X GET https://stock-ai-newsletter.vercel.app/api/cron/send-recommendations \
  -H "Authorization: Bearer WXn82g45+mlEtGZNL8PPL2a7d/OCLe1dMcjFZu+2kwc="
```

**예상 응답:**
```json
{
  "success": true,
  "message": "메일 발송 완료",
  "subscribers": 10,
  "sent": 10,
  "failed": 0,
  "duration": 8234
}
```

### Cron 실행 로그 확인

1. https://vercel.com/monglong0214s-projects/stock-ai-newsletter/deployments
2. 최신 배포 클릭
3. "Functions" 탭
4. `api/cron/send-recommendations` 클릭
5. 실행 로그 및 에러 확인

---

## 📊 모니터링 및 분석

### Supabase 데이터 확인

1. **구독자 현황**
   - https://supabase.com → Table Editor → `subscribers`
   - 활성 구독자 수 확인 (`is_active = true`)

2. **발송 로그**
   - Table Editor → `email_logs`
   - 발송 성공/실패 통계
   - AI 추천 내용 저장

### Vercel Analytics (옵션)

- https://vercel.com/monglong0214s-projects/stock-ai-newsletter/analytics
- 페이지 뷰, 트래픽 분석

---

## 💰 수익화 체크리스트

### 1단계: 시스템 안정화
- [ ] Deployment Protection 해제 완료
- [ ] 도메인 인증 완료 (Resend)
- [ ] 커스텀 도메인 설정 (옵션)
- [ ] Cron Job 정상 작동 확인 (3일 연속)
- [ ] 이메일 발송 성공률 95% 이상

### 2단계: 트래픽 확보
- [ ] 랜딩 페이지 최적화 (subscribe page)
- [ ] SEO 최적화
- [ ] 소셜 미디어 연동
- [ ] 초기 구독자 100명 확보

### 3단계: 수익화
- [ ] 유료 구독 모델 설계
- [ ] 결제 시스템 연동 (Stripe, Toss Payments 등)
- [ ] 프리미엄 기능 개발
- [ ] 광고 모델 검토

---

## 🔧 다음 단계 개선사항

### 필수 기능 추가
1. **구독자 대시보드**
   - 구독 관리 페이지
   - 이메일 발송 내역 조회

2. **A/B 테스팅**
   - 다양한 이메일 템플릿 테스트
   - 발송 시간 최적화

3. **분석 및 리포팅**
   - 구독자 증가율 추적
   - 이메일 오픈율, 클릭률 측정

### 고급 기능
1. **개인화 추천**
   - 사용자별 선호 종목 설정
   - 맞춤형 AI 추천

2. **모바일 앱**
   - React Native 또는 Flutter
   - 푸시 알림

3. **커뮤니티 기능**
   - 사용자 리뷰 및 피드백
   - 실시간 채팅

---

## 📞 긴급 문제 발생 시

### Cron Job 실패
```bash
# 즉시 수동 실행
curl -X GET https://stock-ai-newsletter.vercel.app/api/cron/send-recommendations \
  -H "Authorization: Bearer WXn82g45+mlEtGZNL8PPL2a7d/OCLe1dMcjFZu+2kwc="
```

### 이메일 발송 실패
1. Resend Dashboard 확인: https://resend.com/emails
2. 도메인 상태 확인: https://resend.com/domains
3. API 키 유효성 확인

### 데이터베이스 문제
1. Supabase Dashboard: https://supabase.com
2. SQL Editor에서 직접 쿼리 실행
3. RLS 정책 확인

---

## ✅ 최종 체크

배포 완료 후 반드시 확인:

1. [ ] https://stock-ai-newsletter.vercel.app 접속 → 로그인 없이 접근 가능
2. [ ] 구독 폼 작동 테스트
3. [ ] Cron Job 수동 실행 → 이메일 수신 확인
4. [ ] 구독 취소 링크 작동 확인
5. [ ] 모바일/PC 반응형 확인

**모든 체크 완료 시 프로덕션 준비 완료!** 🎉

---

## 📚 추가 참고 자료

- Vercel Deployment Protection: https://vercel.com/docs/security/deployment-protection
- Resend 도메인 인증: https://resend.com/docs/send-with-vercel
- Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- Next.js Cron Jobs: https://vercel.com/docs/cron-jobs