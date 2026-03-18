import type { Metadata } from 'next'
import AnimatedBackground from '@/components/animated-background'
import DevelopersContent from './_components/developers-content'
import { siteConfig } from '@/lib/constants/seo/config'
import { generateBreadcrumbSchema } from '@/lib/constants/seo/breadcrumb-schema'

export const metadata: Metadata = {
  title: 'StockMatrix MCP 서버 — AI 주식 데이터 API 개발자 가이드',
  description: 'StockMatrix MCP 서버로 250+ 한국 주식 테마의 생명주기 점수, 관련주, 뉴스를 AI 에이전트에서 자연어로 조회하세요. Claude Desktop, Cursor, VS Code, Claude Code에서 바로 사용 가능합니다.',
  alternates: { canonical: `${siteConfig.domain}/developers` },
  openGraph: {
    title: '개발자 — StockMatrix MCP 서버',
    description: '250+ 한국 주식 테마의 생명주기 점수, 관련주, 뉴스를 AI 에이전트에서 직접 조회하세요.',
    url: `${siteConfig.domain}/developers`,
    siteName: siteConfig.serviceName,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '개발자 — StockMatrix MCP 서버',
    description: '250+ 한국 주식 테마의 생명주기 점수, 관련주, 뉴스를 AI 에이전트에서 직접 조회하세요.',
  },
}

const DevelopersPage = () => {
  const pageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'StockMatrix MCP 서버 개발자 가이드',
    description: metadata.description,
    url: `${siteConfig.domain}/developers`,
    mainEntity: {
      '@type': 'SoftwareApplication',
      name: 'stockmatrix-mcp',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Any',
      description: 'MCP server for Korean stock market theme lifecycle analysis',
      url: `${siteConfig.domain}/developers`,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
  }

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: '홈', url: siteConfig.domain },
    { name: '개발자', url: `${siteConfig.domain}/developers` },
  ])

  return (
    <>
      <script
        id="developers-page-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema).replace(/</g, '\\u003c') }}
      />
      <script
        id="developers-breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c') }}
      />
      <main className="min-h-screen bg-black text-white relative overflow-hidden">
        <AnimatedBackground />

        <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
          <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]" aria-hidden="true" />
        </div>

        <DevelopersContent />
      </main>
    </>
  )
}

export default DevelopersPage
