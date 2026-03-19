import { createOgLayout } from '@/lib/og-template';
import { createOgImageResponse } from '@/lib/og-image-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Stock Matrix - 자주 묻는 질문';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return createOgImageResponse(
    createOgLayout({
      title: '자주 묻는 질문',
      subtitle: 'Stock Matrix AI 주식 분석 뉴스레터',
    }),
    size
  );
}
