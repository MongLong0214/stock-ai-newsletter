/**
 * Strategic Internal Linking Configuration
 * Distributes link equity and improves crawlability
 */

import { siteConfig } from './config';

export interface InternalLink {
  text: string;
  url: string;
  title: string;
}

export const internalLinks = {
  // Links to include in footer or content
  mainNavigation: [
    {
      text: '서비스 소개',
      url: `${siteConfig.domain}/about`,
      title: 'Stock Matrix AI 주식 분석 서비스 소개',
    },
    {
      text: '기술적 지표 가이드',
      url: `${siteConfig.domain}/technical-indicators`,
      title: 'RSI, MACD, 볼린저밴드 등 기술적 지표 완벽 가이드',
    },
    {
      text: '자주 묻는 질문',
      url: `${siteConfig.domain}/faq`,
      title: 'Stock Matrix 주식 뉴스레터 FAQ',
    },
    {
      text: '무료 구독하기',
      url: `${siteConfig.domain}/subscribe`,
      title: '매일 7:50 AI 주식분석 무료 이메일 구독',
    },
  ],

  // Contextual links for content pages
  contextualLinks: {
    // Links to add in about page
    about: [
      {
        text: '기술적 지표에 대해 자세히 알아보기',
        url: `${siteConfig.domain}/technical-indicators`,
        title: '30가지 기술적 지표 완벽 가이드',
      },
      {
        text: '자주 묻는 질문 보기',
        url: `${siteConfig.domain}/faq`,
        title: 'Stock Matrix FAQ',
      },
    ],

    // Links to add in technical-indicators page
    technicalIndicators: [
      {
        text: 'AI 분석 뉴스레터 무료 구독하기',
        url: `${siteConfig.domain}/subscribe`,
        title: '지금 무료 구독',
      },
      {
        text: 'Stock Matrix 서비스 자세히 보기',
        url: `${siteConfig.domain}/about`,
        title: '서비스 소개',
      },
    ],

    // Links to add in FAQ page
    faq: [
      {
        text: '기술적 지표 완벽 가이드',
        url: `${siteConfig.domain}/technical-indicators`,
        title: 'RSI, MACD, 볼린저밴드 설명',
      },
      {
        text: '지금 바로 무료 구독하기',
        url: `${siteConfig.domain}/subscribe`,
        title: '무료 이메일 구독',
      },
    ],
  },

  // Breadcrumb links
  breadcrumbs: {
    about: [
      { text: '홈', url: siteConfig.domain },
      { text: '서비스 소개', url: `${siteConfig.domain}/about` },
    ],
    technicalIndicators: [
      { text: '홈', url: siteConfig.domain },
      {
        text: '기술적 지표',
        url: `${siteConfig.domain}/technical-indicators`,
      },
    ],
    faq: [
      { text: '홈', url: siteConfig.domain },
      { text: 'FAQ', url: `${siteConfig.domain}/faq` },
    ],
    subscribe: [
      { text: '홈', url: siteConfig.domain },
      { text: '구독하기', url: `${siteConfig.domain}/subscribe` },
    ],
  },

  // Quick links for footer
  quickLinks: [
    {
      text: 'RSI 지표란?',
      url: '/technical-indicators#rsi',
      title: 'RSI 지표 설명',
    },
    {
      text: 'MACD 골든크로스',
      url: '/technical-indicators#macd',
      title: 'MACD 골든크로스 설명',
    },
    {
      text: '볼린저밴드 활용법',
      url: '/technical-indicators#bollinger',
      title: '볼린저밴드 활용법',
    },
    {
      text: '정말 무료인가요?',
      url: '/faq#free',
      title: '무료 서비스 설명',
    },
  ],
} as const;

/**
 * Helper function to generate anchor tag HTML
 */
export function generateInternalLinkHTML(link: InternalLink): string {
  return `<a href="${link.url}" title="${link.title}" class="text-emerald-400 hover:text-emerald-300 underline transition-colors">${link.text}</a>`;
}