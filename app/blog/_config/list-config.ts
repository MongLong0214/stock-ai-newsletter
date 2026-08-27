/**
 * 블로그 목록 렌더 개수.
 *
 * 서버(스키마 생성)와 클라이언트(목록 렌더)가 같은 값을 봐야 하므로 'use client' 모듈이 아닌
 * 여기에 둔다. 클라이언트 모듈에서 export하면 서버 쪽 import가 client reference로 치환돼
 * 런타임에 undefined가 된다.
 *
 * SSR에서 전체(1000+)를 렌더하면 /blog HTML이 5MB+로 커져 크롤 효율·모바일 성능이 무너진다.
 * 초기엔 이 개수만 렌더하고 나머지는 무한스크롤로, 전체 글 발견은 sitemap이 담당한다.
 */
export const INITIAL_RENDER_COUNT = 24;
