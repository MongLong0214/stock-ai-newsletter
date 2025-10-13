import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().startsWith('sk-').optional(),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),
  GEMINI_API_KEY: z.string().min(1),
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export function validateEnv() {
  try {
    envSchema.parse({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      AWS_REGION: process.env.AWS_REGION,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      CRON_SECRET: process.env.CRON_SECRET,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ 환경 변수 검증 실패:', error.issues);
      throw new Error('환경 변수가 올바르게 설정되지 않았습니다.');
    }
    throw error;
  }
}

// Build-time environment validation (production only)
if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
  try {
    validateEnv();
    console.log('✅ Environment variables validated successfully at build time');
  } catch (error) {
    console.error('❌ Environment validation failed at build time');
    throw error;
  }
}