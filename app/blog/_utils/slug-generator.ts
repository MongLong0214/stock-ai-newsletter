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
 *
 * 제목 해시를 항상 붙인다. `[^\w\s-]`가 한글을 전부 지우므로 KEYWORD_MAPPINGS에
 * 걸리는 낱말 하나만 같으면 서로 다른 글이 같은 슬러그로 붕괴한다 —
 * "RSI 활용법"과 "RSI 다이버전스"가 둘 다 `rsi-2026-08-27`이 된다.
 * blog_posts는 slug UNIQUE + upsert(onConflict:'slug')라, 붕괴는 같은 날 발행된
 * 다른 글을 덮어쓰는 결과로 이어진다.
 *
 * @param title - 원본 제목
 * @param fallbackKeyword - 제목이 숫자만일 때 사용할 보조 키워드
 * @returns 날짜와 해시가 포함된 슬러그 (예: stock-recommend-2024-01-15-k3f9a1)
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

  // KST 날짜를 쓴다. UTC로 두면 05:30 KST 발행이 전날 날짜 슬러그를 받아,
  // 같은 KST 날짜의 실행이 서로 다른 날짜를 갖고 날짜 기반 충돌 보호도 어긋난다.
  const date = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `${slugBase}-${date}-${hashSlugSeed(`${title}|${fallbackKeyword ?? ''}`)}`;
}
