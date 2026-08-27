/**
 * 병합된 블로그 글의 301 리다이렉트 맵 (자동 생성 — scripts/blog-merge/merge-clusters.ts)
 *
 * 같은 관련주 클러스터에 중복 발행된 글을 한 편으로 합치면서, 사라지는 URL이
 * 404가 되지 않도록 승자 글로 영구 이동시킨다. next.config.ts가 빌드 시 읽으므로
 * 런타임 비용이 없다.
 *
 * 아직 병합을 실행하지 않아 비어 있다. `npm run blog:merge -- --apply`가 채운다.
 */

export const MERGED_BLOG_REDIRECTS: readonly { from: string; to: string }[] = [];
