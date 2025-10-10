# 💸 완전 무료로 이메일 발송하기

## 🎯 무료 옵션 4가지

### 옵션 1: Vercel 도메인 사용 (가장 간단) ⭐

**비용**: 완전 무료
**난이도**: ⭐⭐☆☆☆ (쉬움)

Vercel이 제공하는 도메인(`stock-ai-newsletter.vercel.app`)을 Resend에 추가합니다.

**절차**:

1. **Resend에 Vercel 도메인 추가**
   - https://resend.com/domains 접속
   - "Add Domain" 클릭
   - 입력: `stock-ai-newsletter.vercel.app`

2. **DNS 레코드 확인**
   - Resend가 제공하는 DNS 레코드 복사
   - Vercel이 DNS를 자동 관리하므로 수동 설정 불필요할 수 있음
   - 안되면 Vercel Support에 문의

3. **환경 변수 업데이트**
   ```bash
   EMAIL_FROM=AI 주식 추천 <noreply@stock-ai-newsletter.vercel.app>
   ```

4. **재배포**
   ```bash
   vercel --prod
   ```

**예상 성공률**: 70% (Vercel 정책에 따라 다름)

---

### 옵션 2: SendGrid 무료 플랜 전환

**비용**: 완전 무료 (월 100통)
**난이도**: ⭐⭐⭐☆☆ (보통)

SendGrid는 도메인 인증 없이도 무료로 발송 가능합니다.

**절차**:

1. **SendGrid 가입**
   - https://signup.sendgrid.com
   - 무료 플랜 선택 (월 100통)

2. **API 키 생성**
   - Settings → API Keys → Create API Key
   - Full Access 권한 선택

3. **코드 수정**

   `package.json`에 추가:
   ```json
   "@sendgrid/mail": "^8.1.0"
   ```

   `lib/email.ts` 수정:
   ```typescript
   import sgMail from '@sendgrid/mail';

   sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

   await sgMail.send({
     to: email,
     from: 'noreply@your-verified-sender.com',
     subject: `[${today}] AI 주식 추천`,
     html: generateEmailHTML(greeting, today, recommendations, email),
   });
   ```

4. **환경 변수 추가**
   ```bash
   SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
   ```

**장점**:
- ✅ 완전 무료
- ✅ 도메인 인증 불필요
- ✅ 월 100통 제공

**단점**:
- ⚠️ 코드 수정 필요
- ⚠️ Sender Verification 필요 (본인 이메일 인증)

---

### 옵션 3: 무료 도메인 + Resend

**비용**: 완전 무료
**난이도**: ⭐⭐⭐⭐☆ (어려움)

무료 도메인 서비스를 이용해 도메인을 받고 Resend에 연결합니다.

**무료 도메인 제공 업체**:
- Freenom (.tk, .ml, .ga, .cf, .gq) - 완전 무료
- InfinityFree - 무료 호스팅 + 무료 서브도메인

**절차**:

1. **Freenom에서 무료 도메인 받기**
   - https://www.freenom.com
   - 원하는 도메인 검색 (예: stockai.tk)
   - 무료로 등록 (최대 12개월)

2. **DNS 설정**
   - Freenom DNS 관리에서 Resend DNS 레코드 추가
   - TXT, MX, CNAME 레코드 설정

3. **Resend에 도메인 추가**
   - https://resend.com/domains
   - 받은 무료 도메인 입력
   - DNS 인증 대기

4. **환경 변수 업데이트**
   ```bash
   EMAIL_FROM=AI 주식 추천 <noreply@stockai.tk>
   NEXT_PUBLIC_APP_URL=https://stockai.tk
   ```

**장점**:
- ✅ 완전 무료
- ✅ 커스텀 도메인 사용

**단점**:
- ⚠️ 신뢰도 낮음 (스팸 처리 가능성 높음)
- ⚠️ 1년마다 갱신 필요
- ⚠️ DNS 설정 복잡
- ⚠️ 이메일 도달률 낮을 수 있음

---

### 옵션 4: Mailgun 무료 플랜

**비용**: 완전 무료 (3개월, 이후 월 $35)
**난이도**: ⭐⭐⭐☆☆ (보통)

Mailgun은 첫 3개월 동안 월 5,000통 무료입니다.

**절차**:

1. **Mailgun 가입**
   - https://signup.mailgun.com
   - 신용카드 등록 필요 (3개월 후 자동 과금)

2. **도메인 추가 또는 샌드박스 사용**
   - 샌드박스 도메인으로 테스트 가능
   - 실제 도메인 추가 시 DNS 설정 필요

3. **API 키 사용**
   - 코드 수정 필요 (Resend → Mailgun)

**장점**:
- ✅ 3개월 무료
- ✅ 월 5,000통 (많음)

**단점**:
- ⚠️ 3개월 후 유료 ($35/월)
- ⚠️ 신용카드 등록 필수
- ⚠️ 코드 수정 필요

---

## 🎯 추천 순위 (무료 기준)

### 1위: Vercel 도메인 사용 ⭐⭐⭐⭐⭐
- **즉시 시도 가능**
- **설정 간단**
- **재배포만 하면 됨**

### 2위: SendGrid 전환 ⭐⭐⭐⭐☆
- **확실하게 작동**
- **코드 수정 필요**
- **무료 100통/월**

### 3위: Mailgun (3개월만 무료) ⭐⭐⭐☆☆
- **단기적으로는 좋음**
- **3개월 후 과금 주의**

### 4위: 무료 도메인 ⭐⭐☆☆☆
- **스팸 위험 높음**
- **비추천**

---

## 📋 즉시 실행 가능한 방법

### 방법 1: Vercel 도메인 시도 (5분)

```bash
# 1. Resend에 도메인 추가
# https://resend.com/domains
# Domain: stock-ai-newsletter.vercel.app

# 2. 환경 변수 업데이트 (Vercel Dashboard)
EMAIL_FROM=AI 주식 추천 <noreply@stock-ai-newsletter.vercel.app>

# 3. 재배포
vercel --prod

# 4. 테스트
curl -X GET https://stock-ai-newsletter.vercel.app/api/cron/send-recommendations \
  -H "Authorization: Bearer WXn82g45+mlEtGZNL8PPL2a7d/OCLe1dMcjFZu+2kwc="
```

**안되면** → 방법 2로

---

### 방법 2: SendGrid로 전환 (30분)

1. SendGrid 가입 및 API 키 발급
2. 코드 수정 (제공 가능)
3. 환경 변수 추가
4. 재배포
5. 발송 테스트

---

## 💡 최종 추천

**지금 바로 시도**:
1. Vercel 도메인 방법 (5분 소요)
2. 안되면 즉시 SendGrid 전환 (30분 소요)

**SendGrid 전환 시 코드 수정이 필요하면 제가 바로 해드릴 수 있습니다.**

어떤 방법으로 진행할까요?