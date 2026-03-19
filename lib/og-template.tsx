import React, { type CSSProperties, type ReactNode } from 'react';
import { siteConfig } from '@/lib/constants/seo/config';

interface OgLayoutOptions {
  title: ReactNode;
  subtitle: string;
  titleSize?: number;
  titleLineHeight?: number;
  titleMaxWidth?: number;
  subtitleMaxWidth?: number;
}

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;

const COLORS = {
  backgroundTop: '#050505',
  backgroundBottom: '#000000',
  panel: '#0b1211',
  panelStrong: '#111918',
  border: 'rgba(16, 185, 129, 0.12)',
  borderStrong: 'rgba(0, 255, 65, 0.22)',
  text: '#eef5ef',
  muted: '#95a8a1',
  faint: '#4f7768',
  greenPrimary: '#00ff41',
  greenPrimarySoft: 'rgba(0, 255, 65, 0.14)',
  emerald: '#10b981',
  emeraldSoft: 'rgba(16, 185, 129, 0.16)',
  mint: '#8ef2bf',
  mintSoft: 'rgba(142, 242, 191, 0.18)',
  grid: 'rgba(16, 185, 129, 0.14)',
  glow: 'rgba(0, 255, 65, 0.12)',
  shadow: '0 28px 56px rgba(0, 0, 0, 0.38), 0 0 0 1px rgba(16, 185, 129, 0.04)',
} as const;

const dots = Array.from({ length: 14 }, (_, row) =>
  Array.from({ length: 27 }, (_, col) => ({
    key: `${row}-${col}`,
    left: 82 + col * 40,
    top: 48 + row * 40,
    opacity: row >= 4 && row <= 9 && col >= 8 && col <= 18 ? 0.26 : 0.1,
  }))
).flat();

const sharedLabelStyle: CSSProperties = {
  display: 'flex',
  fontSize: 12,
  lineHeight: 1,
  color: COLORS.faint,
};

const sharedTickStyle: CSSProperties = {
  display: 'flex',
  fontSize: 9,
  lineHeight: 1,
  color: 'rgba(118, 150, 138, 0.82)',
};

function Panel({
  style,
  children,
}: {
  style: CSSProperties;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 24,
        background: `linear-gradient(180deg, ${COLORS.panelStrong} 0%, ${COLORS.panel} 100%)`,
        border: `1px solid ${COLORS.border}`,
        boxShadow: COLORS.shadow,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function LogoMark(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 512 512"
      width="30"
      height="30"
      style={{ display: 'flex', borderRadius: 8, overflow: 'hidden' }}
    >
      <defs>
        <linearGradient id="stockmatrix-og-logo-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00FF41" stopOpacity="1" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="1" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="96" fill="#000000" />
      <path
        d="M 80 384 L 128 320 L 176 368 L 224 256 L 272 304 L 320 176 L 368 224 L 432 112 L 432 432 L 80 432 Z"
        fill="url(#stockmatrix-og-logo-grad)"
        opacity="0.15"
      />
      <path
        d="M 80 384 L 128 320 L 176 368 L 224 256 L 272 304 L 320 176 L 368 224 L 432 112"
        stroke="url(#stockmatrix-og-logo-grad)"
        strokeWidth="48"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="432" cy="112" r="40" fill="#00FF41" />
      <circle cx="432" cy="112" r="64" fill="none" stroke="#00FF41" strokeWidth="12" opacity="0.4" />
    </svg>
  );
}

function LineChartCard({
  title,
  style,
  bars,
  accent = COLORS.greenPrimary,
}: {
  title: string;
  style: CSSProperties;
  bars: number[];
  accent?: string;
}): React.JSX.Element {
  return (
    <Panel style={{ padding: '18px 20px', opacity: 0.22, ...style }}>
      <div style={{ ...sharedLabelStyle, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', position: 'relative', flex: 1, width: '100%' }}>
        {[24, 54, 84, 114].map((top) => (
          <div
            key={top}
            style={{
              position: 'absolute',
              left: 0,
              top,
              width: '100%',
              height: 1,
              background: 'rgba(16, 185, 129, 0.08)',
              display: 'flex',
            }}
          />
        ))}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, width: '100%', height: '100%' }}>
          {bars.map((value, index) => (
            <div
              key={`${title}-${index}`}
              style={{
                display: 'flex',
                width: 8,
                height: value,
                borderRadius: 999,
                background: index % 2 === 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(0, 255, 65, 0.14)',
              }}
            />
          ))}
        </div>
        <svg
          viewBox="0 0 300 138"
          width="300"
          height="138"
          style={{ position: 'absolute', inset: 0, opacity: 0.92 }}
        >
          <polyline
            fill="none"
            stroke={accent}
            strokeWidth="2"
            strokeOpacity="0.46"
            points="0,96 18,92 30,101 42,90 54,95 66,84 78,98 90,86 102,91 114,83 126,92 138,81 150,88 162,78 174,92 186,73 198,89 210,76 222,93 234,79 246,90 258,82 270,95 282,86 300,92"
          />
          <polyline
            fill="none"
            stroke={COLORS.mint}
            strokeWidth="1.5"
            strokeOpacity="0.16"
            points="0,110 18,106 30,104 42,101 54,103 66,98 78,104 90,97 102,99 114,95 126,98 138,94 150,96 162,92 174,98 186,88 198,94 210,90 222,99 234,91 246,94 258,90 270,97 282,92 300,95"
          />
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        {['09:00', '09:30', '10:00', '10:30', '11:00'].map((tick) => (
          <div key={tick} style={sharedTickStyle}>
            {tick}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function GaugeCard({ style }: { style: CSSProperties }): React.JSX.Element {
  return (
    <Panel style={{ padding: '18px 22px', opacity: 0.2, ...style }}>
      <div style={{ ...sharedLabelStyle, marginBottom: 12 }}>Signal coverage</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1 }}>
        {[
          { value: '30', label: 'Indicators' },
          { value: '250', label: 'Themes' },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: 146,
              height: 146,
              position: 'relative',
            }}
          >
            <svg viewBox="0 0 146 146" width="146" height="146" style={{ position: 'absolute', inset: 0 }}>
              <circle cx="73" cy="73" r="54" fill="none" stroke="rgba(16, 185, 129, 0.1)" strokeWidth="10" />
              <circle
                cx="73"
                cy="73"
                r="54"
                fill="none"
                stroke="rgba(0, 255, 65, 0.34)"
                strokeWidth="10"
                strokeDasharray="228 339"
                strokeLinecap="round"
                transform="rotate(124 73 73)"
              />
            </svg>
            <div style={{ display: 'flex', fontSize: 54, fontWeight: 700, color: 'rgba(16, 185, 129, 0.32)' }}>
              {item.value}
            </div>
            <div style={{ display: 'flex', marginTop: 2, fontSize: 12, color: COLORS.faint }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ScatterCard({ style }: { style: CSSProperties }): React.JSX.Element {
  const points = [
    [18, 72], [22, 48], [26, 30], [32, 58], [37, 20], [44, 62], [52, 36], [56, 52],
    [61, 26], [68, 48], [72, 34], [78, 70], [84, 42], [90, 22], [96, 60], [102, 32],
    [108, 54], [114, 18], [120, 64], [126, 40], [132, 56], [138, 27], [145, 50],
    [151, 35], [158, 72], [164, 21], [170, 58], [176, 31], [182, 45], [188, 68],
    [196, 24], [202, 52], [208, 16], [214, 66], [220, 42], [226, 54], [232, 28],
    [238, 48], [246, 36], [252, 62], [258, 23], [264, 58], [270, 30], [278, 67],
    [284, 40], [290, 20], [296, 56], [302, 34], [308, 70], [314, 28], [320, 60],
  ];

  return (
    <Panel style={{ padding: '18px 20px 16px', opacity: 0.8, ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={sharedLabelStyle}>Theme dispersion</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {['+', 'x'].map((icon) => (
            <div key={icon} style={{ ...sharedTickStyle, fontSize: 12 }}>
              {icon}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', position: 'relative', flex: 1, width: '100%' }}>
        <svg viewBox="0 0 330 132" width="330" height="132" style={{ display: 'flex', width: '100%', height: '100%' }}>
          {[24, 56, 88, 120].map((y) => (
            <line key={y} x1="0" y1={y} x2="330" y2={y} stroke="rgba(16, 185, 129, 0.08)" strokeWidth="1" />
          ))}
          {[32, 80, 128, 176, 224, 272, 320].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="132" stroke="rgba(16, 185, 129, 0.05)" strokeWidth="1" />
          ))}
          {points.map(([x, y], index) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r={index % 7 === 0 ? 3.2 : 2.4}
              fill={index % 4 === 0 ? COLORS.mint : COLORS.emerald}
              fillOpacity={index % 5 === 0 ? 0.94 : 0.78}
            />
          ))}
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        {['0', '10', '20', '30', '40', '50', '60', '70', '80'].map((tick) => (
          <div key={tick} style={sharedTickStyle}>
            {tick}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AccentMetricCard({ style }: { style: CSSProperties }): React.JSX.Element {
  return (
    <Panel
      style={{
        padding: '18px 18px 16px',
        background: 'linear-gradient(180deg, rgba(11, 22, 18, 0.98) 0%, rgba(5, 10, 8, 0.98) 100%)',
        border: '1px solid rgba(16, 185, 129, 0.16)',
        opacity: 1,
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', fontSize: 12, color: 'rgba(216, 255, 233, 0.84)' }}>Themes tracked</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {['//', '...'].map((icon) => (
            <div key={icon} style={{ ...sharedTickStyle, color: 'rgba(145, 225, 179, 0.5)' }}>
              {icon}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 68,
          lineHeight: 1,
          fontWeight: 700,
          letterSpacing: -3,
          color: 'rgba(142, 242, 191, 0.88)',
          marginBottom: 8,
          textShadow: '0 0 14px rgba(16, 185, 129, 0.1)',
        }}
      >
        250+
      </div>
      <svg viewBox="0 0 180 78" width="180" height="78" style={{ display: 'flex', width: '100%', marginTop: 'auto' }}>
        <polyline
          fill="none"
          stroke={COLORS.emerald}
          strokeWidth="2"
          strokeOpacity="0.62"
          points="0,62 10,42 18,68 28,34 36,58 46,24 56,52 66,18 76,56 86,12 96,48 106,20 116,60 126,14 136,50 146,26 156,58 166,34 180,54"
        />
        {Array.from({ length: 12 }, (_, index) => (
          <line
            key={index}
            x1={index * 16}
            y1="0"
            x2={index * 16}
            y2="78"
            stroke="rgba(16, 185, 129, 0.04)"
            strokeWidth="1"
          />
        ))}
      </svg>
    </Panel>
  );
}

function MutedStatCard({ style }: { style: CSSProperties }): React.JSX.Element {
  return (
    <Panel style={{ padding: '18px 20px', opacity: 0.12, ...style }}>
      <div style={{ ...sharedLabelStyle, marginBottom: 8 }}>Coverage status</div>
      <div style={{ display: 'flex', fontSize: 64, lineHeight: 1, fontWeight: 700, color: 'rgba(16, 185, 129, 0.12)' }}>
        2
      </div>
      <div style={{ display: 'flex', marginTop: 8, fontSize: 11, color: 'rgba(95, 131, 117, 0.84)' }}>
        KOSPI · KOSDAQ
      </div>
    </Panel>
  );
}

function BarsCard({ style }: { style: CSSProperties }): React.JSX.Element {
  const bars = [56, 72, 82, 66, 94, 108, 84, 96, 118, 104, 90, 112];
  const ticks = ['09:00', '09:20', '09:40', '10:00', '10:20', '10:40'];

  return (
    <Panel style={{ padding: '18px 20px', opacity: 0.22, ...style }}>
      <div style={{ ...sharedLabelStyle, marginBottom: 10 }}>Signal mix by session</div>
      <div style={{ display: 'flex', position: 'relative', flex: 1, width: '100%' }}>
        {[30, 60, 90, 120].map((top) => (
          <div
            key={top}
            style={{
              position: 'absolute',
              left: 0,
              top,
              width: '100%',
              height: 1,
              background: 'rgba(16, 185, 129, 0.08)',
              display: 'flex',
            }}
          />
        ))}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flex: 1 }}>
          {bars.map((height, index) => (
            <div
              key={height}
              style={{
                display: 'flex',
                width: 16,
                height,
                borderRadius: 999,
                background: index % 3 === 1 ? COLORS.greenPrimarySoft : 'rgba(16, 185, 129, 0.14)',
              }}
            />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        {ticks.map((tick) => (
          <div key={tick} style={sharedTickStyle}>
            {tick}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function createOgLayout({
  title,
  subtitle,
  titleSize = 108,
  titleLineHeight = 0.98,
  titleMaxWidth = 700,
  subtitleMaxWidth = 560,
}: OgLayoutOptions): React.JSX.Element {
  const host = siteConfig.domain.replace(/^https?:\/\//, '');

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${COLORS.backgroundTop} 0%, ${COLORS.backgroundBottom} 100%)`,
        fontFamily: '"Noto Sans KR", sans-serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          background: 'linear-gradient(90deg, rgba(0, 0, 0, 0.46) 0%, rgba(0, 0, 0, 0.08) 18%, rgba(0, 0, 0, 0.08) 82%, rgba(0, 0, 0, 0.46) 100%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          background: 'linear-gradient(180deg, transparent 50%, rgba(16, 185, 129, 0.035) 50%)',
          backgroundSize: '100% 4px',
          opacity: 0.6,
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: -132,
          left: 290,
          width: 640,
          height: 640,
          borderRadius: '50%',
          display: 'flex',
          background: 'radial-gradient(circle, rgba(0, 255, 65, 0.12) 0%, rgba(16, 185, 129, 0.03) 38%, rgba(0, 255, 65, 0) 72%)',
        }}
      />

      {dots.map((dot) => (
        <div
          key={dot.key}
          style={{
            position: 'absolute',
            display: 'flex',
            left: dot.left,
            top: dot.top,
            width: 2,
            height: 2,
            borderRadius: '50%',
            background: COLORS.grid,
            opacity: dot.opacity,
          }}
        />
      ))}

      <LineChartCard
        title="Market pulse"
        style={{ top: 2, left: -92, width: 394, height: 170, transform: 'rotate(-0.6deg)' }}
        bars={[44, 58, 62, 48, 66, 72, 64, 74, 60, 76, 70, 84, 68, 74, 80, 66, 70, 86]}
      />

      <GaugeCard style={{ top: 244, left: -96, width: 410, height: 182, transform: 'rotate(0.4deg)' }} />

      <ScatterCard style={{ left: -28, bottom: -26, width: 446, height: 230, transform: 'rotate(7.2deg)' }} />

      <LineChartCard
        title="Theme velocity"
        style={{ top: 2, right: -40, width: 308, height: 168, transform: 'rotate(-0.5deg)' }}
        bars={[54, 62, 58, 68, 74, 70, 66, 82, 76, 88, 80, 74, 84, 90]}
        accent={COLORS.emerald}
      />

      <AccentMetricCard style={{ top: 174, right: 126, width: 184, height: 196, transform: 'rotate(8.8deg)' }} />
      <MutedStatCard style={{ top: 246, right: -40, width: 232, height: 174 }} />
      <BarsCard style={{ right: -20, bottom: -8, width: 320, height: 210, transform: 'rotate(0.8deg)' }} />

      <div
        style={{
          position: 'relative',
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '86px 120px 56px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <LogoMark />
          <div style={{ display: 'flex', fontSize: 17, fontWeight: 700, color: '#e7fff0' }}>
            {siteConfig.serviceName}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            maxWidth: 760,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              maxWidth: titleMaxWidth,
              padding: '0 18px',
              fontSize: titleSize,
              lineHeight: titleLineHeight,
              letterSpacing: -4.5,
              fontWeight: 780,
              color: COLORS.text,
              textShadow: '0 8px 22px rgba(0, 0, 0, 0.28)',
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
              wordBreak: 'keep-all',
              overflowWrap: 'anywhere',
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 18,
              maxWidth: subtitleMaxWidth,
              fontSize: 18,
              lineHeight: 1.45,
              fontWeight: 500,
              color: COLORS.muted,
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
              wordBreak: 'keep-all',
              overflowWrap: 'anywhere',
            }}
          >
            {subtitle}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 26,
            fontSize: 11,
            letterSpacing: 2.6,
            textTransform: 'uppercase',
            color: 'rgba(86, 132, 112, 0.42)',
          }}
        >
          {host}
        </div>
      </div>
    </div>
  );
}
