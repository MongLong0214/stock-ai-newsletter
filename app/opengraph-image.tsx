import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'STOCK MATRIX - AI 주식 분석 뉴스레터';
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
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
          backgroundImage: 'linear-gradient(to bottom, #000, #001a00)',
          position: 'relative',
        }}
      >
        {/* Matrix rain effect background */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.1,
            fontSize: '20px',
            color: '#00ff41',
            display: 'flex',
            flexWrap: 'wrap',
            overflow: 'hidden',
          }}
        >
          {'01010101010101010101010101010101010101010101'.repeat(30)}
        </div>

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            padding: '60px',
            border: '2px solid #00ff41',
            borderRadius: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
          }}
        >
          {/* Logo/Title */}
          <div
            style={{
              fontSize: '80px',
              fontWeight: 'bold',
              color: '#00ff41',
              letterSpacing: '8px',
              marginBottom: '20px',
              textShadow: '0 0 20px #00ff41, 0 0 40px #00ff41',
              display: 'flex',
            }}
          >
            STOCK MATRIX
          </div>

          {/* Divider */}
          <div
            style={{
              width: '600px',
              height: '2px',
              background: 'linear-gradient(to right, transparent, #00ff41, transparent)',
              marginBottom: '30px',
              display: 'flex',
            }}
          />

          {/* Description */}
          <div
            style={{
              fontSize: '36px',
              color: '#fff',
              marginBottom: '15px',
              display: 'flex',
            }}
          >
            3개의 AI가 분석한 주간 급등 종목 추천
          </div>

          {/* Target */}
          <div
            style={{
              fontSize: '32px',
              color: '#00ff41',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span style={{ marginRight: '10px' }}>📈</span>
            매주 10% 수익 목표
          </div>
        </div>

        {/* Bottom domain */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            fontSize: '28px',
            color: '#00ff41',
            opacity: 0.8,
            display: 'flex',
          }}
        >
          stockmatrix.co.kr
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}