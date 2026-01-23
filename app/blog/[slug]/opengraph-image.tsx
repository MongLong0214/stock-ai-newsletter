import { ImageResponse } from 'next/og';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { siteConfig } from '@/lib/constants/seo/config';
import { isValidBlogSlug } from '../_utils/slug-validator';

export const runtime = 'edge';
export const alt = 'Stock Matrix 블로그';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

/**
 * 블로그 포스트 조회 (OG 이미지용)
 */
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

/**
 * 동적 Open Graph 이미지 생성
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidBlogSlug(slug)) {
    return new Response('Not found', { status: 404 });
  }
  const post = await getBlogPost(slug);

  if (!post) {
    return new Response('Not found', { status: 404 });
  }

  // 제목 길이 제한 (너무 길면 잘림)
  const title = post.title.length > 80 ? post.title.slice(0, 77) + '...' : post.title;
  const description =
    post.description.length > 150 ? post.description.slice(0, 147) + '...' : post.description;

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '80px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >
        {/* 배경 장식 - 작은 Matrix 느낌 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.03,
            background:
              'radial-gradient(circle at 30% 20%, rgba(16, 185, 129, 0.2) 0%, transparent 50%)',
          }}
        />

        {/* 카테고리 뱃지 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '2px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '999px',
            padding: '12px 24px',
            color: '#10b981',
            fontSize: 28,
            fontWeight: 600,
            position: 'relative',
          }}
        >
          {post.category || '주식 뉴스레터'}
        </div>

        {/* 제목 & 설명 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
          <h1
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: '#ffffff',
              lineHeight: 1.2,
              margin: 0,
              maxWidth: '1000px',
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontSize: 32,
              color: '#94a3b8',
              lineHeight: 1.4,
              margin: 0,
              maxWidth: '900px',
            }}
          >
            {description}
          </p>
        </div>

        {/* 하단: 로고 & 날짜 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* 로고 아이콘 */}
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
                fontWeight: 900,
                color: '#000',
              }}
            >
              SM
            </div>
            <span style={{ fontSize: 36, fontWeight: 700, color: '#ffffff' }}>
              {siteConfig.serviceName}
            </span>
          </div>
          {post.published_at && (
            <span style={{ fontSize: 28, color: '#64748b' }}>
              {new Date(post.published_at).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
