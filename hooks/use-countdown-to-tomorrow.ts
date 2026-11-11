'use client';

import { useState, useEffect } from 'react';
import { DELIVERY_HOUR, DELIVERY_MINUTE } from '@/lib/constants/delivery';
import { getKoreanHolidays, isTradingDay } from '@/lib/utils/korean-trading-calendar';

interface TimeRemaining {
  hours: number;
  minutes: number;
  seconds: number;
  /** 계산 전(서버 렌더·첫 페인트)에는 빈 문자열 — 호출부가 기본 문구를 쓴다 */
  formatted: string;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MAX_LOOKAHEAD_DAYS = 14;

/**
 * 다음 뉴스레터 발송 시각(KST 영업일 07:30)의 epoch ms.
 *
 * 예전 계산은 브라우저 시간대로 "내일 08:30"을 셌다. 그래서 오전 7:45에 보면 45분 뒤라고
 * 했고(그날 메일은 이미 나갔다), 금요일 오후·연휴 전날에도 다음 날 메일이 온다고 했다.
 */
export function nextDeliveryAt(nowMs: number): number {
  const kst = new Date(nowMs + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  for (let offset = 0; offset <= MAX_LOOKAHEAD_DAYS; offset++) {
    // 달력 날짜만 쓰는 로컬 Date — 거래일 판정 유틸이 로컬 getter로 요일·날짜를 읽는다
    const day = new Date(y, m, d + offset);
    const at = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), DELIVERY_HOUR, DELIVERY_MINUTE) - KST_OFFSET_MS;
    if (at > nowMs && isTradingDay(day, getKoreanHolidays(day.getFullYear()))) return at;
  }
  return Date.UTC(y, m, d + 1, DELIVERY_HOUR, DELIVERY_MINUTE) - KST_OFFSET_MS;
}

export function formatRemaining(diffMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return days > 0 ? `${days}일 ${hours}시간 ${minutes}분` : `${hours}시간 ${minutes}분 ${seconds}초`;
}

export function useCountdownToTomorrow(): TimeRemaining {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>({
    hours: 0,
    minutes: 0,
    seconds: 0,
    formatted: '',
  });

  useEffect(() => {
    function calculateTimeRemaining(): TimeRemaining {
      const now = Date.now();
      const diff = nextDeliveryAt(now) - now;
      return {
        hours: Math.floor(diff / 3_600_000),
        minutes: Math.floor((diff % 3_600_000) / 60_000),
        seconds: Math.floor((diff % 60_000) / 1000),
        formatted: formatRemaining(diff),
      };
    }

    setTimeRemaining(calculateTimeRemaining());

    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return timeRemaining;
}