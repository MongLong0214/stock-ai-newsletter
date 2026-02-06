import { NextResponse } from 'next/server'
import { isSupabasePlaceholder } from '@/lib/supabase'

/** 캐시 프리셋 */
const CACHE = {
  short: 'public, s-maxage=60',
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
  return apiSuccess(emptyData)
}

/** Supabase 테이블 미존재 여부 체크 */
export function isTableNotFound(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.message?.includes('does not exist')
}

/** API 라우트 에러 핸들러 */
export function handleApiError(error: unknown, context: string) {
  const message = error instanceof Error ? error.message : '알 수 없는 오류'
  console.error(`[TLI API] ${context}:`, message)
  return apiError(context)
}