/**
 * KIS 토큰 Supabase 저장/조회 서비스
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database, KisToken, KisTokenRow, KisTokenInsert } from './types';

const TOKEN_ID = 'kis_access_token';

let supabaseClient: SupabaseClient<Database> | null = null;

/**
 * Supabase 클라이언트 초기화 (lazy initialization)
 */
function getSupabase(): SupabaseClient<Database> {
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase credentials not configured. ' +
          'Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
      );
    }

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
    const { data: tokenData } = await supabase
      .from('kis_tokens')
      .select('*')
      .eq('id', TOKEN_ID)
      .single();

    if (!tokenData) {
      return null;
    }

    const row = tokenData as KisTokenRow;
    const now = Date.now();

    // 토큰이 만료되었으면 null 반환
    if (row.expires_at <= now) {
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
    const tokenRow: KisTokenInsert = {
      id: TOKEN_ID,
      access_token: token.access_token,
      expires_at: token.expires_at,
      updated_at: new Date().toISOString(),
    };
    await supabase.from('kis_tokens').upsert(tokenRow);
  } catch (error) {
    // Supabase 저장 실패해도 계속 진행 (메모리 캐시 사용)
    console.error('[KIS Token Storage] Failed to save token to Supabase:', error);
  }
}

/**
 * Supabase에서 토큰 삭제
 */
export async function deleteTokenFromStorage(): Promise<void> {
  try {
    const supabase = getSupabase();
    await supabase.from('kis_tokens').delete().eq('id', TOKEN_ID);
  } catch (error) {
    // 삭제 실패해도 무시 (토큰 만료로 자동 정리됨)
    console.error('[KIS Token Storage] Failed to delete token from Supabase:', error);
  }
}