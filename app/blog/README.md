# 블로그 자동 생성 시스템

## 🎯 개요

Gemini AI 기반 동적 키워드 생성 및 블로그 자동 생성 시스템입니다.

**핵심 기능**:
- 🤖 **AI 자동 키워드 생성**: Gemini가 매일 새로운 SEO 최적화 키워드 5개 발굴
- 🔍 **중복 방지**: Supabase 기반 실시간 중복 키워드 필터링
- 📊 **품질 점수 시스템**: 검색 의도, 난이도, 검색량 기반 키워드 평가
- ⚡ **완전 자동화**: GitHub Actions로 평일 오전 9시 자동 실행
- 💾 **Draft 자동 저장**: 생성된 블로그는 자동으로 Draft 상태로 저장

## 🚀 사용 방법

### 로컬 실행

```bash
npm run generate-blog
```

**동작**:
- Gemini AI가 주식 투자 관련 키워드 5개 자동 생성
- 중복 키워드 자동 제거
- 품질 점수 기반 우선순위 선택
- 5개 블로그 포스트 자동 생성
- Draft 상태로 Supabase 저장

### GitHub Actions 자동 실행

**자동 스케줄**: 평일 오전 9:00 KST (월~금)
- 자동으로 AI 키워드 5개 생성
- Draft 상태로 저장
- 실패 시 에러 로그 출력

**수동 실행**:
1. GitHub → Actions → "Generate Blog Content"
2. "Run workflow" 클릭
3. 실행 대기 (~10분 소요)

## 🤖 AI 키워드 생성 시스템

### 동작 흐름

```
1. Gemini AI 호출
   ↓
2. 주식 투자 관련 롱테일 키워드 생성
   ↓
3. Supabase에서 이미 사용된 키워드 조회
   ↓
4. 중복 키워드 제거
   ↓
5. 키워드 품질 점수 계산
   - 검색 의도 (정보형 > 상업형)
   - 난이도 (낮음 > 중간 > 높음)
   - 검색량 (500~1500 최적)
   ↓
6. 점수 기반 정렬 및 상위 5개 선택
   ↓
7. 각 키워드에 맞는 콘텐츠 타입 자동 매칭
   ↓
8. 블로그 포스트 생성 (경쟁사 분석 → 콘텐츠 생성)
```

### 키워드 품질 평가

**관련성 점수** (7.5~10점):
- 주식 투자 주제 관련도
- 실제 검색 가능성
- 정보 탐색 의도 명확성

**검색 의도** 가중치:
- Informational (1.2x): 정보 탐색 - 가장 유리
- Commercial (1.1x): 상업적 비교
- Transactional (0.9x): 거래 의도
- Navigational (0.7x): 특정 사이트 탐색

**난이도** 가중치:
- Low (1.3x): 낮은 경쟁 - 가장 유리
- Medium (1.0x): 적절한 경쟁
- High (0.7x): 높은 경쟁

**검색량** 가중치:
- 500~1500: 1.2x (최적)
- 100~500: 1.0x (양호)
- <100: 0.6x (너무 적음)
- >3000: 0.8x (경쟁 높음)

## 📁 시스템 구조

```
app/blog/
├── _services/
│   ├── keyword-generator.ts       # AI 키워드 생성 엔진
│   ├── content-generator.ts       # Gemini 콘텐츠 생성
│   ├── serp-api.ts                # 경쟁사 검색
│   ├── web-scraper.ts             # 경쟁사 스크래핑
│   └── blog-repository.ts         # Supabase 저장
├── _config/
│   └── pipeline-config.ts         # 시스템 설정
├── pipeline.ts                    # 파이프라인 오케스트레이션
└── README.md                      # 본 문서

scripts/
└── generate-blog-post.ts          # CLI 진입점

.github/workflows/
└── generate-blog-content.yml      # GitHub Actions 워크플로우
```

## 🔧 환경변수

### 필수 환경변수

```env
SERP_API_KEY=your_serpapi_key                          # Google 검색 API
GOOGLE_CLOUD_PROJECT=your_project_id                   # Gemini AI 프로젝트
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service.json   # GCP 인증
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co      # Supabase URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key           # Supabase Public
SUPABASE_SERVICE_ROLE_KEY=your_service_key            # Supabase Admin
```

### GitHub Secrets

Actions에서 실행하려면 다음 secrets 필수:
- `SERP_API_KEY`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_CREDENTIALS` (JSON 전체)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 📈 성능 및 제한

### API 사용량

**SerpApi**:
- 무료 플랜: 월 100회
- 키워드당 1회 호출
- 평일 주 5회 × 5개 = 주 25회 사용
- **월 사용량**: ~100회 (무료 플랜 한도)

**Gemini AI**:
- 키워드 생성: ~8K 토큰 출력
- 콘텐츠 생성 (5개): ~320K 토큰 출력
- **1회 실행당 총 ~328K 토큰**

### 실행 시간

- 키워드 생성: ~10초
- 블로그 5개 생성: ~500초 (8분)
- **총 소요 시간**: ~510초 (8.5분)

### 권장 설정

**일일 생성 개수**: 5개 (평일)
- 주 5일 × 5개 = 주 25개 블로그
- 월 ~100개 블로그
- SerpApi 무료 플랜 최대 활용

## 🛠️ 트러블슈팅

### 키워드 생성 실패

**증상**: "AI 응답 파싱 실패"

**원인**: Gemini가 JSON 형식 외 텍스트 반환

**해결**:
1. `keyword-generator.ts:66` 프롬프트 확인
2. 재시도 로직 (maxRetries: 3) 동작 확인

### 중복 키워드 생성

**증상**: 이미 있는 키워드로 글 생성

**원인**: Supabase 조회 실패

**해결**:
1. `blog_posts` 테이블 `target_keyword` 인덱스 확인
2. 로그에서 "기존 키워드" 개수 확인

### GitHub Actions 실패

**증상**: workflow 실패

**원인**: Secrets 누락

**해결**:
1. Repository Settings → Secrets 확인
2. `SUPABASE_SERVICE_ROLE_KEY` 권한 검증

## 📊 생성 통계

**예상 월간 생성량**:
- 평일 5일 × 4주 = 20일
- 1일 5개 × 20일 = **월 100개 블로그**

**키워드 다양성**:
- AI가 매일 새로운 키워드 생성
- 중복 제거로 100% 유니크
- 검색 커버리지 지속 확대

## 📞 지원

**문의**: aistockmatrix@gmail.com