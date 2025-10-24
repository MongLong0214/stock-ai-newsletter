import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const baseUrl = 'https://stockmatrix.co.kr';

    return {
        rules: [
            // 모든 일반 봇 기본 접근
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/api/', '/unsubscribe/'],
                crawlDelay: 2,
            },
            // 주요 검색 엔진
            { userAgent: 'Googlebot', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 },
            { userAgent: 'Yeti', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 }, // Naver
            { userAgent: 'Daumoa', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 }, // Daum/Kakao
            { userAgent: 'Bingbot', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 },

            // 공식 AI 봇
            { userAgent: 'GPTBot', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 }, // OpenAI
            { userAgent: 'ClaudeBot', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 }, // Anthropic Claude
            { userAgent: 'Claude-Web', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 }, // Anthropic Claude Web
            { userAgent: 'PerplexityBot', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 }, // Perplexity AI
            { userAgent: 'Google-Extended', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 }, // Google Gemini/Bard
            { userAgent: 'Applebot-Extended', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 }, // Apple Intelligence
            { userAgent: 'CCBot', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 }, // Common Crawl
            { userAgent: 'FacebookBot', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 }, // Meta AI
            { userAgent: 'Bytespider', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 }, // ByteDance/TikTok
            { userAgent: 'anthropic-ai', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 }, // Anthropic 연구용
            { userAgent: 'Omgilibot', allow: '/', disallow: ['/api/', '/unsubscribe/'], crawlDelay: 2 }, // Omgili
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
        host: baseUrl,
    };
}
