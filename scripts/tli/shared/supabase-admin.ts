import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js';

const isUnitTest = process.env.VITEST === 'true';
if (!isUnitTest) config({ path: '.env.local', quiet: true })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// next build는 이 모듈을 import하는 API 라우트(예: admin/tli/comparison-v4/promote)의 page data를
// 수집하려고 모듈을 로드한다. 그 시점엔 서버 전용 시크릿이 없을 수 있다(특히 Vercel Preview 환경).
// 빌드 단계에서만 placeholder로 대체해 빌드를 통과시키고, 스크립트/런타임에서는 그대로 fail-loud —
// 잘못된 자격증명으로 조용히 도는 것을 막는다. lib/env.ts와 동일한 NEXT_PHASE 가드.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
const permitsPlaceholder = isBuildPhase || isUnitTest;

if ((!supabaseUrl || !serviceRoleKey) && !permitsPlaceholder) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL');
}

export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  serviceRoleKey || 'placeholder-key',
  { auth: { persistSession: false } },
);
