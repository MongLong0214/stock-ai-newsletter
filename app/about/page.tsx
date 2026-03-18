import AnimatedBackground from '@/components/animated-background';
import ServiceIntroSection from './_components/service-intro-section';
import { siteConfig, schemaIds } from '@/lib/constants/seo/config'
import { schemaConfig } from '@/lib/constants/seo/schema'
import { generateBreadcrumbSchema, breadcrumbPatterns } from '@/lib/constants/seo/breadcrumb-schema'

/** metadata는 about/layout.tsx에서 전체 정의 (OG, Twitter 포함) — page에서 중복 선언 금지 */

const AboutPage = () => {
  const aboutSchema = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    '@id': schemaIds.pageId('/about'),
    name: `${siteConfig.serviceName} 서비스 소개`,
    description: schemaConfig.serviceDesc,
    url: `${siteConfig.domain}/about`,
    isPartOf: { '@id': schemaIds.website },
    inLanguage: 'ko-KR',
    mainEntity: {
      '@id': schemaIds.organization,
    },
  }

  const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbPatterns.about)

  return (
    <>
      <script
        id="about-page-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema).replace(/</g, '\\u003c') }}
      />
      <script
        id="about-breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c') }}
      />
      <main className="min-h-screen bg-black text-white relative overflow-hidden">
        <AnimatedBackground />

        <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
          <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]" aria-hidden="true" />
        </div>

        <ServiceIntroSection />
      </main>
    </>
  );
};

export default AboutPage;
