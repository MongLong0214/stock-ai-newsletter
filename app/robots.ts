import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const baseUrl = 'https://stockmatrix.co.kr';

    return {
        rules: [
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🔍 주요 검색 엔진 (기본 crawlDelay: 1초)
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            { userAgent: 'Googlebot', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 1 },
            { userAgent: 'Yeti', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 1 }, // Naver
            { userAgent: 'Daumoa', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 1 }, // Daum/Kakao
            { userAgent: 'Bingbot', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 1 },

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🤖 AI 검색 엔진 봇 (crawlDelay 없음 - 빠른 크롤링 허용)
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            // OpenAI ChatGPT (공식 확인됨)
            { userAgent: 'GPTBot', allow: '/', disallow: ['/api/', '/unsubscribe/'] },
            { userAgent: 'ChatGPT-User', allow: '/', disallow: ['/api/', '/unsubscribe/'] },
            { userAgent: 'OAI-SearchBot', allow: '/', disallow: ['/api/', '/unsubscribe/'] },

            // Anthropic Claude (공식 확인됨)
            { userAgent: 'ClaudeBot', allow: '/', disallow: ['/api/', '/unsubscribe/'] },

            // Google Gemini/Bard (공식 확인됨)
            { userAgent: 'Google-Extended', allow: '/', disallow: ['/api/', '/unsubscribe/'] },

            // Perplexity AI (공식 확인됨)
            { userAgent: 'PerplexityBot', allow: '/', disallow: ['/api/', '/unsubscribe/'] },

            // Meta AI (공식 확인됨)
            { userAgent: 'FacebookBot', allow: '/', disallow: ['/api/', '/unsubscribe/'] },

            // Apple Intelligence (공식 확인됨)
            { userAgent: 'Applebot-Extended', allow: '/', disallow: ['/api/', '/unsubscribe/'] },

            // You.com AI (공식 확인됨)
            { userAgent: 'YouBot', allow: '/', disallow: ['/api/', '/unsubscribe/'] },

            // Cohere AI (공식 확인됨)
            { userAgent: 'cohere-ai', allow: '/', disallow: ['/api/', '/unsubscribe/'] },

            // Diffbot (공식 확인됨)
            { userAgent: 'Diffbot', allow: '/', disallow: ['/api/', '/unsubscribe/'] },

            // Amazon Alexa AI (공식 확인됨)
            { userAgent: 'Amazonbot', allow: '/', disallow: ['/api/', '/unsubscribe/'] },

            // ByteDance/TikTok AI (공식 확인됨)
            { userAgent: 'Bytespider', allow: '/', disallow: ['/api/', '/unsubscribe/'] },

            // Common Crawl - AI 학습용 (공식 확인됨)
            { userAgent: 'CCBot', allow: '/', disallow: ['/api/', '/unsubscribe/'] },

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
        host: baseUrl,
    };
}
