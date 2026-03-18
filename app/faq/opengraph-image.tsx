import { ImageResponse } from 'next/og';
import { createOgLayout } from '@/lib/og-template';

export const runtime = 'edge';
export const alt = 'Stock Matrix - 자주 묻는 질문';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    createOgLayout({
      title: '자주 묻는 질문',
      subtitle: 'Stock Matrix AI 주식 분석 뉴스레터',
    }),
    { ...size }
  );
}
