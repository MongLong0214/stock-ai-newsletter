#!/bin/bash

# 🚀 엔터프라이즈급 자동 배포 스크립트
# Vercel 배포 및 환경 변수 자동 설정

set -e

echo "🚀 Starting enterprise deployment..."

# 환경 변수 파일에서 읽기
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local file not found"
    exit 1
fi

# .env.local에서 환경 변수 로드
export $(cat .env.local | grep -v '^#' | xargs)

echo "📦 Deploying to Vercel..."

# Vercel 배포 (프로덕션)
vercel --prod --yes \
    -e NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
    -e NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    -e GEMINI_API_KEY="$GEMINI_API_KEY" \
    -e RESEND_API_KEY="$RESEND_API_KEY" \
    -e EMAIL_FROM="$EMAIL_FROM" \
    -e CRON_SECRET="$CRON_SECRET" \
    -e NEXT_PUBLIC_APP_URL="https://stock-ai-newsletter.vercel.app"

echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Visit your deployment URL"
echo "2. Update NEXT_PUBLIC_APP_URL in Vercel dashboard with actual URL"
echo "3. Configure Resend domain verification"
echo "4. Test email sending"