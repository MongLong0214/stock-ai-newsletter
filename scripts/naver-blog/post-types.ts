/**
 * 네이버 발행 글 유형 로테이션
 *
 * 한 종류만 계속 내면 테마명과 숫자만 바뀐 글이 쌓인다 — 네이버가 저품질로 잡는
 * 대표 신호가 "동일 문구 대량 반복"이다. 자사 블로그에서 1,306편 템플릿 양산으로
 * 이미 겪은 문제를 여기서 반복하지 않기 위해 유형을 나눈다.
 *
 * 유형마다 문장 구조·소제목·데이터 소스가 다르므로 같은 템플릿의 재발행 간격이
 * 주 2회에서 격주 1회 수준으로 떨어진다.
 */

export type PostType = 'evergreen' | 'news' | 'ranking' | 'similar' | 'theme';

export interface TypePlan {
  /** 이 유형이 쓰는 데이터 */
  readonly source: string;
  readonly type: PostType;
  readonly why: string;
}

export const TYPE_PLANS: Readonly<Record<PostType, TypePlan>> = {
  theme: {
    type: 'theme',
    source: '/api/tli/themes/{id}',
    why: '개별 테마 심층 — 점수 구성 요소와 관련종목',
  },
  ranking: {
    type: 'ranking',
    source: '/api/tli/scores/ranking',
    why: '주간 집계 — 개별 테마가 아니라 시장 전체 흐름',
  },
  similar: {
    type: 'similar',
    source: 'theme.comparisons',
    why: '유사 패턴 비교 — 과거 사이클과 대조, 서술 구조가 다름',
  },
  evergreen: {
    type: 'evergreen',
    source: '고정 콘텐츠 + 현재 수치',
    why: '지표 설명 — 검색 수요가 꾸준하고 시의성에 안 묶임',
  },
  news: {
    type: 'news',
    source: 'theme.recentNews (50건)',
    why: '테마별 뉴스 흐름 — 날짜·매체가 매번 달라 문장이 겹치지 않는다',
  },
};

/**
 * 발행 회차로 유형을 정한다.
 *
 * 매일 1편(주 7편) 기준의 7일 주기다. 빈도 자체는 문제가 아니다 — 네이버 C-Rank는
 * 꾸준한 발행을 활동성 신호로 본다. 위험한 것은 같은 템플릿의 반복이므로
 * 유형을 5종으로 나누고 같은 유형이 연속으로 나오지 않게 배치한다.
 *
 * KST 날짜로 돈다. 발행 기록 수로 세던 것을 바꾼 이유: GitHub Actions 러너는 매 실행마다
 * 새 VM이고 .naver-blog/ 는 gitignore라 CI에서는 readHistory()가 항상 []였다.
 * 회차가 늘 0 → typeForHistory(0) → **매일 theme**. 로테이션이 운영에서 통째로 죽어 있었다.
 * 날짜에서 뽑으면 상태 복원이 실패해도 유형은 항상 맞는다.
 *
 *   1 theme → 2 ranking → 3 theme → 4 similar → 5 theme → 6 news → 7 evergreen
 *
 * theme이 3/7로 가장 많지만 매번 다른 테마를 다루고(쿨다운 적용), 나머지 4종이
 * 사이에 끼어 같은 문장 구조가 이틀 연속 나오지 않는다.
 */
const ROTATION: readonly PostType[] = [
  'theme', 'ranking', 'theme', 'similar', 'theme', 'news', 'evergreen',
];

/**
 * 같은 테마를 다시 쓰기까지의 최소 간격(일).
 *
 * 매일 발행하면 상승 테마 목록이 며칠씩 겹친다. 쿨다운이 없으면 같은 테마 글이
 * 사흘 연속 나올 수 있고, 그것이 정확히 "동일 문구 반복"이 된다.
 */
export const ROTATION_LENGTH = ROTATION.length;

export const THEME_COOLDOWN_DAYS = 14;

export function pickType(publishIndex: number): PostType {
  return ROTATION[((publishIndex % ROTATION.length) + ROTATION.length) % ROTATION.length];
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** KST 기준 일련일. 로테이션 주기(7)와 같아 요일마다 유형이 고정된다. */
export function kstDayIndex(now: number): number {
  return Math.floor((now + KST_OFFSET_MS) / DAY_MS);
}

/** 그날의 유형. 상태가 없어도 결정된다. */
export function typeForDate(now: number): PostType {
  return pickType(kstDayIndex(now));
}

/** evergreen은 7회에 한 번 오므로 주제 인덱스도 날짜에서 뽑는다(주제 7종 → 49일 주기). */
export function evergreenIndexForDate(now: number): number {
  return Math.floor(kstDayIndex(now) / ROTATION.length);
}
