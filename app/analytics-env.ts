export const shouldRenderAnalytics = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.NEXT_PUBLIC_VERCEL_ENV === 'production' || env.VERCEL_ENV === 'production';
