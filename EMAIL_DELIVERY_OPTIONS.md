# 📧 모든 구독자에게 이메일 발송하기

## 현재 상황

✅ **구독자**: 2명
- chowonil0214@naver.com (조원일)
- weplay0628@gmail.com (테스트 구독자)

⚠️ **Resend 무료 플랜 제약**: weplay0628@gmail.com로만 발송 가능

---

## 🚀 즉시 해결 방법 3가지

### 옵션 1: Resend 유료 플랜 업그레이드 ⭐ (추천 - 가장 빠름)

**비용**: $20/월 (50,000 이메일)

**장점**:
- ✅ 즉시 사용 가능 (5분 이내)
- ✅ 도메인 인증 필요 없음
- ✅ 모든 이메일 주소로 발송 가능
- ✅ 전문적인 이메일 인프라

**절차**:
1. https://resend.com/settings/billing 접속
2. "Upgrade to Pro" 클릭
3. 결제 정보 입력
4. 즉시 사용 가능

**재배포 필요**: ❌ 없음

---

### 옵션 2: 커스텀 도메인 구매 + 인증 (프로페셔널)

**비용**:
- 도메인: 약 $10-15/년 (예: stockai.kr)
- Resend: 무료 (월 100통까지)

**장점**:
- ✅ 브랜드 이미지 강화
- ✅ 신뢰도 향상
- ✅ 장기적으로 비용 절감

**절차**:

#### 1. 도메인 구매
- **추천 업체**: Cloudflare, Namecheap, GoDaddy
- **추천 도메인**:
  - stockai.kr
  - 주식ai.com
  - aistock.kr

#### 2. Vercel에 도메인 연결
```bash
# Vercel Dashboard
https://vercel.com/monglong0214s-projects/stock-ai-newsletter/settings/domains

# 도메인 입력 → DNS 레코드 복사
```

#### 3. Resend에 도메인 추가
```bash
# Resend Dashboard
https://resend.com/domains

# "Add Domain" 클릭 → 구매한 도메인 입력
```

#### 4. DNS 레코드 설정
도메인 업체 DNS 설정에 추가:

```
Type    Name                Value
TXT     @                   v=spf1 include:resend.com ~all
MX      @                   feedback-smtp.us-east-1.amazonses.com (Priority: 10)
CNAME   resend._domainkey   [Resend에서 제공하는 값]
```

#### 5. 도메인 인증 확인
- Resend Dashboard → "Verify Domain" 클릭
- 인증 완료까지 1-24시간 소요

#### 6. 환경 변수 업데이트
```bash
# Vercel Dashboard → Environment Variables
EMAIL_FROM=AI 주식 추천 <noreply@stockai.kr>
NEXT_PUBLIC_APP_URL=https://stockai.kr

# 재배포
vercel --prod
```

**소요 시간**: 1-24시간

---

### 옵션 3: 테스트용 임시 해결 (개발 단계)

**비용**: 무료

**방법**: chowonil0214@naver.com을 비활성화하고 weplay0628@gmail.com만 유지

```bash
# Supabase에서 직접 실행
UPDATE subscribers
SET is_active = false
WHERE email = 'chowonil0214@naver.com';
```

**장점**: 무료로 테스트 가능
**단점**: 실제 구독자에게 발송 불가

---

## 🎯 추천 선택

### 수익화 프로젝트 → **옵션 1 또는 옵션 2**

| 기준 | 옵션 1 (유료 플랜) | 옵션 2 (커스텀 도메인) |
|------|-------------------|----------------------|
| 속도 | ⚡ 5분 | 🕐 1-24시간 |
| 비용 | $20/월 | $10-15/년 |
| 브랜드 | resend.dev | ✅ 커스텀 도메인 |
| 신뢰도 | 보통 | ✅ 높음 |
| 유지보수 | 쉬움 | 보통 |

**즉시 시작하려면**: 옵션 1 ✅
**장기적 브랜딩**: 옵션 2 ✅

---

## 💡 최적 전략

### Phase 1: 빠른 시작 (지금)
1. Resend Pro 플랜 업그레이드 ($20/월)
2. 즉시 구독자에게 발송 시작
3. 피드백 수집 및 개선

### Phase 2: 브랜드 강화 (1-2주 후)
1. 커스텀 도메인 구매 (예: stockai.kr)
2. 도메인 인증 완료
3. Resend 무료 플랜으로 다운그레이드
4. 비용 절감 + 브랜드 강화

---

## 🚨 중요 참고사항

### Resend 무료 플랜 제약
- ✅ 월 100통 무료
- ⚠️ **본인 인증된 이메일(weplay0628@gmail.com)로만 발송 가능**
- ⚠️ 도메인 인증 없이는 다른 사람에게 발송 불가

### Resend Pro 플랜
- ✅ 월 50,000통
- ✅ 모든 이메일 주소로 발송 가능
- ✅ 도메인 인증 선택사항
- ✅ 전송 성공률 높음

---

## 📞 다음 단계 선택

### 선택 1: Resend Pro 업그레이드 (추천)
```bash
# 즉시 실행 가능
# 1. https://resend.com/settings/billing 접속
# 2. 결제 후 바로 크론잡 실행
curl -X GET https://stock-ai-newsletter.vercel.app/api/cron/send-recommendations \
  -H "Authorization: Bearer WXn82g45+mlEtGZNL8PPL2a7d/OCLe1dMcjFZu+2kwc="
```

### 선택 2: 커스텀 도메인 설정
```bash
# 도메인 구매 → DNS 설정 → 인증 대기 → 환경 변수 업데이트 → 재배포
```

### 선택 3: 테스트 계속
```bash
# 현재 상태 유지 (weplay0628@gmail.com로만 발송)
```

어떤 방법을 선택하시겠습니까?