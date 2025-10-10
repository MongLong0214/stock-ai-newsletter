# 🚀 배포 가이드

## 1단계: Resend 도메인 인증

### 도메인이 있는 경우
1. [https://resend.com/domains](https://resend.com/domains) 접속
2. "Add Domain" 클릭
3. 본인 도메인 입력 (예: `example.com`)
4. DNS 레코드 추가:
   - TXT 레코드 추가 (도메인 소유권 확인)
   - MX 레코드 추가 (이메일 수신)
   - CNAME 레코드 추가 (DKIM)
5. "Verify Domain" 클릭하여 인증 완료

### 도메인이 없는 경우
무료 옵션:
- **Vercel 도메인**: 배포 후 자동으로 `your-app.vercel.app` 도메인 제공
  - Resend는 vercel.app 서브도메인 인증 지원
- **무료 도메인 서비스**: Freenom, Cloudflare Pages 등

## 2단계: 환경 변수 수정

도메인 인증 완료 후 `.env.local` 파일 수정:

```bash
# 기존
NEXT_PUBLIC_APP_URL=http://localhost:3000

# 배포 후 (예시)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

## 3단계: 이메일 발송 주소 변경

`lib/email.ts` 파일에서 `from` 주소를 인증된 도메인으로 변경:

```typescript
// 현재
from: 'AI 주식 추천 <onboarding@resend.dev>',

// 변경 (예시)
from: 'AI 주식 추천 <newsletter@your-domain.com>',
```

## 4단계: Vercel 배포

### GitHub 연동 방식 (권장)
1. GitHub 저장소 생성
2. 코드 푸시:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/your-username/stock-ai-newsletter.git
   git push -u origin main
   ```
3. [vercel.com](https://vercel.com) 접속
4. "Import Project" → GitHub 저장소 선택
5. 환경 변수 설정:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
   - `RESEND_API_KEY`
   - `CRON_SECRET`
   - `NEXT_PUBLIC_APP_URL` (배포 후 자동 생성된 URL)
6. "Deploy" 클릭

### Vercel CLI 방식
```bash
npm install -g vercel
vercel login
vercel --prod
```

## 5단계: Cron Job 확인

배포 완료 후 Vercel 대시보드에서:
1. Project Settings → Cron Jobs
2. 매일 오전 8시 50분 (KST) = 23:50 UTC 확인
3. 로그에서 실행 결과 모니터링

## 6단계: 테스트

배포 완료 후:
1. `https://your-app.vercel.app` 접속
2. 이메일 구독 신청
3. 수동 크론 실행:
   ```bash
   curl -X GET https://your-app.vercel.app/api/cron/send-recommendations \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```
4. 이메일 수신 확인

## 📝 체크리스트

- [ ] Resend 도메인 인증 완료
- [ ] `.env.local` 업데이트
- [ ] `lib/email.ts`의 `from` 주소 변경
- [ ] Vercel 환경 변수 설정
- [ ] 배포 성공
- [ ] Cron Job 활성화 확인
- [ ] 이메일 테스트 성공

## 🔒 보안 주의사항

1. **절대 커밋하지 말 것:**
   - `.env.local` 파일
   - API 키들
   - CRON_SECRET

2. **`.gitignore` 확인:**
   ```
   .env*.local
   .env
   ```

3. **Vercel 환경 변수 관리:**
   - Production, Preview, Development 환경별로 설정 가능
   - Production용 API 키는 별도 관리 권장

## 🆘 문제 해결

### 이메일이 발송되지 않을 때
1. Resend 대시보드에서 도메인 상태 확인
2. DNS 레코드 재확인
3. Vercel 로그 확인: `vercel logs`

### Cron이 실행되지 않을 때
1. `vercel.json` 파일 존재 확인
2. Vercel 대시보드에서 Cron Jobs 탭 확인
3. CRON_SECRET 환경 변수 확인

### 구독이 안될 때
1. Supabase 데이터베이스 연결 확인
2. RLS 정책 확인
3. 브라우저 콘솔 에러 확인