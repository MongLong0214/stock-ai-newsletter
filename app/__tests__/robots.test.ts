import { describe, expect, it } from 'vitest';

import robots from '../robots';

describe('robots policy', () => {
  it('allows social preview crawlers to crawl card pages while keeping api routes blocked', () => {
    const config = robots();
    if (!Array.isArray(config.rules)) {
      throw new TypeError('Expected robots rules to be an array');
    }

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

describe('SEO·백링크 크롤러 정책', () => {
  const GRAPH_BOTS = ['CCBot', 'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'PetalBot'];

  it('링크 그래프 크롤러에게 페이지를 열되 /api/ 는 막는다', () => {
    const config = robots();
    if (!Array.isArray(config.rules)) throw new TypeError('rules must be an array');

    for (const bot of GRAPH_BOTS) {
      const rule = config.rules.find((r) => r.userAgent === bot);
      expect(rule, `${bot} 규칙이 있어야 한다`).toBeDefined();
      // 전면 차단(disallow: '/')으로 되돌아가면 외부 도구에서 "백링크 없음"이 된다.
      expect(rule?.allow).toBe('/');
      expect(rule?.disallow).toContain('/api/');
      expect(rule?.disallow).not.toContain('/');
    }
  });
});
