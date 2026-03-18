import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Stock Matrix - AI 주식 분석 뉴스레터';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0a0a0a 0%, #0f1a14 50%, #0a0a0a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '70px 80px',
          position: 'relative',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Subtle accent glow */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '600px',
            height: '600px',
            background:
              'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 60%)',
            display: 'flex',
          }}
        />

        {/* Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: '999px',
            padding: '10px 24px',
            color: '#10b981',
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          AI 주식 분석 뉴스레터
        </div>

        {/* Title + Subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.1,
              display: 'flex',
            }}
          >
            Stock Matrix
          </div>
          <div
            style={{
              fontSize: 32,
              color: '#64748b',
              lineHeight: 1.4,
              display: 'flex',
            }}
          >
            매일 오전 7:30 · AI가 분석한 KOSPI·KOSDAQ 3종목
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            width: '100%',
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 900,
              color: '#000',
            }}
          >
            SM
          </div>
          <span style={{ fontSize: 30, fontWeight: 700, color: '#ffffff' }}>
            Stock Matrix
          </span>
          <div style={{ flex: 1, display: 'flex' }} />
          <span style={{ fontSize: 24, color: '#475569' }}>stockmatrix.co.kr</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
