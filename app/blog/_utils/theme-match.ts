/**
 * 키워드가 가리키는 TLI 테마 찾기
 *
 * "스테이블코인 관련주" → 테마 "스테이블코인". 공백을 무시하고 테마명이 키워드에 포함되면
 * 매치이며, 여러 개 걸리면 가장 긴 이름을 택한다("2차전지"와 "2차전지 장비"가 둘 다
 * 포함되면 구체적인 쪽이 맞다).
 */
export function findThemeForKeyword<T extends { name: string | null }>(
  keyword: string,
  themes: readonly T[],
): T | undefined {
  const normalized = keyword.replace(/\s+/g, '');
  return themes
    .filter((t) => t.name && t.name.length >= 2 && normalized.includes(t.name.replace(/\s+/g, '')))
    .sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0))[0];
}
