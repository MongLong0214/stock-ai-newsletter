import { ImageResponse } from 'next/og';
import { createOgLayout } from '@/lib/og-template';

export const runtime = 'edge';
export const alt = 'Stock Matrix - 테마 트래킹 알고리즘';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
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
    { ...size }
  );
}
