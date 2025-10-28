'use client';

import { useEffect, useRef, useState, RefObject } from 'react';
import { useInView } from 'framer-motion';

interface RevealOptions {
  /**
   * 애니메이션을 한 번만 실행할지 여부
   * @default true
   */
  once?: boolean;

  /**
   * 요소의 얼마나 보여야 트리거될지 (0-1)
   * @default 0.3
   */
  amount?: number;

  /**
   * 애니메이션 지연 시간 (ms)
   * @default 0
   */
  delay?: number;
}

/**
 * useReveal Hook
 *
 * 요소가 뷰포트에 들어올 때 애니메이션을 트리거합니다.
 */
export function useReveal<T extends HTMLElement = HTMLElement>(
  options: RevealOptions = {}
) {
  const {
    once = true,
    amount = 0.3,
    delay = 0,
  } = options;

  const ref = useRef<T>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  const isInView = useInView(ref, {
    once,
    amount,
  });

  useEffect(() => {
    if (isInView && !isRevealed) {
      if (delay > 0) {
        const timer = setTimeout(() => {
          setIsRevealed(true);
        }, delay);
        return () => clearTimeout(timer);
      } else {
        setIsRevealed(true);
      }
    }
  }, [isInView, isRevealed, delay]);

  return {
    ref: ref as RefObject<T>,
    isInView: delay > 0 ? isRevealed : isInView,
  };
}

/**
 * useStaggerReveal Hook
 *
 * 여러 자식 요소들이 순차적으로 나타나는 효과를 제공합니다.
 */
export function useStaggerReveal<T extends HTMLElement = HTMLElement>(
  options: RevealOptions & {
    staggerDelay?: number;
  } = {}
) {
  const { staggerDelay = 100, ...revealOptions } = options;
  const { ref, isInView } = useReveal<T>(revealOptions);

  function getDelay(index: number): number {
    return index * (staggerDelay / 1000);
  }

  return {
    ref,
    isInView,
    getDelay,
    staggerDelay,
  };
}