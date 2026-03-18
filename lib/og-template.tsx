import { type ReactNode } from 'react';

interface OgLayoutOptions {
  title: ReactNode;
  subtitle: string;
  titleSize?: number;
  titleLineHeight?: number;
}

export function createOgLayout({
  title,
  subtitle,
  titleSize = 120,
  titleLineHeight = 1.0,
}: OgLayoutOptions): React.JSX.Element {
  return (
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
      {/* Card 1 - Top-left: line chart (partially cut off) */}
      <div
        style={{
          position: 'absolute',
          top: '-30px',
          left: '-60px',
          width: '360px',
          height: '200px',
          background: '#111827',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '16px',
          transform: 'rotate(-3deg)',
          opacity: 0.3,
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', flex: 1 }}>
          <div style={{ width: '3px', height: '30px', background: '#10b98130', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '3px', height: '45px', background: '#10b98130', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '3px', height: '35px', background: '#10b98130', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '3px', height: '55px', background: '#10b98130', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '3px', height: '40px', background: '#10b98130', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '3px', height: '60px', background: '#10b98130', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '3px', height: '50px', background: '#10b98130', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '3px', height: '70px', background: '#10b98130', borderRadius: '1px', display: 'flex' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
          <span style={{ fontSize: '8px', color: '#334155', display: 'flex' }}>10:30</span>
          <span style={{ fontSize: '8px', color: '#334155', display: 'flex' }}>11:00</span>
          <span style={{ fontSize: '8px', color: '#334155', display: 'flex' }}>11:30</span>
          <span style={{ fontSize: '8px', color: '#334155', display: 'flex' }}>12:00</span>
        </div>
      </div>

      {/* Card 2 - Left: gauge metrics (300 / 80) */}
      <div
        style={{
          position: 'absolute',
          top: '140px',
          left: '-40px',
          width: '320px',
          height: '220px',
          background: '#111827',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '16px',
          transform: 'rotate(-4deg)',
          opacity: 0.45,
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
        }}
      >
        <span style={{ fontSize: '9px', color: '#475569', display: 'flex', marginBottom: '4px' }}>TLI 점수</span>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '44px', fontWeight: 700, color: '#10b98140', display: 'flex' }}>85</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '44px', fontWeight: 700, color: '#3B82F630', display: 'flex' }}>72</span>
          </div>
        </div>
        <span style={{ fontSize: '8px', color: '#334155', display: 'flex' }}>지난 30일</span>
      </div>

      {/* Card 3 - Bottom-left: scatter plot (most visible) */}
      <div
        style={{
          position: 'absolute',
          bottom: '-20px',
          left: '-30px',
          width: '420px',
          height: '280px',
          background: '#111827',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '16px',
          transform: 'rotate(-3deg)',
          opacity: 0.55,
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
        }}
      >
        <span style={{ fontSize: '10px', color: '#64748b', display: 'flex', marginBottom: '8px' }}>테마 분포도</span>
        <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '1px', background: 'rgba(255,255,255,0.05)', display: 'flex' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '1px', height: '100%', background: 'rgba(255,255,255,0.05)', display: 'flex' }} />
          <div style={{ position: 'absolute', top: '15px', left: '25px', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', opacity: 0.5, display: 'flex' }} />
          <div style={{ position: 'absolute', top: '40px', left: '60px', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', opacity: 0.4, display: 'flex' }} />
          <div style={{ position: 'absolute', top: '55px', left: '100px', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', opacity: 0.5, display: 'flex' }} />
          <div style={{ position: 'absolute', top: '30px', left: '140px', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', opacity: 0.35, display: 'flex' }} />
          <div style={{ position: 'absolute', top: '70px', left: '80px', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', opacity: 0.45, display: 'flex' }} />
          <div style={{ position: 'absolute', top: '50px', left: '180px', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', opacity: 0.5, display: 'flex' }} />
          <div style={{ position: 'absolute', top: '85px', left: '120px', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', opacity: 0.4, display: 'flex' }} />
          <div style={{ position: 'absolute', top: '25px', left: '220px', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', opacity: 0.35, display: 'flex' }} />
          <div style={{ position: 'absolute', top: '65px', left: '200px', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', opacity: 0.5, display: 'flex' }} />
          <div style={{ position: 'absolute', top: '95px', left: '160px', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', opacity: 0.4, display: 'flex' }} />
          <div style={{ position: 'absolute', top: '45px', left: '260px', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', opacity: 0.45, display: 'flex' }} />
          <div style={{ position: 'absolute', top: '80px', left: '300px', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', opacity: 0.35, display: 'flex' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>10</span>
          <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>20</span>
          <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>30</span>
          <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>40</span>
          <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>50</span>
          <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>60</span>
          <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>70</span>
          <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>80</span>
        </div>
      </div>

      {/* Card 4 - Right: "Users online" / 298 (prominent, overlaps title) */}
      <div
        style={{
          position: 'absolute',
          top: '80px',
          right: '-10px',
          width: '280px',
          height: '220px',
          background: '#0f1729',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          transform: 'rotate(5deg)',
          opacity: 0.6,
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
        }}
      >
        <span style={{ fontSize: '10px', color: '#64748b', display: 'flex', marginBottom: '4px' }}>활성 테마</span>
        <span style={{ fontSize: '56px', fontWeight: 700, color: '#8B5CF6', opacity: 0.7, display: 'flex' }}>73</span>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', marginTop: '8px', flex: 1 }}>
          <div style={{ width: '4px', height: '20px', background: '#8B5CF615', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '4px', height: '35px', background: '#8B5CF615', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '4px', height: '25px', background: '#8B5CF615', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '4px', height: '40px', background: '#8B5CF615', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '4px', height: '30px', background: '#8B5CF615', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '4px', height: '45px', background: '#8B5CF615', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '4px', height: '35px', background: '#8B5CF615', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '4px', height: '50px', background: '#8B5CF615', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '4px', height: '28px', background: '#8B5CF615', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '4px', height: '42px', background: '#8B5CF615', borderRadius: '1px', display: 'flex' }} />
        </div>
      </div>

      {/* Card 5 - Top-right: traffic chart (partially cut off) */}
      <div
        style={{
          position: 'absolute',
          top: '-20px',
          right: '-80px',
          width: '300px',
          height: '180px',
          background: '#111827',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '16px',
          transform: 'rotate(3deg)',
          opacity: 0.3,
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
        }}
      >
        <span style={{ fontSize: '9px', color: '#475569', display: 'flex', marginBottom: '8px' }}>테마별 거래량</span>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', flex: 1 }}>
          <div style={{ width: '6px', height: '20px', background: '#10b98120', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '6px', height: '35px', background: '#10b98120', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '6px', height: '28px', background: '#10b98120', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '6px', height: '42px', background: '#10b98120', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '6px', height: '30px', background: '#10b98120', borderRadius: '1px', display: 'flex' }} />
          <div style={{ width: '6px', height: '50px', background: '#10b98120', borderRadius: '1px', display: 'flex' }} />
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#10b981', opacity: 0.4, display: 'flex' }} />
            <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>반도체</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#3B82F6', opacity: 0.4, display: 'flex' }} />
            <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>AI</span>
          </div>
        </div>
      </div>

      {/* Card 6 - Bottom-right: bar chart (partially cut off) */}
      <div
        style={{
          position: 'absolute',
          bottom: '-10px',
          right: '-60px',
          width: '320px',
          height: '240px',
          background: '#111827',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '16px',
          transform: 'rotate(2deg)',
          opacity: 0.35,
          display: 'flex',
          flexDirection: 'column',
          padding: '18px',
        }}
      >
        <span style={{ fontSize: '9px', color: '#475569', display: 'flex', marginBottom: '8px' }}>지표별 분포</span>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', flex: 1 }}>
          <div style={{ width: '20px', height: '80px', background: '#10b98118', borderRadius: '2px', display: 'flex' }} />
          <div style={{ width: '20px', height: '45px', background: '#3B82F618', borderRadius: '2px', display: 'flex' }} />
          <div style={{ width: '20px', height: '65px', background: '#10b98118', borderRadius: '2px', display: 'flex' }} />
          <div style={{ width: '20px', height: '30px', background: '#F59E0B18', borderRadius: '2px', display: 'flex' }} />
          <div style={{ width: '20px', height: '90px', background: '#10b98118', borderRadius: '2px', display: 'flex' }} />
          <div style={{ width: '20px', height: '55px', background: '#8B5CF618', borderRadius: '2px', display: 'flex' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>09:00</span>
          <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>09:30</span>
          <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>10:00</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#10b981', opacity: 0.4, display: 'flex' }} />
            <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>RSI</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#F59E0B', opacity: 0.4, display: 'flex' }} />
            <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>MACD</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#8B5CF6', opacity: 0.4, display: 'flex' }} />
            <span style={{ fontSize: '7px', color: '#334155', display: 'flex' }}>BB</span>
          </div>
        </div>
      </div>

      {/* Brand */}
      <div style={{ position: 'absolute', top: '50px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', display: 'flex' }}
        />
        <span style={{ fontSize: '18px', fontWeight: 600, color: '#94a3b8', letterSpacing: '1.5px', display: 'flex' }}>
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
          maxWidth: '1000px',
          padding: '0 60px',
          marginTop: '20px',
        }}
      >
        <div
          style={{
            fontSize: `${titleSize}px`,
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: titleLineHeight,
            letterSpacing: '-3px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: '20px',
            fontWeight: 400,
            color: '#64748b',
            textAlign: 'center',
            lineHeight: 1.5,
            display: 'flex',
          }}
        >
          {subtitle}
        </div>
      </div>

      {/* Domain */}
      <div
        style={{
          position: 'absolute',
          bottom: '36px',
          right: '48px',
          fontSize: '14px',
          color: '#1e293b',
          display: 'flex',
        }}
      >
        stockmatrix.co.kr
      </div>
    </div>
  );
}
