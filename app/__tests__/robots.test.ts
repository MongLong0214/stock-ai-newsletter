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

    const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
    type Rule = (typeof rules)[number];
    for (const userAgent of userAgents) {
      expect(
        rules.find((rule: Rule) => rule.userAgent === userAgent)
      ).toEqual({
        userAgent,
        allow: '/',
        disallow: ['/api/'],
      });
    }
  });
});
