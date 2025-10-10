'use client';

import { useState, useEffect } from 'react';

interface TimeRemaining {
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
}

export function useCountdownToTomorrow(): TimeRemaining {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>({
    hours: 0,
    minutes: 0,
    seconds: 0,
    formatted: '계산 중...',
  });

  useEffect(() => {
    function calculateTimeRemaining(): TimeRemaining {
      const now = new Date();
      const tomorrow = new Date();

      // Set to tomorrow 8:50 AM
      tomorrow.setDate(now.getDate() + 1);
      tomorrow.setHours(8, 50, 0, 0);

      const diff = tomorrow.getTime() - now.getTime();

      if (diff <= 0) {
        return {
          hours: 0,
          minutes: 0,
          seconds: 0,
          formatted: '곧 도착',
        };
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      return {
        hours,
        minutes,
        seconds,
        formatted: `${hours}시간 ${minutes}분 ${seconds}초`,
      };
    }

    // Initial calculation
    setTimeRemaining(calculateTimeRemaining());

    // Update every second
    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return timeRemaining;
}