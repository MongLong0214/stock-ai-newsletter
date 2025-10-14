import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'STOCK MATRIX - AI 주식 분석';
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
          backgroundImage: 'linear-gradient(135deg, #000 0%, #001210 100%)',
          position: 'relative',
        }}
      >
        {/* Scanline effect */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.05,
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #10b981 2px, #10b981 4px)',
            display: 'flex',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          {/* Logo */}
          <div
            style={{
              fontSize: '90px',
              fontWeight: 'bold',
              color: '#10b981',
              letterSpacing: '10px',
              marginBottom: '30px',
              textShadow: '0 0 30px #10b981',
              display: 'flex',
            }}
          >
            STOCK
          </div>
          <div
            style={{
              fontSize: '90px',
              fontWeight: 'bold',
              color: '#10b981',
              letterSpacing: '10px',
              marginBottom: '40px',
              textShadow: '0 0 30px #10b981',
              display: 'flex',
            }}
          >
            MATRIX
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: '38px',
              color: '#fff',
              marginBottom: '20px',
              display: 'flex',
            }}
          >
            AI 주식 분석 뉴스레터
          </div>

          {/* Stats */}
          <div
            style={{
              display: 'flex',
              gap: '40px',
              marginTop: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '48px',
                  color: '#10b981',
                  fontWeight: 'bold',
                  display: 'flex',
                }}
              >
                3
              </div>
              <div
                style={{
                  fontSize: '24px',
                  color: '#fff',
                  display: 'flex',
                }}
              >
                AI 분석
              </div>
            </div>

            <div
              style={{
                width: '2px',
                height: '80px',
                background: '#10b981',
                opacity: 0.3,
                display: 'flex',
              }}
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '48px',
                  color: '#10b981',
                  fontWeight: 'bold',
                  display: 'flex',
                }}
              >
                7일
              </div>
              <div
                style={{
                  fontSize: '24px',
                  color: '#fff',
                  display: 'flex',
                }}
              >
                주간 추천
              </div>
            </div>

            <div
              style={{
                width: '2px',
                height: '80px',
                background: '#10b981',
                opacity: 0.3,
                display: 'flex',
              }}
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '48px',
                  color: '#10b981',
                  fontWeight: 'bold',
                  display: 'flex',
                }}
              >
                10%
              </div>
              <div
                style={{
                  fontSize: '24px',
                  color: '#fff',
                  display: 'flex',
                }}
              >
                수익 목표
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}