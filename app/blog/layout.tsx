/**
 * 블로그 레이아웃
 *
 * [이 파일의 역할]
 * - /blog 경로 하위 모든 페이지의 공통 레이아웃
 * - 메타데이터 설정 (SEO)
 * - 공통 스타일 적용
 *
 * [Next.js App Router 레이아웃]
 * - layout.tsx는 해당 폴더와 하위 폴더의 모든 페이지에 적용
 * - 페이지 전환 시에도 레이아웃은 유지됨 (리렌더링 안됨)
 * - children으로 실제 페이지 컴포넌트가 전달됨
 *
 * [적용 범위]
 * - /blog (목록 페이지)
 * - /blog/[slug] (상세 페이지)
 *
 * [메타데이터 상속]
 * - 이 파일의 metadata는 하위 페이지에서 오버라이드 가능
 * - 상세 페이지에서는 동적 메타데이터로 덮어씀
 */

import type { Metadata } from 'next';
import { siteConfig } from '@/lib/constants/seo/config';

/**
 * 블로그 섹션 기본 메타데이터
 *
 * [SEO 최적화 항목]
 * - title: 브라우저 탭 제목
 * - description: 검색 결과에 표시되는 설명
 * - openGraph: 소셜 미디어 공유 시 표시 정보
 * - twitter: 트위터 카드 설정
 * - alternates.canonical: 정규 URL (중복 콘텐츠 방지)
 */
export const metadata: Metadata = {
  // 페이지 제목 (브라우저 탭에 표시)
  title: '주식 투자 블로그',
  // 페이지 설명 (검색 결과에 표시, 155자 이내 권장)
  description:
    'AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 주식 투자에 필요한 모든 정보를 제공합니다. Stock Matrix의 전문 블로그에서 투자 인사이트를 얻어가세요.',

  // Open Graph 메타태그 (Facebook, LinkedIn 등에서 사용)
  openGraph: {
    title: '주식 투자 블로그 | Stock Matrix',
    description:
      'AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 주식 투자에 필요한 모든 정보를 제공합니다.',
    url: `${siteConfig.domain}/blog`,
    siteName: siteConfig.serviceName,
    type: 'website', // 페이지 유형 (website, article 등)
    locale: 'ko_KR', // 한국어
  },

  // Twitter 카드 설정
  twitter: {
    card: 'summary_large_image', // 큰 이미지 카드
    title: '주식 투자 블로그 | Stock Matrix',
    description:
      'AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 주식 투자에 필요한 모든 정보를 제공합니다.',
  },

  // 정규 URL (중복 콘텐츠 방지)
  // 같은 콘텐츠가 여러 URL에서 접근 가능할 때 대표 URL 지정
  alternates: {
    canonical: `${siteConfig.domain}/blog`,
  },
};

/**
 * BlogLayout Props
 *
 * @property children - 하위 페이지 컴포넌트 (page.tsx)
 */
interface BlogLayoutProps {
  children: React.ReactNode;
}

/**
 * 블로그 레이아웃 컴포넌트
 *
 * [역할]
 * - 블로그 전체에 적용되는 공통 레이아웃
 * - 현재는 검은 배경만 적용
 * - 향후 네비게이션, 사이드바 등 추가 가능
 *
 * @param children - 하위 페이지 컴포넌트
 */
export default function BlogLayout({ children }: BlogLayoutProps) {
  return (
    // min-h-screen: 최소 높이를 뷰포트 전체로
    // bg-black: 검은 배경
    <div className="min-h-screen bg-black">
      {children}
    </div>
  );
}