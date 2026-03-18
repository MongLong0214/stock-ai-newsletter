import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const alt = '테마 생명주기 분석 - Stock Matrix';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  Peak: { label: '정점', color: '#EF4444' },
  Growth: { label: '성장', color: '#10B981' },
  Emerging: { label: '초기', color: '#3B82F6' },
  Reigniting: { label: '재점화', color: '#F97316' },
  Decline: { label: '하락', color: '#F59E0B' },
  Dormant: { label: '휴면', color: '#64748B' },
};

async function getThemeData(id: string) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
      { auth: { persistSession: false } }
    );

    const { data: theme } = await supabase
      .from('themes')
      .select('name, description')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle();

    const { data: score } = await supabase
      .from('lifecycle_scores')
      .select('score, stage')
      .eq('theme_id', id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return { theme, score };
  } catch {
    return { theme: null, score: null };
  }
}

export default async function Image({ params }: { params: { id: string } }) {
  const { id } = params;
  const { theme, score } = await getThemeData(id);

  const name = theme?.name || '테마 분석';
  const stageKey = score?.stage || 'Emerging';
  const stageInfo = STAGE_LABELS[stageKey] || STAGE_LABELS.Emerging;
  const scoreValue = score?.score ?? '--';

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

        {/* Stage badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: `${stageInfo.color}14`,
            border: `1px solid ${stageInfo.color}40`,
            borderRadius: '999px',
            padding: '10px 24px',
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: stageInfo.color,
              display: 'flex',
            }}
          />
          <span
            style={{
              fontSize: 24,
              color: stageInfo.color,
              fontWeight: 600,
            }}
          >
            {stageInfo.label} 단계
          </span>
        </div>

        {/* Title + Score + Subtitle */}
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
            {name}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '12px',
            }}
          >
            <span style={{ fontSize: 30, color: '#94a3b8' }}>생명주기 점수</span>
            <span
              style={{
                fontSize: 52,
                fontWeight: 800,
                color: '#10b981',
              }}
            >
              {scoreValue}
            </span>
            <span style={{ fontSize: 24, color: '#64748b' }}>/100</span>
          </div>
          <div
            style={{
              fontSize: 28,
              color: '#64748b',
              display: 'flex',
            }}
          >
            AI 테마 생명주기 인텔리전스
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
