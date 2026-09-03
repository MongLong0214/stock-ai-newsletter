import { createOgLayout } from '@/lib/og-template';
import { createOgImageResponse } from '@/lib/og-image-response';
import { getThemeSeoData } from './theme-seo-data';

export const runtime = 'nodejs';
export const revalidate = 86400;

// 빌드 타임 프리렌더 제외 → 첫 요청 시 온디맨드 렌더 후 ISR 캐시(하루).
// 활성 테마 수백 개의 무거운 Satori 렌더가 빌드를 OOM/타임아웃시키던 문제 해소.
export function generateStaticParams() {
  return [];
}

export const alt = '테마 생명주기 분석 - StockMatrix';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  Peak: { label: '정점', color: '#EF4444' },
  Growth: { label: '성장', color: '#10B981' },
  Emerging: { label: '초기', color: '#3B82F6' },
  Reigniting: { label: '재점화', color: '#F97316' },
  Decline: { label: '하락', color: '#F59E0B' },
  Dormant: { label: '휴면', color: '#64748B' },
};

export default async function Image({ params }: { params: { id: string } }) {
  const { id } = params;
  const theme = await getThemeSeoData(id);

  const name = theme?.name || '테마 분석';
  const stageKey = theme?.stage || 'Emerging';
  const stageInfo = STAGE_LABELS[stageKey] || STAGE_LABELS.Emerging;
  const scoreValue = theme?.score ?? '--';

  return createOgImageResponse(
    createOgLayout({
      title: name,
      subtitle: `생명주기 점수 ${scoreValue}/100 · ${stageInfo.label} 단계`,
      titleSize: name.length > 8 ? 80 : 120,
    }),
    size
  );
}
