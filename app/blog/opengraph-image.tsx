import { ImageResponse } from 'next/og';
import { siteConfig } from '@/lib/constants/seo/config';

export const runtime = 'edge';
export const alt = 'Stock Matrix 블로그 - AI 주식 분석 인사이트';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

/**
 * 블로그 목록 페이지 Open Graph 이미지
 */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >
        {/* 배경 장식 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.05,
            background:
              'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.3) 0%, transparent 70%)',
          }}
        />

        {/* 메인 콘텐츠 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '40px',
            position: 'relative',
          }}
        >
          {/* 로고 */}
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: '24px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 64,
              fontWeight: 900,
              color: '#000',
              boxShadow: '0 20px 40px rgba(16, 185, 129, 0.3)',
            }}
          >
            SM
          </div>

          {/* 제목 */}
          <h1
            style={{
              fontSize: 80,
              fontWeight: 900,
              color: '#ffffff',
              lineHeight: 1.1,
              margin: 0,
              textAlign: 'center',
              maxWidth: '900px',
            }}
          >
            Stock Matrix 블로그
          </h1>

          {/* 설명 */}
          <p
            style={{
              fontSize: 40,
              color: '#94a3b8',
              lineHeight: 1.4,
              margin: 0,
              textAlign: 'center',
              maxWidth: '800px',
            }}
          >
            AI 기반 주식 분석 인사이트와 투자 전략을 공유합니다
          </p>

          {/* 강조 뱃지 */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              marginTop: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '999px',
                padding: '12px 32px',
                color: '#10b981',
                fontSize: 28,
                fontWeight: 600,
              }}
            >
              기술적 분석
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '999px',
                padding: '12px 32px',
                color: '#10b981',
                fontSize: 28,
                fontWeight: 600,
              }}
            >
              투자 전략
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '999px',
                padding: '12px 32px',
                color: '#10b981',
                fontSize: 28,
                fontWeight: 600,
              }}
            >
              시장 분석
            </div>
          </div>
        </div>

        {/* 하단 도메인 */}
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            fontSize: 32,
            color: '#64748b',
            fontWeight: 500,
          }}
        >
          {siteConfig.domain.replace('https://', '')}
        </div>
      </div>
    ),
    { ...size }
  );
}