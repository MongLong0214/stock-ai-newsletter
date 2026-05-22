import { NextResponse } from 'next/server'
import { isSupabasePlaceholder } from '@/lib/supabase'

/** UUID 형식 검증 정규식 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 캐시 프리셋 (Vercel Edge 캐시 강제용 CDN-Cache-Control 포함)
 *  - TLI 테마/점수는 일 단위 갱신 → 장기 캐시 안전
 *  - Vercel-CDN-Cache-Control이 Vercel Edge 캐시 우선순위
 */
const CACHE = {
  short: {
    'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
    'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    'Vercel-CDN-Cache-Control': 'public, s-maxage=600',
  },
  medium: {
    'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
    'CDN-Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
    'Vercel-CDN-Cache-Control': 'public, s-maxage=21600',
  },
  long: {
    'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=1800',
    'CDN-Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=43200',
    'Vercel-CDN-Cache-Control': 'public, s-maxage=86400',
  },
} as const

/** API 성공 응답 */
export function apiSuccess<T>(
  data: T,
  metadata?: Record<string, unknown>,
  cache: keyof typeof CACHE = 'long',
) {
  return NextResponse.json(
    { success: true as const, data, metadata },
    { headers: CACHE[cache] },
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