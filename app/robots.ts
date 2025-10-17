import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://stockmatrix.co.kr';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'Yeti', // Naver
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'Daumoa', // Daum/Kakao
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'Bingbot', // Bing/Microsoft
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      // AI Search Engine Crawlers (AEO Optimization)
      {
        userAgent: 'GPTBot', // OpenAI ChatGPT
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'ChatGPT-User', // ChatGPT Browse
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'Claude-Web', // Anthropic Claude
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'ClaudeBot', // Anthropic Claude Bot
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'Google-Extended', // Google Gemini/Bard AI Training
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'PerplexityBot', // Perplexity AI
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'Applebot-Extended', // Apple Intelligence
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'CCBot', // Common Crawl (AI Training Data)
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'anthropic-ai', // Anthropic AI Research
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'Omgilibot', // Omgili Search
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'FacebookBot', // Meta AI
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
      {
        userAgent: 'Bytespider', // ByteDance/TikTok AI
        allow: '/',
        crawlDelay: 0,
        disallow: ['/api/', '/unsubscribe/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}