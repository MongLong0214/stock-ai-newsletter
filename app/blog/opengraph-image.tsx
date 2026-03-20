import { createOgLayout } from '@/lib/og-template';
import { createOgImageResponse } from '@/lib/og-image-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Stock Matrix 블로그';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return createOgImageResponse(
    createOgLayout({
      title: '주식 분석 블로그',
      subtitle: 'AI 인사이트, 테마 분석, 기술적 지표 가이드',
      titleSize: 86,
    }),
    size
  );
}
