import { describe, expect, it } from 'vitest';

import { shouldRenderAnalytics } from '../analytics-env';

describe('shouldRenderAnalytics', () => {
  it.each([
    ['VERCEL_ENV production', { VERCEL_ENV: 'production' }, true],
    ['NEXT_PUBLIC_VERCEL_ENV production', { NEXT_PUBLIC_VERCEL_ENV: 'production' }, true],
    ['preview deployment', { VERCEL_ENV: 'preview', NEXT_PUBLIC_VERCEL_ENV: 'preview' }, false],
    ['development deployment', { VERCEL_ENV: 'development', NEXT_PUBLIC_VERCEL_ENV: 'development' }, false],
    ['local environment', {}, false],
  ] as const)('%s', (_name, env, expected) => {
    expect(shouldRenderAnalytics(env as NodeJS.ProcessEnv)).toBe(expected);
  });
});
