/**
 * 포커스 트랩 훅
 *
 * 모달이나 다이얼로그 내부에서 Tab 키 포커스가 순환하도록 관리합니다.
 * 모바일 캘린더 등 접근성을 위해 사용됩니다.
 */

import { useEffect } from 'react';

interface UseFocusTrapProps {
  /** 포커스 트랩 활성화 여부 */
  isActive: boolean;
  /** 포커스 가능한 요소를 찾을 컨테이너 선택자 */
  containerSelector: string;
}

function useFocusTrap({ isActive, containerSelector }: UseFocusTrapProps) {
  useEffect(() => {
    if (!isActive) return;

    // 포커스 가능한 요소 탐색
    const focusableElements = document.querySelectorAll(
      `${containerSelector} button, ${containerSelector} a, ${containerSelector} [tabindex]:not([tabindex="-1"])`
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[
      focusableElements.length - 1
    ] as HTMLElement;

    /** Tab 키 핸들러: 첫 번째/마지막 요소에서 순환 */
    function handleTabKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab: 역방향 순환
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: 정방향 순환
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }

    document.addEventListener('keydown', handleTabKey);

    // 초기 포커스 설정 (약간의 지연 후)
    setTimeout(() => firstElement.focus(), 100);

    return () => document.removeEventListener('keydown', handleTabKey);
  }, [isActive, containerSelector]);
}

export default useFocusTrap;