import { createOgLayout } from '@/lib/og-template';
import { createOgImageResponse } from '@/lib/og-image-response';

export const runtime = 'nodejs';
// 태그 라벨은 거의 바뀌지 않으므로 반복 크롤링의 이미지 재렌더링을 줄인다.
export const revalidate = 604800;

// 빌드 타임 프리렌더 제외 → 첫 요청 시 온디맨드 렌더 후 7일간 ISR 캐시.
export function generateStaticParams() {
  return [];
}

export const alt = 'StockMatrix 블로그 태그';
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
