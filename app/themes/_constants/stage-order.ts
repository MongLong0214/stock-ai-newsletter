import type { Stage } from '@/lib/tli/types'

/** ThemeRanking의 배열 값만 포함하는 키 타입 */
type ThemeRankingArrayKey = 'emerging' | 'growth' | 'peak' | 'decline' | 'reigniting'

/** 단계별 섹션 순서 및 메타데이터 */
export const STAGE_ORDER: {
  key: ThemeRankingArrayKey
  stage: Stage
  title: string
  subtitle: string
}[] = [
  { key: 'emerging', stage: 'Emerging', title: '초기 단계', subtitle: '새로운 기회가 형성되는 테마' },
  { key: 'growth', stage: 'Growth', title: '성장 단계', subtitle: '관심이 빠르게 증가하는 테마' },
  { key: 'peak', stage: 'Peak', title: '정점 단계', subtitle: '관심이 최고조에 달한 테마' },
  { key: 'reigniting', stage: 'Growth', title: '재점화 감지', subtitle: '하락 후 다시 관심이 증가하는 테마' },
  { key: 'decline', stage: 'Decline', title: '하락 단계', subtitle: '관심이 감소하고 있는 테마' },
]
