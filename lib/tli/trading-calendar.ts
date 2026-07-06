import { isMarketClosed } from '@/app/archive/_utils/market/hours'

type TliCollectionMode = 'full' | 'news-only'

// 정오(12:00) 고정 + 로컬 타임존 Date 생성자를 사용한다. isMarketClosed()는 이 Date를
// getDay()/getFullYear() 등 로컬 getter로만 읽으므로, 생성자·getter가 모두 "로컬" 기준으로 대칭을
// 이뤄 실행 환경의 타임존(UTC 서버든 KST든)과 무관하게 항상 의도한 날짜를 가리킨다. 정오로 고정한
// 이유는 자정 근처에서 하루가 밀리는 것을 방지하기 위함 — 이후 "UTC로 통일" 리팩터링 시 이 대칭을
// 깨면(예: 생성자만 UTC로 바꾸고 getter는 로컬로 남기면) 날짜가 하루씩 어긋나는 버그가 생긴다.
function parseKoreanMarketDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export function isKoreanTradingDate(dateString: string): boolean {
  return !isMarketClosed(parseKoreanMarketDate(dateString))
}

export function shouldCollectTliStocks(input: {
  readonly mode: TliCollectionMode
  readonly kstDate: string
}): boolean {
  return input.mode === 'full' && isKoreanTradingDate(input.kstDate)
}
