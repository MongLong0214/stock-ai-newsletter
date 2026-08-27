import { NextResponse, type NextRequest } from 'next/server';
import { incrementViewCount } from '@/app/blog/_services/blog-repository';
import { isValidBlogSlug } from '@/app/blog/_utils/slug-validator';

/**
 * 블로그 조회수 기록.
 *
 * 페이지가 ISR(revalidate=24h)이라 서버 렌더에서 세면 재생성 때만 1회 오른다.
 * 실제 조회를 세려면 클라이언트에서 호출해야 한다. sendBeacon으로 오므로
 * 응답 본문은 의미 없고, 실패해도 사용자 경험에 영향이 없어야 한다.
 */
export async function POST(request: NextRequest) {
  try {
    const { slug } = await request.json();
    if (typeof slug !== 'string' || !isValidBlogSlug(slug)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    await incrementViewCount(slug);
    return NextResponse.json({ ok: true });
  } catch {
    // 집계 실패가 페이지를 깨뜨리지 않는다
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
