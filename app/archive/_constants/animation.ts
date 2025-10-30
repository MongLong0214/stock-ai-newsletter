/**
 * 애니메이션 상수
 *
 * 중앙화된 애니메이션 타이밍 및 이징 시스템
 * 애플리케이션 전체에 일관된 모션 디자인 보장
 *
 * 디자인 철학:
 * - Fast: 사용자 인터랙션에 대한 빠른 피드백 (200ms)
 * - Normal: 표준 UI 전환 (300ms)
 * - Slow: 페이지 레벨 애니메이션 (500ms)
 * - Slower: 히어로 애니메이션 및 페이지 전환 (800ms)
 *
 * 이징:
 * - 부드럽고 자연스러운 모션을 위한 커스텀 cubic-bezier
 * - Material Design 모션 원칙 기반
 */

/**
 * 표준 애니메이션 지속시간 (초 단위)
 * 컴포넌트 전체에 일관된 타이밍을 위해 이 상수들 사용
 */
export const DURATION = {
  /** 빠른 피드백 (200ms) - 호버 상태, 마이크로 인터랙션 */
  fast: 0.2,

  /** 표준 전환 (300ms) - 모달 열기/닫기, 드롭다운 확장 */
  normal: 0.3,

  /** 콘텐츠 애니메이션 (500ms) - 카드 입장, 콘텐츠 드러내기 */
  slow: 0.5,

  /** 히어로 애니메이션 (800ms) - 페이지 헤더, 대형 콘텐츠 블록 */
  slower: 0.8,
} as const;

/**
 * 표준 이징 함수
 * 자연스럽고 전문적인 모션을 위한 커스텀 cubic-bezier 곡선
 */
export const EASING = {
  /** 부드러운 가속 및 감속 - 범용 */
  smooth: [0.19, 1, 0.22, 1] as const,

  /** 날카로운 입장 - 뷰포트로 들어오는 요소 */
  entrance: [0.0, 0.0, 0.2, 1] as const,

  /** 날카로운 퇴장 - 뷰포트를 떠나는 요소 */
  exit: [0.4, 0.0, 1, 1] as const,

  /** 탄성 바운스 - 재미있는 인터랙션 */
  bounce: [0.68, -0.55, 0.265, 1.55] as const,
} as const;

/**
 * 스태거 애니메이션 타이밍
 * 리스트 아이템의 조율된 입장 애니메이션을 위함
 */
export const STAGGER = {
  /** 아이템 간 기본 지연 (150ms) */
  delay: 0.15,

  /** 자식 요소 지연 오프셋 (100ms) */
  childDelay: 0.1,
} as const;

/**
 * 리스트 아이템 애니메이션을 위한 스태거 지연 계산
 *
 * @param index - 리스트 내 아이템 인덱스
 * @param childDelay - 자식 요소를 위한 추가 지연 (기본값: 0)
 * @returns 초 단위 총 애니메이션 지연
 *
 * @example
 * getStaggerDelay(0) // Returns 0
 * getStaggerDelay(1) // Returns 0.15
 * getStaggerDelay(2, 0.2) // Returns 0.5 (2 * 0.15 + 0.2)
 */
export function getStaggerDelay(index: number, childDelay = 0): number {
  return index * STAGGER.delay + childDelay;
}

/**
 * 스프링 애니메이션 구성
 * 물리 기반 애니메이션을 위함 (호버 효과, 제스처)
 */
export const SPRING = {
  /** 반응형 스프링 - 빠르고 탄력있는 인터랙션 */
  responsive: {
    type: 'spring' as const,
    stiffness: 500,
    damping: 30,
    duration: 0.15,
  },

  /** 부드러운 스프링 - 부드럽고 유동적인 모션 */
  smooth: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
  },

  /** 튀는 스프링 - 재미있고 활기찬 모션 */
  bouncy: {
    type: 'spring' as const,
    stiffness: 500,
    damping: 20,
  },
} as const;

/**
 * 호버 애니메이션 스케일 배율
 * 호버 효과를 위한 일관된 스케일 값
 */
export const HOVER_SCALE = {
  /** 미묘한 호버 (2% 스케일) - 대형 카드, 히어로 요소 */
  subtle: 1.02,

  /** 표준 호버 (5% 스케일) - 버튼, 소형 카드 */
  standard: 1.05,

  /** 두드러진 호버 (10% 스케일) - 아이콘, 소형 인터랙티브 요소 */
  prominent: 1.1,
} as const;

/**
 * 일반적인 패턴을 위한 애니메이션 변형
 * 바로 사용 가능한 Framer Motion 변형
 */
export const VARIANTS = {
  /** 보이지 않음에서 보임으로 페이드인 */
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },

  /** 페이드와 함께 위로 슬라이드 */
  slideUp: {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -30 },
  },

  /** 페이드와 함께 아래로 슬라이드 */
  slideDown: {
    initial: { opacity: 0, y: -30 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 30 },
  },

  /** 페이드와 함께 스케일 */
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },

  /** 왼쪽에서 슬라이드 인 */
  slideLeft: {
    initial: { opacity: 0, x: -40 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 40 },
  },

  /** 오른쪽에서 슬라이드 인 */
  slideRight: {
    initial: { opacity: 0, x: 40 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40 },
  },
} as const;