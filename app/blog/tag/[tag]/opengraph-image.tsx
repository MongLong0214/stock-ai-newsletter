import { createOgLayout } from '@/lib/og-template';
import { createOgImageResponse } from '@/lib/og-image-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Stock Matrix 블로그 태그';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

function normalizeTagLabel(rawTag: string): string {
  const decoded = decodeURIComponent(rawTag).trim();
  if (!decoded) return '주식 태그';
  return decoded.length > 18 ? `${decoded.slice(0, 18)}...` : decoded;
}

export default async function Image({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const tagLabel = normalizeTagLabel(tag);

  return createOgImageResponse(
    createOgLayout({
      title: `#${tagLabel}`,
      subtitle: '태그별 AI 주식 분석 아카이브',
      titleSize: tagLabel.length > 8 ? 88 : 104,
    }),
    size
  );
}
