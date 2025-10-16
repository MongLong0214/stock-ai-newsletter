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
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}