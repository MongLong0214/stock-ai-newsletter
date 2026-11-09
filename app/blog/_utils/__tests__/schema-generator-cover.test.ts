import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createArticleSchema, createBlogPostingSchema } from '../schema-generator';
import type { BlogPost, BlogPostCreateInput } from '../../_types/blog';

beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co'); });
afterAll(() => { vi.unstubAllEnvs(); });

const COVER = 'https://x.supabase.co/storage/v1/object/public/blog-images/posts/s/r-cover-1536x1024.webp';
const withCover = `# 제목\n\n![커버 사진 설명](${COVER} "캡션 · AI 생성 이미지")\n\n본문`;

const input = (content: string) => ({
  slug: 's', title: '제목', description: '설명', content, target_keyword: '키워드',
}) as BlogPostCreateInput;

describe('blog schema cover image', () => {
  it('stores the cover as the BlogPosting image when the body has one', () => {
    expect(createBlogPostingSchema(input(withCover), 's').image).toBe(COVER);
    expect(createBlogPostingSchema(input('본문만'), 's')).not.toHaveProperty('image');
  });

  it('puts the cover first in the rendered Article schema and keeps the OG card variants', () => {
    const post = { ...input(withCover), published_at: '2026-11-10T05:30:00+09:00', updated_at: '2026-11-10T05:30:00+09:00' } as BlogPost;
    const images = createArticleSchema(post, 's').image;
    expect(images[0]).toMatchObject({ url: COVER, width: 1536, height: 1024, caption: '캡션 · AI 생성 이미지' });
    expect(images).toHaveLength(4);

    const legacy = createArticleSchema({ ...post, content: '본문만' }, 's').image;
    expect(legacy).toHaveLength(3);
    expect(legacy.every((i) => String(i.url).includes('/opengraph-image'))).toBe(true);
  });
});
