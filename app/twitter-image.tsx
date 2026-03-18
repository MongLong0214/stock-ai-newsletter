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
        {/* Card 1 — Gauge Card (top-left) */}
        <div
          style={{
            position: 'absolute',
            top: '25px',
            left: '-40px',
            width: '340px',
            height: '220px',
            background: '#111827',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(-6deg)',
            opacity: 0.55,
            display: 'flex',
            flexDirection: 'column',
            padding: '18px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', display: 'flex' }}>TLI 점수</span>
            <span style={{ fontSize: '11px', color: '#64748b', display: 'flex' }}>관심도</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '42px', fontWeight: 700, color: '#e2e8f0', display: 'flex' }}>85</span>
              <div style={{ width: '60px', height: '4px', background: '#1e293b', borderRadius: '2px', display: 'flex' }}>
                <div style={{ width: '85%', height: '4px', background: '#10b981', borderRadius: '2px', display: 'flex' }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '42px', fontWeight: 700, color: '#cbd5e1', display: 'flex' }}>72</span>
              <div style={{ width: '60px', height: '4px', background: '#1e293b', borderRadius: '2px', display: 'flex' }}>
                <div style={{ width: '72%', height: '4px', background: '#10b981', borderRadius: '2px', display: 'flex' }} />
              </div>
            </div>
          </div>
          <span style={{ fontSize: '10px', color: '#475569', display: 'flex', marginTop: '8px' }}>지난 30일</span>
        </div>

        {/* Card 2 — Activity Chart (top-left, overlapping) */}
        <div
          style={{
            position: 'absolute',
            top: '140px',
            left: '20px',
            width: '280px',
            height: '170px',
            background: '#111827',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(-3deg)',
            opacity: 0.5,
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#64748b', display: 'flex', marginBottom: '12px' }}>관심도 추이</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', flex: 1 }}>
            {[28, 35, 22, 40, 52, 45, 60, 55, 70, 48, 62, 75, 58, 80, 72, 85, 68, 78, 90, 82].map((h, i) => (
              <div key={`bar-${i}`} style={{ width: '10px', height: `${h}px`, background: 'rgba(16,185,129,0.25)', borderRadius: '2px', display: 'flex' }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '8px', color: '#334155', display: 'flex' }}>09:00</span>
            <span style={{ fontSize: '8px', color: '#334155', display: 'flex' }}>09:30</span>
            <span style={{ fontSize: '8px', color: '#334155', display: 'flex' }}>10:00</span>
          </div>
        </div>

        {/* Card 3 — Active Themes (top-right) */}
        <div
          style={{
            position: 'absolute',
            top: '60px',
            right: '-20px',
            width: '280px',
            height: '200px',
            background: '#111827',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(4deg)',
            opacity: 0.55,
            display: 'flex',
            flexDirection: 'column',
            padding: '18px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#64748b', display: 'flex', marginBottom: '8px' }}>활성 테마</span>
          <span style={{ fontSize: '48px', fontWeight: 700, color: '#8B5CF6', display: 'flex' }}>73</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', flex: 1, marginTop: '8px' }}>
            {[18, 22, 15, 28, 32, 25, 35, 30, 38, 42, 36, 45].map((h, i) => (
              <div key={`sp-${i}`} style={{ width: '14px', height: `${h}px`, background: 'rgba(139,92,246,0.2)', borderRadius: '2px', display: 'flex' }} />
            ))}
          </div>
          <span style={{ fontSize: '10px', color: '#22c55e', display: 'flex', marginTop: '6px' }}>전일 대비 +5</span>
        </div>

        {/* Card 4 — Theme Volume Table (top-right, partially off screen) */}
        <div
          style={{
            position: 'absolute',
            top: '0px',
            right: '-60px',
            width: '300px',
            height: '160px',
            background: '#111827',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(3deg)',
            opacity: 0.5,
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '10px', color: '#64748b', display: 'flex', marginBottom: '4px' }}>테마별 거래량</span>
          {[
            { color: '#10b981', name: '반도체', width: '75%' },
            { color: '#3b82f6', name: '2차전지', width: '60%' },
            { color: '#f59e0b', name: 'AI', width: '88%' },
            { color: '#ef4444', name: '바이오', width: '45%' },
          ].map((row, i) => (
            <div key={`vol-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: row.color, display: 'flex' }} />
              <span style={{ fontSize: '11px', color: '#94a3b8', width: '52px', display: 'flex' }}>{row.name}</span>
              <div style={{ flex: 1, height: '6px', background: '#1e293b', borderRadius: '3px', display: 'flex' }}>
                <div style={{ width: row.width, height: '6px', background: row.color, opacity: 0.4, borderRadius: '3px', display: 'flex' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Card 5 — Scatter Plot (bottom-left) */}
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '-30px',
            width: '380px',
            height: '240px',
            background: '#111827',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(-2deg)',
            opacity: 0.5,
            display: 'flex',
            flexDirection: 'column',
            padding: '18px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#64748b', display: 'flex', marginBottom: '12px' }}>테마 분포도</span>
          <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
            <div style={{ position: 'absolute', bottom: '0px', left: '0px', width: '100%', height: '1px', background: 'rgba(255,255,255,0.06)', display: 'flex' }} />
            <div style={{ position: 'absolute', bottom: '0px', left: '0px', width: '1px', height: '100%', background: 'rgba(255,255,255,0.06)', display: 'flex' }} />
            {[
              { top: 20, left: 30 }, { top: 50, left: 80 }, { top: 35, left: 140 },
              { top: 70, left: 60 }, { top: 15, left: 200 }, { top: 55, left: 170 },
              { top: 80, left: 120 }, { top: 40, left: 250 }, { top: 65, left: 220 },
              { top: 25, left: 280 }, { top: 90, left: 190 }, { top: 45, left: 310 },
            ].map((dot, i) => (
              <div key={`dot-${i}`} style={{ position: 'absolute', top: `${dot.top}px`, left: `${dot.left}px`, width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', opacity: 0.35, display: 'flex' }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            {['10', '20', '30', '40', '50', '60', '70', '80'].map((label) => (
              <span key={label} style={{ fontSize: '8px', color: '#334155', display: 'flex' }}>{label}</span>
            ))}
          </div>
        </div>

        {/* Card 6 — Bar Chart (bottom-right) */}
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '-30px',
            width: '300px',
            height: '200px',
            background: '#111827',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(3deg)',
            opacity: 0.5,
            display: 'flex',
            flexDirection: 'column',
            padding: '18px',
          }}
        >
          <span style={{ fontSize: '10px', color: '#64748b', display: 'flex', marginBottom: '12px' }}>지표별 분포</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flex: 1 }}>
            {[
              { h: 65, color: '#10b981' },
              { h: 80, color: '#3b82f6' },
              { h: 35, color: '#f59e0b' },
              { h: 95, color: '#10b981' },
              { h: 50, color: '#8B5CF6' },
              { h: 70, color: '#3b82f6' },
            ].map((bar, i) => (
              <div key={`dist-${i}`} style={{ width: '30px', height: `${bar.h}px`, background: bar.color, opacity: 0.25, borderRadius: '4px', display: 'flex' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            {[
              { color: '#10b981', label: 'RSI' },
              { color: '#3b82f6', label: 'MACD' },
              { color: '#f59e0b', label: 'BB' },
            ].map((legend) => (
              <div key={legend.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: legend.color, display: 'flex' }} />
                <span style={{ fontSize: '8px', color: '#475569', display: 'flex' }}>{legend.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Brand (top center) */}
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
          <span
            style={{
              fontSize: '22px',
              fontWeight: 600,
              color: '#94a3b8',
              letterSpacing: '1px',
              display: 'flex',
            }}
          >
            Stock Matrix
          </span>
        </div>

        {/* Hero Text */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontSize: '100px',
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.0,
              textAlign: 'center',
              letterSpacing: '-2px',
              display: 'flex',
            }}
          >
            AI 주식 분석.
          </div>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 400,
              color: '#64748b',
              textAlign: 'center',
              display: 'flex',
            }}
          >
            매일 오전 7:30, 30개 지표로 분석한 3종목
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
