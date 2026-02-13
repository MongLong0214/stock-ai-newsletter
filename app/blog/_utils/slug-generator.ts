/** 한글 키워드 → 영문 URL 슬러그 변환 */

/** SEO 영문 URL을 위한 한글-영문 매핑 */
const KEYWORD_MAPPINGS: Record<string, string> = {
  주식: 'stock',
  뉴스레터: 'newsletter',
  추천: 'recommend',
  분석: 'analysis',
  투자: 'investment',
  무료: 'free',
  사이트: 'site',
  서비스: 'service',
  종목: 'stocks',
  코스피: 'kospi',
  코스닥: 'kosdaq',
  기술적: 'technical',
  'AI': 'ai',
};

/** 한글 키워드를 영문으로 치환하고 URL-safe 문자열로 정규화 */
function normalizeSlugBase(text: string): string {
  let slug = text.toLowerCase();

  Object.entries(KEYWORD_MAPPINGS).forEach(([korean, english]) => {
    slug = slug.replace(new RegExp(korean, 'g'), english);
  });

  return slug
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^-|-$/g, '');
}

/** 영문 알파벳이 하나라도 포함되었는지 확인 */
function hasAlpha(slug: string): boolean {
  return /[a-z]/.test(slug);
}

/** 문자열을 간단한 해시로 변환 (슬러그 고유성 보장용) */
function hashSlugSeed(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 6);
}

/**
 * 제목에서 URL-friendly 슬러그 생성
 * @param title - 원본 제목
 * @param fallbackKeyword - 제목이 숫자만일 때 사용할 보조 키워드
 * @returns 날짜가 포함된 슬러그 (예: stock-newsletter-recommend-2024-01-15)
 */
export function generateSlug(title: string, fallbackKeyword?: string): string {
  const baseFromTitle = normalizeSlugBase(title);
  let slugBase = baseFromTitle;

  if (!slugBase || !hasAlpha(slugBase)) {
    const fallbackBase = fallbackKeyword
      ? normalizeSlugBase(fallbackKeyword)
      : '';
    if (fallbackBase && hasAlpha(fallbackBase)) {
      slugBase = fallbackBase;
    }
  }

  if (!slugBase) {
    const seed = title || fallbackKeyword || 'stock-analysis';
    slugBase = `stock-analysis-${hashSlugSeed(seed)}`;
  }

  const date = new Date().toISOString().slice(0, 10);
  return `${slugBase}-${date}`;
}
