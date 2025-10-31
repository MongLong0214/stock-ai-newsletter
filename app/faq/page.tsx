'use client';

import AnimatedBackground from '@/components/animated-background';
import FAQSection from './_components/faq-section';
import { generateFAQSchema } from '@/lib/constants/seo/faq-data';

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <AnimatedBackground />

      <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]" aria-hidden="true" />
      </div>

      <FAQSection />

      {/* Schema.org Structured Data for SEO - Only on FAQ page */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateFAQSchema()),
        }}
      />
    </div>
  );
}