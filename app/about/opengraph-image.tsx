import { createOgLayout } from '@/lib/og-template';
import { createOgImageResponse } from '@/lib/og-image-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Stock Matrix - AI 주식 분석 서비스 소개';
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
          <span style={{ display: 'flex' }}>매일 아침,</span>
          <span style={{ display: 'flex' }}>AI가 분석합니다</span>
        </>
      ),
      subtitle: '30개 기술적 지표 · KOSPI · KOSDAQ',
      titleSize: 90,
    }),
    size
  );
}
