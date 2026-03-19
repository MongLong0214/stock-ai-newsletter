import { createOgLayout } from '@/lib/og-template';
import { createOgImageResponse } from '@/lib/og-image-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Stock Matrix - 30가지 기술적 지표 완벽 가이드';
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
          <span style={{ display: 'flex' }}>30개 지표</span>
          <span style={{ display: 'flex' }}>완벽 가이드</span>
        </>
      ),
      subtitle: 'RSI · MACD · 볼린저밴드',
      titleSize: 90,
    }),
    size
  );
}
