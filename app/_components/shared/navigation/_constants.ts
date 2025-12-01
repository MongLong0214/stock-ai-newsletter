// Navigation configuration constants
export const SCROLL_THRESHOLD = 20;

export const ANIMATION_DURATION = {
  nav: 0.6,
  link: 0.5,
  hover: 0.3,
  mobile: 0.3,
} as const;

export const EASING = {
  expo: [0.19, 1, 0.22, 1] as const,
  spring: { stiffness: 380, damping: 30 } as const,
  mobileSpring: { stiffness: 300, damping: 30 } as const,
} as const;

export const NAVIGATION_LINKS = [
  { href: '/', label: '홈', highlighted: false },
  { href: '/archive', label: '아카이브', highlighted: true },
  { href: '/blog', label: '블로그', highlighted: false },
  { href: '/about', label: '서비스', highlighted: false },
  { href: '/technical-indicators', label: '가이드', highlighted: false },
  { href: '/faq', label: 'FAQ', highlighted: false },
] as const;