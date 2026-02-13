export function isValidBlogSlug(slug: string): boolean {
  if (!slug) return false;

  const normalized = slug.toLowerCase();

  // 경로 탐색 공격 방지
  if (normalized.includes('..') || normalized.includes('./') || normalized.includes('\\')) {
    return false;
  }

  // 과도한 길이 방지
  if (normalized.length > 200) return false;

  // 소문자, 숫자, 하이픈, 언더스코어만 허용
  return /^[a-z0-9_-]+$/.test(normalized);
}
