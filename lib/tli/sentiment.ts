/** 한국 금융 뉴스 감성 분석 모듈 */

/** 긍정 키워드 (bullish) */
export const POSITIVE_KEYWORDS: readonly string[] = [
  '급등', '상승', '호재', '성장', '돌파', '신고가', '수혜', '확대',
  '상한가', '호황', '대박', '폭등', '강세', '회복', '반등', '기대감',
  '흑자', '전환', '매출증가', '수주', '계약', '투자확대', '실적호전',
  '이익증가', '상승세', '성장세', '개선', '기대', '긍정', '확장',
] as const

/** 부정 키워드 (bearish) */
export const NEGATIVE_KEYWORDS: readonly string[] = [
  '급락', '하락', '악재', '위기', '폭락', '손실', '축소', '하한가',
  '불황', '약세', '침체', '부진', '적자', '감소', '매출감소', '적자전환',
  '하락세', '둔화', '우려', '부정', '리스크', '위험', '규제', '제재',
  '과열', '버블', '조정', '경고',
] as const

export interface SentimentResult {
  score: number
  positive: number
  negative: number
  label: '긍정' | '부정' | '중립'
}

/**
 * 한국 금융 뉴스 제목의 감성 분석.
 * Score = (positive - negative) / max(positive + negative, 1)
 * 범위: -1.0 (매우 부정) ~ +1.0 (매우 긍정), 0 = 중립
 */
export function analyzeSentiment(title: string): SentimentResult {
  let positive = 0
  let negative = 0

  // 긴 키워드부터 매칭하여 부분 문자열 중복 카운트 방지
  const sortedPositive = [...POSITIVE_KEYWORDS].sort((a, b) => b.length - a.length)
  const sortedNegative = [...NEGATIVE_KEYWORDS].sort((a, b) => b.length - a.length)
  const matched = new Set<number>()

  for (const kw of sortedPositive) {
    let searchFrom = 0
    while (searchFrom < title.length) {
      const idx = title.indexOf(kw, searchFrom)
      if (idx === -1) break
      let overlaps = false
      for (let i = idx; i < idx + kw.length; i++) {
        if (matched.has(i)) {
          overlaps = true
          break
        }
      }
      if (!overlaps) {
        positive++
        for (let i = idx; i < idx + kw.length; i++) matched.add(i)
      }
      searchFrom = idx + kw.length
    }
  }
  for (const kw of sortedNegative) {
    let searchFrom = 0
    while (searchFrom < title.length) {
      const idx = title.indexOf(kw, searchFrom)
      if (idx === -1) break
      let overlaps = false
      for (let i = idx; i < idx + kw.length; i++) {
        if (matched.has(i)) {
          overlaps = true
          break
        }
      }
      if (!overlaps) {
        negative++
        for (let i = idx; i < idx + kw.length; i++) matched.add(i)
      }
      searchFrom = idx + kw.length
    }
  }

  const total = positive + negative
  const score = total > 0 ? (positive - negative) / total : 0
  const label = score > 0.1 ? '긍정' : score < -0.1 ? '부정' : '중립'

  return { score, positive, negative, label }
}

/** 정규식 특수문자 이스케이프 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 기사 제목이 테마 키워드와 관련있는지 확인.
 * 짧은 영문 키워드(≤3자)는 단어 경계 매칭으로 오탐 방지.
 */
export function isRelevantArticle(title: string, keywords: string[]): boolean {
  return keywords.some(keyword => {
    // 짧은 영문/숫자 키워드: 단어 경계(word boundary) 필수
    if (keyword.length <= 3 && /^[A-Za-z0-9]+$/.test(keyword)) {
      return new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(title)
    }
    return title.includes(keyword)
  })
}

/**
 * 감성 점수에 대한 UI 색상/라벨 설정 반환.
 */
export function getSentimentConfig(score: number) {
  if (score > 0.1) {
    return {
      label: '긍정' as const,
      color: '#10B981',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
    }
  }
  if (score < -0.1) {
    return {
      label: '부정' as const,
      color: '#EF4444',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      text: 'text-red-400',
    }
  }
  return {
    label: '중립' as const,
    color: '#64748B',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    text: 'text-slate-400',
  }
}

/**
 * 감성 점수 배열의 집계 (점수 계산용).
 * average: 원본 평균 [-1, 1]
 * normalized: 점수 계산용 [0, 1] 정규화
 */
export function aggregateSentiment(scores: number[]): {
  average: number
  normalized: number
  label: '긍정' | '부정' | '중립'
} {
  if (scores.length === 0) {
    return { average: 0, normalized: 0, label: '중립' }
  }
  const average = scores.reduce((sum, s) => sum + s, 0) / scores.length
  const normalized = (average + 1) / 2 // [-1,1] → [0,1]
  const label = average > 0.1 ? '긍정' : average < -0.1 ? '부정' : '중립'
  return { average, normalized, label }
}
