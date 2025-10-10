# 📧 SendGrid 완전 무료 설정 가이드

## ✅ SendGrid 장점
- 💰 **완전 무료** (월 100통)
- 🚀 **도메인 인증 불필요** (Single Sender Verification만 하면 됨)
- ✉️ **모든 이메일 주소로 발송 가능**
- 📊 **전송 통계 제공**

---

## 🚀 단계별 설정 (10분)

### 1단계: SendGrid 가입

1. https://signup.sendgrid.com 접속
2. 이메일 주소 입력: `weplay0628@gmail.com`
3. 비밀번호 설정
4. "Create Account" 클릭
5. 이메일 인증 (받은 메일에서 링크 클릭)

---

### 2단계: API 키 발급

1. https://app.sendgrid.com/settings/api_keys 접속
2. **"Create API Key"** 클릭
3. 설정:
   - **API Key Name**: `stock-ai-newsletter`
   - **API Key Permissions**: **Full Access** 선택
4. **"Create & View"** 클릭
5. **API 키 복사** (⚠️ 한 번만 표시됨!)
   ```
   SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

---

### 3단계: Sender 인증 (필수)

SendGrid는 발신자 이메일을 반드시 인증해야 합니다.

1. https://app.sendgrid.com/settings/sender_auth/senders 접속
2. **"Create New Sender"** 클릭
3. 정보 입력:
   ```
   From Name: AI 주식 추천
   From Email Address: weplay0628@gmail.com
   Reply To: weplay0628@gmail.com

   Address: 서울특별시
   City: 서울
   State: 서울
   Zip Code: 12345
   Country: South Korea

   Company: AI Stock Newsletter
   Website: https://stock-ai-newsletter.vercel.app
   ```
4. **"Create"** 클릭
5. **이메일 확인**: `weplay0628@gmail.com`으로 발송된 인증 메일에서 **"Verify Single Sender"** 클릭
6. 인증 완료!

---

### 4단계: 로컬 환경 변수 설정

`.env.local` 파일 수정:

```bash
# Email Service (SendGrid)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=AI 주식 추천 <weplay0628@gmail.com>
```

**⚠️ 중요**: `EMAIL_FROM`의 이메일은 반드시 **Sender 인증한 이메일(weplay0628@gmail.com)**과 동일해야 합니다!

---

### 5단계: 로컬 테스트

```bash
# 개발 서버 재시작
npm run dev

# 크론잡 테스트
curl -X GET http://localhost:3002/api/cron/send-recommendations \
  -H "Authorization: Bearer WXn82g45+mlEtGZNL8PPL2a7d/OCLe1dMcjFZu+2kwc="
```

**예상 결과**:
```json
{
  "success": true,
  "message": "메일 발송 완료",
  "subscribers": 2,
  "sent": 2,
  "failed": 0
}
```

**✅ 모든 구독자(chowonil0214@naver.com 포함)에게 발송 성공!**

---

### 6단계: Vercel 프로덕션 환경 변수 설정

1. https://vercel.com/monglong0214s-projects/stock-ai-newsletter/settings/environment-variables 접속

2. **SENDGRID_API_KEY 추가**:
   - Name: `SENDGRID_API_KEY`
   - Value: `SG.xxxxxxxxxx` (2단계에서 복사한 API 키)
   - Environment: **Production** 선택
   - **Save** 클릭

3. **EMAIL_FROM 업데이트**:
   - 기존 `EMAIL_FROM` 찾기 → **Edit** 클릭
   - Value: `AI 주식 추천 <weplay0628@gmail.com>`
   - **Save** 클릭

4. **RESEND_API_KEY 삭제** (선택사항):
   - 기존 `RESEND_API_KEY` 찾기 → **Remove** 클릭

---

### 7단계: 재배포

```bash
# 변경사항 커밋
git add .
git commit -m "Switch from Resend to SendGrid for free email delivery"
git push origin main

# Vercel 재배포
vercel --prod
```

---

### 8단계: 프로덕션 테스트

```bash
# 크론잡 실행
curl -X GET https://stock-ai-newsletter.vercel.app/api/cron/send-recommendations \
  -H "Authorization: Bearer WXn82g45+mlEtGZNL8PPL2a7d/OCLe1dMcjFZu+2kwc="
```

**성공 시**:
- ✅ chowonil0214@naver.com에 이메일 도착
- ✅ weplay0628@gmail.com에 이메일 도착
- ✅ 완전 무료로 모든 구독자에게 발송 가능!

---

## 📊 SendGrid 대시보드

### 발송 통계 확인
https://app.sendgrid.com/stats

- 발송 성공/실패 건수
- 오픈율, 클릭률
- Bounce, Spam 신고

### 이메일 활동 로그
https://app.sendgrid.com/email_activity

- 실시간 발송 내역
- 개별 이메일 상태 추적

---

## ⚠️ 주의사항

### 1. Sender 인증 필수
- SendGrid는 **인증된 발신자 이메일**로만 발송 가능
- `EMAIL_FROM`은 반드시 인증한 이메일과 동일해야 함

### 2. 무료 플랜 제약
- **월 100통** 제한
- 구독자가 100명 이상이면 Pro 플랜 업그레이드 필요 ($20/월)

### 3. 스팸 방지
- 첫 발송 시 스팸함에 들어갈 수 있음
- 구독자에게 "주소록에 추가" 요청
- 발송 빈도 일정하게 유지

---

## 🎯 완료 체크리스트

- [ ] SendGrid 가입 완료
- [ ] API 키 발급 및 복사
- [ ] Sender 인증 완료 (weplay0628@gmail.com)
- [ ] `.env.local` 업데이트
- [ ] 로컬 테스트 성공 (모든 구독자에게 발송)
- [ ] Vercel 환경 변수 설정
- [ ] 재배포 완료
- [ ] 프로덕션 테스트 성공

**모두 완료되면 완전 무료로 모든 구독자에게 이메일 발송 가능! 🎉**

---

## 💡 다음 단계

### 구독자 100명 이상일 때
1. SendGrid Pro 플랜 업그레이드 ($20/월, 50,000통)
2. 또는 다른 무료 서비스 조합 (예: Mailgun, AWS SES)

### 브랜딩 강화
1. 커스텀 도메인 구매 (예: stockai.kr)
2. SendGrid에 도메인 추가 및 인증
3. `EMAIL_FROM` 업데이트: `AI 주식 추천 <noreply@stockai.kr>`