import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'
export const alt = '테마 생명주기 분석 - StockMatrix'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  Peak: { label: '정점', color: '#EF4444' },
  Growth: { label: '성장', color: '#10B981' },
  Emerging: { label: '부상', color: '#3B82F6' },
  Reigniting: { label: '재점화', color: '#F97316' },
  Decline: { label: '하락', color: '#F59E0B' },
  Dormant: { label: '휴면', color: '#64748B' },
}

async function getThemeData(id: string) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
      { auth: { persistSession: false } }
    )

    const { data: theme } = await supabase
      .from('themes')
      .select('name, description')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle()

    const { data: score } = await supabase
      .from('lifecycle_scores')
      .select('score, stage')
      .eq('theme_id', id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return { theme, score }
  } catch {
    return { theme: null, score: null }
  }
}

export default async function Image({ params }: { params: { id: string } }) {
  const { id } = params
  const { theme, score } = await getThemeData(id)

  const name = theme?.name || '테마 분석'
  const stageKey = score?.stage || 'Emerging'
  const stageInfo = STAGE_LABELS[stageKey] || STAGE_LABELS.Emerging
  const scoreValue = score?.score ?? '--'

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
        {/* Matrix rain background */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.06,
            fontSize: '18px',
            color: '#10b981',
            display: 'flex',
            flexWrap: 'wrap',
            overflow: 'hidden',
          }}
        >
          {'01010101010101010101010101010101010101010101'.repeat(30)}
        </div>

        {/* Main card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            padding: '50px 70px',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '24px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            minWidth: '700px',
          }}
        >
          {/* Stage badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '24px',
              padding: '8px 20px',
              borderRadius: '999px',
              backgroundColor: `${stageInfo.color}18`,
              border: `1px solid ${stageInfo.color}40`,
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: stageInfo.color,
                display: 'flex',
              }}
            />
            <span
              style={{
                fontSize: '22px',
                color: stageInfo.color,
                fontWeight: 600,
              }}
            >
              {stageInfo.label} 단계
            </span>
          </div>

          {/* Theme name */}
          <div
            style={{
              fontSize: '64px',
              fontWeight: 'bold',
              color: '#fff',
              marginBottom: '16px',
              display: 'flex',
              textAlign: 'center',
            }}
          >
            {name}
          </div>

          {/* Divider */}
          <div
            style={{
              width: '400px',
              height: '1px',
              background: 'linear-gradient(to right, transparent, #10b981, transparent)',
              marginBottom: '24px',
              display: 'flex',
            }}
          />

          {/* Score */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '12px',
              marginBottom: '12px',
            }}
          >
            <span style={{ fontSize: '28px', color: '#94a3b8' }}>
              생명주기 점수
            </span>
            <span
              style={{
                fontSize: '56px',
                fontWeight: 'bold',
                color: '#10b981',
              }}
            >
              {scoreValue}
            </span>
            <span style={{ fontSize: '24px', color: '#64748b' }}>/100</span>
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: '22px',
              color: '#64748b',
              display: 'flex',
            }}
          >
            AI 테마 생명주기 인텔리전스
          </div>
        </div>

        {/* Bottom branding */}
        <div
          style={{
            position: 'absolute',
            bottom: '36px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span
            style={{
              fontSize: '26px',
              color: '#10b981',
              fontWeight: 'bold',
              letterSpacing: '4px',
              opacity: 0.8,
            }}
          >
            STOCK MATRIX
          </span>
          <span style={{ fontSize: '20px', color: '#334155' }}>|</span>
          <span style={{ fontSize: '20px', color: '#475569' }}>
            stockmatrix.co.kr
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
