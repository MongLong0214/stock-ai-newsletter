import { NextResponse } from 'next/server';

import { checkRateLimit, type RateLimitPolicy } from './check-rate-limit';

type Handler<Ctx> = (request: Request, ctx: Ctx) => Promise<Response> | Response;

export const withRateLimit = <Ctx = unknown>(
  policy: RateLimitPolicy,
  handler: Handler<Ctx>,
): Handler<Ctx> => {
  return async (request, ctx) => {
    const result = await checkRateLimit(request, policy);
    if (!result.ok) {
      const retryAfter = String(result.retryAfter ?? 60);
      const path = new URL(request.url).pathname;
      const isBackendUnavailable = result.reason === 'backend_unavailable';
      const status = isBackendUnavailable ? 503 : 429;
      const errorMessage = isBackendUnavailable
        ? 'service temporarily unavailable'
        : 'rate limit exceeded';

      console.warn(
        JSON.stringify({
          event: isBackendUnavailable
            ? 'rate_limit_backend_unavailable'
            : 'rate_limit_hit',
          policy,
          path,
          retryAfter,
          status,
        }),
      );
      return NextResponse.json(
        { error: errorMessage },
        {
          status,
          headers: { 'Retry-After': retryAfter },
        },
      );
    }
    return handler(request, ctx);
  };
};
