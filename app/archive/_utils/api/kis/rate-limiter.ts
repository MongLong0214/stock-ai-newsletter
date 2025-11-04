/**
 * KIS API Rate Limiting 유틸리티
 */

interface RateLimitTracker {
  lastTokenRequest: number;
  tokenRequestCount: number;
  lastPriceRequest: number;
  priceRequestCount: number;
}

const rateLimitTracker: RateLimitTracker = {
  lastTokenRequest: 0,
  tokenRequestCount: 0,
  lastPriceRequest: 0,
  priceRequestCount: 0,
};

const MINUTE_MS = 60 * 1000;

/**
 * Rate limit 체크 및 경고
 */
export function checkRateLimit(type: 'token' | 'price'): void {
  const now = Date.now();

  if (type === 'token') {
    const timeSinceLastRequest = now - rateLimitTracker.lastTokenRequest;
    if (timeSinceLastRequest < MINUTE_MS) {
      const waitTime = Math.ceil((MINUTE_MS - timeSinceLastRequest) / 1000);
      console.warn(
        `[KIS] Rate limit warning: Token request within 1 minute. ` +
          `Please wait ${waitTime}s before next request.`
      );
    }
    rateLimitTracker.lastTokenRequest = now;
    rateLimitTracker.tokenRequestCount++;
  } else {
    rateLimitTracker.lastPriceRequest = now;
    rateLimitTracker.priceRequestCount++;
  }
}
