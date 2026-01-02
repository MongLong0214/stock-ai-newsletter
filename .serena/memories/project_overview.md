# Stock AI Newsletter - 프로젝트 개요

## 프로젝트 목적
AI 기반 주식 분석 뉴스레터 플랫폼. 한국 주식 시장을 대상으로 기술적 분석 결과를 이메일로 발송.

## 기술 스택
- **Framework**: Next.js 15.5.7 (App Router, Turbopack)
- **React**: 19.1.0
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS 4.x
- **Animation**: Framer Motion
- **Package Manager**: npm
- **Hosting**: Vercel

## 핵심 기능
1. **뉴스레터 아카이브**: 과거 발송 뉴스레터 조회
2. **실시간 주가**: KIS API 연동 실시간 시세 조회
3. **기술적 분석**: 6개 시그널 점수 표시
4. **이메일 발송**: SendGrid 연동
5. **블로그**: MDX 기반 기술 분석 글

## 주요 디렉토리
- `/app/archive`: 뉴스레터 아카이브 페이지
- `/app/api/stock`: 주가 조회 API
- `/app/blog`: 블로그 페이지
- `/scripts`: 뉴스레터 발송 스크립트

## 환경 변수
- `.env.local`: 로컬 개발용 (Supabase, KIS API 등)
