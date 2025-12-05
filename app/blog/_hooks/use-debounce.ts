import { useState, useEffect } from 'react';

/**
 * Debounce 훅 - 검색 입력 최적화
 *
 * @param value - debounce할 값
 * @param delay - 지연 시간 (ms)
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}