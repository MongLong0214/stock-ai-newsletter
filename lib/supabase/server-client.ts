/**
 * 서버 사이드 Supabase 클라이언트
 */

import { createClient } from '@supabase/supabase-js';

/**
 * 서버 사이드용 Supabase 클라이언트 생성
 * Service role key가 있으면 사용, 없으면 anon key 사용
 */
export function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
}