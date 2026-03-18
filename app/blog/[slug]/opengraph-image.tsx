import { ImageResponse } from 'next/og';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { isValidBlogSlug } from '../_utils/slug-validator';

export const runtime = 'edge';
export const alt = 'Stock Matrix 블로그';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

async function getBlogPost(slug: string) {
  const supabase = getServerSupabaseClient();
  const { data } = await supabase
    .from('blog_posts')
    .select('title, description, category, published_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();
  return data;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidBlogSlug(slug)) {
    return new Response('Not found', { status: 404 });
  }
  const post = await getBlogPost(slug);

  if (!post) {
    return new Response('Not found', { status: 404 });
  }

  const title = post.title.length > 60 ? post.title.slice(0, 57) + '...' : post.title;
  const description =
    post.description.length > 100 ? post.description.slice(0, 97) + '...' : post.description;

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
            top: '20px',
            left: '-50px',
            width: '340px',
            height: '220px',
            background: '#0f1729',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(-6deg)',
            opacity: 0.55,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', gap: '40px' }}>
            <div style={{ fontSize: '11px', color: '#4b5563', display: 'flex' }}>TLI 점수</div>
            <div style={{ fontSize: '11px', color: '#4b5563', display: 'flex' }}>관심도</div>
          </div>
          <div style={{ display: 'flex', gap: '40px', marginTop: '4px' }}>
            <div style={{ fontSize: '38px', fontWeight: 700, color: '#e2e8f0', display: 'flex' }}>85</div>
            <div style={{ fontSize: '38px', fontWeight: 700, color: '#e2e8f0', display: 'flex' }}>72</div>
          </div>
          <div style={{ fontSize: '10px', color: '#374151', display: 'flex', marginTop: '8px' }}>지난 30일</div>
          <div style={{ width: '100%', height: '5px', background: '#1a2332', borderRadius: '3px', display: 'flex', marginTop: '12px' }}>
            <div style={{ width: '68%', height: '5px', background: '#10b98133', borderRadius: '3px', display: 'flex' }} />
          </div>
        </div>

        {/* Card 2 — Trend Sparkline (mid-left) */}
        <div
          style={{
            position: 'absolute',
            top: '155px',
            left: '20px',
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
          <div style={{ fontSize: '11px', color: '#4b5563', display: 'flex' }}>관심도 추이</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', marginTop: '12px' }}>
            {[25, 35, 30, 50, 45, 60, 55, 70, 65, 75, 80, 72].map((h, i) => (
              <div key={`sp-${i}`} style={{ width: '8px', height: `${h}px`, background: '#10b98125', borderRadius: '2px', display: 'flex' }} />
            ))}
          </div>
        </div>

        {/* Card 3 — Count Card (top-right) */}
        <div
          style={{
            position: 'absolute',
            top: '55px',
            right: '-30px',
            width: '280px',
            height: '200px',
            background: '#0f1729',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            transform: 'rotate(4deg)',
            opacity: 0.55,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
          }}
        >
          <div style={{ fontSize: '11px', color: '#4b5563', display: 'flex' }}>활성 테마</div>
          <div style={{ fontSize: '48px', fontWeight: 700, color: '#8B5CF6', display: 'flex' }}>73</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', marginTop: '4px' }}>
            {[12, 18, 15, 25, 22, 30, 28, 35].map((h, i) => (
              <div key={`mc-${i}`} style={{ width: '4px', height: `${h}px`, background: '#8B5CF620', borderRadius: '1px', display: 'flex' }} />
            ))}
          </div>
          <div style={{ fontSize: '10px', color: '#10b981', display: 'flex', marginTop: '8px' }}>+5 전일 대비</div>
        </div>

        {/* Card 4 — Table (far top-right, cut off) */}
        <div
          style={{
            position: 'absolute',
            top: '-15px',
            right: '-90px',
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
          }}
        >
          <div style={{ fontSize: '10px', color: '#4b5563', display: 'flex', marginBottom: '12px' }}>테마별 거래량</div>
          {[
            { color: '#3B82F6', label: '반도체', barW: 40 },
            { color: '#10B981', label: '2차전지', barW: 32 },
            { color: '#F59E0B', label: 'AI', barW: 28 },
            { color: '#EF4444', label: '바이오', barW: 22 },
          ].map((row) => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: row.color, display: 'flex' }} />
              <div style={{ fontSize: '11px', color: '#6b7280', display: 'flex', width: '52px' }}>{row.label}</div>
              <div style={{ width: `${row.barW}px`, height: '5px', background: `${row.color}1F`, borderRadius: '3px', display: 'flex' }} />
            </div>
          ))}
        </div>

        {/* Card 5 — Scatter (bottom-left) */}
        <div
          style={{
            position: 'absolute',
            bottom: '-15px',
            left: '-50px',
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
          <div style={{ fontSize: '11px', color: '#4b5563', display: 'flex' }}>테마 분포도</div>
          <div style={{ display: 'flex', position: 'relative', flex: 1, marginTop: '8px' }}>
            {[
              { top: 20, left: 30, size: 6, op: 0.35 },
              { top: 60, left: 80, size: 5, op: 0.25 },
              { top: 40, left: 150, size: 6, op: 0.4 },
              { top: 90, left: 50, size: 5, op: 0.15 },
              { top: 30, left: 220, size: 6, op: 0.3 },
              { top: 70, left: 180, size: 5, op: 0.2 },
              { top: 100, left: 120, size: 6, op: 0.35 },
              { top: 50, left: 260, size: 5, op: 0.25 },
              { top: 80, left: 300, size: 6, op: 0.4 },
              { top: 110, left: 200, size: 5, op: 0.15 },
              { top: 25, left: 100, size: 6, op: 0.3 },
              { top: 95, left: 280, size: 5, op: 0.2 },
            ].map((dot, i) => (
              <div
                key={`dot-${i}`}
                style={{
                  position: 'absolute',
                  top: `${dot.top}px`,
                  left: `${dot.left}px`,
                  width: `${dot.size}px`,
                  height: `${dot.size}px`,
                  borderRadius: '50%',
                  background: '#10b981',
                  opacity: dot.op,
                  display: 'flex',
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: '8px', color: '#1e293b', display: 'flex', gap: '16px' }}>
            <span style={{ display: 'flex' }}>10</span>
            <span style={{ display: 'flex' }}>20</span>
            <span style={{ display: 'flex' }}>30</span>
            <span style={{ display: 'flex' }}>40</span>
            <span style={{ display: 'flex' }}>50</span>
            <span style={{ display: 'flex' }}>60</span>
            <span style={{ display: 'flex' }}>70</span>
            <span style={{ display: 'flex' }}>80</span>
          </div>
        </div>

        {/* Card 6 — Bar Chart (bottom-right) */}
        <div
          style={{
            position: 'absolute',
            bottom: '5px',
            right: '-50px',
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
          <div style={{ fontSize: '10px', color: '#4b5563', display: 'flex' }}>지표별 분포</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flex: 1, marginTop: '12px' }}>
            {[35, 60, 80, 50, 25, 45].map((h, i) => (
              <div key={`bar-${i}`} style={{ width: '28px', height: `${h}px`, background: '#10b98118', borderRadius: '3px', display: 'flex' }} />
            ))}
          </div>
        </div>

        {/* Brand */}
        <div
          style={{
            position: 'absolute',
            top: '48px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
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
          <span style={{ fontSize: '22px', fontWeight: 600, color: '#94a3b8', letterSpacing: '1px', display: 'flex' }}>
            Stock Matrix
          </span>
        </div>

        {/* Hero Text - Dynamic blog title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            zIndex: 10,
            maxWidth: '900px',
            padding: '0 40px',
          }}
        >
          <div
            style={{
              fontSize: title.length > 30 ? '58px' : '72px',
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.0,
              letterSpacing: '-2px',
              textAlign: 'center',
              display: 'flex',
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 400,
              color: '#64748b',
              textAlign: 'center',
              lineHeight: 1.4,
              display: 'flex',
            }}
          >
            {description}
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
