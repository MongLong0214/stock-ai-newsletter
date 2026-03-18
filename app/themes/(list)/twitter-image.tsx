import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Stock Matrix - 테마 생명주기 분석';
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
          background: '#0c1222',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          overflow: 'hidden',
        }}
      >
        {/* Card 1 - Gauge Card (top-left) */}
        <div
          style={{
            position: 'absolute',
            top: '25px',
            left: '-40px',
            width: '340px',
            height: '220px',
            background: '#0f1729',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(-6deg)',
            opacity: 0.55,
            display: 'flex',
            flexDirection: 'column',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', color: '#4b5563', display: 'flex' }}>TLI 점수</span>
            <span style={{ fontSize: '11px', color: '#4b5563', display: 'flex' }}>관심도</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '38px', fontWeight: 700, color: '#e2e8f0', display: 'flex' }}>85</span>
            <span style={{ fontSize: '38px', fontWeight: 700, color: '#e2e8f0', display: 'flex' }}>72</span>
          </div>
          <span style={{ fontSize: '10px', color: '#374151', marginBottom: '12px', display: 'flex' }}>지난 30일</span>
          <div style={{ width: '100%', height: '5px', background: '#1a2332', borderRadius: '3px', display: 'flex' }}>
            <div style={{ width: '68%', height: '5px', background: '#10b98133', borderRadius: '3px', display: 'flex' }} />
          </div>
        </div>

        {/* Card 2 - Trend Chart (mid-left) */}
        <div
          style={{
            position: 'absolute',
            top: '160px',
            left: '30px',
            width: '260px',
            height: '160px',
            background: '#0f1729',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(-3deg)',
            opacity: 0.5,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#4b5563', marginBottom: '10px', display: 'flex' }}>관심도 추이</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', flex: 1 }}>
            <div style={{ width: '8px', height: '30px', background: '#10b98125', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '8px', height: '45px', background: '#10b98125', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '8px', height: '35px', background: '#10b98125', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '8px', height: '60px', background: '#10b98125', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '8px', height: '50px', background: '#10b98125', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '8px', height: '70px', background: '#10b98125', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '8px', height: '55px', background: '#10b98125', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '8px', height: '80px', background: '#10b98125', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '8px', height: '65px', background: '#10b98125', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '8px', height: '40px', background: '#10b98125', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '8px', height: '55px', background: '#10b98125', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '8px', height: '20px', background: '#10b98125', borderRadius: '2px', display: 'flex' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '8px', color: '#1e293b', display: 'flex' }}>09:00</span>
            <span style={{ fontSize: '8px', color: '#1e293b', display: 'flex' }}>10:00</span>
            <span style={{ fontSize: '8px', color: '#1e293b', display: 'flex' }}>11:00</span>
          </div>
        </div>

        {/* Card 3 - Active Themes (top-right) */}
        <div
          style={{
            position: 'absolute',
            top: '60px',
            right: '-20px',
            width: '280px',
            height: '200px',
            background: '#0f1729',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(4deg)',
            opacity: 0.55,
            display: 'flex',
            flexDirection: 'column',
            padding: '24px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#4b5563', marginBottom: '4px', display: 'flex' }}>활성 테마</span>
          <span style={{ fontSize: '48px', fontWeight: 700, color: '#8B5CF6', display: 'flex' }}>73</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', marginTop: '8px' }}>
            <div style={{ width: '4px', height: '15px', background: '#8B5CF620', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '4px', height: '25px', background: '#8B5CF620', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '4px', height: '10px', background: '#8B5CF620', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '4px', height: '35px', background: '#8B5CF620', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '4px', height: '20px', background: '#8B5CF620', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '4px', height: '30px', background: '#8B5CF620', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '4px', height: '18px', background: '#8B5CF620', borderRadius: '2px', display: 'flex' }} />
            <div style={{ width: '4px', height: '28px', background: '#8B5CF620', borderRadius: '2px', display: 'flex' }} />
          </div>
          <span style={{ fontSize: '10px', color: '#10b981', marginTop: '8px', display: 'flex' }}>+5 전일 대비</span>
        </div>

        {/* Card 4 - Theme Table (far top-right) */}
        <div
          style={{
            position: 'absolute',
            top: '-10px',
            right: '-80px',
            width: '320px',
            height: '180px',
            background: '#0f1729',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(3deg)',
            opacity: 0.45,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
            gap: '14px',
          }}
        >
          <span style={{ fontSize: '10px', color: '#4b5563', display: 'flex' }}>테마별 거래량</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3B82F6', display: 'flex' }} />
            <span style={{ fontSize: '11px', color: '#6b7280', display: 'flex', width: '60px' }}>반도체</span>
            <div style={{ width: '40px', height: '5px', background: '#3B82F620', borderRadius: '3px', display: 'flex' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', display: 'flex' }} />
            <span style={{ fontSize: '11px', color: '#6b7280', display: 'flex', width: '60px' }}>2차전지</span>
            <div style={{ width: '32px', height: '5px', background: '#10B98120', borderRadius: '3px', display: 'flex' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B', display: 'flex' }} />
            <span style={{ fontSize: '11px', color: '#6b7280', display: 'flex', width: '60px' }}>AI</span>
            <div style={{ width: '28px', height: '5px', background: '#F59E0B20', borderRadius: '3px', display: 'flex' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', display: 'flex' }} />
            <span style={{ fontSize: '11px', color: '#6b7280', display: 'flex', width: '60px' }}>바이오</span>
            <div style={{ width: '22px', height: '5px', background: '#EF444420', borderRadius: '3px', display: 'flex' }} />
          </div>
        </div>

        {/* Card 5 - Scatter Plot (bottom-left) */}
        <div
          style={{
            position: 'absolute',
            bottom: '-10px',
            left: '-40px',
            width: '400px',
            height: '260px',
            background: '#0f1729',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(-2deg)',
            opacity: 0.5,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#4b5563', marginBottom: '10px', display: 'flex' }}>테마 분포도</span>
          <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
            <div style={{ position: 'absolute', top: '20%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.03)', display: 'flex' }} />
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.03)', display: 'flex' }} />
            <div style={{ position: 'absolute', top: '80%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.03)', display: 'flex' }} />
            <div style={{ position: 'absolute', top: '25%', left: '15%', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', opacity: 0.3, display: 'flex' }} />
            <div style={{ position: 'absolute', top: '40%', left: '25%', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', opacity: 0.2, display: 'flex' }} />
            <div style={{ position: 'absolute', top: '55%', left: '40%', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', opacity: 0.35, display: 'flex' }} />
            <div style={{ position: 'absolute', top: '30%', left: '55%', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', opacity: 0.15, display: 'flex' }} />
            <div style={{ position: 'absolute', top: '65%', left: '35%', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', opacity: 0.4, display: 'flex' }} />
            <div style={{ position: 'absolute', top: '20%', left: '70%', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', opacity: 0.25, display: 'flex' }} />
            <div style={{ position: 'absolute', top: '75%', left: '60%', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', opacity: 0.3, display: 'flex' }} />
            <div style={{ position: 'absolute', top: '45%', left: '80%', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', opacity: 0.2, display: 'flex' }} />
            <div style={{ position: 'absolute', top: '60%', left: '18%', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', opacity: 0.15, display: 'flex' }} />
            <div style={{ position: 'absolute', top: '35%', left: '48%', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', opacity: 0.35, display: 'flex' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontSize: '8px', color: '#1e293b', display: 'flex' }}>10</span>
            <span style={{ fontSize: '8px', color: '#1e293b', display: 'flex' }}>20</span>
            <span style={{ fontSize: '8px', color: '#1e293b', display: 'flex' }}>30</span>
            <span style={{ fontSize: '8px', color: '#1e293b', display: 'flex' }}>40</span>
            <span style={{ fontSize: '8px', color: '#1e293b', display: 'flex' }}>50</span>
            <span style={{ fontSize: '8px', color: '#1e293b', display: 'flex' }}>60</span>
            <span style={{ fontSize: '8px', color: '#1e293b', display: 'flex' }}>70</span>
            <span style={{ fontSize: '8px', color: '#1e293b', display: 'flex' }}>80</span>
          </div>
        </div>

        {/* Card 6 - Bar Chart (bottom-right) */}
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '-40px',
            width: '320px',
            height: '220px',
            background: '#0f1729',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(3deg)',
            opacity: 0.5,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
          }}
        >
          <span style={{ fontSize: '10px', color: '#4b5563', marginBottom: '10px', display: 'flex' }}>지표별 분포</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flex: 1 }}>
            <div style={{ width: '28px', height: '35px', background: '#10b98118', borderRadius: '3px', display: 'flex' }} />
            <div style={{ width: '28px', height: '60px', background: '#10b98118', borderRadius: '3px', display: 'flex' }} />
            <div style={{ width: '28px', height: '80px', background: '#10b98118', borderRadius: '3px', display: 'flex' }} />
            <div style={{ width: '28px', height: '50px', background: '#10b98118', borderRadius: '3px', display: 'flex' }} />
            <div style={{ width: '28px', height: '25px', background: '#10b98118', borderRadius: '3px', display: 'flex' }} />
            <div style={{ width: '28px', height: '45px', background: '#10b98118', borderRadius: '3px', display: 'flex' }} />
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#10b98140', display: 'flex' }} />
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#3B82F640', display: 'flex' }} />
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#F59E0B40', display: 'flex' }} />
          </div>
        </div>

        {/* Brand */}
        <div
          style={{
            position: 'absolute',
            top: '48px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#10b981',
              display: 'flex',
            }}
          />
          <span style={{ fontSize: '22px', fontWeight: 600, color: '#94a3b8', letterSpacing: '1px' }}>
            Stock Matrix
          </span>
        </div>

        {/* Hero Text */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontSize: '100px',
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.0,
              letterSpacing: '-2px',
              display: 'flex',
            }}
          >
            테마 생명주기.
          </div>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 400,
              color: '#64748b',
              letterSpacing: '0.5px',
              display: 'flex',
            }}
          >
            한국 주식시장 테마의 탄생부터 쇠퇴까지
          </div>
        </div>

        {/* Domain */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            right: '50px',
            fontSize: '18px',
            color: '#334155',
            display: 'flex',
          }}
        >
          stockmatrix.co.kr
        </div>
      </div>
    ),
    { ...size }
  );
}
