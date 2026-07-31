/**
 * KIS 토큰 Supabase 저장/조회 서비스.
 * kis_tokens는 service-role 전용 서버 자산이며 anon fallback을 허용하지 않는다.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database, KisToken, KisTokenRow, KisTokenInsert } from './types';

const TOKEN_ID = 'kis_access_token';

let supabaseClient: SupabaseClient<Database> | null = null;

export class KisTokenStorageError extends Error {
  readonly name = 'KisTokenStorageError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** Supabase service-role client lazy initialization. */
function getSupabase(): SupabaseClient<Database> {
  if (supabaseClient) return supabaseClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new KisTokenStorageError(
      'KIS token storage requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  supabaseClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

/** Supabase에서 유효한 토큰 조회. 저장소 오류는 cache miss로 위장하지 않는다. */
export async function getTokenFromStorage(): Promise<KisToken | null> {
  const supabase = getSupabase();
  const { data: tokenData, error } = await supabase
    .from('kis_tokens')
    .select('*')
    .eq('id', TOKEN_ID)
    .maybeSingle();

  if (error) {
    throw new KisTokenStorageError(`Failed to read KIS token storage: ${error.message}`);
  }
  if (!tokenData) return null;

  const row = tokenData as KisTokenRow;
  if (row.expires_at <= Date.now()) return null;

  return {
    access_token: row.access_token,
    expires_at: row.expires_at,
  };
}

/** Supabase에 토큰 저장. 실패를 삼키지 않아 반복 발급을 방지한다. */
export async function saveTokenToStorage(token: KisToken): Promise<void> {
  const supabase = getSupabase();
  const tokenRow: KisTokenInsert = {
    id: TOKEN_ID,
    access_token: token.access_token,
    expires_at: token.expires_at,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('kis_tokens').upsert(tokenRow);
  if (error) {
    throw new KisTokenStorageError(`Failed to persist KIS token: ${error.message}`);
  }
}

/** 401/403으로 거절된 정확한 저장 토큰만 삭제한다. 새로 갱신된 토큰은 보존한다. */
export async function invalidateTokenInStorage(rejectedAccessToken: string): Promise<void> {
  if (!rejectedAccessToken) {
    throw new KisTokenStorageError('Rejected KIS access token is required for invalidation');
  }
  const supabase = getSupabase();
  const { error } = await supabase
    .from('kis_tokens')
    .delete()
    .eq('id', TOKEN_ID)
    .eq('access_token', rejectedAccessToken);
  if (error) {
    throw new KisTokenStorageError(`Failed to invalidate KIS token: ${error.message}`);
  }
}
