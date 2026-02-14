# llm-hunt-blogs

> Multi-LLM 블로그 자동 생성 파이프라인 — CTF Key Hunter 연동

---

## 실행

```bash
# 단일 명령어 — 키 갱신 + 블로그 생성 전부 자동
npx tsx scripts/llm-hunt-blogs/index.ts

# 호환성 래퍼 (위와 동일)
npx tsx scripts/generate-blog-post-multi-llm.ts
```

---

## 폴더 구조

```
scripts/llm-hunt-blogs/
├── index.ts                     # 엔트리 포인트 + 프로세스 관리
├── types.ts                     # 전체 타입 정의
├── constants.ts                 # 상수, 타임아웃, 모델 설정
├── utils.ts                     # withTimeout, withTimeoutFallback, err
│
├── key-hunter/
│   ├── ctf-key-hunter.js        # API 키 수집 스크립트
│   └── manager.ts               # 키 갱신, 로드, 선택
│
├── data/                        # 런타임 데이터 (gitignored)
│   ├── ctf-keys.json            # 전체 수집 키
│   ├── ctf-keys-valid.json      # 유효성 검증 통과 키
│   └── ctf-keys-working.json    # 실제 동작 확인 키
│
├── providers/
│   ├── openai.ts                # GPT-5.2 (Thinking)
│   ├── google.ts                # Gemini 3 Pro
│   ├── groq.ts                  # Llama 4 Scout
│   └── router.ts                # 프로바이더 감지, 라운드로빈, 폴백
│
└── pipeline/
    ├── keywords.ts              # 키워드 생성 (Zod + SEO 점수)
    ├── content.ts               # 콘텐츠 생성 + 품질 점수
    ├── draft.ts                 # 검색 → 스크래핑 → 초안 생성
    ├── selection.ts             # AI 선별 + DB 중복 검증
    ├── publish.ts               # 저장 & 발행 + Google Indexing
    └── runner.ts                # 4-Phase 파이프라인 오케스트레이터
```

---

## 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│ 0. Key Refresh (자동)                                     │
│    ctf-keys-working.json 없거나 24시간 초과 시:            │
│    → execSync: node key-hunter/ctf-key-hunter.js --working│
│    → 수집 → 추출 → 검증 → call 테스트 → working.json 저장 │
├──────────────────────────────────────────────────────────┤
│ Phase 1. Keyword Generation (프로바이더 수 × 5개)          │
│    Supabase에서 기존 키워드/제목 조회 → 중복 제거           │
│    TLI 테마 컨텍스트 주입 → AI로 15개 키워드 생성           │
│    Zod 스키마 검증 + SEO 점수 기반 정렬                     │
├──────────────────────────────────────────────────────────┤
│ Phase 2. Draft Generation (프로바이더별 할당, 저장 없음)    │
│    키워드 1→OpenAI, 2→Google, 3→Groq, 4→OpenAI...         │
│    Google SERP 검색 → 경쟁사 스크래핑 → 분석               │
│    프롬프트 조립 → LLM fallback 체인으로 콘텐츠 생성        │
│    품질 점수 60점 미만 시 재시도 (최대 3회)                 │
├──────────────────────────────────────────────────────────┤
│ Phase 3. AI Selection + 중복 검증 (상위 10개 선별)          │
│    Supabase에서 기존 블로그 150개 조회                     │
│    기존 글과 주제/키워드 겹치는 초안 탈락 (최우선)          │
│    초안끼리 주제 중복 시 품질 높은 1개만 남김               │
│    나머지 중 SEO + 품질 + 다양성 + 독자가치 기준 선별      │
│    실패 시 품질 점수 순 폴백                               │
├──────────────────────────────────────────────────────────┤
│ Phase 4. Save & Publish (선별된 10개만)                    │
│    Supabase 저장 → 발행 → Google Indexing API 알림         │
└──────────────────────────────────────────────────────────┘
```

---

## LLM 프로바이더

| Provider | 모델 | API | 환경변수 | 비고 |
|----------|------|-----|---------|------|
| OpenAI | `gpt-5.2` (Thinking) | `api.openai.com/v1/chat/completions` | `OPENAI_API_KEY` | reasoning_effort: high, max_completion_tokens: 32768 |
| Google | `gemini-3-pro-preview` | `@google/genai` SDK | `GEMINI_API_KEY` | maxOutputTokens: 65536, temp: 0.8 |
| Groq | `llama-4-scout-17b-16e-instruct` | `api.groq.com/openai/v1/chat/completions` | `GROQ_API_KEY` | max_completion_tokens: 32768, temp: 0.7, TPM: 30K |

### 키 우선순위

```
1. 환경변수 (OPENAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY)
2. data/ctf-keys-working.json에서 랜덤 선택
```

### LLM 호출 전략

- **키워드 생성**: 라운드로빈 (OpenAI → Google → Groq → OpenAI → ...)
- **콘텐츠 생성**: Fallback 체인 (1차 → 실패 시 2차 → 실패 시 3차)
- **재시도**: 최대 3회, exponential backoff (2s → 4s → 8s) + jitter

---

## CTF Key Hunter 연동

### 자동 갱신 조건

| 조건 | 동작 |
|------|------|
| `data/ctf-keys-working.json` 없음 | Hunter 자동 실행 |
| 파일 수정 시간 > 24시간 | Hunter 자동 실행 |
| 파일 수정 시간 < 24시간 | 기존 파일 사용 (스킵) |
| Hunter 실패 + 기존 파일 있음 | 기존 파일로 폴백 |
| Hunter 실패 + 기존 파일 없음 | env var 없으면 exit(1) |

### Hunter 실행 파라미터

```bash
node scripts/llm-hunt-blogs/key-hunter/ctf-key-hunter.js --working --pages=10 --limit=50
# timeout: 5분
# stdio: inherit (로그 실시간 출력)
```

### working.json 구조

```json
{
  "openai": [
    { "key": "sk-proj-...", "repo": "https://github.com/...", "file": ".env", "models": 97 }
  ],
  "google": [
    { "key": "AIzaSy...", "repo": "https://github.com/...", "file": "config.yaml" }
  ],
  "groq": [
    { "key": "gsk_...", "repo": "https://github.com/...", "file": "settings.py", "models": 20 }
  ]
}
```

---

## 타임아웃 체인

```
60분 ─── 글로벌 스크립트 타임아웃 (15개 생성 + 선별 + 발행)
 │
 ├─ 5분 ── Key Hunter execSync 타임아웃
 │
 ├─ 5분 ── 키워드 15개 생성 (reasoning 모델 대응)
 │
 ├─ × 15 ─ 초안 생성 루프
 │   ├─ 1분 ── Google SERP 검색 (withTimeoutFallback → [])
 │   ├─ 2분 ── 경쟁사 스크래핑 (withTimeoutFallback → [])
 │   └─ 5분 ── AI 콘텐츠 생성 (withTimeout → throw)
 │       └─ 2분 ── 개별 LLM 호출 (withTimeout)
 │           └─ fallback: primary → provider2 → provider3
 │
 ├─ 2분 ── AI 선별 (15→10, withTimeout)
 │
 └─ × 10 ─ 저장 & 발행 (30초 each)
```

---

## 필수 환경변수

| 변수 | 용도 | 필수 |
|------|------|------|
| `SERP_API_KEY` | Google 검색 API | 필수 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | 필수 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 키 | 필수 |
| `OPENAI_API_KEY` | OpenAI API | 선택 (working.json 대체) |
| `GEMINI_API_KEY` | Google AI API | 선택 (working.json 대체) |
| `GROQ_API_KEY` | Groq API | 선택 (working.json 대체) |

---

## 에러 핸들링

### LLM 응답 방어

| 상황 | 처리 |
|------|------|
| API 4xx/5xx | throw → fallback 체인 다음 프로바이더 |
| choices 배열 비어있음 | throw (명시적 에러 메시지) |
| Google 빈 응답 (safety filter) | throw → fallback |
| 품질 점수 < 60 | throw → 재시도 (최대 3회) |
| JSON 파싱 실패 | throw → 재시도 |
| 모든 프로바이더 실패 | throw → 해당 블로그 건너뜀 |

### 파이프라인 방어

| 상황 | 처리 |
|------|------|
| 검색 결과 0건 | AI 자체 지식으로 생성 (fallback) |
| 스크래핑 타임아웃 | 빈 배열로 폴백 |
| 키워드 생성 실패 | 전체 파이프라인 종료 |
| 5개 중 일부 블로그 실패 | 나머지 계속 진행 |
| 전체 0개 성공 | exit(1) |

---

## 품질 점수 (100점 만점)

| 항목 | 배점 | 기준 |
|------|------|------|
| 길이 품질 | 30 | 경쟁사 평균 × 1.3 대비 비율 |
| 구조 품질 | 25 | title, metaTitle, metaDescription, FAQ |
| SEO 품질 | 25 | 키워드 포함 여부 (제목, 메타, 본문 3회+) |
| 가독성 품질 | 20 | H2 3개+, 리스트, 단락 5개+ |

**최소 통과 점수: 60점** (미달 시 재시도)

---

## ctf-key-hunter.js 모드

| 플래그 | 동작 |
|--------|------|
| `--login` | Chrome 열어서 Google OAuth 로그인 → 쿠키 저장 |
| `--test` | 수집 → 추출 → 유효성 테스트 → valid.json 저장 |
| `--call` | valid.json의 키로 실제 API 호출 테스트 |
| `--working` | **통합**: 수집 → 추출 → 테스트 → call 검증 → working.json 저장 |
| `--pages=N` | 수집할 페이지 수 (기본 100, blog 연동 시 10) |
| `--limit=N` | 페이지당 항목 수 (기본 50) |
| `--provider=X` | 특정 프로바이더만 필터 |
| `--pFetch=N` | GitHub fetch 병렬도 (기본 24) |
| `--pTest=N` | 키 테스트 병렬도 (기본 8) |

---

## 최초 셋업

```bash
# 1. apiradar.live 로그인 (1회)
node scripts/llm-hunt-blogs/key-hunter/ctf-key-hunter.js --login

# 2. working keys 생성
node scripts/llm-hunt-blogs/key-hunter/ctf-key-hunter.js --working --pages=10 --limit=50

# 3. 블로그 생성 (이후 이것만 반복)
npx tsx scripts/llm-hunt-blogs/index.ts
```
