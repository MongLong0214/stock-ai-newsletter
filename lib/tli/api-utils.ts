import { NextResponse } from 'next/server'
import { isSupabasePlaceholder } from '@/lib/supabase'

/** UUID 형식 검증 정규식 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 캐시 프리셋 */
const CACHE = {
  short: 'public, s-maxage=60',
  medium: 'public, s-maxage=300, stale-while-revalidate=600',
  long: 'public, s-maxage=3600, stale-while-revalidate=1800',
} as const

/** API 성공 응답 */
export function apiSuccess<T>(
  data: T,
  metadata?: Record<string, unknown>,
  cache: keyof typeof CACHE = 'long',
) {
  return NextResponse.json(
    { success: true as const, data, metadata },
    { headers: { 'Cache-Control': CACHE[cache] } },
  )
}

/** API 에러 응답 */
export function apiError(message: string, status = 500) {
  return NextResponse.json(
    { success: false as const, error: { message } },
    { status },
  )
}

/** Supabase 미설정 시 빈 응답 */
export function placeholderResponse<T>(emptyData: T) {
  if (!isSupabasePlaceholder) return null
  return apiSuccess(emptyData, undefined, 'short')
}

/** Supabase 테이블 미존재 여부 체크 */
export function isTableNotFound(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.message?.includes('does not exist')
}

/** API 라우트 에러 핸들러 */
export function handleApiError(error: unknown, context: string) {
  console.error(`[TLI API] ${context}:`, error)
  return apiError(context)
}

/** ilike 쿼리의 SQL 와일드카드 이스케이프 */
export function escapeIlike(str: string): string {
  return str.replace(/%/g, '\\%').replace(/_/g, '\\_')
}