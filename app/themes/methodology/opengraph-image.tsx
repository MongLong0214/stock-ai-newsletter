import { createOgLayout } from '@/lib/og-template';
import { createOgImageResponse } from '@/lib/og-image-response';

export const runtime = 'nodejs';
export const alt = 'Stock Matrix - 테마 트래킹 알고리즘';
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
          <span style={{ display: 'flex' }}>알고리즘</span>
          <span style={{ display: 'flex' }}>완전 공개</span>
        </>
      ),
      subtitle: 'TLI 점수 산출 과정',
      titleSize: 90,
    }),
    size
  );
}
