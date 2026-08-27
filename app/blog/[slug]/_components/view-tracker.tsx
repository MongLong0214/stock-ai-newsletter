'use client';

import { useEffect } from 'react';

/**
 * 조회수 기록 비콘.
 *
 * incrementViewCount는 정의만 되고 호출부가 없어 1,306편의 view_count가
 * 사실상 전부 0이었다("트래픽 없음"이 아니라 "측정한 적 없음"). 콘텐츠 정리의
 * 효과를 재려면 기준선이 필요하므로 여기서 배선한다.
 */
export default function ViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const body = JSON.stringify({ slug });
    // sendBeacon은 페이지를 떠나도 전송이 보장되고 렌더를 막지 않는다
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/blog/view', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/blog/view', { method: 'POST', body, keepalive: true }).catch(() => {});
  }, [slug]);

  return null;
}
