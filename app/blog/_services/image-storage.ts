/** 블로그 본문 이미지 Supabase Storage 저장소 */

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { VISUAL_CONFIG } from '../_config/pipeline-config';

const BUCKET = VISUAL_CONFIG.storageBucket;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/webp', 'image/png', 'image/jpeg'];

let bucketReady: Promise<void> | null = null;

/**
 * 공개 버킷을 보장한다 (run당 1회).
 *
 * 버킷이 없으면 만든다. 공개 읽기 버킷이어야 본문 `<img>`와 크롤러가 서명 없이 읽는다.
 * 실패한 시도는 캐시하지 않는다 — 일시 오류 한 번이 그 run의 이미지를 전부 막지 않게 한다.
 */
export function ensureBlogImageBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const supabase = getServerSupabaseClient();
    const { data } = await supabase.storage.getBucket(BUCKET);
    if (data) {
      if (!data.public) throw new Error(`스토리지 버킷 ${BUCKET}이 비공개다 — 본문 이미지가 깨진다`);
      return;
    }
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_FILE_BYTES,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    });
    // 동시 생성 경합으로 이미 있으면 성공으로 본다
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`스토리지 버킷 생성 실패: ${error.message}`);
    }
  })().catch((error: unknown) => {
    bucketReady = null;
    throw error;
  });
  return bucketReady;
}

/**
 * 이미지 업로드 → 공개 URL.
 *
 * 덮어쓰지 않는다(upsert:false). 경로에 run 고유값이 들어가므로 충돌은 곧 버그이며,
 * 덮어쓰기를 허용하면 이미 발행된 글의 이미지가 소리 없이 바뀐다.
 */
export async function uploadBlogImage(path: string, data: Buffer, contentType: string): Promise<string> {
  await ensureBlogImageBucket();
  const supabase = getServerSupabaseClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, data, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(`이미지 업로드 실패(${path}): ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** 저장되지 않은 초안의 이미지 정리 (실패해도 발행 흐름에 영향 없음) */
export async function removeBlogImages(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = getServerSupabaseClient();
  const { error } = await supabase.storage.from(BUCKET).remove([...paths]);
  if (error) console.warn(`[Visuals] 이미지 정리 실패 (${paths.length}개): ${error.message}`);
}
