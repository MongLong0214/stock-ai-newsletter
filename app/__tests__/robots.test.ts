import { describe, expect, it } from 'vitest';

import robots from '../robots';

describe('robots policy', () => {
  it('allows social preview crawlers to crawl card pages while keeping api routes blocked', () => {
    const config = robots();
    const userAgents = [
      'Twitterbot',
      'facebookexternalhit',
      'Facebot',
      'Slackbot',
      'LinkedInBot',
      'Discordbot',
      'TelegramBot',
      'WhatsApp',
      'SkypeUriPreview',
    ];

    for (const userAgent of userAgents) {
      expect(
        config.rules.find((rule) => rule.userAgent === userAgent)
      ).toEqual({
        userAgent,
        allow: '/',
        disallow: ['/api/'],
      });
    }
  });
});
