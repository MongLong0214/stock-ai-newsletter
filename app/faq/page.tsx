import FAQSection from '../_components/faq-section';
import { generateFAQSchema } from '@/lib/constants/seo/faq-data';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '자주 묻는 질문 - Stock Matrix AI 주식 분석',
  description:
    'Stock Matrix AI 주식 분석 뉴스레터에 대한 자주 묻는 질문과 답변. 무료 AI 기술적 분석, RSI, MACD, 볼린저밴드 등 30가지 지표 활용.',
  alternates: {
    canonical: 'https://stockmatrix.co.kr/faq',
  },
};

export default function FAQPage() {
  return (
    <>
      <FAQSection />
      {/* Schema.org Structured Data for SEO - Only on FAQ page */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateFAQSchema()),
        }}
      />
    </>
  );
}