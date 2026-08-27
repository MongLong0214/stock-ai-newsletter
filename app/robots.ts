import { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/constants/seo/config';

// #DaumWebMasterTool:4b0564f4ab4eddd8aeccac8c9b10fbcc6f1b5ed93990d9bc29bb5f246b12bb35:nFArT0OIkE5+7VCbwTnXuA==

const SOCIAL_PREVIEW_BOTS = [
    'Twitterbot',
    'facebookexternalhit',
    'Facebot',
    'FacebookBot',
    'Slackbot',
    'LinkedInBot',
    'Discordbot',
    'TelegramBot',
    'WhatsApp',
    'SkypeUriPreview',
] as const;

export default function robots(): MetadataRoute.Robots {
    const baseUrl = siteConfig.domain;

    return {
        rules: [
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🔍 주요 검색 엔진 (기본 crawlDelay: 1초)
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            { userAgent: 'Googlebot', allow: '/', disallow: ['/api/', '/unsubscribe/'] },
            { userAgent: 'Yeti', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 1 }, // Naver
            { userAgent: 'Daumoa', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 1 }, // Daum/Kakao
            { userAgent: 'Bingbot', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 1 },

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🤖 AI 검색 엔진 봇 (crawlDelay 없음 - 빠른 크롤링 허용)
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            // OpenAI ChatGPT (공식 확인됨)
            { userAgent: 'GPTBot', allow: ['/', '/api/tli/'], disallow: ['/api/', '/unsubscribe/'] },
            { userAgent: 'ChatGPT-User', allow: ['/', '/api/tli/'], disallow: ['/api/', '/unsubscribe/'] },
            { userAgent: 'OAI-SearchBot', allow: ['/', '/api/tli/'], disallow: ['/api/', '/unsubscribe/'] },

            // Anthropic Claude (공식 확인됨)
            { userAgent: 'ClaudeBot', allow: ['/', '/api/tli/'], disallow: ['/api/', '/unsubscribe/'] },

            // Google Gemini/Bard (공식 확인됨)
            { userAgent: 'Google-Extended', allow: ['/', '/api/tli/'], disallow: ['/api/', '/unsubscribe/'] },

            // Perplexity AI (공식 확인됨)
            { userAgent: 'PerplexityBot', allow: ['/', '/api/tli/'], disallow: ['/api/', '/unsubscribe/'] },

            ...SOCIAL_PREVIEW_BOTS.map((userAgent) => ({
                userAgent,
                allow: '/',
                disallow: ['/api/'],
            })),

            // Apple Intelligence (공식 확인됨)
            { userAgent: 'Applebot-Extended', allow: ['/', '/api/tli/'], disallow: ['/api/', '/unsubscribe/'] },

            // You.com AI (공식 확인됨)
            { userAgent: 'YouBot', allow: ['/', '/api/tli/'], disallow: ['/api/', '/unsubscribe/'] },

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🔓 SEO·백링크 그래프 크롤러 — 페이지는 열고 /api/ 만 막는다
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 전면 차단하면 무료·유료 백링크 도구가 전부 이 그래프 기반이라
            // 외부에서 이 도메인을 평가할 때 "백링크 없음"으로 읽힌다.
            // 링크 그래프는 페이지의 <a>만 보면 되므로 API 접근은 열어줄 이유가 없다.
            // crawlDelay로 페이지 크롤 속도를 묶어 Vercel 함수 호출량을 억제한다.
            ...['CCBot', 'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'PetalBot',
                'Amazonbot', 'cohere-ai', 'Diffbot', 'Bytespider'].map((userAgent) => ({
                    userAgent,
                    allow: '/',
                    disallow: ['/api/', '/unsubscribe/'],
                    crawlDelay: 10,
                })),

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🌐 일반 봇 기본 규칙 (마지막에 위치)
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/api/', '/unsubscribe/'],
                crawlDelay: 2,
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
    };
}
