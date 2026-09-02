import type { NextConfig } from "next";
import { MERGED_BLOG_REDIRECTS } from './app/blog/_config/merged-redirects';

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    root: process.cwd(),
  },

  // 정적 페이지(OG 이미지·sitemap 등) 생성 타임아웃 상향(기본 60s).
  // 대량 페이지 빌드 후반 리소스 경합 시 60s 초과로 실패하던 문제의 안전망.
  staticPageGenerationTimeout: 180,

  // 보안 헤더 설정 (Enterprise Security Standards)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            // Vercel 기본값은 max-age만 붙는다. www가 유효한 인증서를 갖게 된 뒤에야
            // includeSubDomains를 켤 수 있다 — 그 전에 켰다면 www를 접속 불가로 만들었다.
            // preload는 등재 후 해제에 수개월이 걸리므로 hstspreload.org 제출 시점에 추가한다.
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vercel.live https://www.googletagmanager.com https://*.clarity.ms",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://vitals.vercel-insights.com https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://*.clarity.ms https://c.bing.com",
              "frame-src https://vercel.live",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: '/icon',
        destination: '/icon-512.png',
        permanent: true,
      },
      // 병합된 블로그 글 — 중복 클러스터의 패자를 승자로 영구 이동.
      // 정적 맵이라 런타임 DB 조회가 없다.
      ...MERGED_BLOG_REDIRECTS.map((r) => ({
        source: r.from,
        destination: r.to,
        permanent: true,
      })),
    ];
  },
};

export default nextConfig;
