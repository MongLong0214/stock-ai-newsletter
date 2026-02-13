import Script from "next/script";
import { TECHNICAL_INDICATORS_DATA } from "./constants/home-page";
import HomePageClient from "./_components/home/home-page-client";
import LatestBlogSection from "./_components/home/latest-blog-section";

export default function HomePage() {
  return (
    <>
      <HomePageClient technicalIndicators={TECHNICAL_INDICATORS_DATA} />
      <LatestBlogSection />

      {/* 홈페이지 SoftwareApplication 스키마 */}
      <Script
        id="software-application-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Stock Matrix',
            applicationCategory: 'FinanceApplication',
            operatingSystem: 'Web Browser',
            description:
              '매일 오전 7시 50분 AI가 30가지 기술적 지표로 분석한 KOSPI·KOSDAQ 3종목을 이메일로 제공하는 무료 주식 분석 뉴스레터',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'KRW',
              availability: 'https://schema.org/InStock',
            },
            applicationSubCategory: 'Investment Analysis',
            featureList: [
              'AI 기술적 분석',
              '30가지 지표 분석',
              'KOSPI·KOSDAQ 종목 분석',
              '매일 아침 이메일 발송',
              '무료 서비스',
              '테마 생명주기 추적',
            ],
            screenshot: 'https://stockmatrix.co.kr/opengraph-image',
          }),
        }}
        strategy="afterInteractive"
      />
    </>
  );
}
