import { createOgLayout } from '@/lib/og-template';
import { createOgImageResponse } from '@/lib/og-image-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Stock Matrix - 무료 구독 시작하기';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return createOgImageResponse(
    createOgLayout({
      title: (
        <>
          <span style={{ display: 'flex' }}>무료로</span>
          <span style={{ display: 'flex' }}>시작하세요</span>
        </>
      ),
      subtitle: '매일 아침 7:30, AI 분석 리포트가 도착합니다',
      titleSize: 90,
    }),
    size
  );
}
