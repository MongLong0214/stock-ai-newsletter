import { createOgLayout } from '@/lib/og-template';
import { createOgImageResponse } from '@/lib/og-image-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Stock Matrix - 테마 생명주기 분석';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return createOgImageResponse(
    createOgLayout({
      title: '테마 생명주기',
      subtitle: '한국 주식시장 테마의 탄생부터 쇠퇴까지',
    }),
    size
  );
}
