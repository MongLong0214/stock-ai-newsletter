import { describe, expect, it } from 'vitest';
import createCollectionPageSchema from '@/app/blog/_utils/schema-generator-list';
import { INITIAL_RENDER_COUNT } from '@/app/blog/_config/list-config';
import type { BlogPostListItem } from '@/app/blog/_types/blog';

const post = (i: number) => ({ slug: `p-${i}`, title: `글 ${i}` }) as BlogPostListItem;

describe('createCollectionPageSchema', () => {
  it('렌더되는 개수까지만 ItemList에 선언한다', () => {
    const schema = createCollectionPageSchema(Array.from({ length: 1000 }, (_, i) => post(i)));
    expect(schema.mainEntity.numberOfItems).toBe(INITIAL_RENDER_COUNT);
    expect(schema.mainEntity.itemListElement).toHaveLength(INITIAL_RENDER_COUNT);
  });

  it('글이 적으면 실제 개수를 쓴다 (NaN/null이 되지 않는다)', () => {
    const schema = createCollectionPageSchema([post(0), post(1)]);
    expect(schema.mainEntity.numberOfItems).toBe(2);
    expect(JSON.stringify(schema)).not.toContain('"numberOfItems":null');
  });

  it('빈 목록도 0으로 직렬화된다', () => {
    expect(JSON.parse(JSON.stringify(createCollectionPageSchema([]))).mainEntity.numberOfItems).toBe(0);
  });
});
