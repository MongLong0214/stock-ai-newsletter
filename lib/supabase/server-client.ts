/**
 * 서버 사이드 Supabase 클라이언트
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 싱글톤 클라이언트 캐시
let cachedClient: SupabaseClient | null = null;

/**
 * 서버 사이드용 Supabase 클라이언트 생성
 * Service role key가 있으면 사용, 없으면 anon key 사용
 */
export function getServerSupabaseClient(): SupabaseClient {
  // 캐시된 클라이언트가 있으면 재사용
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceRoleKey || anonKey;

  // 환경변수 상태 로깅 (프로덕션에서 디버깅용)
  if (!url) {
    console.error('[Supabase] NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.');
  }
  if (!serviceRoleKey && !anonKey) {
    console.error(
      '[Supabase] SUPABASE_SERVICE_ROLE_KEY 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.'
    );
  }

  if (!url || !key) {
    throw new Error(
      'Supabase 환경변수가 설정되지 않았습니다. ' +
        `URL: ${url ? '설정됨' : '없음'}, ` +
        `SERVICE_ROLE_KEY: ${serviceRoleKey ? '설정됨' : '없음'}, ` +
        `ANON_KEY: ${anonKey ? '설정됨' : '없음'}`
    );
  }

  // 사용 중인 키 타입 로깅
  console.log(
    `[Supabase] 클라이언트 초기화: ${serviceRoleKey ? 'service_role' : 'anon'} 키 사용`
  );

  cachedClient = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });

  return cachedClient;
}