import { ImageResponse } from 'next/og';
import { createOgLayout } from '@/lib/og-template';

export const runtime = 'edge';
export const alt = 'Stock Matrix - AI 주식 분석 뉴스레터';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    createOgLayout({
      title: 'AI 주식 분석',
      subtitle: '매일 오전 7:30, 30개 지표로 분석한 3종목',
    }),
    { ...size }
  );
}