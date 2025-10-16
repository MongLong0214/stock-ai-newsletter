import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://stockmatrix.co.kr';
  const currentDate = new Date();

  return [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1.0,
      alternates: {
        languages: {
          ko: baseUrl,
        },
      },
    },
    {
      url: `${baseUrl}/subscribe`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.9,
      alternates: {
        languages: {
          ko: `${baseUrl}/subscribe`,
        },
      },
    },
    {
      url: `${baseUrl}/unsubscribe`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.2,
      alternates: {
        languages: {
          ko: `${baseUrl}/unsubscribe`,
        },
      },
    },
  ];
}