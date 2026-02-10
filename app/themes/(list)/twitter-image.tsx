import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'StockMatrix 테마 트래커 — AI로 분석하는 주식 테마 생명주기';
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
          backgroundImage: 'linear-gradient(to bottom, #000, #001210)',
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
            opacity: 0.08,
            fontSize: '18px',
            color: '#10b981',
            display: 'flex',
            flexWrap: 'wrap',
            overflow: 'hidden',
            lineHeight: 1.2,
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
            width: '900px',
          }}
        >
          {/* Small logo/title */}
          <div
            style={{
              fontSize: '48px',
              fontWeight: 'bold',
              color: '#10b981',
              letterSpacing: '4px',
              marginBottom: '40px',
              display: 'flex',
            }}
          >
            STOCK MATRIX
          </div>

          {/* Main Title */}
          <div
            style={{
              fontSize: '64px',
              fontWeight: 'bold',
              color: '#fff',
              marginBottom: '30px',
              display: 'flex',
            }}
          >
            테마 생명주기 분석
          </div>

          {/* Lifecycle stages visualization */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              marginBottom: '35px',
              padding: '30px 40px',
              border: '2px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '16px',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
            }}
          >
            {/* Early */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  marginBottom: '12px',
                  display: 'flex',
                }}
              />
              <div
                style={{
                  fontSize: '24px',
                  color: '#10b981',
                  fontWeight: 'bold',
                  display: 'flex',
                }}
              >
                Early
              </div>
              <div
                style={{
                  fontSize: '18px',
                  color: '#64748b',
                  display: 'flex',
                }}
              >
                초기
              </div>
            </div>

            {/* Arrow */}
            <div
              style={{
                fontSize: '40px',
                color: '#334155',
                display: 'flex',
              }}
            >
              →
            </div>

            {/* Growth */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#0ea5e9',
                  marginBottom: '12px',
                  display: 'flex',
                }}
              />
              <div
                style={{
                  fontSize: '24px',
                  color: '#0ea5e9',
                  fontWeight: 'bold',
                  display: 'flex',
                }}
              >
                Growth
              </div>
              <div
                style={{
                  fontSize: '18px',
                  color: '#64748b',
                  display: 'flex',
                }}
              >
                성장
              </div>
            </div>

            {/* Arrow */}
            <div
              style={{
                fontSize: '40px',
                color: '#334155',
                display: 'flex',
              }}
            >
              →
            </div>

            {/* Peak */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#f59e0b',
                  marginBottom: '12px',
                  display: 'flex',
                }}
              />
              <div
                style={{
                  fontSize: '24px',
                  color: '#f59e0b',
                  fontWeight: 'bold',
                  display: 'flex',
                }}
              >
                Peak
              </div>
              <div
                style={{
                  fontSize: '18px',
                  color: '#64748b',
                  display: 'flex',
                }}
              >
                과열
              </div>
            </div>

            {/* Arrow */}
            <div
              style={{
                fontSize: '40px',
                color: '#334155',
                display: 'flex',
              }}
            >
              →
            </div>

            {/* Decay */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  marginBottom: '12px',
                  display: 'flex',
                }}
              />
              <div
                style={{
                  fontSize: '24px',
                  color: '#ef4444',
                  fontWeight: 'bold',
                  display: 'flex',
                }}
              >
                Decay
              </div>
              <div
                style={{
                  fontSize: '18px',
                  color: '#64748b',
                  display: 'flex',
                }}
              >
                쇠퇴
              </div>
            </div>
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: '28px',
              color: '#94a3b8',
              display: 'flex',
              textAlign: 'center',
            }}
          >
            한국 주식시장 테마의 탄생부터 쇠퇴까지
          </div>
        </div>

        {/* Bottom domain */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            fontSize: '26px',
            color: '#10b981',
            opacity: 0.8,
            display: 'flex',
          }}
        >
          stockmatrix.co.kr/themes
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}