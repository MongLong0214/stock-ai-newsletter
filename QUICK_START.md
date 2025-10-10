# 🚀 빠른 시작 가이드

## 현재 상태: ✅ 로컬 테스트 완료

### ✅ 완료된 작업
1. Gemini API 연동 및 테스트 성공
2. 크론 API 엔드포인트 작동 확인
3. 데이터베이스 연결 성공
4. 이메일 템플릿 준비 완료

### 📋 다음 단계: 프로덕션 배포

#### 1️⃣ Resend 도메인 인증 (필수)

**옵션 A: 도메인이 있는 경우**
```
1. https://resend.com/domains 접속
2. Add Domain 클릭
3. 도메인 입력 및 DNS 레코드 추가
4. 도메인 인증 완료 대기 (수 분 소요)
```

**옵션 B: 도메인이 없는 경우**
```
1. Vercel에 먼저 배포
2. 자동 생성된 vercel.app 도메인 사용
3. Resend에서 vercel.app 서브도메인 인증
```

#### 2️⃣ 환경 변수 설정

**.env.local에 EMAIL_FROM 추가:**
```bash
EMAIL_FROM=AI 주식 추천 <newsletter@your-verified-domain.com>
```

#### 3️⃣ Vercel 배포

**GitHub 연동 (권장):**
```bash
# 1. GitHub 저장소 생성 후
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/username/stock-ai-newsletter.git
git push -u origin main

# 2. Vercel에서 Import Project
# 3. 환경 변수 설정 (Production):
#    - NEXT_PUBLIC_SUPABASE_URL
#    - NEXT_PUBLIC_SUPABASE_ANON_KEY
#    - GEMINI_API_KEY
#    - RESEND_API_KEY
#    - EMAIL_FROM
#    - CRON_SECRET
#    - NEXT_PUBLIC_APP_URL (배포 후 생성된 URL)
```

**Vercel CLI:**
```bash
npm install -g vercel
vercel login
vercel --prod
# 환경 변수는 대화형으로 입력
```

#### 4️⃣ 배포 후 확인

```bash
# 1. 웹사이트 접속
https://your-app.vercel.app

# 2. 구독 신청 테스트

# 3. 크론 수동 실행
curl -X GET https://your-app.vercel.app/api/cron/send-recommendations \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# 4. 이메일 수신 확인
```

#### 5️⃣ Cron Job 확인

Vercel 대시보드에서:
- Project Settings → Cron Jobs
- 매일 오전 8:50 (KST) 스케줄 확인
- Logs에서 실행 내역 모니터링

---

## 🛠️ 로컬 개발

```bash
# 개발 서버 실행
npm run dev

# Gemini 단독 테스트
node test-gemini.js

# 크론 엔드포인트 테스트
curl -X GET http://localhost:3002/api/cron/send-recommendations \
  -H "Authorization: Bearer WXn82g45+mlEtGZNL8PPL2a7d/OCLe1dMcjFZu+2kwc="
```

---

## ⚠️ 중요 체크리스트

**배포 전:**
- [ ] `.env.local`에 실제 API 키들 확인
- [ ] `.gitignore`에 `.env*` 포함 확인
- [ ] Resend 도메인 인증 완료
- [ ] `EMAIL_FROM` 환경 변수 설정

**배포 후:**
- [ ] Vercel 환경 변수 모두 설정
- [ ] `NEXT_PUBLIC_APP_URL` 업데이트
- [ ] Cron Job 활성화 확인
- [ ] 이메일 테스트 성공

---

## 📞 문제 해결

**이메일 발송 실패:**
- Resend 대시보드에서 도메인 상태 확인
- `EMAIL_FROM` 주소가 인증된 도메인인지 확인
- Vercel 로그 확인: `vercel logs`

**Cron 미실행:**
- `vercel.json` 파일 존재 확인
- Vercel 대시보드 → Cron Jobs 탭 확인
- 환경 변수 `CRON_SECRET` 설정 확인

**자세한 내용:** `DEPLOYMENT_GUIDE.md` 참조