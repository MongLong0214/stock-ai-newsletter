/**
 * KIS 토큰 Supabase 저장/조회 서비스
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database, KisToken, KisTokenRow, KisTokenInsert } from './types';

const TOKEN_ID = 'kis_access_token';
const TOKEN_SAFETY_MARGIN_MS = 5 * 60_000;

let supabaseClient: SupabaseClient<Database> | null = null;

/**
 * Supabase 클라이언트 초기화 (lazy initialization)
 */
function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

function getSupabase(): SupabaseClient<Database> | null {
  if (!hasSupabaseConfig()) return null;
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // kis_tokens는 RLS로 service_role 전용. 서버(API 라우트)에서만 실행되므로 service_role 우선.
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) return null;

    supabaseClient = createClient<Database>(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

/**
 * Supabase에서 토큰 조회
 */
export async function getTokenFromStorage(): Promise<KisToken | null> {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data: tokenData, error } = await supabase
      .from('kis_tokens')
      .select('*')
      .eq('id', TOKEN_ID)
      .single();

    if (error) {
      console.error('[KIS Token Storage] Failed to get token from Supabase:', error);
      return null;
    }

    if (!tokenData) {
      return null;
    }

    const row = tokenData as KisTokenRow;
    const now = Date.now();

    // 토큰이 만료되었으면 null 반환
    if (row.expires_at <= now + TOKEN_SAFETY_MARGIN_MS) {
      return null;
    }

    return {
      access_token: row.access_token,
      expires_at: row.expires_at,
    };
  } catch (error) {
    // Supabase 조회 실패 시 null 반환 (캐시 미스로 처리)
    console.error('[KIS Token Storage] Failed to get token from Supabase:', error);
    return null;
  }
}

/**
 * Supabase에 토큰 저장 (upsert)
 */
export async function saveTokenToStorage(token: KisToken): Promise<void> {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    const tokenRow: KisTokenInsert = {
      id: TOKEN_ID,
      access_token: token.access_token,
      expires_at: token.expires_at,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('kis_tokens').upsert(tokenRow);
    if (error) {
      console.error('[KIS Token Storage] upsert failed:', error.message);
    }
  } catch (error) {
    console.error('[KIS Token Storage] Failed to save token to Supabase:', error);
  }
}

export function resetKisTokenStorageForTest(): void {
  supabaseClient = null;
}
