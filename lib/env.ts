import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().startsWith('sk-'),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  GEMINI_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().startsWith('re_'),
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
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      CRON_SECRET: process.env.CRON_SECRET,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ 환경 변수 검증 실패:', error.errors);
      throw new Error('환경 변수가 올바르게 설정되지 않았습니다.');
    }
    throw error;
  }
}