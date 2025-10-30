# 인증 및 인가 구현 요구사항

## 개요

현재 뉴스레터 아카이브 API는 **인증 없이 공개되어 있습니다**. 프로덕션 배포 전 반드시 인증 시스템을 구현해야 합니다.

## 보안 위험

### 현재 상태 (위험도: HIGH)
- ✅ WCAG AAA 접근성 준수
- ✅ SQL 인젝션 방지
- ✅ 입력 검증 완료
- ✅ 보안 헤더 설정
- ❌ **인증/인가 미구현** (CRITICAL)
- ❌ **Rate Limiting 없음** (HIGH)

### 취약점
1. **무단 접근**: 누구나 전체 뉴스레터 아카이브 접근 가능
2. **데이터 스크래핑**: 자동화된 아카이브 다운로드 방지 불가
3. **비즈니스 데이터 노출**: 경쟁사가 투자 전략 분석 가능
4. **프리미엄 콘텐츠 보호 불가**: 유료 구독 모델 적용 불가

## 권장 구현 방안

### Option 1: NextAuth.js (권장)
**장점**: Next.js와 완벽한 통합, 다양한 Provider 지원

```bash
npm install next-auth
```

**구현 예시**:
```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      session.user.isSubscriber = await checkSubscription(token.sub);
      return session;
    },
  },
};

export const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

**API 라우트 보호**:
```typescript
// app/api/newsletter/[date]/route.ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET(request: NextRequest, { params }) {
  // 1. 인증 체크
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. 구독자 권한 체크
  if (!session.user.isSubscriber) {
    return NextResponse.json({ error: 'Subscription required' }, { status: 403 });
  }

  // 기존 로직...
}
```

### Option 2: Clerk (간편한 대안)
**장점**: 즉시 사용 가능한 UI, 적은 설정

```bash
npm install @clerk/nextjs
```

### Option 3: Supabase Auth (이미 Supabase 사용 중)
**장점**: 기존 Supabase 인프라 활용

```bash
npm install @supabase/auth-helpers-nextjs
```

## Rate Limiting 구현

### Upstash Redis 활용 (권장)
```bash
npm install @upstash/ratelimit @upstash/redis
```

**구현 예시**:
```typescript
// middleware.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10초당 10회
  analytics: true,
});

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/newsletter')) {
    const ip = request.ip ?? '127.0.0.1';
    const { success, limit, reset, remaining } = await ratelimit.limit(ip);

    if (!success) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': new Date(reset).toISOString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
```

## 구독 관리 시스템

### Supabase 테이블 구조
```sql
-- 사용자 구독 정보 테이블
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  subscription_type TEXT NOT NULL, -- 'free' | 'premium' | 'enterprise'
  status TEXT NOT NULL, -- 'active' | 'cancelled' | 'expired'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- RLS (Row Level Security) 정책
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription"
  ON user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);
```

### 구독 체크 유틸리티
```typescript
// lib/subscription.ts
export async function checkSubscription(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('status, expires_at')
    .eq('user_id', userId)
    .single();

  if (error || !data) return false;

  if (data.status !== 'active') return false;

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return false;
  }

  return true;
}
```

## 구현 우선순위

### Phase 1: 기본 인증 (1-2주)
- [ ] NextAuth.js 설정
- [ ] Google/Email Provider 연동
- [ ] Session 관리
- [ ] API 라우트 보호

### Phase 2: 구독 시스템 (1주)
- [ ] Supabase 테이블 생성
- [ ] 구독 체크 로직
- [ ] 프리미엄 콘텐츠 분리

### Phase 3: Rate Limiting (3일)
- [ ] Upstash Redis 설정
- [ ] Middleware 구현
- [ ] Rate Limit 헤더

### Phase 4: 모니터링 (1주)
- [ ] 로그인 실패 추적
- [ ] 구독 만료 알림
- [ ] Rate Limit 초과 알림

## 환경 변수 설정

```.env.local
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Upstash Redis (Rate Limiting)
UPSTASH_REDIS_REST_URL=your-upstash-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-token

# Supabase (이미 설정됨)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 프로덕션 체크리스트

배포 전 필수 확인 사항:

- [ ] 인증 시스템 구현 완료
- [ ] Rate Limiting 활성화
- [ ] 구독 관리 시스템 테스트
- [ ] Session 만료 처리 확인
- [ ] 에러 핸들링 검증
- [ ] 로그인/로그아웃 플로우 테스트
- [ ] 무단 접근 차단 확인
- [ ] 성능 테스트 (Rate Limit 포함)

## 참고 자료

- [NextAuth.js 문서](https://next-auth.js.org/)
- [Upstash Rate Limiting](https://upstash.com/docs/redis/features/ratelimiting)
- [Supabase Auth Helpers](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

## 연락처

인증 시스템 구현 관련 문의사항이 있으시면 개발팀에 문의하세요.
