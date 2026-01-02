# Archive 모듈 구조

## 개요
`/app/archive` - 뉴스레터 아카이브 페이지

## 디렉토리 구조
```
app/archive/
├── page.tsx                 # 메인 페이지
├── layout.tsx               # 레이아웃
├── _archive-data/
│   └── archives.json        # 정적 뉴스레터 데이터
├── _components/
│   ├── ui/
│   │   └── score-badge.tsx  # 점수 배지
│   ├── calendar/
│   │   ├── desktop-sidebar.tsx
│   │   ├── mobile-calendar-toggle.tsx
│   │   └── mini-calendar/   # 캘린더 컴포넌트
│   ├── cards/
│   │   └── newsletter-card/ # 뉴스레터 카드
│   └── layout/
│       ├── page-header.tsx
│       ├── newsletter-grid.tsx
│       └── empty-state.tsx
├── _hooks/
│   ├── use-stock-prices.ts  # 실시간 시세 조회
│   ├── use-archive-data.ts  # 아카이브 데이터
│   ├── use-calendar-state.ts
│   ├── use-newsletter-data.ts
│   ├── use-mobile-calendar.ts
│   ├── use-keyboard-shortcuts.ts
│   └── use-focus-trap.ts
├── _utils/
│   ├── market/
│   │   ├── hours.ts         # 시장 시간 계산
│   │   └── _constants/holidays.ts
│   ├── formatting/
│   │   ├── price.ts
│   │   ├── score.ts
│   │   └── date.ts
│   ├── cache/
│   │   ├── stock-price.ts
│   │   └── types.ts
│   └── api/kis/             # KIS API 클라이언트
├── _types/
│   └── archive.types.ts     # 타입 정의
└── _constants/
    └── animations.ts        # 애니메이션 상수
```

## 핵심 기능
1. 날짜별 뉴스레터 조회
2. 실시간 주가 표시 (KIS API)
3. 기술적 분석 시그널 점수
4. 반응형 캘린더 (데스크톱/모바일)
5. 키보드 단축키 지원
