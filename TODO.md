# AI 주식 뉴스레터 - 남은 작업

## 현재 상태 (2025-10-10)

### ✅ 완료된 작업
- [x] SendGrid에서 AWS SES로 이메일 서비스 전환
- [x] AWS SES 이메일 인증 (weplay0628@gmail.com)
- [x] IAM 사용자 권한 설정 (AmazonSESFullAccess)
- [x] 이메일 전송 시스템 구현 (SESv2Client 직접 사용)
- [x] 로컬 환경 테스트 성공 (Sandbox 모드)
- [x] TypeScript 빌드 에러 해결
- [x] nodemailer 제거, AWS SDK 직접 사용

### 📧 이메일 전송 상태
- **성공**: weplay0628@gmail.com (Sandbox 모드 인증 완료)
- **실패**: chowonil0214@naver.com (미인증 - Sandbox 제한)
- **일일 한도**: 200개 (Sandbox 모드)

---

## 🔴 필수 작업

### 1. AI API 키 설정
**우선순위**: 높음
**파일**: `.env.local`

```bash
# 현재 상태
OPENAI_API_KEY=sk-your-openai-key  # ❌ 더미 키
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key  # ❌ 더미 키
GEMINI_API_KEY=your_gemini_api_key  # ✅ 작동 중

# 필요한 작업
1. OpenAI 플랫폼에서 API 키 발급
   - https://platform.openai.com/api-keys
   - 크레딧 충전 필요 ($5-20)

2. Anthropic Console에서 API 키 발급
   - https://console.anthropic.com/
   - 크레딧 충전 필요 ($5-20)

3. .env.local 파일 업데이트
```

**예상 시간**: 30분
**비용**: OpenAI $5-20, Anthropic $5-20

---

### 2. Vercel 배포
**우선순위**: 높음

**단계**:
```bash
# 1. GitHub Repository 생성 및 푸시
git init
git add .
git commit -m "Initial commit: AI stock newsletter with AWS SES"
git branch -M main
git remote add origin https://github.com/yourusername/stock-ai-newsletter.git
git push -u origin main

# 2. Vercel 프로젝트 생성
- https://vercel.com 로그인
- Import Git Repository
- stock-ai-newsletter 선택

# 3. 환경 변수 설정 (Vercel Dashboard)
# ⚠️ 주의: .env.local 파일에서 실제 값을 복사하세요
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=sk-proj-your_openai_key
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key
GEMINI_API_KEY=your_gemini_api_key
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
EMAIL_FROM=AI 주식 추천 <your_verified_email@gmail.com>
CRON_SECRET=your_cron_secret
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# 4. 배포 확인
```

**예상 시간**: 30분
**비용**: 무료

---

### 3. Vercel Cron Job 설정
**우선순위**: 높음
**파일**: `vercel.json`

**생성 필요**:
```json
{
  "crons": [
    {
      "path": "/api/cron/send-recommendations",
      "schedule": "50 23 * * *"
    }
  ]
}
```

**설명**:
- 매일 23:50 UTC (한국시간 08:50 AM)
- Authorization 헤더는 Vercel Cron에서 자동 추가

**예상 시간**: 10분

---

## 🟡 선택 작업

### 4. AWS SES Production 모드 전환
**우선순위**: 중간 (Sandbox로 초기 운영 가능)

**필요 조건**:
- 도메인 소유 (선택사항, 권장)
- AWS 심사 신청서 작성

**옵션 A: 도메인 없이 신청** (현재 상태)
- 발신 주소: weplay0628@gmail.com
- 전문성: 낮음
- 비용: 무료

**옵션 B: 도메인 구매 후 신청** (권장)
```
1. 도메인 구매
   - Google Domains / Namecheap
   - 추천: mystocknews.com ($12/년)

2. AWS SES 도메인 인증
   - DNS TXT, CNAME 레코드 추가
   - DKIM 설정

3. Production 모드 신청
   - 사용 사례 설명 (영어)
   - 1-2일 심사 대기
```

**혜택**:
- 모든 이메일 주소로 발송 가능
- 일일 50,000개 한도
- 전문적인 발신 주소 (newsletter@mystocknews.com)

**예상 시간**: 2-3시간 (도메인 설정 포함)
**비용**: $12/년 (도메인)

---

### 5. 추가 이메일 주소 인증 (Sandbox 모드)
**우선순위**: 낮음

**필요 시**:
```bash
# AWS Console → SES → Verified identities → Create identity
# Email address 선택
# 테스트 받을 이메일 주소 입력
# 인증 이메일 확인

예시:
- test@naver.com
- friend@kakao.com
- 최대 수십 개까지 가능
```

**예상 시간**: 5분/이메일

---

## 🟢 개선 작업

### 6. 에러 처리 개선
**우선순위**: 낮음

**현재 문제**:
- AI API 에러 시 경고 메시지만 표시
- Gemini만 작동, GPT/Claude는 에러

**개선 방안**:
```typescript
// lib/ai-recommendations.ts
// Fallback 로직 추가
// 재시도 횟수 증가
// 에러 알림 시스템
```

---

### 7. 모니터링 및 로깅
**우선순위**: 낮음

**추가 기능**:
```
- Sentry 에러 추적
- AWS CloudWatch 로그
- 이메일 발송 성공률 대시보드
- 일일 통계 리포트
```

---

## 📝 참고 문서

### 생성된 문서
- `AWS_SES_SETUP.md` - 전체 AWS SES 설정 가이드 (212줄)
- `.env.local.example` - 환경 변수 템플릿

### 주요 파일
- `lib/email.ts` - SESv2Client 직접 사용
- `lib/ai-recommendations.ts` - AI API 호출
- `app/api/cron/send-recommendations/route.ts` - 크론 작업
- `lib/env.ts` - 환경 변수 검증

---

## 🎯 권장 작업 순서

### Phase 1: 즉시 실행 (1시간)
1. AI API 키 발급 및 설정 (30분)
2. Vercel 배포 (30분)

### Phase 2: 배포 후 (30분)
3. Vercel Cron Job 설정 (10분)
4. 환경 변수 확인 (10분)
5. 프로덕션 테스트 (10분)

### Phase 3: 선택 (1-3일)
6. Production 모드 전환 결정
7. 도메인 구매 및 설정 (선택)
8. AWS 심사 대기

---

## 💰 예상 비용

### 필수 비용
- OpenAI API: $5-20/월
- Anthropic API: $5-20/월
- Vercel: 무료
- AWS SES: 무료 (월 3,000개까지)

### 선택 비용
- 도메인: $12/년 (선택)
- AWS SES (초과 시): $0.10/1,000개

**총 예상 월 비용**: $10-40 (도메인 제외)

---

## 🚨 주의사항

### Sandbox 모드 제한
- ⚠️ 인증된 이메일만 발송 가능
- ⚠️ 일일 200개 제한
- ⚠️ chowonil0214@naver.com 등 미인증 주소는 발송 실패

### 보안
- 🔒 `.env.local` 파일 Git 커밋 금지
- 🔒 AWS 자격 증명 노출 주의
- 🔒 CRON_SECRET 보안 유지

### API 키
- 💳 OpenAI, Anthropic 크레딧 충전 필요
- 💳 사용량 모니터링 권장
- 💳 한도 초과 방지

---

## ✅ 체크리스트

완료 시 체크:

- [ ] OpenAI API 키 발급 및 설정
- [ ] Anthropic API 키 발급 및 설정
- [ ] GitHub Repository 생성 및 푸시
- [ ] Vercel 프로젝트 배포
- [ ] Vercel 환경 변수 설정
- [ ] Vercel Cron Job 설정
- [ ] 프로덕션 환경 이메일 테스트
- [ ] AWS SES Production 모드 전환 (선택)
- [ ] 도메인 구매 및 인증 (선택)
- [ ] 모니터링 시스템 구축 (선택)

---

**마지막 업데이트**: 2025-10-10
**다음 작업 시작**: AI API 키 설정부터
