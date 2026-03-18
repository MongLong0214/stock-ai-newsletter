import { ImageResponse } from 'next/og';
import { createOgLayout } from '@/lib/og-template';

export const runtime = 'edge';
export const alt = 'Stock Matrix - MCP 서버 개발자 가이드';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    createOgLayout({
      title: 'MCP 서버',
      subtitle: '250+ 한국 주식 테마 데이터 API',
    }),
    { ...size }
  );
}
