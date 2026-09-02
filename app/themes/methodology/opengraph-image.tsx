import { createOgLayout } from '@/lib/og-template';
import { createOgImageResponse } from '@/lib/og-image-response';

export const runtime = 'nodejs';
export const revalidate = 86400;
export const alt = 'StockMatrix - 테마 추적 알고리즘';
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
          <span style={{ display: 'flex' }}>테마 추적</span>
          <span style={{ display: 'flex' }}>알고리즘</span>
        </>
      ),
      subtitle: '점수와 방향 전망 계산 과정',
      titleSize: 90,
    }),
    size
  );
}
