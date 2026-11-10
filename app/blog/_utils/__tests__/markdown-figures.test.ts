import { describe, expect, it } from 'vitest';
import { parseMarkdown, wrapFigures, wrapTables } from '../markdown-parser';

const COVER = 'https://x.supabase.co/storage/v1/object/public/blog-images/posts/a/r-cover-1536x1024.webp';
const SECTION = 'https://x.supabase.co/storage/v1/object/public/blog-images/posts/a/r-section1-1536x1024.webp';
const CHART = 'https://x.supabase.co/storage/v1/object/public/blog-images/posts/a/r-chart-1600x900.png';

describe('blog figures', () => {
  it('turns standalone images into figures with intrinsic size, captions and loading hints', async () => {
    const html = await parseMarkdown([
      `![커버 설명](${COVER} "커버 캡션 · AI 생성 이미지")`,
      '',
      '## 섹션',
      '',
      `![섹션 설명](${SECTION} "섹션 캡션")`,
      '',
      `![차트 설명](${CHART})`,
    ].join('\n'));

    expect(html).toContain(`<figure><img src="${COVER}" alt="커버 설명" width="1536" height="1024" loading="eager" fetchpriority="high" decoding="async"><figcaption>커버 캡션 · AI 생성 이미지</figcaption></figure>`);
    expect(html).toContain(`<figure><img src="${SECTION}" alt="섹션 설명" width="1536" height="1024" loading="lazy" decoding="async"><figcaption>섹션 캡션</figcaption></figure>`);
    expect(html).toContain(`<figure><img src="${CHART}" alt="차트 설명" width="1600" height="900" loading="lazy" decoding="async"></figure>`);
    expect(html).toContain('<h2 id="섹션">섹션</h2>');
  });

  it('keeps captions and alt text escaped', async () => {
    const html = await parseMarkdown(`![a "b" <i>](${COVER} "캡션 <script>alert(1)</script> & co")`);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<i>');
    expect(html).toContain('<figcaption>캡션 &#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E; &#x26; co</figcaption>');
  });

  it('drops unsafe sources through the sanitizer before wrapping', async () => {
    const html = await parseMarkdown('![x](javascript:alert(1) "bad")');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<figure>');
  });

  it('leaves inline images inside text untouched', () => {
    const inline = `<p>앞 <img src="${COVER}" alt="x"> 뒤</p>`;
    expect(wrapFigures(inline)).toBe(inline);
  });

  it('omits dimensions when the file name carries none', () => {
    expect(wrapFigures('<p><img src="https://a/b.webp" alt="x"></p>'))
      .toBe('<figure><img src="https://a/b.webp" alt="x" loading="lazy" decoding="async"></figure>');
  });

  it('prioritises only a leading cover, not a chart that happens to come first', async () => {
    const html = await parseMarkdown(`도입\n\n## 데이터\n\n![차트](${CHART})`);
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('fetchpriority');
  });

  it('wraps tables in a horizontal scroll container', async () => {
    const html = await parseMarkdown('| a | b |\n|--|--|\n| 1 | 2 |');
    expect(html).toMatch(/^<div class="table-scroll"><table>[\s\S]*<\/table><\/div>$/);
    expect(wrapTables('<p>표 없음</p>')).toBe('<p>표 없음</p>');
  });
});
