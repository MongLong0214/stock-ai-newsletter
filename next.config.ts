import type { NextConfig } from "next";

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
              "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vercel.live https://www.googletagmanager.com https://www.clarity.ms",
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
    ];
  },
};

export default nextConfig;
