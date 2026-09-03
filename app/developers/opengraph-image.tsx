import { createOgLayout } from '@/lib/og-template';
import { createOgImageResponse } from '@/lib/og-image-response';
import { siteConfig } from '@/lib/constants/seo/config';

export const runtime = 'nodejs';
export const revalidate = 86400;
export const alt = 'StockMatrix - MCP 서버 개발자 가이드';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return createOgImageResponse(
    createOgLayout({
      title: 'MCP 서버',
      subtitle: `${siteConfig.themeCountFloor}+ 한국 주식 테마 데이터 API`,
    }),
    size
  );
}
